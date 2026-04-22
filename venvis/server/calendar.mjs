import { google } from 'googleapis'

const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN

export const CALENDAR_ENABLED = !!(CLIENT_ID && CLIENT_SECRET && REFRESH_TOKEN)

function getClient() {
  const auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET)
  auth.setCredentials({ refresh_token: REFRESH_TOKEN })
  return google.calendar({ version: 'v3', auth })
}

function formatEvent(e) {
  const start = e.start?.dateTime || e.start?.date || ''
  const end   = e.end?.dateTime   || e.end?.date   || ''
  return `- ${e.summary || '(sin título)'} | ${start} → ${end}${e.location ? ' | ' + e.location : ''}`
}

export async function getTodayEvents() {
  if (!CALENDAR_ENABLED) return 'Google Calendar no configurado.'
  const cal   = getClient()
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const end   = new Date(); end.setHours(23, 59, 59, 999)

  const res = await cal.events.list({
    calendarId: 'primary',
    timeMin:    start.toISOString(),
    timeMax:    end.toISOString(),
    singleEvents: true,
    orderBy:    'startTime'
  })

  const items = res.data.items || []
  if (!items.length) return 'No tenés eventos hoy.'
  return `Eventos de hoy:\n${items.map(formatEvent).join('\n')}`
}

export async function getWeekEvents() {
  if (!CALENDAR_ENABLED) return 'Google Calendar no configurado.'
  const cal   = getClient()
  const start = new Date()
  const end   = new Date(); end.setDate(end.getDate() + 7)

  const res = await cal.events.list({
    calendarId: 'primary',
    timeMin:    start.toISOString(),
    timeMax:    end.toISOString(),
    singleEvents: true,
    orderBy:    'startTime',
    maxResults: 20
  })

  const items = res.data.items || []
  if (!items.length) return 'No tenés eventos en los próximos 7 días.'
  return `Eventos próximos 7 días:\n${items.map(formatEvent).join('\n')}`
}

export async function createEvent(title, date, time, durationMinutes = 60) {
  if (!CALENDAR_ENABLED) return 'Google Calendar no configurado.'
  const cal = getClient()

  const startDt = new Date(`${date}T${time || '09:00'}:00`)
  const endDt   = new Date(startDt.getTime() + durationMinutes * 60000)

  const res = await cal.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: title,
      start: { dateTime: startDt.toISOString(), timeZone: 'America/Argentina/Buenos_Aires' },
      end:   { dateTime: endDt.toISOString(),   timeZone: 'America/Argentina/Buenos_Aires' }
    }
  })

  return `Evento creado: "${res.data.summary}" el ${res.data.start.dateTime}`
}
