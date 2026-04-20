import 'dotenv/config'
import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

import { streamResponse } from './brain.mjs'
import { textToSpeech } from './tts.mjs'
import { getAllMemory, getRecentMessages, deleteMemory, ensureSession } from './memory.mjs'

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

app.delete('/api/memory/:key', (req, res) => {
  const sessionId = req.query.session || DEFAULT_SESSION
  deleteMemory(sessionId, decodeURIComponent(req.params.key))
  res.json({ ok: true })
})

io.on('connection', (socket) => {
  socket.on('user_message', async ({ text, sessionId }) => {
    const sid = sessionId || DEFAULT_SESSION
    try {
      const fullText = await streamResponse(socket, text, sid)
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
