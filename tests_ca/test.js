import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

// Counters
export let allowed = new Counter("allowed_requests");
export let blocked = new Counter("blocked_requests");
export let latencyTrend = new Trend("latency", true);

// Tenants, users, routes
const tenants = [...Array(5)].map((_, i) => `tenant${i+1}`);
const users = [...Array(10)].map((_, i) => `user${i+1}`);
const routes = [
  "/privacy_policy",
  "/logo-image",
  "/extension/review-count",
  "/extension/get-reviews",
  "/auth/login",
  "/super-admin/login",
  "/api/test",
  "/customer/api/data",
  "/super-admin/dashboard",
  "/webhook/event",
];

export let options = {
  vus: 50,
  duration: "30s",
};

export default function () {
  const tenant = tenants[Math.floor(Math.random() * tenants.length)];
  const user = users[Math.floor(Math.random() * users.length)];
  const path = routes[Math.floor(Math.random() * routes.length)];

  const url = `http://nginx_ca${path}`;
  const headers = {
    "X-Shop": tenant,
    "X-User": user,
    "User-Agent": `ua-${user}`
  };

  let res = http.get(url, { headers });

  latencyTrend.add(res.timings.duration, { tenant, path });

  if (res.status === 200) {
    allowed.add(1, { tenant, path });
  } else if (res.status === 429) {
    blocked.add(1, { tenant, path });
  }

  check(res, { "status is 200 or 429": (r) => r.status === 200 || r.status === 429 });

  sleep(0.1);
}
