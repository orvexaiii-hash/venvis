/* global io, marked */

const socket = io()
const SESSION_ID = 'agus'

let currentMode = 'chat'
let isRecording = false
let mediaRecorder = null
let audioChunks = []
let pendingWilliamBubble = null

const chatView        = document.getElementById('chatView')
const voiceView       = document.getElementById('voiceView')
const messages        = document.getElementById('messages')
const chatInput       = document.getElementById('chatInput')
const btnSend         = document.getElementById('btnSend')
const btnMode         = document.getElementById('btnMode')
const modeLabel       = document.getElementById('modeLabel')
const btnPTT          = document.getElementById('btnPTT')
const voiceStatus     = document.getElementById('voiceStatus')
const voiceTrans      = document.getElementById('voiceTranscript')
const btnMemory       = document.getElementById('btnMemory')
const memoryOverlay   = document.getElementById('memoryOverlay')
const memoryList      = document.getElementById('memoryList')
const btnCloseMemory  = document.getElementById('btnCloseMemory')

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
    voiceStatus.textContent = 'Listo'
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
  pendingWilliamBubble = appendWilliamThinking()
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

function appendWilliamThinking() {
  const div = document.createElement('div')
  div.className = 'msg-william'
  div.innerHTML = '<div class="thinking"><span></span><span></span><span></span></div>'
  messages.appendChild(div)
  scrollBottom()
  return div
}

function scrollBottom() {
  messages.scrollTop = messages.scrollHeight
}

// ── SOCKET EVENTS ──
socket.on('william_chunk', ({ text }) => {
  if (!pendingWilliamBubble) {
    pendingWilliamBubble = document.createElement('div')
    pendingWilliamBubble.className = 'msg-william'
    messages.appendChild(pendingWilliamBubble)
  }
  const thinking = pendingWilliamBubble.querySelector('.thinking')
  if (thinking) thinking.remove()

  pendingWilliamBubble.dataset.raw = (pendingWilliamBubble.dataset.raw || '') + text
  pendingWilliamBubble.innerHTML = marked.parse(pendingWilliamBubble.dataset.raw)
  scrollBottom()
})

socket.on('william_done', ({ text }) => {
  if (pendingWilliamBubble) {
    pendingWilliamBubble.innerHTML = marked.parse(text)
    pendingWilliamBubble.dataset.raw = ''
    pendingWilliamBubble = null
  }
  btnSend.disabled = false
  chatInput.disabled = false
  chatInput.focus()
  scrollBottom()
  if (currentMode === 'voice') voiceStatus.textContent = 'Listo'
})

socket.on('william_audio', ({ audioBase64 }) => {
  const bytes = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0))
  const blob = new Blob([bytes], { type: 'audio/mpeg' })
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  if (currentMode === 'voice') voiceStatus.textContent = 'Hablando...'
  audio.addEventListener('ended', () => {
    URL.revokeObjectURL(url)
    if (currentMode === 'voice') voiceStatus.textContent = 'Listo'
  })
  audio.play().catch(() => {})
})

socket.on('william_error', ({ message }) => {
  pendingWilliamBubble = null
  btnSend.disabled = false
  chatInput.disabled = false
  const div = document.createElement('div')
  div.className = 'msg-error'
  div.textContent = message
  messages.appendChild(div)
  scrollBottom()
  if (currentMode === 'voice') voiceStatus.textContent = 'Listo'
})

socket.on('user_transcript', ({ text }) => {
  voiceTrans.textContent = `Vos: ${text}`
})

// ── VOZ: push-to-talk ──
async function startRecording() {
  if (isRecording) return
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    audioChunks = []
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data) }
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop())
      const blob = new Blob(audioChunks, { type: 'audio/webm' })
      const arrayBuf = await blob.arrayBuffer()
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuf)))
      voiceStatus.textContent = 'Pensando...'
      socket.emit('user_audio', { audioBase64: base64, sessionId: SESSION_ID })
    }
    mediaRecorder.start()
    isRecording = true
    btnPTT.classList.add('recording')
    voiceStatus.textContent = 'Escuchando...'
    voiceTrans.textContent = ''
  } catch (err) {
    console.error('[PTT] Micrófono no disponible:', err)
    voiceStatus.textContent = 'Sin micrófono'
  }
}

function stopRecording() {
  if (!isRecording || !mediaRecorder) return
  isRecording = false
  btnPTT.classList.remove('recording')
  mediaRecorder.stop()
  mediaRecorder = null
}

btnPTT.addEventListener('mousedown', startRecording)
btnPTT.addEventListener('touchstart', (e) => { e.preventDefault(); startRecording() }, { passive: false })
btnPTT.addEventListener('mouseup', stopRecording)
btnPTT.addEventListener('touchend', (e) => { e.preventDefault(); stopRecording() }, { passive: false })
btnPTT.addEventListener('mouseleave', stopRecording)

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
        <div class="memory-item-conf">Confianza: ${item.confidence}/10</div>
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
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
