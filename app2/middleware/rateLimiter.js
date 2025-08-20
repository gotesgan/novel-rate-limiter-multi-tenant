const redis = require("../helper/redis");

/**
 * Define per-route static token buckets
 * key: route path, value: { rps, bucketSize }
 */
const buckets = {
  "/logo-image": { rps: 33, bucketSize: 200 },
  "/privacy_policy": { rps: 33, bucketSize: 200 },
  "/extension/review-count": { rps: 10, bucketSize: 600 },
  "/extension/get-reviews": { rps: 10, bucketSize: 600 },
  "/auth/login": { rps: 0.33, bucketSize: 20 },
  "/super-admin/login": { rps: 0.33, bucketSize: 20 },
  "/api": { rps: 3.33, bucketSize: 200 },
  "/customer/api": { rps: 3.33, bucketSize: 200 },
  "/super-admin": { rps: 3.33, bucketSize: 200 },
  "/webhook": { rps: 200, bucketSize: 200 },
  default: { rps: 16.66, bucketSize: 100 },
};

/**
 * Normal Token Bucket Consume
 */
async function tokenBucketConsume(key, rps, bucketSize) {
  const now = Date.now();

  const data = await redis.get(key);
  let tokens = bucketSize;
  let lastRefill = now;

  if (data) {
    const { tokens: storedTokens, lastRefill: storedTime } = JSON.parse(data);
    const elapsedSeconds = (now - storedTime) / 1000;
    tokens = Math.min(bucketSize, storedTokens + elapsedSeconds * rps);
    lastRefill = now;
  }

  if (tokens >= 1) {
    tokens -= 1;
    await redis.set(
      key,
      JSON.stringify({ tokens, lastRefill }),
      "PX",
      60 * 60 * 1000
    );
    return { allowed: true, remaining: Math.floor(tokens) };
  } else {
    return { allowed: false, retryAfter: Math.ceil(1 / rps) };
  }
}

/**
 * Middleware
 */
async function rateLimiter(req, res, next) {
  const route = buckets[req.path] ? req.path : "default";
  const { rps, bucketSize } = buckets[route];

  const key = `tb:${route}`;

  try {
    const result = await tokenBucketConsume(key, rps, bucketSize);
    if (result.allowed) {
      return next();
    } else {
      return res.status(429).json({
        success: false,
        message: "Too many requests. Please slow down.",
        retryAfter: result.retryAfter,
      });
    }
  } catch (err) {
    console.error("[RateLimiter] Error", err);
    return next();
  }
}

/**
 * Clear all keys
 */
async function clearAllKeys() {
  try {
    const keys = await redis.keys("tb:*");
    if (keys.length) await redis.del(keys);
    console.info(`[RateLimiter] Cleared ${keys.length} keys.`);
  } catch (err) {
    console.error("[RateLimiter] Failed to clear keys:", err);
  }
}

module.exports = { rateLimiter, clearAllKeys };
