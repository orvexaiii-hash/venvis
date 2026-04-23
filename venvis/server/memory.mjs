import { db } from './db.mjs'

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
