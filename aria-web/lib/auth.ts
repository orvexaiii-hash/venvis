import { SignJWT, jwtVerify } from 'jose'
import { randomInt } from 'crypto'

function getSecret() {
  const s = process.env.JWT_SECRET
  if (!s) throw new Error('JWT_SECRET no configurado')
  return new TextEncoder().encode(s)
}

export function generateOTP(): string {
  return String(randomInt(100000, 999999))
}

export async function signJWT(payload: { phone: string }): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .sign(getSecret())
}

export async function verifyJWT(token: string): Promise<{ phone: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return payload as { phone: string }
  } catch {
    return null
  }
}
