const { put } = require('@vercel/blob');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const filename = req.headers['x-filename'] || `upload-${Date.now()}.jpg`;
  try {
    const blob = await put(`defects/${filename}`, req, { access: 'public' });
    res.json({ url: blob.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports.config = { api: { bodyParser: false } };
