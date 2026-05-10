import { db } from './db.mjs'

export function saveMemory(phone, key, value) {
  db.prepare(`
    INSERT INTO memories (phone, key, value)
    VALUES (?, ?, ?)
    ON CONFLICT(phone, key) DO UPDATE SET
      value = excluded.value,
      updated_at = datetime('now')
  `).run(phone, key, value)
}

export function getMemory(phone, key) {
  return db.prepare(
    'SELECT value FROM memories WHERE phone = ? AND key = ? COLLATE NOCASE'
  ).get(phone, key)?.value ?? null
}

export function getAllMemories(phone) {
  return db.prepare(
    'SELECT key, value FROM memories WHERE phone = ? ORDER BY updated_at DESC'
  ).all(phone)
}
