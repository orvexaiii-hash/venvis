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
  const exact = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone)
  if (exact) return exact
  // Fallback: find old @lid / @s.whatsapp.net variant and migrate it
  const bare = phone.replace(/@.+$/, '')
  const old = db.prepare("SELECT * FROM users WHERE phone LIKE ? LIMIT 1").get(bare + '@%')
  if (old) {
    db.prepare('UPDATE users SET phone = ? WHERE phone = ?').run(phone, old.phone)
    return db.prepare('SELECT * FROM users WHERE phone = ?').get(phone) || null
  }
  return null
}

export function listUsers() {
  return db.prepare('SELECT phone, name, display_name, active, is_admin, paid_until, created_at FROM users ORDER BY created_at DESC').all()
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

export function setPaidUntil(phone, date) {
  db.prepare('UPDATE users SET paid_until = ? WHERE phone = ?').run(date, phone)
}

export function setDisplayName(phone, name) {
  db.prepare('UPDATE users SET display_name = ? WHERE phone = ?').run(name, phone)
}

export function isPaymentExpired(phone) {
  const user = db.prepare('SELECT paid_until FROM users WHERE phone = ?').get(phone)
  if (!user || !user.paid_until) return false
  return new Date(user.paid_until) < new Date()
}

export function activateUserDirect(phoneFragment) {
  const bare = phoneFragment.replace(/@.+$/, '')
  // Activate ALL records matching this number (bare, @lid, @s.whatsapp.net, etc.)
  const result = db.prepare("UPDATE users SET active = 1 WHERE phone = ? OR phone LIKE ?").run(bare, bare + '@%')
  if (result.changes > 0) return { success: true, phone: bare }
  return { success: false }
}

export function deleteUser(phone) {
  const bare = phone.replace(/@.+$/, '')
  db.prepare("DELETE FROM users WHERE phone = ? OR phone LIKE ?").run(bare, bare + '@%')
}
