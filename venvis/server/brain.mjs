import Anthropic from '@anthropic-ai/sdk'
import { getRecentMessages, getAllMemory, saveMessage, upsertMemory } from './memory.mjs'
import { searchWeb, formatSearchResults }                              from './search.mjs'
import { getTodayEvents, getWeekEvents, createEvent, CALENDAR_ENABLED } from './calendar.mjs'
import { turnOn, turnOff, setColor, sendIRCommand, controlACviaIR, TUYA_ENABLED } from './tuya.mjs'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL  = 'claude-haiku-4-5-20251001'

const SEARCH_ENABLED = !!(process.env.SERPER_API_KEY || (process.env.GOOGLE_API_KEY && process.env.GOOGLE_SEARCH_ENGINE_ID))

// ── TOOL DEFINITIONS ────────────────────────────────────

const TOOL_SEARCH = {
  name: 'web_search',
  description: 'Busca información actualizada en internet: noticias, precios, clima, eventos, cotizaciones, resultados deportivos, etc.',
  input_schema: {
    type: 'object',
    properties: { query: { type: 'string', description: 'Consulta de búsqueda optimizada' } },
    required: ['query']
  }
}

const TOOL_CALENDAR_READ = {
  name: 'get_calendar_events',
  description: 'Obtiene eventos del Google Calendar del usuario. Úsalo cuando pregunte qué tiene hoy, esta semana, sus reuniones, agenda, etc.',
  input_schema: {
    type: 'object',
    properties: {
      period: { type: 'string', enum: ['today', 'week'], description: '"today" para hoy, "week" para los próximos 7 días' }
    },
    required: ['period']
  }
}

const TOOL_CALENDAR_CREATE = {
  name: 'create_calendar_event',
  description: 'Crea un evento en el Google Calendar del usuario.',
  input_schema: {
    type: 'object',
    properties: {
      title:    { type: 'string',  description: 'Título del evento' },
      date:     { type: 'string',  description: 'Fecha en formato YYYY-MM-DD' },
      time:     { type: 'string',  description: 'Hora en formato HH:MM (24hs)' },
      duration: { type: 'integer', description: 'Duración en minutos (default 60)' }
    },
    required: ['title', 'date']
  }
}

const TOOL_DEVICE_CONTROL = {
  name: 'control_device',
  description: 'Controla dispositivos del hogar vía Tuya: encender/apagar la lámpara RGB Demasled, cambiar colores, o encender/apagar el aire acondicionado Charly directamente.',
  input_schema: {
    type: 'object',
    properties: {
      device:  { type: 'string', enum: ['lamp', 'ac'],   description: '"lamp" para lámpara RGB Demasled, "ac" para aire acondicionado Charly' },
      action:  { type: 'string', enum: ['on', 'off', 'color'], description: 'Acción a realizar' },
      r:       { type: 'integer', description: 'Rojo 0-255 (solo para action=color en lamp)' },
      g:       { type: 'integer', description: 'Verde 0-255 (solo para action=color en lamp)' },
      b:       { type: 'integer', description: 'Azul 0-255 (solo para action=color en lamp)' }
    },
    required: ['device', 'action']
  }
}

const TOOL_IR_COMMAND = {
  name: 'send_ir_command',
  description: 'Envía un comando IR al televisor usando el control IR. Úsalo para subir/bajar volumen, cambiar canal, etc.',
  input_schema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Nombre del comando IR (ej: "power", "vol_up", "vol_down", "ch_up", "ch_down", "mute")' }
    },
    required: ['command']
  }
}

function buildTools() {
  const tools = []
  if (SEARCH_ENABLED)   tools.push(TOOL_SEARCH)
  if (CALENDAR_ENABLED) tools.push(TOOL_CALENDAR_READ, TOOL_CALENDAR_CREATE)
  if (TUYA_ENABLED)     tools.push(TOOL_DEVICE_CONTROL, TOOL_IR_COMMAND)
  return tools
}

