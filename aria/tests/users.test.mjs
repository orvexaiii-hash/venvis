import { test } from 'node:test'
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
