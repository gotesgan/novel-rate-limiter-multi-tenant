const crypto = require('crypto');

const redis = require('../helper/redis');

 

/**

 * Route-specific limits

 */

const routeLimits = [

  { pattern: /^\/(logo-image|privacy_policy)/, rps: 33, bucket: 200 },

  { pattern: /^\/extension\/(review-count|get-reviews)/, rps: 10, bucket: 600 },

  { pattern: /^\/(auth\/login|super-admin\/login)/, rps: 0.33, bucket: 20 },

  { pattern: /^\/(api|customer\/api|super-admin)/, rps: 3.33, bucket: 200 },

  { pattern: /^\/webhook\//, rps: 200, bucket: 200 },

  { pattern: /.*/, rps: 16.66, bucket: 100 }, // default

];

 

/**

 * Token bucket check and update in Redis

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

      'PX',

      60 * 60 * 1000

    );

    redis.expire(key, 3600);

    return { allowed: true, remaining: Math.floor(tokens) };

  } else {

    return { allowed: false, retryAfter: Math.ceil(1 / rps) };

  }

}

 

/**

 * Extract normalized origin host from headers

 */

function getOriginHost(req) {

  let origin = req.headers.origin || req.get('referer') || '';

  if (origin) {

    try {

      return new URL(origin).host;

    } catch {

      return origin.replace(/^https?:\/\//, '').replace(/\/$/, '');

    }

  }

  return '';

}

 

/**

 * Simple SHA256 hash helper

 */

function hashString(input) {

  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 12);

}

 

/**

 * Middleware for dynamic rate limiting

 */

async function dynamicRateLimiter(req, res, next) {

  const matched =

    routeLimits.find((rule) => rule.pattern.test(req.path)) ||

    routeLimits[routeLimits.length - 1];

 

  const originHost = getOriginHost(req);

  const ip = req.ip || 'unknown-ip';

  const ua = req.headers['user-agent'] || 'unknown-ua';

 

  let tenantId;

  if (req.shop) {

    tenantId = `${req.shop}:${hashString(ip + ua)}`;

  } else {

    tenantId = `${originHost || 'unknown-origin'}:${hashString(ip + ua)}`;

  }

 

  const key = ['tb', tenantId].join(':');

 

  try {

    const result = await tokenBucketConsume(key, matched.rps, matched.bucket);

 

    if (result.allowed) {

      // console.debug(

      // `[RateLimiter] Allowed: ${req.path} Remaining: ${result.remaining}`

      // );

      return next();

    } else {

      console.warn(

        `[RateLimiter] Blocked: ${req.path} RetryAfter: ${result.retryAfter}`

      );

      return res.status(429).json({

        success: false,

        message: 'Too many requests. Please slow down.',

        retryAfter: result.retryAfter,

      });

    }

  } catch (err) {

    console.error('[RateLimiter] Error', err);

    return next(); // fail open

  }

}

 

/**

 * Clear all rate limiter keys from Redis

 */

async function clearAllRateLimiterKeys() {

  try {

    const keys = await redis.keys('tb*');

    if (keys.length > 0) {

      await redis.del(keys);

      console.info(`[RateLimiter] Cleared ${keys.length} keys.`);

    } else {

      console.info('[RateLimiter] No rate limiter keys found.');

    }

  } catch (err) {

    console.error('[RateLimiter] Failed to clear keys:', err);

  }

}

 

module.exports = { dynamicRateLimiter, clearAllRateLimiterKeys };