import Anthropic from '@anthropic-ai/sdk'
import { saveMemory, getAllMemories } from './memory.mjs'
import { saveReminder, saveRecurringReminder, listReminders, deleteReminder } from './reminders.mjs'
import { getUser } from './users.mjs'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-haiku-4-5-20251001'

const histories = new Map()

function getHistory(phone) {
  if (!histories.has(phone)) histories.set(phone, [])
  return histories.get(phone)
}

function trimHistory(phone) {
  const h = getHistory(phone)
  if (h.length > 20) h.splice(0, h.length - 20)
}

const TOOLS = [
  {
    name: 'save_reminder',
    description: 'Guarda un recordatorio único con fecha y hora exacta.',
    input_schema: {
      type: 'object',
      properties: {
        text:      { type: 'string', description: 'Descripción del recordatorio' },
        remind_at: { type: 'string', description: 'ISO 8601, ej: 2026-05-10T15:00:00Z' }
      },
      required: ['text', 'remind_at']
    }
  },
  {
    name: 'save_recurring_reminder',
    description: 'Guarda un recordatorio que se repite periódicamente.',
    input_schema: {
      type: 'object',
      properties: {
        text:            { type: 'string' },
        first_remind_at: { type: 'string', description: 'Primera ocurrencia ISO 8601' },
        recurrence:      { type: 'string', description: '"daily" o "weekly:MON", "weekly:FRI", etc.' }
      },
      required: ['text', 'first_remind_at', 'recurrence']
    }
  },
  {
    name: 'save_memory',
    description: 'Guarda un dato importante del usuario: DNI, contraseña, dirección, nota, etc.',
    input_schema: {
      type: 'object',
      properties: {
        key:   { type: 'string', description: 'Etiqueta corta, ej: "DNI", "contraseña Netflix"' },
        value: { type: 'string', description: 'El valor a guardar' }
      },
      required: ['key', 'value']
    }
  },
  {
    name: 'get_memory',
    description: 'Recupera un dato guardado del usuario.',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Etiqueta del dato a recuperar' }
      },
      required: ['key']
    }
  },
  {
    name: 'list_reminders',
    description: 'Lista los recordatorios activos del usuario.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'delete_reminder',
    description: 'Elimina un recordatorio por su ID numérico.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'integer', description: 'ID del recordatorio a eliminar' }
      },
      required: ['id']
    }
  }
]

function buildSystemPrompt(userName) {
  const name = userName || 'amigo'
  const now = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })
  return `Sos Aria, una asistente personal de agenda. Hablás en español argentino, de forma natural y amigable. Sin markdown. Sin emojis en exceso.
Fecha y hora actual: ${now}. El usuario se llama ${name}.
Respondés en máximo 2-3 oraciones cortas. Cuando usás herramientas, confirmás el resultado brevemente.`
}

async function executeTool(phone, name, input) {
  switch (name) {
    case 'save_reminder':
      saveReminder(phone, input.text, input.remind_at)
      return { success: true }
    case 'save_recurring_reminder':
      saveRecurringReminder(phone, input.text, input.first_remind_at, input.recurrence)
      return { success: true }
    case 'save_memory':
      saveMemory(phone, input.key, input.value)
      return { success: true }
    case 'get_memory': {
      const all = getAllMemories(phone)
      const found = all.find(m => m.key.toLowerCase() === input.key.toLowerCase())
      return found ? { value: found.value } : { value: null, message: 'No encontré ese dato guardado.' }
    }
    case 'list_reminders':
      return { reminders: listReminders(phone) }
    case 'delete_reminder':
      deleteReminder(input.id, phone)
      return { success: true }
    default:
      return { error: 'unknown tool' }
  }
}

export async function chat(phone, userMessage) {
  const user = getUser(phone)
  const history = getHistory(phone)

  history.push({ role: 'user', content: userMessage })
  trimHistory(phone)

  let response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: buildSystemPrompt(user?.name),
    tools: TOOLS,
    messages: history
  })

  while (response.stop_reason === 'tool_use') {
    const toolBlock = response.content.find(b => b.type === 'tool_use')
    const result = await executeTool(phone, toolBlock.name, toolBlock.input)

    history.push({ role: 'assistant', content: response.content })
    history.push({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: toolBlock.id, content: JSON.stringify(result) }]
    })

    response = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: buildSystemPrompt(user?.name),
      tools: TOOLS,
      messages: history
    })
  }

  const text = response.content.find(b => b.type === 'text')?.text ?? ''
  history.push({ role: 'assistant', content: text })
  trimHistory(phone)
  return text
}
