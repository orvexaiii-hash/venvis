import { execFile } from 'node:child_process'
import { db } from './db.mjs'

const PHONE_IP       = process.env.PHONE_IP
const CHECK_INTERVAL = 60_000
const MISS_THRESHOLD = 2   // consecutive misses before declaring departure

let wasHome     = false
let missStreak  = 0

function ping(ip) {
  return new Promise(resolve => {
    const [cmd, args] = process.platform === 'win32'
      ? ['ping', ['-n', '1', '-w', '1000', ip]]
      : ['ping', ['-c', '1', '-W', '1', ip]]
    execFile(cmd, args, { timeout: 5000 }, (err) => resolve(!err))
  })
}

function prunePresencia() {
  db.prepare('DELETE FROM presencia WHERE id NOT IN (SELECT id FROM presencia ORDER BY id DESC LIMIT 100)').run()
}

export function startPresence(onArrival) {
  if (!PHONE_IP) {
    console.log('[Presence] PHONE_IP no configurado — módulo desactivado.')
    return
  }
  const last = db.prepare('SELECT status FROM presencia ORDER BY id DESC LIMIT 1').get()
  wasHome = last?.status === 'home'
  console.log(`[Presence] Iniciado. Estado inicial: ${wasHome ? 'home' : 'away'}`)

  setInterval(async () => {
    try {
      const isHome = await ping(PHONE_IP)
      if (isHome) {
        missStreak = 0
        if (!wasHome) {
          db.prepare('INSERT INTO presencia (status) VALUES (?)').run('home')
          prunePresencia()
          wasHome = true
          console.log('[Presence] Llegó a casa.')
          onArrival()
        }
      } else {
        missStreak++
        if (wasHome && missStreak >= MISS_THRESHOLD) {
          db.prepare('INSERT INTO presencia (status) VALUES (?)').run('away')
          prunePresencia()
          wasHome = false
          missStreak = 0
          console.log('[Presence] Salió de casa.')
        }
      }
    } catch (err) {
      console.error('[Presence] Error en ping:', err.message)
    }
  }, CHECK_INTERVAL)
}

export function getPresenceStatus() {
  return wasHome ? 'home' : 'away'
}
