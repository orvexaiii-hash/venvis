# Aria — WhatsApp AI Agenda Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Aria, a standalone WhatsApp AI agenda service with activation codes, reminders, recurring reminders, daily summaries, and free-form memory storage.

**Architecture:** New Node.js service in `aria/` folder. Baileys handles WhatsApp (QR-based, no Meta approval). Claude Haiku powers the AI brain. SQLite stores all data. Each user is isolated by phone number.

**Tech Stack:** Node.js 20+ (ESM), `@whiskeysockets/baileys`, `better-sqlite3`, `@anthropic-ai/sdk`, `node:test` for tests.

---

## File Map

| File | Responsibility |
|------|---------------|
| `aria/server/db.mjs` | SQLite connection + schema creation |
| `aria/server/users.mjs` | User CRUD, activation code generation/validation |
| `aria/server/memory.mjs` | Per-user free-form memory (save/get) |
| `aria/server/reminders.mjs` | One-time + recurring reminders, daily summary query, tick loop |
| `aria/server/brain.mjs` | Claude Haiku client, tool definitions, tool execution, chat history |
| `aria/server/whatsapp.mjs` | Baileys connection, message routing, admin commands, send helper |
| `aria/server/index.mjs` | Entry point — wires WhatsApp + reminder tick |
| `aria/scripts/generate-code.mjs` | Admin CLI to generate activation codes |
| `aria/tests/users.test.mjs` | Unit tests for users.mjs |
| `aria/tests/memory.test.mjs` | Unit tests for memory.mjs |
| `aria/tests/reminders.test.mjs` | Unit tests for reminders.mjs |
| `aria/package.json` | Dependencies + scripts |
| `aria/.env.example` | Required env vars |
| `aria/Dockerfile` | Production container |

---

## Task 1: Project scaffold

**Files:**
- Create: `aria/package.json`
- Create: `aria/.env.example`
- Create: `aria/.gitignore`
- Create: `aria/server/` (empty folder marker)
- Create: `aria/tests/` (empty folder marker)
- Create: `aria/scripts/` (empty folder marker)
- Create: `aria/data/.gitkeep`

- [ ] **Step 1: Create `aria/package.json`**

```json
{
  "name": "aria",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node server/index.mjs",
    "test": "node --test tests/*.test.mjs"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "@hapi/boom": "^10.0.1",
    "@whiskeysockets/baileys": "^6.7.16",
    "better-sqlite3": "^11.10.0"
  }
}
```

- [ ] **Step 2: Create `aria/.env.example`**

```
ANTHROPIC_API_KEY=sk-ant-...
ADMIN_PHONE=5491112345678
DB_PATH=./data/aria.db
AUTH_DIR=./data/auth
TZ=America/Argentina/Buenos_Aires
```

- [ ] **Step 3: Create `aria/.gitignore`**

```
node_modules/
data/
.env
```

- [ ] **Step 4: Create placeholder files to establish folder structure**

Create empty files:
- `aria/server/.gitkeep`
- `aria/tests/.gitkeep`
- `aria/scripts/.gitkeep`
- `aria/data/.gitkeep`

- [ ] **Step 5: Install dependencies**

```
cd aria
npm install
```

Expected: `node_modules/` created, no errors. `better-sqlite3` will compile a native addon — requires Python and a C++ compiler. On Windows, run `npm install --global windows-build-tools` first if it fails.

- [ ] **Step 6: Commit**

```
git add aria/package.json aria/.env.example aria/.gitignore aria/data/.gitkeep
git commit -m "feat(aria): project scaffold"
```

---

## Task 2: Database layer

**Files:**
- Create: `aria/server/db.mjs`

- [ ] **Step 1: Create `aria/server/db.mjs`**

