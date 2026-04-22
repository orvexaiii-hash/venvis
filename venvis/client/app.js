/* global io, marked */

const socket = io()
const SESSION_ID = 'agus'

let currentMode = 'chat'
let isRecording = false
let recognition = null
let pendingVenvisBubble = null

const chatView       = document.getElementById('chatView')
const voiceView      = document.getElementById('voiceView')
const messages       = document.getElementById('messages')
const chatInput      = document.getElementById('chatInput')
const btnSend        = document.getElementById('btnSend')
const btnMode        = document.getElementById('btnMode')
const modeLabel      = document.getElementById('modeLabel')
const btnPTT         = document.getElementById('btnPTT')
const voiceStatus     = document.getElementById('voiceStatus')
const voiceStatusText = document.getElementById('voiceStatusText')
const voiceTrans     = document.getElementById('voiceTranscript')
const btnAudio       = document.getElementById('btnAudio')
const btnMemory      = document.getElementById('btnMemory')

let audioEnabled = true
let currentAudio = null

btnAudio.addEventListener('click', () => {
  audioEnabled = !audioEnabled
  btnAudio.textContent = audioEnabled ? '🔊' : '🔇'
  btnAudio.title = audioEnabled ? 'Silenciar audio' : 'Activar audio'
  if (!audioEnabled && currentAudio) stopCurrentAudio()
})

function stopCurrentAudio() {
  if (!currentAudio) return
  currentAudio.pause()
  currentAudio.currentTime = 0
  currentAudio = null
}
const memoryOverlay  = document.getElementById('memoryOverlay')
const memoryList     = document.getElementById('memoryList')
const btnCloseMemory = document.getElementById('btnCloseMemory')

// ── SPEECH RECOGNITION SETUP ──
const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition

function initSpeechRecognition() {
  if (!SpeechRecognitionAPI) {
    voiceStatus.textContent = 'Solo disponible en Chrome/Edge'
    btnPTT.disabled = true
    return
  }
  recognition = new SpeechRecognitionAPI()
  recognition.lang = 'es-AR'
  recognition.continuous = false
  recognition.interimResults = false

  recognition.onstart = () => {
    isRecording = true
    btnPTT.classList.add('recording')
    setVoiceState('listening')
    voiceTrans.textContent = ''
  }

  recognition.onresult = (e) => {
    const text = e.results[0][0].transcript.trim()
    if (!text) return
    voiceTrans.textContent = `Vos: ${text}`
    setVoiceState('processing')
    socket.emit('user_message', { text, sessionId: SESSION_ID, voiceMode: true })
  }

  recognition.onerror = (e) => {
    console.error('[STT]', e.error)
    if (e.error === 'not-allowed') {
      voiceStatusText.textContent = 'Permiso de micrófono denegado'
      voiceStatus.className = 'voice-status'
    } else {
      setVoiceState('idle')
    }
    isRecording = false
    btnPTT.classList.remove('recording')
  }

  recognition.onend = () => {
    isRecording = false
    btnPTT.classList.remove('recording')
    if (voiceStatus.classList.contains('listening')) setVoiceState('idle')
  }
}

initSpeechRecognition()

// ── VOICE STATE ──
function setVoiceState(state) {
  voiceStatus.className = 'voice-status ' + (state !== 'idle' ? state : '')
  const labels = {
    idle:       'Listo',
    listening:  'Escuchando',
    processing: 'Procesando',
    speaking:   'VENVIS está hablando'
  }
  voiceStatusText.textContent = labels[state] ?? state
}

// ── MODO TOGGLE ──
btnMode.addEventListener('click', () => {
  currentMode = currentMode === 'chat' ? 'voice' : 'chat'
  if (currentMode === 'chat') {
    chatView.classList.remove('hidden')
    voiceView.classList.add('hidden')
    modeLabel.textContent = 'Voz'
  } else {
    chatView.classList.add('hidden')
    voiceView.classList.remove('hidden')
    modeLabel.textContent = 'Chat'
    setVoiceState('idle')
  }
})

// ── CHAT ──
function sendChatMessage() {
  const text = chatInput.value.trim()
  if (!text) return
  chatInput.value = ''
  appendUserMessage(text)
  btnSend.disabled = true
  chatInput.disabled = true
  pendingVenvisBubble = appendVenvisThinking()
  socket.emit('user_message', { text, sessionId: SESSION_ID })
}

btnSend.addEventListener('click', sendChatMessage)
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage() }
})

function appendUserMessage(text) {
  const div = document.createElement('div')
  div.className = 'msg-user'
  div.textContent = text
  messages.appendChild(div)
  scrollBottom()
}

