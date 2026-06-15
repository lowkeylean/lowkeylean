const { initAdmin, adminDb } = require('./_firebase');
const { rateLimit, clientIp } = require('./_ratelimit');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const limit = rateLimit(`reports:${clientIp(req)}`, { limit: 60, windowMs: 60_000 });
  if (!limit.ok) {
    res.setHeader('Retry-After', String(limit.retryAfter));
    return res.status(429).json({ error: 'Too many requests' });
  }
  try {
    initAdmin();
    const snap = await adminDb()
      .collection('reports')
      .orderBy('generated_at', 'desc')
      .limit(20)
      .get();
    const reports = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        generated_at: data.generated_at?.toDate?.()?.toISOString() ?? null,
      };
    });
    res.setHeader('Cache-Control', 'no-store');
    res.json(reports);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
