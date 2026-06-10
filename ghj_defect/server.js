const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { db, SEGMENTS } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const ACCESS_CODE = process.env.ACCESS_CODE || '1234';

const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

// --- Auth: reporting requires an access code ---
function requireAuth(req, res, next) {
  const code = req.headers['x-access-code'];
  if (code !== ACCESS_CODE) {
    return res.status(401).json({ error: 'Invalid or missing access code' });
  }
  next();
}

// Lets the report page validate the code before showing the form
app.post('/api/auth/check', requireAuth, (req, res) => {
  res.json({ ok: true });
});

// --- Report a defect (authorized users, exactly 1 'before' photo) ---
app.post('/api/defects', requireAuth, (req, res) => {
  upload.single('before')(req, res, (err) => {
    if (err) {
      const msg =
        err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
          ? 'Exactly 1 before photo is required'
          : err.message;
      return res.status(400).json({ error: msg });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Exactly 1 before photo is required' });
    }

    const { segment } = req.body;
    if (!SEGMENTS.includes(segment)) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: `Segment must be one of: ${SEGMENTS.join(', ')}` });
    }

    const beforeUrl = `/uploads/${req.file.filename}`;
    const result = db
      .prepare('INSERT INTO defects (segment, before_picture_url) VALUES (?, ?)')
      .run(segment, beforeUrl);

    const defect = db.prepare('SELECT * FROM defects WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(defect);
  });
});

// --- List defects (?status=active returns Reported + In Progress) ---
app.get('/api/defects', (req, res) => {
  const { status } = req.query;
  let rows;
  if (status === 'active') {
    rows = db
      .prepare(
        "SELECT * FROM defects WHERE status IN ('Reported', 'In Progress') ORDER BY created_at DESC, id DESC"
      )
      .all();
  } else if (status) {
    rows = db
      .prepare('SELECT * FROM defects WHERE status = ? ORDER BY created_at DESC, id DESC')
      .all(status);
  } else {
    rows = db.prepare('SELECT * FROM defects ORDER BY created_at DESC, id DESC').all();
  }
  res.json(rows);
});

// --- Worker selects a task -> In Progress ---
app.post('/api/defects/:id/start', (req, res) => {
  const defect = db.prepare('SELECT * FROM defects WHERE id = ?').get(req.params.id);
  if (!defect) return res.status(404).json({ error: 'Defect not found' });
  if (defect.status === 'Completed') {
    return res.status(409).json({ error: 'Defect is already completed' });
  }
  db.prepare("UPDATE defects SET status = 'In Progress' WHERE id = ?").run(req.params.id);
  res.json(db.prepare('SELECT * FROM defects WHERE id = ?').get(req.params.id));
});

// --- Worker completes a task: 'after' photo + remarks ---
app.post('/api/defects/:id/complete', (req, res) => {
  upload.single('after')(req, res, (err) => {
    if (err) {
      const msg =
        err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
          ? 'Exactly 1 after photo is required'
          : err.message;
      return res.status(400).json({ error: msg });
    }

    const defect = db.prepare('SELECT * FROM defects WHERE id = ?').get(req.params.id);
    if (!defect) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(404).json({ error: 'Defect not found' });
    }
    if (defect.status === 'Completed') {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(409).json({ error: 'Defect is already completed' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'An after photo is required to complete a defect' });
    }

    const remarks = (req.body.remarks || '').trim();
    if (!remarks) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'Remarks are required to complete a defect' });
    }

    const afterUrl = `/uploads/${req.file.filename}`;
    db.prepare(
      "UPDATE defects SET status = 'Completed', after_picture_url = ?, remarks = ? WHERE id = ?"
    ).run(afterUrl, remarks, req.params.id);

    res.json(db.prepare('SELECT * FROM defects WHERE id = ?').get(req.params.id));
  });
});

// --- Dashboard metrics ---
app.get('/api/metrics', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) AS n FROM defects').get().n;
  const completed = db
    .prepare("SELECT COUNT(*) AS n FROM defects WHERE status = 'Completed'")
    .get().n;
  const completionPct = total === 0 ? 0 : Math.round((completed / total) * 1000) / 10;
  res.json({ totalReported: total, totalCompleted: completed, completionPct });
});

app.get('/api/segments', (req, res) => {
  res.json(SEGMENTS);
});

app.listen(PORT, () => {
  console.log(`Defect manager running on http://localhost:${PORT}`);
});
