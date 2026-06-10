const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'defects.db');

const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS defects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    segment TEXT NOT NULL CHECK (segment IN ('Public Area', 'Rooms', 'Lobby', 'Kitchen')),
    status TEXT NOT NULL DEFAULT 'Reported' CHECK (status IN ('Reported', 'In Progress', 'Completed')),
    before_picture_url TEXT NOT NULL,
    after_picture_url TEXT,
    remarks TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  )
`);

const SEGMENTS = ['Public Area', 'Rooms', 'Lobby', 'Kitchen'];

module.exports = { db, SEGMENTS };
