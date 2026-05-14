import { db } from './db.mjs'
import { randomBytes } from 'crypto'

export function generateCode() {
  return 'ARIA-' + randomBytes(2).toString('hex').toUpperCase()
}

export function createActivationCode(phone) {
  const code = generateCode()
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
  db.prepare(`
    INSERT INTO users (phone, activation_code, code_expires_at)
    VALUES (?, ?, ?)
    ON CONFLICT(phone) DO UPDATE SET
      activation_code = excluded.activation_code,
      code_expires_at = excluded.code_expires_at
  `).run(phone, code, expiresAt)
  return code
}

export function activateUser(phone, code) {
  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone)
  if (!user) return { success: false, reason: 'not_found' }
  if (user.active) return { success: false, reason: 'already_active' }
  if (user.activation_code !== code) return { success: false, reason: 'invalid_code' }
  if (new Date(user.code_expires_at) < new Date()) return { success: false, reason: 'expired' }
  db.prepare(`
    UPDATE users SET active = 1, activation_code = NULL, code_expires_at = NULL WHERE phone = ?
  `).run(phone)
  return { success: true }
}

export function setUserName(phone, name) {
  db.prepare('UPDATE users SET name = ? WHERE phone = ?').run(name, phone)
}

export function getUser(phone) {
  return db.prepare('SELECT * FROM users WHERE phone = ?').get(phone) || null
}

export function listUsers() {
  return db.prepare('SELECT phone, name, active, is_admin, created_at FROM users ORDER BY created_at DESC').all()
}

export function deactivateUser(phone) {
  db.prepare('UPDATE users SET active = 0 WHERE phone = ?').run(phone)
}

export function makeAdmin(phone) {
  db.prepare('UPDATE users SET is_admin = 1 WHERE phone = ?').run(phone)
}

export function isAdmin(phone) {
  const user = db.prepare('SELECT is_admin FROM users WHERE phone = ?').get(phone)
  return user?.is_admin === 1
}

export function promoteToAdmin(phone) {
  db.prepare(`
    INSERT INTO users (phone, active, is_admin)
    VALUES (?, 1, 1)
    ON CONFLICT(phone) DO UPDATE SET active = 1, is_admin = 1
  `).run(phone)
}

export function activateUserDirect(phoneFragment) {
  const normalized = phoneFragment.includes('@') ? phoneFragment : phoneFragment + '@lid'
  const result = db.prepare('UPDATE users SET active = 1 WHERE phone = ?').run(normalized)
  if (result.changes > 0) return { success: true, phone: normalized }
  // fallback: try partial match on phone column
  const user = db.prepare("SELECT phone FROM users WHERE phone LIKE ? LIMIT 1").get('%' + phoneFragment + '%')
  if (user) {
    db.prepare('UPDATE users SET active = 1 WHERE phone = ?').run(user.phone)
    return { success: true, phone: user.phone }
  }
  return { success: false }
}
