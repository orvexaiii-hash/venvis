/* global io, marked */

const socket = io()
let SESSION_ID   = localStorage.getItem('venvis_session') || null
let SESSION_USER = localStorage.getItem('venvis_user')   || null

let currentMode       = 'chat'
let isRecording       = false
let recognition       = null
let pendingVenvisBubble = null
let accumulatedText   = ''
let conversationActive = false
let sendTimer         = null
let waitingForTTS     = false
let ttsPlaying        = false
const SEND_DELAY_MS   = 1500


const chatView        = document.getElementById('chatView')
const voiceView       = document.getElementById('voiceView')
const messages        = document.getElementById('messages')
const chatInput       = document.getElementById('chatInput')
const btnSend         = document.getElementById('btnSend')
const btnMode         = document.getElementById('btnMode')
const modeLabel       = document.getElementById('modeLabel')
const btnPTT          = document.getElementById('btnPTT')
const voiceStatus     = document.getElementById('voiceStatus')
const voiceStatusText = document.getElementById('voiceStatusText')
const voiceTrans      = document.getElementById('voiceTranscript')
const btnAudio        = document.getElementById('btnAudio')
const btnMemory       = document.getElementById('btnMemory')
const btnAttach       = document.getElementById('btnAttach')
const fileInput       = document.getElementById('fileInput')
const imgPreview      = document.getElementById('imgPreview')
const imgPreviewThumb = document.getElementById('imgPreviewThumb')
const btnRemoveImg    = document.getElementById('btnRemoveImg')
const sessionPicker   = document.getElementById('sessionPicker')
const connDot         = document.getElementById('connDot')

// ── SESSION PICKER ──
function initSessionPicker() {
  if (SESSION_ID) {
    sessionPicker.classList.add('hidden')
    return
  }
  document.querySelectorAll('.session-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      SESSION_ID   = btn.dataset.session
      SESSION_USER = btn.dataset.name
      localStorage.setItem('venvis_session', SESSION_ID)
      localStorage.setItem('venvis_user',    SESSION_USER)
      sessionPicker.classList.add('hidden')
    })
  })
}
initSessionPicker()

// ── CONNECTION STATUS ──
socket.on('connect',    () => { connDot.className = 'conn-dot connected';    connDot.title = 'Conectado' })
socket.on('disconnect', () => { connDot.className = 'conn-dot disconnected'; connDot.title = 'Desconectado — reconectando...' })
socket.on('reconnect',  () => { connDot.className = 'conn-dot connected';    connDot.title = 'Conectado' })

let audioEnabled = true
let currentAudio = null
let pendingImageBase64 = null
let pendingImageType   = null

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

// ── IMAGE ATTACH ──
const ALLOWED_TYPES = { 'image/jpeg': true, 'image/png': true, 'image/gif': true, 'image/webp': true }
const MAX_SIZE = 5 * 1024 * 1024

function loadImageFile(file) {
  if (!file || !ALLOWED_TYPES[file.type]) return
  if (file.size > MAX_SIZE) { alert('La imagen supera el límite de 5MB.'); return }
  const reader = new FileReader()
  reader.onload = (e) => {
    const dataUrl = e.target.result
    const comma = dataUrl.indexOf(',')
    pendingImageBase64 = dataUrl.slice(comma + 1)
    pendingImageType   = file.type
    imgPreviewThumb.src = dataUrl
    imgPreview.classList.remove('hidden')
    btnAttach.classList.add('has-image')
  }
  reader.readAsDataURL(file)
}

function clearPendingImage() {
  pendingImageBase64 = null
  pendingImageType   = null
  imgPreviewThumb.src = ''
  imgPreview.classList.add('hidden')
  btnAttach.classList.remove('has-image')
  fileInput.value = ''
}

btnAttach.addEventListener('click', () => fileInput.click())
fileInput.addEventListener('change', () => loadImageFile(fileInput.files[0]))
btnRemoveImg.addEventListener('click', clearPendingImage)

