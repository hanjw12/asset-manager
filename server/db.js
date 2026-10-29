import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS people (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS assets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL,
  institution TEXT NOT NULL DEFAULT '',
  note        TEXT NOT NULL DEFAULT '',
  owner_id    INTEGER REFERENCES people(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS valuations (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  date     TEXT NOT NULL,
  value    INTEGER NOT NULL,
  UNIQUE (asset_id, date)
);
CREATE INDEX IF NOT EXISTS valuations_date ON valuations(date);
CREATE TABLE IF NOT EXISTS allocation_targets (
  category TEXT PRIMARY KEY,
  pct      REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS goals (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  target_amount INTEGER NOT NULL,
  target_date   TEXT,
  owner_id      INTEGER REFERENCES people(id)
);
`;

// owner_id 가 없던 초기 버전 DB 를 위한 컬럼 추가. owner_id NULL = 공동 자산/가구 목표.
function migrate(db) {
  for (const table of ['assets', 'goals']) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!cols.some((c) => c.name === 'owner_id')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN owner_id INTEGER REFERENCES people(id)`);
    }
  }
}

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

export function defaultDbPath() {
  const dir = process.env.ASSET_DATA_DIR || path.resolve(import.meta.dirname, '../data');
  return path.join(dir, 'assets.db');
}

// node:sqlite 는 트랜잭션 헬퍼가 없어서 직접 감싼다.
export function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
