import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { signJWT } from '@/lib/auth'
import { sessionCookieOptions } from '@/lib/session'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const code = body?.code?.toString().trim()

  if (!code) {
    return NextResponse.json({ error: 'Falta el código' }, { status: 400 })
  }

  const db = getDb()

  const otp = db.prepare(
    `SELECT id, phone, attempts FROM web_otps
     WHERE code = ? AND used = 0 AND expires_at > datetime('now')
     ORDER BY created_at DESC LIMIT 1`
  ).get(code) as { id: number; phone: string; attempts: number } | undefined

  if (!otp) {
    return NextResponse.json({ error: 'Código inválido o expirado. Pedí uno nuevo.' }, { status: 400 })
  }

  if (otp.attempts >= 3) {
    db.prepare('UPDATE web_otps SET used = 1 WHERE id = ?').run(otp.id)
    return NextResponse.json({ error: 'Demasiados intentos. Pedí un nuevo código.' }, { status: 400 })
  }

  db.prepare('UPDATE web_otps SET used = 1 WHERE id = ?').run(otp.id)

  const token = await signJWT({ phone: otp.phone })
  const response = NextResponse.json({ ok: true })
  response.cookies.set('aria_session', token, sessionCookieOptions())
  return response
}
