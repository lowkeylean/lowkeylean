const { put } = require('@vercel/blob');

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

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: 'Blob storage not configured' });
  }
  try {
    const payload = await getPayload(req);
    const dataUrl = payload && payload.data;
    if (!dataUrl) return res.status(400).json({ error: 'No image data' });

    const base64 = String(dataUrl).replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');
    if (!buffer.length) return res.status(400).json({ error: 'Empty image' });

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
