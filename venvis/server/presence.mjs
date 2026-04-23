// server/presence.mjs
import { exec } from 'node:child_process'
import { db } from './db.mjs'

const PHONE_IP       = process.env.PHONE_IP
const CHECK_INTERVAL = 60_000

let wasHome = false

function ping(ip) {
  return new Promise(resolve => {
    const cmd = process.platform === 'win32'
      ? `ping -n 1 -w 1000 ${ip}`
      : `ping -c 1 -W 1 ${ip}`
    exec(cmd, (err) => resolve(!err))
  })
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
      if (isHome && !wasHome) {
        db.prepare('INSERT INTO presencia (status) VALUES (?)').run('home')
        wasHome = true
        console.log('[Presence] Llegó a casa.')
        onArrival()
      } else if (!isHome && wasHome) {
        db.prepare('INSERT INTO presencia (status) VALUES (?)').run('away')
        wasHome = false
        console.log('[Presence] Salió de casa.')
      }
    } catch (err) {
      console.error('[Presence] Error en ping:', err.message)
    }
  }, CHECK_INTERVAL)
}

export function getPresenceStatus() {
  return wasHome ? 'home' : 'away'
}