```javascript
import Database from 'better-sqlite3'
import { join } from 'path'
import { mkdirSync } from 'fs'

const DB_PATH = process.env.DB_PATH || join(process.cwd(), 'data', 'aria.db')

// Ensure directory exists
if (DB_PATH !== ':memory:') {
  mkdirSync(join(DB_PATH, '..'), { recursive: true })
}

export const db = new Database(DB_PATH)

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    phone TEXT PRIMARY KEY,
    name TEXT,
    active INTEGER DEFAULT 0,
    activation_code TEXT,
    code_expires_at TEXT,
    timezone TEXT DEFAULT 'America/Argentina/Buenos_Aires',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    text TEXT NOT NULL,
    remind_at TEXT NOT NULL,
    recurrence TEXT,
    done INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (phone) REFERENCES users(phone)
  );

  CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(phone, key),
    FOREIGN KEY (phone) REFERENCES users(phone)
  );
`)
```

- [ ] **Step 2: Verify schema loads without errors**

```
cd aria
DB_PATH=:memory: node -e "import('./server/db.mjs').then(() => console.log('OK'))"
```

Expected output: `OK`

- [ ] **Step 3: Commit**

```
git add aria/server/db.mjs
git commit -m "feat(aria): SQLite schema — users, reminders, memories"
```

---

## Task 3: User management

**Files:**
- Create: `aria/server/users.mjs`
- Create: `aria/tests/users.test.mjs`

- [ ] **Step 1: Write failing tests — `aria/tests/users.test.mjs`**

```javascript
import { test, before } from 'node:test'
import assert from 'node:assert/strict'

process.env.DB_PATH = ':memory:'

const { generateCode, createActivationCode, activateUser, getUser, setUserName, listUsers, deactivateUser } = await import('../server/users.mjs')

test('generateCode returns ARIA-XXXX format', () => {
  const code = generateCode()
  assert.match(code, /^ARIA-[A-F0-9]{4}$/)
})

test('createActivationCode creates pending user', () => {
  const code = createActivationCode('5491111111111')
  assert.match(code, /^ARIA-[A-F0-9]{4}$/)
  const user = getUser('5491111111111')
  assert.equal(user.phone, '5491111111111')
  assert.equal(user.active, 0)
  assert.equal(user.activation_code, code)
})

test('activateUser with correct code activates user', () => {
  const code = createActivationCode('5492222222222')
  const result = activateUser('5492222222222', code)
  assert.equal(result.success, true)
  const user = getUser('5492222222222')
  assert.equal(user.active, 1)
  assert.equal(user.activation_code, null)
})

test('activateUser with wrong code returns invalid_code', () => {
  createActivationCode('5493333333333')
  const result = activateUser('5493333333333', 'ARIA-0000')
  assert.equal(result.success, false)
  assert.equal(result.reason, 'invalid_code')
})

test('activateUser on already active user returns already_active', () => {
  const code = createActivationCode('5494444444444')
  activateUser('5494444444444', code)
  const result = activateUser('5494444444444', code)
  assert.equal(result.success, false)
  assert.equal(result.reason, 'already_active')
})

test('setUserName updates user name', () => {
  const code = createActivationCode('5495555555555')
  activateUser('5495555555555', code)
  setUserName('5495555555555', 'Charly')
  const user = getUser('5495555555555')
  assert.equal(user.name, 'Charly')
})

test('deactivateUser sets active to 0', () => {
  const code = createActivationCode('5496666666666')
  activateUser('5496666666666', code)
  deactivateUser('5496666666666')
  const user = getUser('5496666666666')
  assert.equal(user.active, 0)
})

test('getUser returns null for unknown phone', () => {
  const user = getUser('0000000000000')
  assert.equal(user, null)
})
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd aria
DB_PATH=:memory: node --test tests/users.test.mjs
```

Expected: error — `../server/users.mjs` not found or functions undefined.

- [ ] **Step 3: Create `aria/server/users.mjs`**

```javascript
import { db } from './db.mjs'
import { randomBytes } from 'crypto'

export function generateCode() {
  return 'ARIA-' + randomBytes(2).toString('hex').toUpperCase()
}

export function createActivationCode(phone) {
  const code = generateCode()
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
  db.prepare(`
    INSERT INTO users (phone, activation_code, code_expires_at)
    VALUES (?, ?, ?)
    ON CONFLICT(phone) DO UPDATE SET
      activation_code = excluded.activation_code,
      code_expires_at = excluded.code_expires_at
  `).run(phone, code, expiresAt)
  return code
}

export function activateUser(phone, code) {
  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone)
  if (!user) return { success: false, reason: 'not_found' }
  if (user.active) return { success: false, reason: 'already_active' }
  if (user.activation_code !== code) return { success: false, reason: 'invalid_code' }
  if (new Date(user.code_expires_at) < new Date()) return { success: false, reason: 'expired' }
  db.prepare(`
    UPDATE users SET active = 1, activation_code = NULL, code_expires_at = NULL WHERE phone = ?
  `).run(phone)
  return { success: true }
}

export function setUserName(phone, name) {
  db.prepare('UPDATE users SET name = ? WHERE phone = ?').run(name, phone)
}

