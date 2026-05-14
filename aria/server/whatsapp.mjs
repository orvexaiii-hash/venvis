import pkg from 'whatsapp-web.js'
import { exec } from 'child_process'
import { createServer } from 'http'
import { chat } from './brain.mjs'
import { getUser, activateUser, setUserName, createActivationCode, listUsers, deactivateUser, makeAdmin, isAdmin } from './users.mjs'
import { handleCallback as gcalCallback, isConfigured as gcalConfigured } from './gcal.mjs'

const { Client, LocalAuth } = pkg

const AUTH_DIR    = process.env.AUTH_DIR  || './data/auth'
const ADMIN_PHONE = process.env.ADMIN_PHONE

let client = null
let startupTime = 0

// ── QR server (SSE) ─────────────────────────────────────
let currentQR = null
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

  if (req.url === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
    sseClients.add(res)
    if (currentQR) res.write(`data: ${currentQR}\n\n`)
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
  qrServer.listen(8765, () => {
    console.log('\n[Aria] Escaneá el QR en: http://localhost:8765\n')
    if (process.platform === 'win32') exec('start "" "http://localhost:8765"')
  })
}

function broadcastQR(qrData) {
  currentQR = qrData
  for (const c of sseClients) c.write(`data: ${qrData}\n\n`)
}

// ── Message handling ─────────────────────────────────────
export async function stopWhatsApp() {
  if (client) {
    try { await client.destroy() } catch (_) {}
    client = null
  }
}

export async function sendMessage(chatId, text) {
  if (!client) return
  try {
    const fullId = chatId.includes('@') ? chatId : `${chatId}@c.us`
    const chat = await client.getChatById(fullId)
    await chat.sendMessage(text)
  } catch (err) {
    console.error(`[sendMessage] Error enviando a ${chatId}:`, err.message)
  }
}

async function handleAdminCommand(text, replyFn) {
  const parts = text.trim().split(/\s+/)
  const cmd   = parts[0]

  if (cmd === '/generar-codigo') {
    const phone = parts[1]
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
  if (cmd === '/desactivar') {
    const phone = parts[1]
    if (!phone) return replyFn('Uso: /desactivar <numero>')
    deactivateUser(phone)
    return replyFn(`Usuario ${phone} desactivado.`)
  }
  return replyFn('Comandos: /generar-codigo <num> | /listar-usuarios | /desactivar <num>')
}

async function handleMessage(msg) {
  const phone = msg._phone
  const text  = msg.body
  const replyFn = (txt) => msg.reply(txt)

  if (isAdmin(phone) && text.startsWith('/')) {
    return handleAdminCommand(text, replyFn)
  }

  const user = getUser(phone)

  if (!user) {
    createActivationCode(phone)
    await replyFn('Hola! Soy Aria, tu agenda personal con IA.\nPara activar tu cuenta, enviame tu código de activación.')
    for (const admin of listUsers().filter(u => u.is_admin)) {
      await sendMessage(admin.phone, `📱 Nuevo usuario: ${phone} quiere activarse.\nUsá /generar-codigo ${phone}`)
    }
    return
  }

  if (!user.active) {
    const code = text.trim().toUpperCase()
    if (!code.startsWith('ARIA-')) {
      return replyFn('Tu cuenta está pausada. Si ya tenés un código de activación, enviámelo. Si no, contactá al administrador.')
    }
    const result = activateUser(phone, code)
    if (result.success) {
      if (user.name) return replyFn(`Bienvenido de nuevo, ${user.name}! Tu cuenta está activa otra vez. ¿En qué te ayudo?`)
      return replyFn('Código válido! Para terminar, decime: ¿cómo te llamás?')
    }
    if (result.reason === 'expired') return replyFn('Ese código expiró. Pedí uno nuevo al administrador.')
    return replyFn('Código incorrecto. Verificá que lo hayas copiado bien.')
  }

  if (!user.name) {
    const name = text.trim()
    setUserName(phone, name)
    return replyFn(`Hola ${name}! Tu agenda ya está activa.\nPodés decirme cosas como "recordame el dentista mañana a las 15" o "guardá mi DNI: 12345678". ¿En qué te ayudo?`)
  }

  const reply = await chat(phone, text, msg._image ?? null)
  return replyFn(reply)
}

// ── WhatsApp client ──────────────────────────────────────
export async function startWhatsApp() {
  startQRServer()

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: AUTH_DIR }),
    puppeteer: {
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    }
  })

  client.on('qr', (qr) => {
    broadcastQR(qr)
    console.log('[Aria] QR generado — abrí http://localhost:8765 para escanearlo')
  })

  client.on('ready', () => {
    console.log('[WhatsApp] Conectado.')
    currentQR = null
    startupTime = Math.floor(Date.now() / 1000)
  })

  client.on('disconnected', (reason) => {
    console.log('[WhatsApp] Desconectado:', reason)
  })

  client.on('message', async (msg) => {
    if (msg.fromMe) return
    if (msg.timestamp < startupTime) return
    if (msg.from.endsWith('@g.us')) return
    if (!msg.body && !msg.hasMedia) return
    try {
      msg._phone = msg.from
      if (msg.hasMedia) {
        const media = await msg.downloadMedia()
        if (media && media.mimetype.startsWith('image/')) {
          msg._image = { data: media.data, mimetype: media.mimetype }
        }
      }
      console.log(`[MSG] phone=${msg._phone} image=${!!msg._image} body=${(msg.body || '').substring(0, 50)}`)
      await handleMessage(msg)
    } catch (err) {
      console.error('[WhatsApp] Error:', err.message, err.stack)
    }
  })

  await client.initialize()
}
