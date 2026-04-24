// server/reminders.mjs
import { db } from './db.mjs'

const DEFAULT_SESSION = process.env.SESSION_NAME || 'agus'

export function saveReminder(sessionId, text, remindAt) {
  const at = remindAt instanceof Date ? remindAt.toISOString() : remindAt
  db.prepare(`
    INSERT INTO reminders (session_id, text, remind_at) VALUES (?, ?, ?)
  `).run(sessionId, text, at)
}

export function getPendingReminders(sessionId) {
  return db.prepare(`
    SELECT id, text, remind_at FROM reminders
    WHERE session_id = ? AND done = 0 AND remind_at <= datetime('now')
    ORDER BY remind_at
  `).all(sessionId)
}

export function markReminderDone(id) {
  db.prepare('UPDATE reminders SET done = 1 WHERE id = ?').run(id)
}

export function startReminders(onReminder, onDailyBriefing) {
  let lastBriefingDate = ''   // YYYY-MM-DD of last daily summary sent

  function tick() {
    const now   = new Date()
    const TZ    = 'America/Argentina/Buenos_Aires'
    const hour  = parseInt(now.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: TZ }), 10)
    const min   = parseInt(now.toLocaleString('en-US', { minute: 'numeric', timeZone: TZ }), 10)
    const today = now.toLocaleDateString('en-CA', { timeZone: TZ })

    // Daily briefings — fire once per day at exact hour
    if ((hour === 8 || hour === 22) && min === 0 && lastBriefingDate !== `${today}-${hour}`) {
      lastBriefingDate = `${today}-${hour}`
      onDailyBriefing(hour === 8 ? 'morning' : 'night')
    }

    // Pending reminders — check every tick (every minute)
    try {
      const due = getPendingReminders(DEFAULT_SESSION)
      for (const r of due) {
        onReminder(r.text)
        markReminderDone(r.id)
      }
    } catch (err) {
      console.error('[Reminders] Error procesando recordatorios:', err.message)
    }
  }

  setInterval(tick, 60_000)
  console.log('[Reminders] Iniciado.')
}
