import { makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage } from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import { createServer } from 'http'
import { rmSync } from 'fs'
import { join } from 'path'
import { chat } from './brain.mjs'
import { getUser, activateUser, setUserName, createActivationCode, listUsers, deactivateUser, isAdmin, promoteToAdmin, activateUserDirect, isPaymentExpired } from './users.mjs'
import { saveImage } from './image-store.mjs'
import { handleCallback as gcalCallback, isConfigured as gcalConfigured } from './gcal.mjs'
import { handleAdminRequest, broadcastNewUser } from './admin.mjs'

const AUTH_DIR = process.env.AUTH_DIR || join(process.cwd(), 'data', 'auth')

let sock = null
let startupTime = 0

// ── QR server (SSE) ─────────────────────────────────────
let currentQR = null
let lastError = null
const sseClients = new Set()
let qrServerStarted = false

const qrServer = createServer(async (req, res) => {
  if (req.url.startsWith('/auth/google/callback') && gcalConfigured()) {
    const params = new URL(req.url, 'http://localhost').searchParams
    const code  = params.get('code')
    const state = params.get('state')
    if (code && state) {
      try {
        const phone = await gcalCallback(code, state)
        await sendMessage(phone, '¡Google Calendar conectado! Tus próximos recordatorios se van a guardar ahí automaticamente.')
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end('<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h2>✓ Google Calendar conectado</h2><p>Ya podés cerrar esta ventana y volver a WhatsApp.</p></body></html>')
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end('Error: ' + err.message)
      }
    } else {
      res.writeHead(400, { 'Content-Type': 'text/plain' })
      res.end('Faltan parámetros')
    }
    return
  }

  if (req.url === '/api/reset-session') {
    try {
      if (sock) { try { await sock.end() } catch (_) {} sock = null }
      try { rmSync(AUTH_DIR, { recursive: true, force: true }) } catch (_) {}
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('Session reset. Restarting...')
      setTimeout(() => startWhatsApp(), 1000)
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.end('Error: ' + err.message)
    }
    return
  }

  if (req.url.startsWith('/admin')) {
    return handleAdminRequest(req, res)
  }

  if (req.url === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
    sseClients.add(res)
    if (currentQR) res.write(`data: ${currentQR}\n\n`)
    if (lastError) res.write(`event: error\ndata: ${lastError}\n\n`)
    req.on('close', () => sseClients.delete(res))
    return
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Aria QR</title>
<style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;background:#111;color:#fff}
#c{border-radius:12px}p{opacity:.7;margin-top:12px}#status{margin-top:8px;color:#4caf50;font-weight:bold}</style></head>
<body><h2>Escaneá con WhatsApp</h2><canvas id="c"></canvas>
<p>Dispositivos vinculados → Vincular dispositivo</p><div id="status">Esperando QR...</div>
<script src="https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js"></script>
<script>
const es = new EventSource('/events')
es.onmessage = e => {
  QRCode.toCanvas(document.getElementById('c'), e.data, {width:320,color:{dark:'#000',light:'#fff'}})
  document.getElementById('status').textContent = 'QR listo — escanealo ahora!'
}
</script></body></html>`)
})

function startQRServer() {
  if (qrServerStarted) return
  qrServerStarted = true
  qrServer.listen(8765, () => console.log('\n[Aria] Escaneá el QR en: http://localhost:8765\n'))
}

function broadcastQR(qrData) {
  currentQR = qrData
  lastError = null
  for (const c of sseClients) c.write(`data: ${qrData}\n\n`)
}

// ── Sending ──────────────────────────────────────────────
export async function stopWhatsApp() {
  if (sock) { try { await sock.end() } catch (_) {} sock = null }
}

export async function sendMessage(phone, text) {
  if (!sock) return
  try {
    const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`
    await sock.sendMessage(jid, { text })
  } catch (err) {
    console.error(`[sendMessage] Error enviando a ${phone}:`, err.message)
  }
}

// ── Admin commands ───────────────────────────────────────
async function handleAdminCommand(text, replyFn) {
  const parts = text.trim().split(/\s+/)
  const cmd   = parts[0]

  if (cmd === '/generar-codigo') {
    let phone = parts[1]
    if (!phone) return replyFn('Uso: /generar-codigo <numero>')
    const code = createActivationCode(phone)
    return replyFn(`Código para ${phone}: ${code}\nExpira en 48 horas.`)
  }
  if (cmd === '/listar-usuarios') {
    const users = listUsers()
    if (!users.length) return replyFn('No hay usuarios registrados.')
    const lines = users.map(u => `${u.phone} | ${u.name || 'sin nombre'} | ${u.active ? 'activo' : 'pendiente'}`)
    return replyFn(lines.join('\n'))
  }
  if (cmd === '/habilitar-numero') {
    const phone = parts[1]
    if (!phone) return replyFn('Uso: /habilitar-numero <numero>')
    const r = activateUserDirect(phone)
    if (r.success) return replyFn(`Usuario ${r.phone} habilitado.`)
    return replyFn(`No encontré ese número. Asegurate que ya le haya escrito al bot primero.`)
  }
  if (cmd === '/desactivar') {
    const phone = parts[1]
    if (!phone) return replyFn('Uso: /desactivar <numero>')
    deactivateUser(phone)
    return replyFn(`Usuario ${phone} desactivado.`)
  }
  return replyFn('Comandos: /habilitar-numero <num> | /generar-codigo <num> | /listar-usuarios | /desactivar <num>')
}

// ── Message handling ─────────────────────────────────────
async function handleMessage(phone, text, imageData, imageId, replyFn, sendImageFn) {
  if (text && text.startsWith('/admin ')) {
    const secret = text.trim().split(/\s+/)[1]
    const adminKey = process.env.ADMIN_SECRET || 'aria-admin-2026'
    if (secret === adminKey) {
      promoteToAdmin(phone)
      return replyFn('Sos admin. Usá /listar-usuarios para empezar.')
    }
  }

  if (isAdmin(phone) && text && text.startsWith('/')) {
    return handleAdminCommand(text, replyFn)
  }

  const user = getUser(phone)

  if (!user) {
    createActivationCode(phone)
    await replyFn('Hola! 👋 Soy Aria, tu asistente personal con IA.\nYa registré tu número — el administrador va a activar tu cuenta pronto. Te aviso cuando esté lista!')
    broadcastNewUser(phone)
    for (const admin of listUsers().filter(u => u.is_admin)) {
      await sendMessage(admin.phone, `📱 Nuevo usuario quiere activarse.\nMandá: /habilitar-numero ${phone}`)
    }
    return
  }

  if (user.active && isPaymentExpired(phone)) {
    deactivateUser(phone)
    return replyFn('Tu suscripción venció. Contactá al administrador para renovarla.')
  }

  if (!user.active) {
    return replyFn('Hola! 👋 Tu cuenta todavía está pendiente de activación por el administrador. Te avisamos cuando esté lista!')
  }

  const { text: reply, imagesToSend } = await chat(phone, text, imageData, imageId)
  await replyFn(reply)
  for (const img of imagesToSend) {
    try { await sendImageFn(img) } catch (err) { console.error('[sendImage] Error:', err.message) }
  }
}

// ── WhatsApp client ──────────────────────────────────────
export async function startWhatsApp() {
  startQRServer()

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)

  sock = makeWASocket({
    auth: state,
    logger: { level: 'silent', trace(){}, debug(){}, info(){}, warn(){}, error(o){ if(o?.err) console.error('[WA]', o.err.message) }, fatal(){}, child(){ return this } },
    browser: ['Aria', 'Chrome', '1.0.0']
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      broadcastQR(qr)
      console.log('[Aria] QR generado')
    }
    if (connection === 'open') {
      console.log('[WhatsApp] Conectado.')
      currentQR = null
      startupTime = Math.floor(Date.now() / 1000)
    }
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error instanceof Boom
        ? lastDisconnect.error.output?.statusCode !== DisconnectReason.loggedOut
        : true
      console.log('[WhatsApp] Desconectado. Reconectar:', shouldReconnect)
      if (shouldReconnect) setTimeout(() => startWhatsApp(), 3000)
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const msg of messages) {
      if (msg.key.fromMe || !msg.message) continue
      const jid = msg.key.remoteJid
      if (!jid || jid.endsWith('@g.us')) continue
      if ((msg.messageTimestamp || 0) < startupTime) continue

      const phone = jid.replace('@s.whatsapp.net', '')
      const text  = msg.message?.conversation
                 || msg.message?.extendedTextMessage?.text
                 || msg.message?.imageMessage?.caption
                 || ''
      const replyFn = (txt) => sock.sendMessage(jid, { text: txt }, { quoted: msg })

      let imageData = null
      let imageId = null
      if (msg.message?.imageMessage) {
        try {
          const buffer = await downloadMediaMessage(msg, 'buffer', {})
          const mimetype = msg.message.imageMessage.mimetype || 'image/jpeg'
          imageData = { data: buffer.toString('base64'), mimetype }
          imageId = saveImage(phone, buffer, mimetype)
        } catch (_) {}
      }

      const sendImageFn = (img) => sock.sendMessage(jid, { image: img.buffer, mimetype: img.mimetype })
      console.log(`[MSG] phone=${phone} image=${!!imageData} body=${text.substring(0, 50)}`)
      try {
        await handleMessage(phone, text, imageData, imageId, replyFn, sendImageFn)
      } catch (err) {
        console.error('[WhatsApp] Error:', err.message)
      }
    }
  })
}