// ── KEYWORD DETECTION ────────────────────────────────────

const SEARCH_WORDS = [
  'hoy', 'ahora', 'actual', 'último', 'últimos', 'última', 'últimas',
  'noticia', 'noticias', 'precio', 'dólar', 'dolar', 'euro', 'cotización', 'cotizacion',
  'clima', 'temperatura', 'tiempo', 'lluvia', 'pronóstico', 'pronostico',
  'resultado', 'partido', 'ganó', 'gano', 'perdió',
  'inflación', 'inflacion', 'mercado', 'bolsa', 'bitcoin', 'crypto',
  'estreno', 'nueva', 'nuevo', 'reciente', 'esta semana', 'este mes'
]

function needsSearch(text) {
  const lower = text.toLowerCase()
  return SEARCH_WORDS.some(k => lower.includes(k))
}

// ── SYSTEM PROMPT ────────────────────────────────────────

function buildSystemPrompt(memoryItems, voiceMode = false, userName = 'el usuario') {
  const now     = new Date()
  const TZ      = 'America/Argentina/Buenos_Aires'
  const dateStr = now.toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: TZ })
  const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ })

  const memLines = memoryItems.length
    ? memoryItems.map(m => `- ${m.key}: ${m.value}`).join('\n')
    : '- Todavía no sabés nada de él, es la primera vez que hablan.'

  const caps = [
    SEARCH_ENABLED   && '- Búsqueda web en tiempo real (precios, noticias, clima, etc.)',
    CALENDAR_ENABLED && '- Leer y crear eventos en Google Calendar del usuario',
    TUYA_ENABLED     && '- Controlar dispositivos del hogar: lámpara RGB Demasled y dispositivos IR (TV, AC)'
  ].filter(Boolean).join('\n')

  const devices = [
    LAMP_ID && '- Lámpara RGB Demasled (device: "lamp"): encender, apagar, cambiar color',
    AC_ID   && '- Aire acondicionado Charly (device: "ac"): encender, apagar',
    IR_ID   && '- Control IR (send_ir_command): comandos al televisor (power, vol_up, vol_down, ch_up, ch_down, mute)'
  ].filter(Boolean).join('\n')

  const voiceRule = voiceMode
    ? '\nMODO VOZ ACTIVO: Respondé en máximo 2-3 oraciones. Sé directo y conciso. Si la respuesta requiere más detalle, resumí lo esencial y preguntá si el usuario quiere que continúes. No uses listas, bullets ni markdown — solo texto natural para hablar.'
    : ''

  return `Sos VENVIS, asistente personal de IA de ${userName}. Tu modelo de personalidad es Jarvis de Iron Man: preciso, eficiente, levemente irónico cuando la situación lo amerita. Hablás en español rioplatense con registro elevado. Nunca usás malas palabras. Nunca empezás una respuesta con "¡Claro!", "¡Por supuesto!", "¡Genial!" ni frases aduladoras similares. Sos directo y vas al punto. Cuando el usuario está equivocado, se lo decís con claridad y fundamento, sin suavizarlo innecesariamente. Tenés criterio propio.${voiceRule}

REGLA CRÍTICA PARA DOMÓTICA: Cuando el usuario pide encender, apagar o controlar un dispositivo, SIEMPRE llamá la herramienta correspondiente de inmediato. Nunca preguntes por marca, modelo, protocolo ni información adicional. Si el dispositivo está en la lista, actuá. Si no está, decilo en una oración.

Fecha y hora actuales: ${dateStr}, ${timeStr}. Usá este contexto para cualquier referencia temporal.

Capacidades disponibles:
${caps || '- Ninguna integración externa configurada'}
${devices ? '\nDispositivos configurados:\n' + devices : ''}

Lo que sabés de ${userName}:
${memLines}

Sos proactivo: cuando el usuario menciona eventos próximos, recordatorios o contexto temporal relevante, lo incorporás naturalmente a tu respuesta sin que te lo pidan. Usás la fecha y hora actuales para anticiparte a las necesidades del usuario.

Si en la conversación el usuario menciona algo importante sobre sí mismo
(nombre, trabajo, gustos, proyectos, relaciones, hábitos, preferencias),
al final de tu respuesta normal agregá en una línea separada:
__MEMORIZE__{"key":"nombre_clave_corta","value":"dato concreto","confidence":8}__

Solo un __MEMORIZE__ por respuesta, solo si realmente vale la pena recordarlo.
No se lo menciones al usuario, guardalo en silencio.

Si el usuario menciona que tiene que hacer algo o que recordarle algo mañana o en un momento específico, al final de tu respuesta agregá en una línea separada:
__REMIND__{"text":"descripción del recordatorio","remind_at":"YYYY-MM-DDTHH:MM:00"}__

Solo un __REMIND__ por respuesta, solo cuando el usuario explícitamente mencione querer ser recordado. No se lo menciones al usuario.`
}

