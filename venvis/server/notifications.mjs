import webPush from 'web-push'
import { db } from './db.mjs'

const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const VAPID_EMAIL       = process.env.VAPID_EMAIL || 'orvex.aiii@gmail.com'

export const NOTIFICATIONS_ENABLED = !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY)

if (NOTIFICATIONS_ENABLED) {
  webPush.setVapidDetails(`mailto:${VAPID_EMAIL}`, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
}

// Create table if it doesn't exist (db already has WAL mode from db.mjs)
db.exec(`
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint   TEXT UNIQUE,
    p256dh     TEXT,
    auth       TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )
`)

export function saveSubscription(subscription) {
  const { endpoint, keys } = subscription
  db.prepare(`
    INSERT OR REPLACE INTO push_subscriptions (endpoint, p256dh, auth) VALUES (?, ?, ?)
  `).run(endpoint, keys.p256dh, keys.auth)
}

function getSubscriptions() {
  return db.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions').all()
}

export async function sendNotification(title, body) {
  if (!NOTIFICATIONS_ENABLED) return
  const subs    = getSubscriptions()
  const payload = JSON.stringify({ title, body, url: 'https://venvis.orvexautomation.com' })

  for (const sub of subs) {
    try {
      await webPush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      )
    } catch (err) {
      if (err.statusCode === 410) {
        // Subscription expired — remove it
        db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(sub.endpoint)
        console.log('[Push] Suscripción expirada eliminada:', sub.endpoint)
      } else {
        console.error('[Push] Error enviando notificación:', err.message)
      }
    }
  }
}
