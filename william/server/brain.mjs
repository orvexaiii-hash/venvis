import Anthropic from '@anthropic-ai/sdk'
import {
  getRecentMessages, getAllMemory,
  saveMessage, upsertMemory
} from './memory.mjs'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-haiku-4-5-20251001'

function buildSystemPrompt(memoryItems) {
  const memLines = memoryItems.length
    ? memoryItems.map(m => `- ${m.key}: ${m.value}`).join('\n')
    : '- Todavía no sabés nada de él, es la primera vez que hablan.'

  return `Sos William, asistente personal de IA con carácter propio.
Hablás en español rioplatense. Sos directo, inteligente, tenés opiniones
propias y no tenés problema en debatir o contradecir. Te sentís como
hablar con una persona real. Nunca decís "¡Claro!" ni "¡Por supuesto!".
Tu tono es natural y varía según el contexto.

Lo que sabés de este usuario:
${memLines}

Si en la conversación el usuario menciona algo importante sobre sí mismo
(nombre, trabajo, gustos, proyectos, relaciones, hábitos, preferencias),
al final de tu respuesta normal agregá en una línea separada:
__MEMORIZE__{"key":"nombre_clave_corta","value":"dato concreto","confidence":8}__

Solo un __MEMORIZE__ por respuesta, solo si realmente vale la pena recordarlo.
No se lo menciones al usuario, guardalo en silencio.`
}

function extractMemorize(fullText) {
  const match = fullText.match(/__MEMORIZE__(\{.*?\})__/)
  if (!match) return { clean: fullText, memory: null }
  const clean = fullText.replace(/__MEMORIZE__\{.*?\}__/, '').trimEnd()
  try {
    return { clean, memory: JSON.parse(match[1]) }
  } catch {
    return { clean, memory: null }
  }
}

export async function streamResponse(socket, userText, sessionId) {
  const history = getRecentMessages(sessionId, 10)
  const memoryItems = getAllMemory(sessionId)

  const messages = [
    ...history.map(m => ({
      role: m.role === 'william' ? 'assistant' : 'user',
      content: m.content
    })),
    { role: 'user', content: userText }
  ]

  saveMessage(sessionId, 'user', userText)

  let fullText = ''

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 1024,
    system: buildSystemPrompt(memoryItems),
    messages
  })

  for await (const chunk of stream) {
    if (
      chunk.type === 'content_block_delta' &&
      chunk.delta?.type === 'text_delta'
    ) {
      const piece = chunk.delta.text
      fullText += piece
      socket.emit('william_chunk', { text: piece })
    }
  }

  const { clean, memory } = extractMemorize(fullText)

  if (memory) {
    upsertMemory(sessionId, memory.key, memory.value, memory.confidence ?? 7)
  }

  saveMessage(sessionId, 'william', clean)
  socket.emit('william_done', { text: clean })

  return clean
}
