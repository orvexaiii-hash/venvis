import { CALENDAR_ENABLED, getTodayEvents } from './calendar.mjs'
import { searchWeb } from './search.mjs'

const WEATHER_LOCATION = process.env.WEATHER_LOCATION || ''
const SESSION_NAME     = process.env.SESSION_NAME || 'Charly'

function greetingByHour(hour) {
  if (hour < 12) return 'Buenos días'
  if (hour < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

function formatTime(date) {
  return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

const WEATHER_TRANSLATIONS = {
  'Sunny': 'soleado', 'Clear': 'despejado', 'Cloudy': 'nublado',
  'Partly cloudy': 'parcialmente nublado', 'Overcast': 'cubierto',
  'Rain': 'lluvia', 'Light rain': 'lluvia leve', 'Heavy rain': 'lluvia intensa',
  'Thundery outbreaks possible': 'posibles tormentas', 'Patchy rain possible': 'lluvia parcial',
  'Blizzard': 'tormenta de nieve', 'Fog': 'niebla', 'Mist': 'neblina'
}

async function getWeather() {
  try {
    const loc = WEATHER_LOCATION ? encodeURIComponent(WEATHER_LOCATION) : ''
    const url = `https://wttr.in/${loc}?format=j1`
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const data = await res.json()
    const cond = data.current_condition?.[0]
    if (!cond) return null
    const temp = cond.temp_C
    const descEn = cond.weatherDesc?.[0]?.value || ''
    const desc = WEATHER_TRANSLATIONS[descEn] || descEn.toLowerCase()
    return { temp, desc }
  } catch {
    return null
  }
}

async function getNewsHeadline() {
  if (!process.env.SERPER_API_KEY) return null
  try {
    const results = await searchWeb('últimas noticias Argentina')
    return results[0]?.title || null
  } catch {
    return null
  }
}

export async function generateBriefing() {
  const now     = new Date()
  const hour    = now.getHours()
  const name    = SESSION_NAME.charAt(0).toUpperCase() + SESSION_NAME.slice(1)
  const parts   = [`${greetingByHour(hour)}, ${name}. Son las ${formatTime(now)}.`]

  const [weather, calendarText, headline] = await Promise.allSettled([
    getWeather(),
    CALENDAR_ENABLED ? getTodayEvents() : Promise.resolve(null),
    getNewsHeadline()
  ])

  // Weather
  const w = weather.status === 'fulfilled' ? weather.value : null
  if (w) parts.push(`Afuera hay ${w.temp} grados y está ${w.desc}.`)

  // Calendar
  const cal = calendarText.status === 'fulfilled' ? calendarText.value : null
  if (cal && !cal.includes('No tenés eventos')) {
    const eventLines = cal.split('\n').filter(l => l.startsWith('-'))
    const n = eventLines.length
    if (n > 0) {
      parts.push(`Tenés ${n} evento${n > 1 ? 's' : ''} pendiente${n > 1 ? 's' : ''} hoy.`)
    } else {
      parts.push('Sin eventos pendientes hoy.')
    }
  } else {
    parts.push('Sin eventos pendientes hoy.')
  }

  // News
  const news = headline.status === 'fulfilled' ? headline.value : null
  parts.push(news ? `En las noticias: ${news}.` : 'Sin novedades urgentes por ahora.')

  return parts.join(' ')
}
