import 'dotenv/config'
import { createHash, createHmac } from 'crypto'

const BASE_URL      = 'https://openapi.tuyaus.com'
const CLIENT_ID     = process.env.TUYA_CLIENT_ID
const CLIENT_SECRET = process.env.TUYA_CLIENT_SECRET
const IR_ID         = process.env.TUYA_DEVICE_ID_IR
const AC_ID         = process.env.TUYA_DEVICE_ID_AC

function sign(str) {
  return createHmac('sha256', CLIENT_SECRET).update(str).digest('hex').toUpperCase()
}

function sha256(body = '') {
  return createHash('sha256').update(body).digest('hex')
}

function buildHeaders(method, path, body = '', accessToken = '') {
  const t = Date.now().toString()
  const nonce = ''
  const contentHash = sha256(body)
  const stringToSign = [method, contentHash, '', path].join('\n')
  const signStr = CLIENT_ID + accessToken + t + nonce + stringToSign
  return {
    client_id: CLIENT_ID,
    access_token: accessToken,
    sign: sign(signStr),
    t,
    sign_method: 'HMAC-SHA256',
    nonce,
    'Content-Type': 'application/json'
  }
}

async function getToken() {
  const path = '/v1.0/token?grant_type=1'
  const headers = buildHeaders('GET', path)
  const res = await fetch(`${BASE_URL}${path}`, { headers })
  const data = await res.json()
  if (!data.success) throw new Error(`Token error: ${JSON.stringify(data)}`)
  return data.result.access_token
}

async function tuyaRequest(method, path, body = null) {
  const token = await getToken()
  const bodyStr = body ? JSON.stringify(body) : ''
  const headers = buildHeaders(method, path, bodyStr, token)
  const res = await fetch(`${BASE_URL}${path}`, {
    method, headers,
    ...(body ? { body: bodyStr } : {})
  })
  return res.json()
}

console.log('IR_ID:', IR_ID)
console.log('AC_ID:', AC_ID)
console.log()

// 1. Listar remotes del IR blaster
console.log('=== GET /v2.0/infrareds/{IR_ID}/remotes ===')
const remotes = await tuyaRequest('GET', `/v2.0/infrareds/${IR_ID}/remotes`)
console.log(JSON.stringify(remotes, null, 2))
console.log()

// 2. Intentar el comando AC con el AC_ID como remote_id
console.log('=== POST AC command con AC_ID como remote_id ===')
const acCmd = await tuyaRequest('POST',
  `/v2.0/infrareds/${IR_ID}/remotes/${AC_ID}/ac/command`,
  { code: 'Power', value: '1' }
)
console.log(JSON.stringify(acCmd, null, 2))
console.log()

// 3. Info del device AC
console.log('=== GET /v1.0/devices/{AC_ID} ===')
const deviceInfo = await tuyaRequest('GET', `/v1.0/devices/${AC_ID}`)
console.log(JSON.stringify(deviceInfo, null, 2))