// ── TOOL EXECUTOR ────────────────────────────────────────

const LAMP_ID = process.env.TUYA_DEVICE_ID_LAMP || ''
const IR_ID   = process.env.TUYA_DEVICE_ID_IR   || ''
const AC_ID   = process.env.TUYA_DEVICE_ID_AC   || ''

async function executeTool(name, input, socket) {
  try {
    switch (name) {
      case 'web_search': {
        const results = await searchWeb(input.query)
        return formatSearchResults(results)
      }
      case 'get_calendar_events': {
        return input.period === 'week' ? await getWeekEvents() : await getTodayEvents()
      }
      case 'create_calendar_event': {
        return await createEvent(input.title, input.date, input.time, input.duration)
      }
      case 'control_device': {
        if (input.device === 'lamp') {
          if (!LAMP_ID) return 'TUYA_DEVICE_ID_LAMP no configurado.'
          if (input.action === 'on')    return await turnOn(LAMP_ID)
          if (input.action === 'off')   return await turnOff(LAMP_ID)
          if (input.action === 'color') return await setColor(LAMP_ID, input.r ?? 255, input.g ?? 255, input.b ?? 255)
        }
        if (input.device === 'ac') {
          if (!AC_ID || !IR_ID) return 'TUYA_DEVICE_ID_AC o TUYA_DEVICE_ID_IR no configurado.'
          if (input.action === 'on')  return await controlACviaIR(IR_ID, AC_ID, true)
          if (input.action === 'off') return await controlACviaIR(IR_ID, AC_ID, false)
        }
        return 'Acción no reconocida.'
      }
      case 'send_ir_command': {
        if (!IR_ID) return 'TUYA_DEVICE_ID_IR no configurado.'
        return await sendIRCommand(IR_ID, input.command)
      }
      default:
        return 'Herramienta desconocida.'
    }
  } catch (e) {
    console.error(`[Tool:${name}]`, e.message)
    return `Error ejecutando ${name}: ${e.message}`
  }
}

function toolLabel(name) {
  const labels = {
    web_search:            '🔍 Buscando en internet',
    get_calendar_events:   '📅 Consultando calendario',
    create_calendar_event: '📅 Creando evento',
    control_device:        '💡 Controlando dispositivo',
    send_ir_command:       '📡 Enviando comando IR'
  }
  return labels[name] || name
}

// ── MEMORIZE EXTRACTOR ────────────────────────────────────

function extractMemorize(fullText) {
  const match = fullText.match(/__MEMORIZE__(\{.*?\})__/)
  if (!match) return { clean: fullText, memory: null }
  const clean = fullText.replace(/__MEMORIZE__\{.*?\}__/, '').trimEnd()
  try { return { clean, memory: JSON.parse(match[1]) } }
  catch { return { clean, memory: null } }
}

// ── REMIND EXTRACTOR ─────────────────────────────────────

