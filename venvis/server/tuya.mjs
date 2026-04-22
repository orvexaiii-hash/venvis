import { createHash, createHmac } from 'crypto'

const BASE_URL       = 'https://openapi.tuyaus.com'
const CLIENT_ID      = process.env.TUYA_CLIENT_ID
const CLIENT_SECRET  = process.env.TUYA_CLIENT_SECRET

export const TUYA_ENABLED = !!(CLIENT_ID && CLIENT_SECRET)

function sign(str) {
  return createHmac('sha256', CLIENT_SECRET).update(str).digest('hex').toUpperCase()
}

function sha256(body = '') {
  return createHash('sha256').update(body).digest('hex')
}

function buildHeaders(method, path, body = '', accessToken = '') {
  const t     = Date.now().toString()
  const nonce = ''
  const contentHash = sha256(body)
  const stringToSign = [method, contentHash, '', path].join('\n')
  const signStr = CLIENT_ID + accessToken + t + nonce + stringToSign

  return {
    client_id:   CLIENT_ID,
    access_token: accessToken,
    sign:         sign(signStr),
    t,
    sign_method:  'HMAC-SHA256',
    nonce,
    'Content-Type': 'application/json'
  }
}

async function getToken() {
  const path = '/v1.0/token?grant_type=1'
  const headers = buildHeaders('GET', path)
  const res  = await fetch(`${BASE_URL}${path}`, { headers })
  const data = await res.json()
  if (!data.success) throw new Error(`Tuya token error: ${data.msg}`)
  return data.result.access_token
}

async function tuyaRequest(method, path, body = null) {
  const token   = await getToken()
  const bodyStr = body ? JSON.stringify(body) : ''
  const headers = buildHeaders(method, path, bodyStr, token)

  const res  = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    ...(body ? { body: bodyStr } : {})
  })
  return res.json()
}

export async function turnOn(deviceId) {
  if (!TUYA_ENABLED) return 'Tuya no configurado.'
  const r = await tuyaRequest('POST', `/v1.0/devices/${deviceId}/commands`, {
    commands: [{ code: 'switch_led', value: true }]
  })
  return r.success ? 'Dispositivo encendido.' : `Error: ${r.msg}`
}

export async function turnOff(deviceId) {
  if (!TUYA_ENABLED) return 'Tuya no configurado.'
  const r = await tuyaRequest('POST', `/v1.0/devices/${deviceId}/commands`, {
    commands: [{ code: 'switch_led', value: false }]
  })
  return r.success ? 'Dispositivo apagado.' : `Error: ${r.msg}`
}

// Controla AC vía IR blaster usando la API smart IR de Tuya
// infraredId: device ID del IR blaster; remoteId: device ID del AC virtual
export async function controlACviaIR(infraredId, remoteId, power) {
  if (!TUYA_ENABLED) return 'Tuya no configurado.'
  const res = await tuyaRequest('POST',
    `/v2.0/infrareds/${infraredId}/remotes/${remoteId}/ac/command`,
    { code: 'Power', value: power ? '1' : '0' }
  )
  return res.success
    ? (power ? 'Aire encendido.' : 'Aire apagado.')
    : `Error: ${res.msg}`
}

// Convierte RGB (0-255) a HSV de Tuya (h: 0-360, s: 0-1000, v: 0-1000)
function rgbToTuyaHSV(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h = Math.round(h * 60)
    if (h < 0) h += 360
  }
  const s = max === 0 ? 0 : Math.round((d / max) * 1000)
  const v = Math.round(max * 1000)
  return { h, s, v }
}

export async function setColor(deviceId, r, g, b) {
  if (!TUYA_ENABLED) return 'Tuya no configurado.'
  const hsv = rgbToTuyaHSV(r, g, b)
  const res = await tuyaRequest('POST', `/v1.0/devices/${deviceId}/commands`, {
    commands: [
      { code: 'switch_led',   value: true },
      { code: 'work_mode',    value: 'colour' },
      { code: 'colour_data_v2', value: hsv }
    ]
  })
  return res.success ? `Color cambiado a RGB(${r},${g},${b}).` : `Error: ${res.msg}`
}

export async function sendIRCommand(deviceId, command) {
  if (!TUYA_ENABLED) return 'Tuya no configurado.'
  const res = await tuyaRequest('POST', `/v1.0/devices/${deviceId}/commands`, {
    commands: [{ code: 'ir_send', value: command }]
  })
  return res.success ? `Comando IR enviado: ${command}` : `Error: ${res.msg}`
}
