import Anthropic from '@anthropic-ai/sdk'
import { saveMemory, getAllMemories, deleteMemory } from './memory.mjs'
import { saveReminder, saveRecurringReminder, listReminders, deleteReminder, getReminderById, updateReminderGCalId } from './reminders.mjs'
import { getUser, setUserName } from './users.mjs'
import { db } from './db.mjs'
import { getImage, deleteImage } from './image-store.mjs'
import { isConfigured as gcalConfigured, isConnected as gcalConnected, getAuthUrl, createEvent as gcalCreate, deleteEvent as gcalDelete } from './gcal.mjs'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-haiku-4-5-20251001'

// ── Persistent history (DB-backed, in-memory cache) ──────
const historyCache = new Map()

function loadHistory(phone) {
  if (historyCache.has(phone)) return historyCache.get(phone)
  const rows = db.prepare(
    'SELECT role, content FROM chat_messages WHERE phone = ? ORDER BY id ASC'
  ).all(phone)
  const history = rows.map(r => {
    try { return { role: r.role, content: JSON.parse(r.content) } } catch { return null }
  }).filter(Boolean)
  historyCache.set(phone, history)
  return history
}

function saveHistory(phone) {
  const history = historyCache.get(phone) || []
  const last20 = history.slice(-20)
  db.prepare('DELETE FROM chat_messages WHERE phone = ?').run(phone)
  const stmt = db.prepare('INSERT INTO chat_messages (phone, role, content) VALUES (?, ?, ?)')
  for (const msg of last20) {
    stmt.run(phone, msg.role, JSON.stringify(msg.content))
  }
}

function trimHistory(phone) {
  const h = loadHistory(phone)
  if (h.length > 20) h.splice(0, h.length - 20)
}

// ── Tools ────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'save_reminder',
    description: 'Guarda un recordatorio único con fecha y hora exacta.',
    input_schema: {
      type: 'object',
      properties: {
        text:      { type: 'string', description: 'Descripción del recordatorio' },
        remind_at: { type: 'string', description: 'ISO 8601, ej: 2026-05-10T15:00:00-03:00' }
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
    description: 'Guarda un dato importante del usuario: DNI, contraseña, dirección, presupuesto, lista de cosas, etc. Para guardar referencia a una imagen enviada por el usuario, usá key="img_[descripcion]" y value=imageId. Si la nota es temporal (lista de compras, tarea puntual, etc.), usá expires_at con la fecha límite en ISO 8601.',
    input_schema: {
      type: 'object',
      properties: {
        key:        { type: 'string', description: 'Etiqueta corta, ej: "DNI", "contraseña Netflix", "img_presupuesto_premium"' },
        value:      { type: 'string', description: 'El valor a guardar' },
        expires_at: { type: 'string', description: 'Fecha/hora de vencimiento ISO 8601 (solo para notas temporales). Ej: "2026-05-20T23:59:00-03:00"' }
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
    description: 'Elimina un recordatorio. SOLO usá este tool DESPUÉS de que el usuario haya confirmado explícitamente con "sí" o "confirmar". Nunca lo llamés sin confirmación previa.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'integer', description: 'ID del recordatorio a eliminar' }
      },
      required: ['id']
    }
  },
  {
    name: 'link_google_calendar',
    description: 'Genera el enlace para que el usuario conecte su Google Calendar. Usalo cuando el usuario pida conectar o vincular Google Calendar.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'update_name',
    description: 'Guarda o actualiza el nombre del usuario. Usalo cuando el usuario te diga su nombre por primera vez o quiera cambiarlo.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nombre del usuario' }
      },
      required: ['name']
    }
  },
  {
    name: 'list_saved_images',
    description: 'Lista las imágenes guardadas por el usuario con sus IDs y descripciones.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'retrieve_image',
    description: 'Envía al usuario una imagen guardada anteriormente. Usá list_saved_images para obtener el image_id.',
    input_schema: {
      type: 'object',
      properties: {
        image_id: { type: 'string', description: 'ID de la imagen (obtenido de list_saved_images)' }
      },
      required: ['image_id']
    }
  },
  {
    name: 'delete_memory',
    description: 'Elimina una nota guardada del usuario. SOLO usá este tool DESPUÉS de que el usuario haya confirmado explícitamente con "sí" o "confirmar". Nunca lo llamés sin confirmación previa.',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key exacto de la nota a eliminar (como aparece en la lista de notas)' }
      },
      required: ['key']
    }
  },
  {
    name: 'delete_image',
    description: 'Elimina una imagen guardada y su referencia en notas. SOLO usá este tool DESPUÉS de que el usuario haya confirmado explícitamente con "sí" o "confirmar". Nunca lo llamés sin confirmación previa.',
    input_schema: {
      type: 'object',
      properties: {
        image_id: { type: 'string', description: 'ID del archivo de imagen' },
        memory_key: { type: 'string', description: 'Key de la nota que referencia la imagen (empieza con img_)' }
      },
      required: ['image_id', 'memory_key']
    }
  }
]

