import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.DB_PATH = ':memory:'

const {
  saveReminder, saveRecurringReminder, getPendingReminders,
  markDone, computeNextOccurrence, getTodayReminders, listReminders, deleteReminder
} = await import('../server/reminders.mjs')
const { createActivationCode, activateUser } = await import('../server/users.mjs')

const PHONE = '5491100000010'
const code = createActivationCode(PHONE)
activateUser(PHONE, code)

test('saveReminder stores and getPendingReminders returns due items', () => {
  const pastDate = new Date(Date.now() - 60_000).toISOString()
  saveReminder(PHONE, 'Dentista', pastDate)
  const pending = getPendingReminders()
  assert.ok(pending.some(r => r.text === 'Dentista'))
})

test('markDone removes reminder from pending', () => {
  const pastDate = new Date(Date.now() - 60_000).toISOString()
  saveReminder(PHONE, 'Gym', pastDate)
  const pending = getPendingReminders()
  const gym = pending.find(r => r.text === 'Gym')
  assert.ok(gym)
  markDone(gym.id)
  const after = getPendingReminders()
  assert.ok(!after.some(r => r.text === 'Gym'))
})

test('future reminder not in getPendingReminders', () => {
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  saveReminder(PHONE, 'FutureEvent', future)
  const pending = getPendingReminders()
  assert.ok(!pending.some(r => r.text === 'FutureEvent'))
})

test('computeNextOccurrence daily adds 1 day', () => {
  const base = '2026-05-10T09:00:00.000Z'
  const next = computeNextOccurrence(base, 'daily')
  assert.equal(next.slice(0, 10), '2026-05-11')
})

test('computeNextOccurrence weekly adds 7 days', () => {
  const base = '2026-05-10T09:00:00.000Z'
  const next = computeNextOccurrence(base, 'weekly:SUN')
  assert.equal(next.slice(0, 10), '2026-05-17')
})

test('saveRecurringReminder stores recurrence field', () => {
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  saveRecurringReminder(PHONE, 'Medicación', future, 'daily')
  const reminders = listReminders(PHONE)
  const med = reminders.find(r => r.text === 'Medicación')
  assert.ok(med)
  assert.equal(med.recurrence, 'daily')
})

test('deleteReminder removes it from listReminders', () => {
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  saveReminder(PHONE, 'ToDelete', future)
  const before = listReminders(PHONE)
  const target = before.find(r => r.text === 'ToDelete')
  deleteReminder(target.id, PHONE)
  const after = listReminders(PHONE)
  assert.ok(!after.some(r => r.text === 'ToDelete'))
})
