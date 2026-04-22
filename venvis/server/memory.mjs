import { DatabaseSync } from 'node:sqlite'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.DB_PATH || join(__dirname, '..', 'venvis.db')

const db = new DatabaseSync(DB_PATH)

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
`)

export function getRecentMessages(sessionId, n = 10) {
  return db.prepare(`
    SELECT role, content, timestamp FROM conversations
    WHERE session_id = ?
    ORDER BY id DESC LIMIT ?
  `).all(sessionId, n).reverse()
}

export function getAllMemory(sessionId) {
  return db.prepare(`
    SELECT key, value, confidence, updated_at FROM memory
    WHERE session_id = ?
    ORDER BY updated_at DESC
  `).all(sessionId)
}

export function saveMessage(sessionId, role, content) {
  db.prepare(`
    INSERT INTO conversations (session_id, role, content) VALUES (?, ?, ?)
  `).run(sessionId, role, content)
}

export function upsertMemory(sessionId, key, value, confidence) {
  db.prepare(`
    INSERT INTO memory (session_id, key, value, confidence, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(session_id, key) DO UPDATE SET
      value      = excluded.value,
      confidence = excluded.confidence,
      updated_at = datetime('now')
  `).run(sessionId, key, value, confidence)
}

export function deleteMemory(sessionId, key) {
  db.prepare(`DELETE FROM memory WHERE session_id = ? AND key = ?`).run(sessionId, key)
}

export function ensureSession(sessionId, name) {
  db.prepare(`
    INSERT OR IGNORE INTO sessions (id, name) VALUES (?, ?)
  `).run(sessionId, name)
}