// ── System prompt ─────────────────────────────────────────
function buildSystemPrompt(userName, phone, timezone) {
  const tz = timezone || 'America/Argentina/Buenos_Aires'
  const now = new Date().toLocaleString('es-AR', { timeZone: tz })
  const gcalStatus = gcalConfigured()
    ? (gcalConnected(phone) ? 'Google Calendar: conectado.' : 'Google Calendar: no conectado (el usuario puede pedirte conectarlo).')
    : ''
  const nameInstr = !userName
    ? 'El usuario todavía no te dijo su nombre. Presentate brevemente como Aria y preguntale cómo se llama. Cuando te diga, usá update_name para guardarlo.'
    : `El usuario se llama ${userName}.`

  const memories = getAllMemories(phone)
  const memCtx = memories.length
    ? '\n\nNOTAS Y DATOS GUARDADOS DEL USUARIO:\n' + memories.map(m => {
        const expiry = m.expires_at ? ` [vence: ${m.expires_at}]` : ''
        return `• ${m.key}: ${m.value}${expiry}`
      }).join('\n')
    : '\n\n(El usuario no tiene notas guardadas aún.)'

  const reminders = listReminders(phone).slice(0, 10)
  const remCtx = reminders.length
    ? '\n\nRECORDATORIOS ACTIVOS:\n' + reminders.map(r => `• [${r.id}] ${r.text} — ${r.remind_at}${r.recurrence ? ' (recurrente: ' + r.recurrence + ')' : ''}`).join('\n')
    : ''

  return `Sos Aria, la asistente personal de ${userName || 'este usuario'}. Sos su memoria externa: guardás todo lo que te piden, recordás todo cuando lo necesitan, y respondés de forma natural, cálida y profesional en español argentino. Sin markdown. Sin emojis en exceso.
Fecha y hora actual: ${now} (zona horaria: ${tz}). ${nameInstr} ${gcalStatus}
${memCtx}${remCtx}

REGLAS IMPORTANTES:

— RECORDATORIOS:
Antes de guardar cualquier recordatorio, verificá que tenés los tres datos obligatorios:
  • Fecha exacta (calculá la fecha real a partir de hoy si dicen "el sábado", "mañana", etc.)
  • Hora exacta (si no la mencionaron, preguntá)
  • Descripción clara de qué hay que hacer
Si falta alguno, preguntá de a uno hasta completar. Cuando tenés todo, confirmá antes de guardar: "¿Guardamos el recordatorio para el [día] [fecha] a las [hora]: '[descripción]'? Respondé sí para confirmar." Solo guardá después de la confirmación explícita.

— NOTAS Y MEMORIA:
Siempre tenés acceso a todas las notas y recordatorios listados arriba — nunca digas "no tengo nada guardado" si hay datos en la lista.
Cuando el usuario pide algo guardado, devolvé el valor EXACTAMENTE como fue guardado, sin resumir ni reescribir.
Si fue guardado como imagen (clave "img_"), usá retrieve_image — no describas su contenido con texto.
Cuando guardás texto de una imagen, transcribí EXACTAMENTE lo que dice, sin parafrasear.
Antes de guardar una nota que sea claramente temporal (lista de compras, tarea puntual, recordar algo hasta cierta fecha), preguntá: "¿Hasta cuándo necesitás que recuerde esto?" Si el usuario da una fecha, guardá la nota con ese expires_at en ISO 8601. Las notas permanentes (DNI, contraseñas, datos personales) se guardan sin vencimiento.

— ACCIONES DESTRUCTIVAS:
Antes de eliminar cualquier cosa (nota, imagen o recordatorio), describí exactamente qué vas a borrar y pedí confirmación: "¿Confirmás que querés eliminar [descripción]? Respondé sí para confirmar." Solo ejecutá el borrado tras confirmación explícita.

— ESTILO:
Respondés en máximo 2-3 oraciones cortas, en español argentino, de forma natural y profesional. Sin markdown. Sin emojis en exceso.`
}

