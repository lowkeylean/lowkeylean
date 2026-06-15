const { put } = require('@vercel/blob');
const { initAdmin, adminAuth } = require('./_firebase');
const { rateLimit, clientIp } = require('./_ratelimit');

// Extract the JSON payload regardless of how Vercel handed us the body:
// already-parsed object, a JSON string, or an unparsed raw stream.
async function getPayload(req) {
  if (req.body) {
    if (typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string') {
      try { return JSON.parse(req.body); } catch { return null; }
    }
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// Verify the caller holds a valid Firebase session. Returns true on success,
// or sends an error response and returns false. If the server isn't configured
// to verify tokens (no service account), respond 503 so the client falls back
// to inline base64 storage rather than silently accepting anonymous uploads.
async function requireAuth(req, res) {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    res.status(503).json({ error: 'Auth not configured' });
    return false;
  }
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) {
    res.status(401).json({ error: 'Missing auth token' });
    return false;
  }
  try {
    initAdmin();
    await adminAuth().verifyIdToken(match[1]);
    return true;
  } catch {
    res.status(401).json({ error: 'Invalid auth token' });
    return false;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: 'Blob storage not configured' });
  }

  // Throttle bursts per IP (best-effort, per warm instance).
  const limit = rateLimit(`blob:${clientIp(req)}`, { limit: 20, windowMs: 60_000 });
  if (!limit.ok) {
    res.setHeader('Retry-After', String(limit.retryAfter));
    return res.status(429).json({ error: 'Too many uploads, slow down' });
  }

  // Require a valid Firebase session before touching Blob storage.
  if (!(await requireAuth(req, res))) return;

  try {
    const payload = await getPayload(req);
    const dataUrl = payload && payload.data;
    if (!dataUrl) return res.status(400).json({ error: 'No image data' });

    const base64 = String(dataUrl).replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');
    if (!buffer.length) return res.status(400).json({ error: 'Empty image' });
    // Cap payload size (~5 MB decoded) so a single request can't balloon storage.
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(413).json({ error: 'Image too large' });
    }

    const safeName = String(payload.filename || `upload-${Date.now()}.jpg`)
      .replace(/[^a-zA-Z0-9._-]/g, '');
    const blob = await put(`defects/${safeName}`, buffer, {
      access: 'public',
      contentType: 'image/jpeg',
      addRandomSuffix: true,
    });
    res.status(200).json({ url: blob.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
