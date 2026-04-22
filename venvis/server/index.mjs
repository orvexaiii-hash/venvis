import 'dotenv/config'
import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

import { streamResponse } from './brain.mjs'
import { textToSpeech } from './tts.mjs'
import { getAllMemory, getRecentMessages, deleteMemory, ensureSession } from './memory.mjs'
import { google } from 'googleapis'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 3000
const SESSION_NAME = process.env.SESSION_NAME || 'agus'
const DEFAULT_SESSION = SESSION_NAME

ensureSession(DEFAULT_SESSION, SESSION_NAME)

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, { cors: { origin: '*' } })

app.use(express.json())
app.use(express.static(join(__dirname, '..', 'client')))

app.get('/api/memory', (req, res) => {
  const sessionId = req.query.session || DEFAULT_SESSION
  res.json(getAllMemory(sessionId))
})

app.get('/api/history', (req, res) => {
  const sessionId = req.query.session || DEFAULT_SESSION
  res.json(getRecentMessages(sessionId, 50))
})

// ── OAuth Calendar setup (rutas temporales) ──────────────
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  const oauthClient = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'https://venvis.orvexautomation.com/oauth/callback'
  )

  app.get('/oauth/start', (req, res) => {
    const url = oauthClient.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/calendar']
    })
    res.redirect(url)
  })

  app.get('/oauth/callback', async (req, res) => {
    try {
      const { tokens } = await oauthClient.getToken(req.query.code)
      res.send(`<pre style="font-size:18px;padding:20px">
✅ REFRESH TOKEN OBTENIDO

${tokens.refresh_token}

Copiá este valor y pasáselo a Claude.
</pre>`)
    } catch (e) {
      res.send(`<pre>Error: ${e.message}</pre>`)
    }
  })
}
// ─────────────────────────────────────────────────────────

app.delete('/api/memory/:key', (req, res) => {
  const sessionId = req.query.session || DEFAULT_SESSION
  deleteMemory(sessionId, decodeURIComponent(req.params.key))
  res.json({ ok: true })
})

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

io.on('connection', (socket) => {
  socket.on('user_message', async ({ text, sessionId, voiceMode, imageBase64, imageType }) => {
    const sid = sessionId || DEFAULT_SESSION

    let imageData = null
    if (imageBase64 && imageType) {
      if (!ALLOWED_IMAGE_TYPES.has(imageType)) {
        return socket.emit('venvis_error', { message: 'Tipo de imagen no soportado.' })
      }
      const byteLen = Math.ceil(imageBase64.length * 0.75)
      if (byteLen > MAX_IMAGE_BYTES) {
        return socket.emit('venvis_error', { message: 'La imagen supera el límite de 5MB.' })
      }
      imageData = { base64: imageBase64, mediaType: imageType }
    }

    try {
      const fullText = await streamResponse(socket, text || '', sid, !!voiceMode, imageData)
      const audioBuffer = await textToSpeech(fullText)
      if (audioBuffer) {
        socket.emit('venvis_audio', {
          audioBase64: audioBuffer.toString('base64')
        })
      }
    } catch (err) {
      console.error('[Socket] Error:', err.message)
      socket.emit('venvis_error', { message: 'Error interno del servidor' })
    }
  })
})

httpServer.listen(PORT, () => {
  console.log(`
╔════════════════════════════════╗
║   VENVIS está online           ║
║   http://localhost:${PORT}         ║
╚════════════════════════════════╝`)
  console.log('✓ Base de datos lista')
  console.log('✓ Edge TTS: disponible (es-AR-TomasNeural)')
  console.log(`Sesión activa: ${DEFAULT_SESSION}`)
})