// ── Tool execution ────────────────────────────────────────
async function executeTool(phone, name, input) {
  switch (name) {
    case 'save_reminder': {
      const id = saveReminder(phone, input.text, input.remind_at)
      const gcalId = await gcalCreate(phone, input.text, input.remind_at).catch(() => null)
      if (gcalId) updateReminderGCalId(id, gcalId)
      return { success: true }
    }
    case 'save_recurring_reminder': {
      const id = saveRecurringReminder(phone, input.text, input.first_remind_at, input.recurrence)
      const gcalId = await gcalCreate(phone, input.text, input.first_remind_at).catch(() => null)
      if (gcalId) updateReminderGCalId(id, gcalId)
      return { success: true }
    }
    case 'save_memory':
      saveMemory(phone, input.key, input.value, input.expires_at ?? null)
      return { success: true }
    case 'get_memory': {
      const all = getAllMemories(phone)
      const found = all.find(m => m.key.toLowerCase() === input.key.toLowerCase())
      return found ? { value: found.value } : { value: null, message: 'No encontré ese dato guardado.' }
    }
    case 'list_reminders':
      return { reminders: listReminders(phone) }
    case 'delete_reminder': {
      const reminder = getReminderById(input.id, phone)
      deleteReminder(input.id, phone)
      if (reminder?.gcal_event_id) await gcalDelete(phone, reminder.gcal_event_id).catch(() => null)
      return { success: true }
    }
    case 'link_google_calendar':
      if (!gcalConfigured()) return { error: 'Google Calendar no está configurado en el servidor.' }
      return { url: getAuthUrl(phone) }
    case 'update_name': {
      const formatted = input.name.trim().replace(/\b\w/g, c => c.toUpperCase())
      setUserName(phone, formatted)
      return { success: true }
    }
    case 'list_saved_images': {
      const all = getAllMemories(phone)
      const imgs = all.filter(m => m.key.startsWith('img_'))
      if (!imgs.length) return { images: [], message: 'No hay imágenes guardadas.' }
      return { images: imgs.map(m => ({ id: m.value, description: m.key.replace(/^img_/, '') })) }
    }
    case 'retrieve_image': {
      const img = getImage(phone, input.image_id)
      if (!img) return { error: 'Imagen no encontrada. Usá list_saved_images para ver las disponibles.' }
      return { success: true, __image: img }
    }
    case 'delete_memory': {
      deleteMemory(phone, input.key)
      return { success: true }
    }
    case 'delete_image': {
      deleteImage(phone, input.image_id)
      deleteMemory(phone, input.memory_key)
      return { success: true }
    }
    default:
      return { error: 'unknown tool' }
  }
}

// ── Chat ──────────────────────────────────────────────────
export async function chat(phone, userMessage, image = null, imageId = null) {
  const user = getUser(phone)
  const history = loadHistory(phone)
  const imagesToSend = []

  const imageNote = imageId
    ? ` [Imagen recibida guardada en disco con id: "${imageId}". Si querés guardar referencia para recuperarla luego, usá save_memory con key="img_[descripcion]" y value="${imageId}".]`
    : ''

  if (image) {
    history.push({
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: image.mimetype, data: image.data } },
        { type: 'text', text: (userMessage || 'Analizá esta imagen.') + imageNote }
      ]
    })
  } else {
    history.push({ role: 'user', content: userMessage })
  }
  trimHistory(phone)

  try {
    // Reload user so name reflects any update_name call from a prior message
    let currentName = user?.name
    const tz = user?.timezone

    let response = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: buildSystemPrompt(currentName, phone, tz),
      tools: TOOLS,
      messages: history
    })

    while (response.stop_reason === 'tool_use') {
      const toolBlocks = response.content.filter(b => b.type === 'tool_use')
      const results = await Promise.all(toolBlocks.map(b => executeTool(phone, b.name, b.input)))

      // Collect images; strip __image from tool results before sending back to Claude
      const cleanResults = results.map(r => {
        if (r.__image) { imagesToSend.push(r.__image); const { __image, ...rest } = r; return rest }
        return r
      })

      // Refresh name if update_name was called
      if (toolBlocks.some(b => b.name === 'update_name')) {
        currentName = getUser(phone)?.name
      }

      history.push({ role: 'assistant', content: response.content })
      history.push({
        role: 'user',
        content: toolBlocks.map((b, i) => ({
          type: 'tool_result',
          tool_use_id: b.id,
          content: JSON.stringify(cleanResults[i])
        }))
      })

      response = await client.messages.create({
        model: MODEL,
        max_tokens: 512,
        system: buildSystemPrompt(currentName, phone, tz),
        tools: TOOLS,
        messages: history
      })
    }

    const text = response.content.find(b => b.type === 'text')?.text ?? ''
    history.push({ role: 'assistant', content: text })
    trimHistory(phone)
    saveHistory(phone)
    return { text, imagesToSend }

  } catch (err) {
    console.error('[brain] Error:', err.message)
    return { text: 'Lo siento, tuve un problema técnico. Intentá de nuevo en un momento.', imagesToSend: [] }
  }
}
