import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import { join } from 'path'
import qrcode from 'qrcode-terminal'
import { chat } from './brain.mjs'
import { getUser, activateUser, setUserName, createActivationCode, listUsers, deactivateUser } from './users.mjs'

const AUTH_DIR    = process.env.AUTH_DIR  || join(process.cwd(), 'data', 'auth')
const ADMIN_PHONE = process.env.ADMIN_PHONE

let sock = null

export async function sendMessage(phone, text) {
  if (!sock) return
  await sock.sendMessage(`${phone}@s.whatsapp.net`, { text })
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

async function handleMessage(phone, text) {
  const replyFn = (msg) => sendMessage(phone, msg)

  // Admin commands
  if (phone === ADMIN_PHONE && text.startsWith('/')) {
    return handleAdminCommand(text, replyFn)
  }

  const user = getUser(phone)

  // First contact — create pending record, notify admin
  if (!user) {
    createActivationCode(phone)
    await replyFn('Hola! Soy Aria, tu agenda personal con IA.\nPara activar tu cuenta, enviame tu código de activación.')
    if (ADMIN_PHONE) {
      await sendMessage(ADMIN_PHONE, `📱 Nuevo usuario: ${phone} quiere activarse.\nUsá /generar-codigo ${phone}`)
    }
    return
  }

  // Awaiting activation
  if (!user.active) {
    const result = activateUser(phone, text.trim().toUpperCase())
    if (result.success) return replyFn('Código válido! Para terminar, decime: ¿cómo te llamás?')
    if (result.reason === 'expired') return replyFn('Ese código expiró. Pedí uno nuevo.')
    return replyFn('Código incorrecto. Verificá que lo hayas copiado bien.')
  }

  // Awaiting name (onboarding)
  if (!user.name) {
    const name = text.trim()
    setUserName(phone, name)
    return replyFn(`Hola ${name}! Tu agenda ya está activa.\nPodés decirme cosas como "recordame el dentista mañana a las 15" o "guardá mi DNI: 12345678". ¿En qué te ayudo?`)
  }

  // Normal conversation
  const reply = await chat(phone, text)
  return replyFn(reply)
}

export async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)

  sock = makeWASocket({
    auth: state,
    logger: { level: 'silent', trace(){}, debug(){}, info(){}, warn(){}, error(o){ if(o?.err) console.error('[WA]', o.err.message) }, fatal(){}, child(){ return this } }
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('\nEscaneá este QR con WhatsApp → Dispositivos vinculados → Vincular dispositivo:\n')
      qrcode.generate(qr, { small: true })
    }
    if (connection === 'open') console.log('[WhatsApp] Conectado.')
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error instanceof Boom
        ? lastDisconnect.error.output?.statusCode !== DisconnectReason.loggedOut
        : true
      console.log('[WhatsApp] Desconectado. Reconectar:', shouldReconnect)
      if (shouldReconnect) startWhatsApp()
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (msg.key.fromMe || !msg.message) continue
      const jid = msg.key.remoteJid
      if (jid.endsWith('@g.us')) continue
      const phone = jid.replace('@s.whatsapp.net', '')
      const text  = msg.message?.conversation
                 || msg.message?.extendedTextMessage?.text
      if (!text) continue

      try {
        await handleMessage(phone, text)
      } catch (err) {
        console.error('[WhatsApp] Error:', err.message)
      }
    }
  })
}