export function getUser(phone) {
  return db.prepare('SELECT * FROM users WHERE phone = ?').get(phone) || null
}

export function listUsers() {
  return db.prepare('SELECT phone, name, active, created_at FROM users ORDER BY created_at DESC').all()
}

export function deactivateUser(phone) {
  db.prepare('UPDATE users SET active = 0 WHERE phone = ?').run(phone)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd aria
DB_PATH=:memory: node --test tests/users.test.mjs
```

Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```
git add aria/server/users.mjs aria/tests/users.test.mjs
git commit -m "feat(aria): user management + activation codes"
```

---

## Task 4: Memory module

**Files:**
- Create: `aria/server/memory.mjs`
- Create: `aria/tests/memory.test.mjs`

- [ ] **Step 1: Write failing tests — `aria/tests/memory.test.mjs`**

```javascript
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.DB_PATH = ':memory:'

const { saveMemory, getMemory, getAllMemories } = await import('../server/memory.mjs')
const { createActivationCode, activateUser } = await import('../server/users.mjs')

const PHONE = '5491100000001'
const code = createActivationCode(PHONE)
activateUser(PHONE, code)

test('saveMemory stores a key/value', () => {
  saveMemory(PHONE, 'DNI', '38123456')
  const val = getMemory(PHONE, 'DNI')
  assert.equal(val, '38123456')
})

test('saveMemory overwrites existing key', () => {
  saveMemory(PHONE, 'DNI', '99999999')
  const val = getMemory(PHONE, 'DNI')
  assert.equal(val, '99999999')
})

test('getMemory returns null for unknown key', () => {
  const val = getMemory(PHONE, 'nonexistent')
  assert.equal(val, null)
})

test('getAllMemories returns all entries for user', () => {
  saveMemory(PHONE, 'email', 'test@test.com')
  const all = getAllMemories(PHONE)
  assert.ok(all.length >= 2)
  assert.ok(all.some(m => m.key === 'DNI'))
  assert.ok(all.some(m => m.key === 'email'))
})

test('getAllMemories isolates between users', () => {
  const PHONE2 = '5491100000002'
  const code2 = createActivationCode(PHONE2)
  activateUser(PHONE2, code2)
  saveMemory(PHONE2, 'secret', 'only-mine')
  const all1 = getAllMemories(PHONE)
  assert.ok(!all1.some(m => m.key === 'secret'))
})
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd aria
DB_PATH=:memory: node --test tests/memory.test.mjs
```

Expected: module not found error.

- [ ] **Step 3: Create `aria/server/memory.mjs`**

```javascript
import { db } from './db.mjs'

export function saveMemory(phone, key, value) {
  db.prepare(`
    INSERT INTO memories (phone, key, value)
    VALUES (?, ?, ?)
    ON CONFLICT(phone, key) DO UPDATE SET
      value = excluded.value,
      updated_at = datetime('now')
  `).run(phone, key, value)
}

export function getMemory(phone, key) {
  return db.prepare(
    'SELECT value FROM memories WHERE phone = ? AND key = ? COLLATE NOCASE'
  ).get(phone, key)?.value ?? null
}

export function getAllMemories(phone) {
  return db.prepare(
    'SELECT key, value FROM memories WHERE phone = ? ORDER BY updated_at DESC'
  ).all(phone)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd aria
DB_PATH=:memory: node --test tests/memory.test.mjs
```

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```
git add aria/server/memory.mjs aria/tests/memory.test.mjs
git commit -m "feat(aria): per-user memory storage"
```

---

## Task 5: Reminders module

**Files:**
- Create: `aria/server/reminders.mjs`
- Create: `aria/tests/reminders.test.mjs`

- [ ] **Step 1: Write failing tests — `aria/tests/reminders.test.mjs`**

```javascript
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.DB_PATH = ':memory:'

const {
  saveReminder, saveRecurringReminder, getPendingReminders,
  markDone, computeNextOccurrence, getTodayReminders, listReminders, deleteReminder
} = await import('../server/reminders.mjs')
const { createActivationCode, activateUser } = await import('../server/users.mjs')

const PHONE = '5491100000010'
const code = createActivationCode(PHONE)
activateUser(PHONE, code)

test('saveReminder stores and getPendingReminders returns due items', () => {
  const pastDate = new Date(Date.now() - 60_000).toISOString()
  saveReminder(PHONE, 'Dentista', pastDate)
  const pending = getPendingReminders()
  assert.ok(pending.some(r => r.text === 'Dentista'))
})

test('markDone removes reminder from pending', () => {
  const pastDate = new Date(Date.now() - 60_000).toISOString()
  saveReminder(PHONE, 'Gym', pastDate)
  const pending = getPendingReminders()
  const gym = pending.find(r => r.text === 'Gym')
  assert.ok(gym)
  markDone(gym.id)
  const after = getPendingReminders()
  assert.ok(!after.some(r => r.text === 'Gym'))
})

test('future reminder not in getPendingReminders', () => {
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  saveReminder(PHONE, 'FutureEvent', future)
  const pending = getPendingReminders()
  assert.ok(!pending.some(r => r.text === 'FutureEvent'))
})

test('computeNextOccurrence daily adds 1 day', () => {
  const base = '2026-05-10T09:00:00.000Z'
  const next = computeNextOccurrence(base, 'daily')
  assert.equal(next.slice(0, 10), '2026-05-11')
})

test('computeNextOccurrence weekly adds 7 days', () => {
  const base = '2026-05-10T09:00:00.000Z'
  const next = computeNextOccurrence(base, 'weekly:SUN')
  assert.equal(next.slice(0, 10), '2026-05-17')
})

test('saveRecurringReminder stores recurrence field', () => {
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  saveRecurringReminder(PHONE, 'Medicación', future, 'daily')
  const reminders = listReminders(PHONE)
  const med = reminders.find(r => r.text === 'Medicación')
  assert.ok(med)
  assert.equal(med.recurrence, 'daily')
})

test('deleteReminder removes it from listReminders', () => {
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  saveReminder(PHONE, 'ToDelete', future)
  const before = listReminders(PHONE)
  const target = before.find(r => r.text === 'ToDelete')
  deleteReminder(target.id, PHONE)
  const after = listReminders(PHONE)
  assert.ok(!after.some(r => r.text === 'ToDelete'))
})
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd aria
DB_PATH=:memory: node --test tests/reminders.test.mjs
```

Expected: module not found.

- [ ] **Step 3: Create `aria/server/reminders.mjs`**

```javascript
import { db } from './db.mjs'

export function saveReminder(phone, text, remindAt) {
  const at = remindAt instanceof Date ? remindAt.toISOString() : remindAt
  return db.prepare(
    'INSERT INTO reminders (phone, text, remind_at) VALUES (?, ?, ?)'
  ).run(phone, text, at).lastInsertRowid
}

export function saveRecurringReminder(phone, text, remindAt, recurrence) {
  const at = remindAt instanceof Date ? remindAt.toISOString() : remindAt
  return db.prepare(
    'INSERT INTO reminders (phone, text, remind_at, recurrence) VALUES (?, ?, ?, ?)'
  ).run(phone, text, at, recurrence).lastInsertRowid
}

export function getPendingReminders() {
  return db.prepare(`
    SELECT id, phone, text, remind_at, recurrence
    FROM reminders
    WHERE done = 0 AND remind_at <= datetime('now')
    ORDER BY remind_at
  `).all()
}

export function markDone(id) {
  db.prepare('UPDATE reminders SET done = 1 WHERE id = ?').run(id)
}

export function computeNextOccurrence(remindAt, recurrence) {
  const date = new Date(remindAt)
  if (recurrence === 'daily') {
    date.setDate(date.getDate() + 1)
  } else if (recurrence.startsWith('weekly:')) {
    date.setDate(date.getDate() + 7)
  }
  return date.toISOString()
}

export function advanceRecurring(id, remindAt, recurrence) {
  const next = computeNextOccurrence(remindAt, recurrence)
  db.prepare('UPDATE reminders SET remind_at = ? WHERE id = ?').run(next, id)
}

export function getTodayReminders(phone) {
  const TZ = 'America/Argentina/Buenos_Aires'
  const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
  return db.prepare(`
    SELECT text, remind_at FROM reminders
    WHERE phone = ? AND done = 0 AND date(remind_at) = ?
    ORDER BY remind_at
  `).all(phone, today)
}

export function listReminders(phone) {
  return db.prepare(`
    SELECT id, text, remind_at, recurrence FROM reminders
    WHERE phone = ? AND done = 0
    ORDER BY remind_at
  `).all(phone)
}

export function deleteReminder(id, phone) {
  db.prepare('DELETE FROM reminders WHERE id = ? AND phone = ?').run(id, phone)
}

export function startReminderTick(onReminder, onDailySummary) {
  let lastSummaryDate = ''

  function tick() {
    const TZ = 'America/Argentina/Buenos_Aires'
    const now = new Date()
    const hour = parseInt(now.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: TZ }), 10)
    const min  = parseInt(now.toLocaleString('en-US', { minute: 'numeric', timeZone: TZ }), 10)
    const today = now.toLocaleDateString('en-CA', { timeZone: TZ })

    if (hour === 8 && min === 0 && lastSummaryDate !== today) {
      lastSummaryDate = today
      onDailySummary()
    }

    const due = getPendingReminders()
    for (const r of due) {
      onReminder(r)
      if (r.recurrence) {
        advanceRecurring(r.id, r.remind_at, r.recurrence)
      } else {
        markDone(r.id)
      }
    }
  }

  setInterval(tick, 60_000)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd aria
DB_PATH=:memory: node --test tests/reminders.test.mjs
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```
git add aria/server/reminders.mjs aria/tests/reminders.test.mjs
git commit -m "feat(aria): reminders — one-time, recurring, daily tick"
```

---

## Task 6: AI brain

**Files:**
- Create: `aria/server/brain.mjs`

No unit tests for this module — it wraps the Claude API which requires a live key. Manual test after wiring in Task 8.

- [ ] **Step 1: Create `aria/server/brain.mjs`**

```javascript
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
        remind_at: { type: 'string', description: 'ISO 8601, ej: 2026-05-10T15:00:00' }
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
        text:           { type: 'string' },
        first_remind_at: { type: 'string', description: 'Primera ocurrencia ISO 8601' },
        recurrence:     { type: 'string', description: '"daily" o "weekly:MON", "weekly:FRI", etc.' }
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
```

- [ ] **Step 2: Verify module imports cleanly (no API call)**

```
cd aria
node -e "import('./server/brain.mjs').then(() => console.log('OK'))"
```

Expected: `OK` (no error, no API call triggered).

- [ ] **Step 3: Commit**

```
git add aria/server/brain.mjs
git commit -m "feat(aria): Claude Haiku brain with 6 tools"
```

---

## Task 7: WhatsApp layer

**Files:**
- Create: `aria/server/whatsapp.mjs`

- [ ] **Step 1: Create `aria/server/whatsapp.mjs`**

```javascript
import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import { join } from 'path'
import { chat } from './brain.mjs'
import { getUser, activateUser, setUserName, createActivationCode, listUsers, deactivateUser } from './users.mjs'

const AUTH_DIR  = process.env.AUTH_DIR  || join(process.cwd(), 'data', 'auth')
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

  // First contact — create pending user, notify admin
  if (!user) {
    createActivationCode(phone) // creates pending record with a placeholder code
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

  sock = makeWASocket({ auth: state, printQRInTerminal: true })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
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
      const jid  = msg.key.remoteJid
      if (jid.endsWith('@g.us')) continue  // ignore group messages
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
```

- [ ] **Step 2: Verify module imports cleanly**

```
cd aria
node -e "import('./server/whatsapp.mjs').then(() => console.log('OK'))"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```
git add aria/server/whatsapp.mjs
git commit -m "feat(aria): WhatsApp layer — Baileys + message routing + admin commands"
```

---

## Task 8: Entry point + daily summary

**Files:**
- Create: `aria/server/index.mjs`

- [ ] **Step 1: Create `aria/server/index.mjs`**

```javascript
import 'node:process'
import { startWhatsApp, sendMessage } from './whatsapp.mjs'
import { startReminderTick, getTodayReminders } from './reminders.mjs'
import { listUsers } from './users.mjs'

async function sendDailySummary() {
  const TZ = 'America/Argentina/Buenos_Aires'
  const users = listUsers().filter(u => u.active && u.name)

  for (const user of users) {
    const today = getTodayReminders(user.phone)

    let msg
    if (today.length === 0) {
      msg = `Buenos días ${user.name}! No tenés nada agendado para hoy.`
    } else {
      const items = today.map(r => {
        const time = new Date(r.remind_at).toLocaleTimeString('es-AR', {
          hour: '2-digit', minute: '2-digit', timeZone: TZ
        })
        return `• ${time} — ${r.text}`
      }).join('\n')
      msg = `Buenos días ${user.name}! ☀️\nHoy tenés:\n${items}`
    }

    try {
      await sendMessage(user.phone, msg)
    } catch (err) {
      console.error(`[DailySummary] Error enviando a ${user.phone}:`, err.message)
    }
  }
}

async function main() {
  await startWhatsApp()

  startReminderTick(
    async (reminder) => {
      await sendMessage(reminder.phone, `⏰ Recordatorio: ${reminder.text}`)
    },
    sendDailySummary
  )

  console.log('[Aria] Listo.')
}

main().catch(console.error)
```

- [ ] **Step 2: Run all unit tests to make sure nothing broke**

```
cd aria
DB_PATH=:memory: node --test tests/*.test.mjs
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```
git add aria/server/index.mjs
git commit -m "feat(aria): entry point — wires WhatsApp + reminder tick + daily summary"
```

---

## Task 9: Admin CLI script

**Files:**
- Create: `aria/scripts/generate-code.mjs`

- [ ] **Step 1: Create `aria/scripts/generate-code.mjs`**

```javascript
import { createActivationCode } from '../server/users.mjs'

const phone = process.argv[2]

if (!phone || !/^\d{10,15}$/.test(phone)) {
  console.error('Uso: node scripts/generate-code.mjs <numero_sin_+>')
  console.error('Ejemplo: node scripts/generate-code.mjs 5491112345678')
  process.exit(1)
}

const code = createActivationCode(phone)
console.log(`\nCódigo generado para ${phone}:`)
console.log(`\n  ${code}\n`)
console.log('Expira en 48 horas. Mandáselo al cliente.')
```

- [ ] **Step 2: Test the script**

```
cd aria
node scripts/generate-code.mjs 5491112345678
```

Expected output:
```
Código generado para 5491112345678:

  ARIA-XXXX

Expira en 48 horas. Mandáselo al cliente.
```

- [ ] **Step 3: Test validation — no phone**

```
cd aria
node scripts/generate-code.mjs
```

Expected: error message and exit code 1.

- [ ] **Step 4: Commit**

```
git add aria/scripts/generate-code.mjs
git commit -m "feat(aria): admin CLI — generate activation codes"
```

---

## Task 10: Dockerfile + deploy config

**Files:**
- Create: `aria/Dockerfile`
- Create: `aria/.dockerignore`

- [ ] **Step 1: Create `aria/Dockerfile`**

```dockerfile
FROM node:20-slim

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server/ ./server/
COPY scripts/ ./scripts/

VOLUME ["/app/data"]

ENV NODE_ENV=production
ENV DB_PATH=/app/data/aria.db
ENV AUTH_DIR=/app/data/auth

CMD ["node", "server/index.mjs"]
```

- [ ] **Step 2: Create `aria/.dockerignore`**

```
node_modules
data
.env
tests
```

- [ ] **Step 3: Build Docker image to verify it compiles**

```
cd aria
docker build -t aria:local .
```

Expected: image builds without errors. `better-sqlite3` native compilation happens at build time.

- [ ] **Step 4: Commit**

```
git add aria/Dockerfile aria/.dockerignore
git commit -m "feat(aria): Dockerfile for production deploy"
```

---

## Task 11: End-to-end manual test

This task has no automated test — it requires a real WhatsApp number.

- [ ] **Step 1: Copy `.env.example` to `.env` and fill values**

```
cd aria
cp .env.example .env
# Edit .env: set ANTHROPIC_API_KEY, ADMIN_PHONE
```

- [ ] **Step 2: Start Aria**

```
cd aria
node server/index.mjs
```

Expected: QR code prints in terminal.

- [ ] **Step 3: Scan QR with WhatsApp** on any phone. Once connected, terminal shows `[WhatsApp] Conectado.`

- [ ] **Step 4: From ADMIN_PHONE, send `/generar-codigo <test_phone>`**

Expected: bot replies with `Código para XXXXXXXXX: ARIA-XXXX`

- [ ] **Step 5: From test phone, message the bot**

Expected: bot asks for activation code.

- [ ] **Step 6: Send the activation code**

Expected: bot confirms code valid, asks for name.

- [ ] **Step 7: Send your name**

Expected: bot greets by name and explains features.

- [ ] **Step 8: Test reminder — send "recordame tomar agua en 2 minutos"**

Expected: bot confirms. Wait 2 minutes — bot sends reminder message.

- [ ] **Step 9: Test memory — send "guardá mi DNI: 38123456"**

Expected: bot confirms. Then send "cuál es mi DNI?" — bot responds with the number.

- [ ] **Step 10: Final commit**

```
git add aria/.env.example
git commit -m "feat(aria): v1 complete — WhatsApp AI agenda service"
```
