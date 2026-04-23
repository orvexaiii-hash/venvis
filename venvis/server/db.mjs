// server/db.mjs
import { DatabaseSync } from 'node:sqlite'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const DB_PATH = process.env.DB_PATH || join(__dirname, '..', 'venvis.db')
export const db = new DatabaseSync(DB_PATH)

db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    role       TEXT,
    content    TEXT,
    timestamp  TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS memory (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    key        TEXT,
    value      TEXT,
    confidence INTEGER,
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(session_id, key)
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    name       TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS presencia (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    status    TEXT,
    timestamp TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS reminders (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    text       TEXT,
    remind_at  TEXT,
    done       INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
`)