document.addEventListener('paste', (e) => {
  if (currentMode !== 'chat') return
  const item = [...e.clipboardData.items].find(i => i.kind === 'file' && ALLOWED_TYPES[i.type])
  if (item) loadImageFile(item.getAsFile())
})

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
  recognition.lang = 'es'
  recognition.continuous = true
  recognition.interimResults = true

  recognition.onstart = () => {
    isRecording = true
    btnPTT.classList.add('recording')
    setVoiceState('listening')
  }

  recognition.onresult = (e) => {
    if (ttsPlaying) return   // descartar todo lo que escucha mientras VENVIS habla
    let interim = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript
      if (e.results[i].isFinal) {
        accumulatedText += t + ' '
        clearTimeout(sendTimer)
        sendTimer = setTimeout(sendAccumulated, SEND_DELAY_MS)
      } else {
        interim = t
      }
    }
    voiceTrans.textContent = `Vos: ${(accumulatedText + interim).trim()}`
  }

  recognition.onerror = (e) => {
    console.error('[STT]', e.error)
    if (e.error === 'not-allowed') {
      voiceStatusText.textContent = 'Permiso de micrófono denegado'
      voiceStatus.className = 'voice-status'
      stopConversation()
    }
    // no-speech / network: onend se encarga de reiniciar
  }

  recognition.onend = () => {
    isRecording = false
    btnPTT.classList.remove('recording')
    if (!conversationActive || waitingForTTS || sendTimer) return
    // silencio sin hablar y sin timer pendiente — reiniciar escucha
    setTimeout(() => {
      if (conversationActive && !waitingForTTS && !sendTimer) startListeningLoop()
    }, 200)
  }
}

initSpeechRecognition()

function sendAccumulated() {
  sendTimer = null
  const text = accumulatedText.trim()
  accumulatedText = ''
  if (!text || !conversationActive) return
  isRecording = false
  waitingForTTS = true
  try { recognition.abort() } catch (_) {}
  voiceTrans.textContent = `Vos: ${text}`
  setVoiceState('processing')
  socket.emit('user_message', { text, sessionId: SESSION_ID, voiceMode: true })
}

function startListeningLoop() {
  if (!recognition || isRecording || !conversationActive) return
  accumulatedText = ''
  try { recognition.start() } catch (_) {}
}

function handleInterrupt() {
  stopCurrentAudio()
  clearTimeout(sendTimer); sendTimer = null
  waitingForTTS = false
  btnInterrupt.classList.add('hidden')
  // mantener ttsPlaying=true 400ms para que el eco del parlante no entre al mic
  setTimeout(() => {
    ttsPlaying = false
    accumulatedText = ''
    if (conversationActive) startListeningLoop()
  }, 400)
}

function stopConversation() {
  conversationActive = false
  isRecording = false
  waitingForTTS = false
  ttsPlaying = false
  clearTimeout(sendTimer)
  sendTimer = null
  try { recognition.abort() } catch (_) {}
  stopCurrentAudio()
  btnPTT.classList.remove('recording')
  btnPTT.textContent = '🎙'
  btnInterrupt.classList.add('hidden')
  setVoiceState('idle')
}

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
  if (!text && !pendingImageBase64) return
  chatInput.value = ''

  appendUserMessage(text, pendingImageBase64)

  const payload = { text: text || '', sessionId: SESSION_ID }
  if (pendingImageBase64) {
    payload.imageBase64 = pendingImageBase64
    payload.imageType   = pendingImageType
  }
  clearPendingImage()

  btnSend.disabled = true
  chatInput.disabled = true
  pendingVenvisBubble = appendVenvisThinking()
  socket.emit('user_message', payload)
}

btnSend.addEventListener('click', sendChatMessage)
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage() }
})

function msgTime() {
  return new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function appendUserMessage(text, imageBase64) {
  const div = document.createElement('div')
  div.className = 'msg-user'
  if (imageBase64) {
    const img = document.createElement('img')
    img.className = 'msg-user-img'
    img.src = imgPreviewThumb.src || `data:image/jpeg;base64,${imageBase64}`
    div.appendChild(img)
  }
  if (text) {
    const span = document.createElement('span')
    span.textContent = text
    div.appendChild(span)
  }
  const ts = document.createElement('span')
  ts.className = 'msg-timestamp'
  ts.textContent = msgTime()
  div.appendChild(ts)
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
    const ts = document.createElement('span')
    ts.className = 'msg-timestamp'
    ts.textContent = msgTime()
    pendingVenvisBubble.appendChild(ts)
    pendingVenvisBubble.dataset.raw = ''
    pendingVenvisBubble = null
  }
  btnSend.disabled = false
  chatInput.disabled = false
  chatInput.focus()
  scrollBottom()
  // venvis_audio llega separado y maneja el reinicio; si no llega en 4s, reanudar igual
  if (currentMode === 'voice' && waitingForTTS) {
    setTimeout(() => { if (waitingForTTS) resumeConversation() }, 4000)
  }
})

