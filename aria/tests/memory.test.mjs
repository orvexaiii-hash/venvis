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
