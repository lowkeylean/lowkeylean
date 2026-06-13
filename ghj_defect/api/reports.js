const { initAdmin, adminDb } = require('./_firebase');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
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