socket.on('venvis_audio', ({ audioBase64 }) => {
  ttsPlaying = true       // bloquear STT antes de que suene nada
  clearTimeout(sendTimer)
  sendTimer = null
  accumulatedText = ''
  isRecording = false
  try { recognition.abort() } catch (_) {}

  if (!audioEnabled) {
    ttsPlaying = false
    if (currentMode === 'voice') resumeConversation()
    return
  }
  stopCurrentAudio()
  const bytes = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0))
  const blob = new Blob([bytes], { type: 'audio/mpeg' })
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  currentAudio = audio
  if (currentMode === 'voice') {
    setVoiceState('speaking')
    if (conversationActive) btnInterrupt.classList.remove('hidden')
  }
  audio.addEventListener('ended', () => {
    URL.revokeObjectURL(url)
    currentAudio = null
    btnInterrupt.classList.add('hidden')
    setTimeout(() => {
      ttsPlaying = false
      if (currentMode === 'voice') resumeConversation()
    }, 500)
  })
  audio.play().catch(() => {
    ttsPlaying = false
    if (currentMode === 'voice') resumeConversation()
  })
})

function resumeConversation() {
  waitingForTTS = false
  if (conversationActive) {
    setVoiceState('listening')
    startListeningLoop()
  } else {
    setVoiceState('idle')
  }
}

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

socket.on('venvis_proactive', ({ text, audioBase64 }) => {
  const div = document.createElement('div')
  div.className = 'msg-venvis'
  div.innerHTML = marked.parse(text || '')
  const ts = document.createElement('span')
  ts.className = 'msg-timestamp'
  ts.textContent = msgTime()
  div.appendChild(ts)
  messages.appendChild(div)
  scrollBottom()

  if (currentMode === 'voice') {
    voiceTrans.textContent = text ? text.slice(0, 100) + (text.length > 100 ? '…' : '') : ''
  }

  if (audioBase64 && audioEnabled) {
    stopCurrentAudio()
    const bytes = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0))
    const blob  = new Blob([bytes], { type: 'audio/mpeg' })
    const url   = URL.createObjectURL(blob)
    const audio = new Audio(url)
    currentAudio = audio
    if (currentMode === 'voice') setVoiceState('speaking')
    audio.addEventListener('ended', () => {
      URL.revokeObjectURL(url)
      currentAudio = null
      if (currentMode === 'voice') setVoiceState('idle')
    })
    audio.play().catch(() => {})
  }
})

// ── VOZ: botón de conversación continua ──
const btnInterrupt = document.getElementById('btnInterrupt')

btnPTT.addEventListener('click', () => {
  if (!conversationActive) {
    conversationActive = true
    btnPTT.textContent = '⏹'
    startListeningLoop()
  } else {
    stopConversation()
  }
})
btnPTT.addEventListener('touchstart', (e) => { e.preventDefault(); btnPTT.click() }, { passive: false })

btnInterrupt.addEventListener('click', handleInterrupt)
btnInterrupt.addEventListener('touchstart', (e) => { e.preventDefault(); handleInterrupt() }, { passive: false })

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

// ── PUSH NOTIFICATIONS ──
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

async function subscribeToPush(reg) {
  try {
    const existing = await reg.pushManager.getSubscription()
    if (existing) return

    const res = await fetch('/api/push/vapid-key')
    if (!res.ok) return
    const { publicKey } = await res.json()
    if (!publicKey) return

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    })
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub)
    })
  } catch (err) {
    console.error('[Push]', err)
  }
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then(reg => {
      if ('PushManager' in window) subscribeToPush(reg)
    })
    .catch(err => console.error('[SW]', err))
}
