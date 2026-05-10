import { google } from 'googleapis'
import { db } from './db.mjs'

const SCOPES = ['https://www.googleapis.com/auth/calendar.events']
const TZ = 'America/Argentina/Buenos_Aires'

export function isConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_CALLBACK_URL)
}

function makeOAuth2() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_CALLBACK_URL
  )
}

export function getAuthUrl(phone) {
  const oauth2 = makeOAuth2()
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    state: Buffer.from(phone).toString('base64'),
    prompt: 'consent'
  })
}

export async function handleCallback(code, phoneB64) {
  const phone = Buffer.from(phoneB64, 'base64').toString()
  const oauth2 = makeOAuth2()
  const { tokens } = await oauth2.getToken(code)
  db.prepare(`
    INSERT OR REPLACE INTO google_tokens (phone, access_token, refresh_token, expiry)
    VALUES (?, ?, ?, ?)
  `).run(phone, tokens.access_token, tokens.refresh_token ?? null, tokens.expiry_date ?? null)
  return phone
}

function getAuthClient(phone) {
  const row = db.prepare('SELECT * FROM google_tokens WHERE phone = ?').get(phone)
  if (!row) return null
  const oauth2 = makeOAuth2()
  oauth2.setCredentials({
    access_token: row.access_token,
    refresh_token: row.refresh_token,
    expiry_date: row.expiry
  })
  oauth2.on('tokens', (tokens) => {
    db.prepare('UPDATE google_tokens SET access_token = ?, expiry = ? WHERE phone = ?')
      .run(tokens.access_token, tokens.expiry_date ?? null, phone)
    if (tokens.refresh_token) {
      db.prepare('UPDATE google_tokens SET refresh_token = ? WHERE phone = ?')
        .run(tokens.refresh_token, phone)
    }
  })
  return oauth2
}

export function isConnected(phone) {
  return !!db.prepare('SELECT phone FROM google_tokens WHERE phone = ?').get(phone)
}

export async function createEvent(phone, title, startIso) {
  if (!isConfigured()) return null
  const auth = getAuthClient(phone)
  if (!auth) return null
  const cal = google.calendar({ version: 'v3', auth })
  const endIso = new Date(new Date(startIso).getTime() + 30 * 60 * 1000).toISOString()
  const { data } = await cal.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: title,
      start: { dateTime: startIso, timeZone: TZ },
      end:   { dateTime: endIso,   timeZone: TZ }
    }
  })
  return data.id
}

export async function deleteEvent(phone, eventId) {
  if (!isConfigured() || !eventId) return
  const auth = getAuthClient(phone)
  if (!auth) return
  const cal = google.calendar({ version: 'v3', auth })
  await cal.events.delete({ calendarId: 'primary', eventId }).catch(() => {})
}
