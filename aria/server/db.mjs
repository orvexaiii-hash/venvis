import { DatabaseSync } from 'node:sqlite'
import { join } from 'path'
import { mkdirSync } from 'fs'

const DB_PATH = process.env.DB_PATH || join(process.cwd(), 'data', 'aria.db')

if (DB_PATH !== ':memory:') {
  mkdirSync(join(DB_PATH, '..'), { recursive: true })
}

export const db = new DatabaseSync(DB_PATH)

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    phone TEXT PRIMARY KEY,
    name TEXT,
    active INTEGER DEFAULT 0,
    activation_code TEXT,
    code_expires_at TEXT,
    timezone TEXT DEFAULT 'America/Argentina/Buenos_Aires',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    text TEXT NOT NULL,
    remind_at TEXT NOT NULL,
    recurrence TEXT,
    done INTEGER DEFAULT 0,
    gcal_event_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (phone) REFERENCES users(phone)
  );

  CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(phone, key),
    FOREIGN KEY (phone) REFERENCES users(phone)
  );

  CREATE TABLE IF NOT EXISTS google_tokens (
    phone TEXT PRIMARY KEY,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expiry INTEGER,
    FOREIGN KEY (phone) REFERENCES users(phone)
  );
`)

// Migrations
try { db.exec('ALTER TABLE reminders ADD COLUMN gcal_event_id TEXT') } catch (_) {}
try { db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0') } catch (_) {}
