const express = require("express");
const {
  dynamicRateLimiter,
  clearAllRateLimiterKeys,
} = require("./middleware/rateLimiter");

const app = express();
const PORT = process.env.PORT || 3000;

// Apply rate limiter middleware globally
app.use(dynamicRateLimiter);

/**
 * Routes matching your routeLimits patterns
 */

// logo-image & privacy_policy
app.get("/logo-image", (req, res) => {
  res.json({
    success: true,
    route: "logo-image",
    message: "Served logo image",
  });
});

app.get("/privacy_policy", (req, res) => {
  res.json({
    success: true,
    route: "privacy_policy",
    message: "Served privacy policy",
  });
});

// extension endpoints
app.get("/extension/review-count", (req, res) => {
  res.json({ success: true, route: "extension/review-count", count: 42 });
});

app.get("/extension/get-reviews", (req, res) => {
  res.json({ success: true, route: "extension/get-reviews", reviews: [] });
});

// auth & super-admin login
app.get("/auth/login", (req, res) => {
  res.json({ success: true, route: "auth/login", message: "Login attempted" });
});

app.get("/super-admin/login", (req, res) => {
  res.json({
    success: true,
    route: "super-admin/login",
    message: "Super admin login attempted",
  });
});

// api/customer-api/super-admin (generic catch)
app.get("/api/test", (req, res) => {
  res.json({ success: true, route: "api/test", data: { foo: "bar" } });
});

app.get("/customer/api/data", (req, res) => {
  res.json({ success: true, route: "customer/api/data", data: [1, 2, 3] });
});

app.get("/super-admin/dashboard", (req, res) => {
  res.json({
    success: true,
    route: "super-admin/dashboard",
    stats: { users: 10 },
  });
});

// webhook
app.post("/webhook/event", (req, res) => {
  res.json({
    success: true,
    route: "webhook/event",
    status: "Webhook received",
  });
});

// Default catch-all
// app.get('*', (req, res) => {
//   res.json({ success: true, route: 'default', message: 'Fallback route' });
// });

// Clear rate limiter keys
app.get("/clear", async (req, res) => {
  await clearAllRateLimiterKeys();
  res.json({ success: true, message: "Rate limiter keys cleared" });
});

app.listen(PORT, () => {
  console.log(`[Server] Running on http://localhost:${PORT}`);
});
