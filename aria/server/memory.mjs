import { db } from './db.mjs'

export function saveMemory(phone, key, value, expiresAt = null) {
  db.prepare(`
    INSERT INTO memories (phone, key, value, expires_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(phone, key) DO UPDATE SET
      value = excluded.value,
      expires_at = excluded.expires_at,
      updated_at = datetime('now')
  `).run(phone, key, value, expiresAt)
}

export function getMemory(phone, key) {
  return db.prepare(
    `SELECT value FROM memories WHERE phone = ? AND key = ? COLLATE NOCASE
     AND (expires_at IS NULL OR expires_at > datetime('now'))`
  ).get(phone, key)?.value ?? null
}

export function getAllMemories(phone) {
  return db.prepare(
    `SELECT key, value, expires_at FROM memories
     WHERE phone = ? AND (expires_at IS NULL OR expires_at > datetime('now'))
     ORDER BY updated_at DESC`
  ).all(phone)
}

export function deleteMemory(phone, key) {
  db.prepare('DELETE FROM memories WHERE phone = ? AND key = ?').run(phone, key)
}

export function deleteExpiredMemories() {
  const result = db.prepare(
    `DELETE FROM memories WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')`
  ).run()
  if (result.changes > 0) console.log(`[Memory] Eliminadas ${result.changes} notas vencidas`)
}