function appendVenvisThinking() {
  const div = document.createElement('div')
  div.className = 'msg-venvis'
  div.innerHTML = '<div class="thinking"><span></span><span></span><span></span></div>'
  messages.appendChild(div)
  scrollBottom()
  return div
}

function scrollBottom() {
  messages.scrollTop = messages.scrollHeight
}

// ── SOCKET EVENTS ──
socket.on('venvis_chunk', ({ text }) => {
  if (!pendingVenvisBubble) {
    pendingVenvisBubble = document.createElement('div')
    pendingVenvisBubble.className = 'msg-venvis'
    messages.appendChild(pendingVenvisBubble)
  }
  const thinking = pendingVenvisBubble.querySelector('.thinking')
  if (thinking) thinking.remove()
  pendingVenvisBubble.dataset.raw = (pendingVenvisBubble.dataset.raw || '') + text
  pendingVenvisBubble.innerHTML = marked.parse(pendingVenvisBubble.dataset.raw)
  scrollBottom()
})

socket.on('venvis_done', ({ text }) => {
  if (pendingVenvisBubble) {
    pendingVenvisBubble.innerHTML = marked.parse(text)
    pendingVenvisBubble.dataset.raw = ''
    pendingVenvisBubble = null
  }
  btnSend.disabled = false
  chatInput.disabled = false
  chatInput.focus()
  scrollBottom()
})

socket.on('venvis_audio', ({ audioBase64 }) => {
  if (!audioEnabled) return
  stopCurrentAudio()
  const bytes = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0))
  const blob = new Blob([bytes], { type: 'audio/mpeg' })
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  currentAudio = audio
  if (currentMode === 'voice') setVoiceState('speaking')
  audio.addEventListener('ended', () => {
    URL.revokeObjectURL(url)
    currentAudio = null
    if (currentMode === 'voice') setVoiceState('idle')
  })
  audio.play().catch(() => {})
})

socket.on('venvis_error', ({ message }) => {
  pendingVenvisBubble = null
  btnSend.disabled = false
  chatInput.disabled = false
  const div = document.createElement('div')
  div.className = 'msg-error'
  div.textContent = message
  messages.appendChild(div)
  scrollBottom()
  if (currentMode === 'voice') setVoiceState('idle')
})

// ── VOZ: push-to-talk con SpeechRecognition ──
function startListening() {
  if (!recognition || isRecording) return
  stopCurrentAudio()
  try {
    recognition.start()
  } catch (err) {
    console.error('[PTT] start error:', err)
  }
}

function stopListening() {
  if (!recognition || !isRecording) return
  recognition.stop()
}

btnPTT.addEventListener('mousedown', startListening)
btnPTT.addEventListener('touchstart', (e) => { e.preventDefault(); startListening() }, { passive: false })
btnPTT.addEventListener('mouseup', stopListening)
btnPTT.addEventListener('touchend', (e) => { e.preventDefault(); stopListening() }, { passive: false })
btnPTT.addEventListener('mouseleave', stopListening)

// ── MEMORIA ──
btnMemory.addEventListener('click', async () => {
  memoryOverlay.classList.remove('hidden')
  await loadMemory()
})

btnCloseMemory.addEventListener('click', () => {
  memoryOverlay.classList.add('hidden')
})

memoryOverlay.addEventListener('click', (e) => {
  if (e.target === memoryOverlay) memoryOverlay.classList.add('hidden')
})

async function loadMemory() {
  memoryList.innerHTML = '<p class="empty-state">Cargando...</p>'
  const res = await fetch(`/api/memory?session=${SESSION_ID}`)
  const items = await res.json()
  if (!items.length) {
    memoryList.innerHTML = '<p class="empty-state">Sin recuerdos aún.</p>'
    return
  }
  memoryList.innerHTML = ''
  for (const item of items) {
    const div = document.createElement('div')
    div.className = 'memory-item'
    div.innerHTML = `
      <div class="memory-item-body">
        <div class="memory-item-key">${escapeHtml(item.key)}</div>
        <div class="memory-item-value">${escapeHtml(item.value)}</div>
        <div class="memory-item-conf">Confianza: ${escapeHtml(String(item.confidence))}/10</div>
      </div>
      <button data-key="${escapeHtml(item.key)}" title="Olvidar">×</button>
    `
    div.querySelector('button').addEventListener('click', async (e) => {
      const key = e.currentTarget.dataset.key
      await fetch(`/api/memory/${encodeURIComponent(key)}?session=${SESSION_ID}`, { method: 'DELETE' })
      await loadMemory()
    })
    memoryList.appendChild(div)
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
