const { put } = require('@vercel/blob');

// Buffer the raw request stream into a single Buffer. Passing a Node stream
// straight to put() can fail without a known content length, so we read it
// fully first and hand put() a Buffer with an explicit content type.
async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: 'Blob storage not configured' });
  }
  try {
    const buffer = await readBody(req);
    if (!buffer.length) return res.status(400).json({ error: 'Empty body' });
    const filename = req.headers['x-filename'] || `upload-${Date.now()}.jpg`;
    const blob = await put(`defects/${filename}`, buffer, {
      access: 'public',
      contentType: 'image/jpeg',
      addRandomSuffix: true,
    });
    res.status(200).json({ url: blob.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports.config = { api: { bodyParser: false } };

