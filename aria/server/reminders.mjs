import { db } from './db.mjs'

export function saveReminder(phone, text, remindAt) {
  const at = remindAt instanceof Date ? remindAt.toISOString() : remindAt
  return db.prepare(
    'INSERT INTO reminders (phone, text, remind_at) VALUES (?, ?, ?)'
  ).run(phone, text, at).lastInsertRowid
}

export function saveRecurringReminder(phone, text, remindAt, recurrence) {
  const at = remindAt instanceof Date ? remindAt.toISOString() : remindAt
  return db.prepare(
    'INSERT INTO reminders (phone, text, remind_at, recurrence) VALUES (?, ?, ?, ?)'
  ).run(phone, text, at, recurrence).lastInsertRowid
}

export function getPendingReminders() {
  return db.prepare(`
    SELECT id, phone, text, remind_at, recurrence
    FROM reminders
    WHERE done = 0 AND remind_at <= strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    ORDER BY remind_at
  `).all()
}

export function markDone(id) {
  db.prepare('UPDATE reminders SET done = 1 WHERE id = ?').run(id)
}

export function computeNextOccurrence(remindAt, recurrence) {
  const date = new Date(remindAt)
  if (recurrence === 'daily') {
    date.setDate(date.getDate() + 1)
  } else if (recurrence.startsWith('weekly:')) {
    date.setDate(date.getDate() + 7)
  }
  return date.toISOString()
}

export function advanceRecurring(id, remindAt, recurrence) {
  const next = computeNextOccurrence(remindAt, recurrence)
  db.prepare('UPDATE reminders SET remind_at = ? WHERE id = ?').run(next, id)
}

export function getTodayReminders(phone) {
  const TZ = 'America/Argentina/Buenos_Aires'
  const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
  return db.prepare(`
    SELECT text, remind_at FROM reminders
    WHERE phone = ? AND done = 0 AND date(remind_at) = ?
    ORDER BY remind_at
  `).all(phone, today)
}

export function listReminders(phone) {
  return db.prepare(`
    SELECT id, text, remind_at, recurrence FROM reminders
    WHERE phone = ? AND done = 0
    ORDER BY remind_at
  `).all(phone)
}

export function getReminderById(id, phone) {
  return db.prepare('SELECT * FROM reminders WHERE id = ? AND phone = ?').get(id, phone)
}

export function updateReminderGCalId(id, gcalEventId) {
  db.prepare('UPDATE reminders SET gcal_event_id = ? WHERE id = ?').run(gcalEventId, id)
}

export function deleteReminder(id, phone) {
  db.prepare('DELETE FROM reminders WHERE id = ? AND phone = ?').run(id, phone)
}

export function getPendingWebOTPs() {
  return db.prepare(
    `SELECT id, phone, code FROM web_otps
     WHERE sent = 0 AND used = 0 AND expires_at > datetime('now')`
  ).all()
}

export function markOTPSent(id) {
  db.prepare('UPDATE web_otps SET sent = 1 WHERE id = ?').run(id)
}

export function getWorkoutUsersForToday() {
  const today = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: 'America/Argentina/Buenos_Aires'
  }).format(new Date()).toUpperCase()

  return db.prepare(`
    SELECT DISTINCT ur.phone, r.name as routine_name
    FROM user_routines ur
    JOIN routines r ON r.id = ur.routine_id
    JOIN routine_exercises re ON re.routine_id = ur.routine_id
    WHERE ur.active = 1 AND re.day_of_week = ?
  `).all(today)
}

export function startReminderTick(onReminder, onDailySummary, onCleanupExpired, onSendOTPs, onWorkoutFollowUp) {
  let lastSummaryDate = ''
  let lastFollowUpDate = ''

  function tick() {
    const TZ = 'America/Argentina/Buenos_Aires'
    const now = new Date()
    const hour = parseInt(now.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: TZ }), 10)
    const min  = parseInt(now.toLocaleString('en-US', { minute: 'numeric', timeZone: TZ }), 10)
    const today = now.toLocaleDateString('en-CA', { timeZone: TZ })

    if (hour === 8 && min === 0 && lastSummaryDate !== today) {
      lastSummaryDate = today
      onDailySummary()
    }

    if (hour === 21 && min === 0 && lastFollowUpDate !== today) {
      lastFollowUpDate = today
      if (onWorkoutFollowUp) onWorkoutFollowUp()
    }

    if (onCleanupExpired) onCleanupExpired()
    if (onSendOTPs) onSendOTPs()

    const due = getPendingReminders()
    for (const r of due) {
      onReminder(r)
      if (r.recurrence) {
        advanceRecurring(r.id, r.remind_at, r.recurrence)
      } else {
        markDone(r.id)
      }
    }
  }

  setInterval(tick, 60_000)
}
