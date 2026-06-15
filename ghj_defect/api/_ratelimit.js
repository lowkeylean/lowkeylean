// Best-effort, zero-dependency in-memory rate limiter.
//
// State lives per warm serverless instance, so this throttles bursts against a
// single instance rather than guaranteeing a global limit. Combined with auth
// on the endpoints and an unlisted URL, it's enough to blunt accidental loops
// or casual abuse without provisioning Redis/KV. For a hard global guarantee,
// configure Vercel WAF rate limiting in the dashboard.

const hits = new Map();

function prune(now) {
  for (const [key, entry] of hits) {
    if (now > entry.reset) hits.delete(key);
  }
}

// Returns { ok: true } when under the limit, or { ok: false, retryAfter }
// (seconds) when the caller should back off.
function rateLimit(key, { limit = 30, windowMs = 60_000 } = {}) {
  const now = Date.now();
  if (hits.size > 5000) prune(now); // keep the map from growing unbounded

  const entry = hits.get(key);
  if (!entry || now > entry.reset) {
    hits.set(key, { count: 1, reset: now + windowMs });
    return { ok: true };
  }
  entry.count += 1;
  if (entry.count > limit) {
    return { ok: false, retryAfter: Math.ceil((entry.reset - now) / 1000) };
  }
  return { ok: true };
}

// Best-effort client IP from Vercel's forwarding headers.
function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

module.exports = { rateLimit, clientIp };