function extractRemind(fullText) {
  const match = fullText.match(/__REMIND__(\{.*?\})__/)
  if (!match) return { clean: fullText, remind: null }
  const clean = fullText.replace(/__REMIND__\{.*?\}__/, '').trimEnd()
  try { return { clean, remind: JSON.parse(match[1]) } }
  catch { return { clean, remind: null } }
}

// ── STREAM FINAL RESPONSE ────────────────────────────────

async function streamFinal(socket, messages, systemPrompt) {
  let fullText = ''
  const stream = client.messages.stream({ model: MODEL, max_tokens: 1024, system: systemPrompt, messages })
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      fullText += event.delta.text
      socket.emit('venvis_chunk', { text: event.delta.text })
    }
  }
  return fullText
}

// ── MAIN EXPORT ──────────────────────────────────────────

export async function streamResponse(socket, userText, sessionId, voiceMode = false, imageData = null) {
  const history      = getRecentMessages(sessionId, 10)
  const memoryItems  = getAllMemory(sessionId)
  const USER_NAMES   = { charly: 'Charly', agus: 'Agus' }
  const userName     = USER_NAMES[sessionId] || 'el usuario'
  const systemPrompt = buildSystemPrompt(memoryItems, voiceMode, userName)
  const tools        = buildTools()

  const userContent = imageData
    ? [
        { type: 'image', source: { type: 'base64', media_type: imageData.mediaType, data: imageData.base64 } },
        { type: 'text',  text: userText || 'Analizá esta imagen.' }
      ]
    : userText

  const baseMessages = [
    ...history.map(m => ({ role: m.role === 'venvis' ? 'assistant' : 'user', content: m.content })),
    { role: 'user', content: userContent }
  ]

  const savedText = userText || '[imagen]'
  saveMessage(sessionId, 'user', savedText)

  let fullText = ''

  if (tools.length === 0) {
    fullText = await streamFinal(socket, baseMessages, systemPrompt)
  } else {
    const forceSearch  = SEARCH_ENABLED && needsSearch(userText)
    const tool_choice  = forceSearch ? { type: 'tool', name: 'web_search' } : { type: 'auto' }

    let workingMessages = [...baseMessages]
    const MAX_ITERS = 4

    for (let i = 0; i < MAX_ITERS; i++) {
      const response = await client.messages.create({
        model: MODEL, max_tokens: 1024,
        system: systemPrompt,
        messages: workingMessages,
        tools,
        tool_choice: i === 0 ? tool_choice : { type: 'auto' }
      })

      if (response.stop_reason === 'end_turn') {
        // Stream the final answer
        workingMessages.push({ role: 'assistant', content: response.content })
        fullText = await streamFinal(socket, workingMessages.slice(0, -1), systemPrompt)
        break
      }

      if (response.stop_reason === 'tool_use') {
        workingMessages.push({ role: 'assistant', content: response.content })
        const toolResults = []

        for (const block of response.content) {
          if (block.type !== 'tool_use') continue
          socket.emit('venvis_chunk', { text: `\n⚡ ${toolLabel(block.name)}...\n` })
          const result = await executeTool(block.name, block.input, socket)
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result })
        }

        workingMessages.push({ role: 'user', content: toolResults })
        continue
      }

      // Unexpected stop reason — stream directly
      fullText = await streamFinal(socket, baseMessages, systemPrompt)
      break
    }
  }

  const { clean: cleanAfterMemory, memory } = extractMemorize(fullText)
  const { clean, remind } = extractRemind(cleanAfterMemory)
  if (memory) upsertMemory(sessionId, memory.key, memory.value, memory.confidence ?? 7)
  if (remind) {
    const { saveReminder } = await import('./reminders.mjs')
    saveReminder(sessionId, remind.text, remind.remind_at)
  }
  saveMessage(sessionId, 'venvis', clean)
  socket.emit('venvis_done', { text: clean })
  return clean
}
