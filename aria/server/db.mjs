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

  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS web_otps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    sent INTEGER DEFAULT 0,
    used INTEGER DEFAULT 0,
    attempts INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    muscle_group TEXT NOT NULL,
    description TEXT NOT NULL,
    image_url TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS routines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    difficulty TEXT CHECK(difficulty IN ('beginner','intermediate','advanced')),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS routine_exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    routine_id INTEGER NOT NULL,
    exercise_id INTEGER NOT NULL,
    day_of_week TEXT NOT NULL,
    order_index INTEGER NOT NULL,
    sets INTEGER NOT NULL,
    reps TEXT NOT NULL,
    rest_seconds INTEGER,
    FOREIGN KEY (routine_id) REFERENCES routines(id),
    FOREIGN KEY (exercise_id) REFERENCES exercises(id)
  );

  CREATE TABLE IF NOT EXISTS user_routines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    routine_id INTEGER NOT NULL,
    active INTEGER DEFAULT 1,
    assigned_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (phone) REFERENCES users(phone),
    FOREIGN KEY (routine_id) REFERENCES routines(id)
  );

  CREATE TABLE IF NOT EXISTS user_modules (
    phone TEXT NOT NULL,
    module TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    activated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (phone, module),
    FOREIGN KEY (phone) REFERENCES users(phone)
  );
`)

// Migrations
try { db.exec('ALTER TABLE reminders ADD COLUMN gcal_event_id TEXT') } catch (_) {}
try { db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0') } catch (_) {}
try { db.exec('ALTER TABLE users ADD COLUMN paid_until TEXT') } catch (_) {}
try { db.exec('ALTER TABLE users ADD COLUMN display_name TEXT') } catch (_) {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_chat_phone ON chat_messages(phone, id)') } catch (_) {}
try { db.exec('ALTER TABLE memories ADD COLUMN expires_at TEXT') } catch (_) {}
