import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { generateOTP } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const phone = body?.phone?.toString().replace(/\D/g, '')

  if (!phone || phone.length < 10 || phone.length > 15) {
    return NextResponse.json({ error: 'Número inválido' }, { status: 400 })
  }

  const db = getDb()

  // Verificar que el usuario existe y está activo
  const user = db.prepare('SELECT phone FROM users WHERE phone = ? AND active = 1').get(phone)
  if (!user) {
    return NextResponse.json({ error: 'Número no registrado en Aria' }, { status: 404 })
  }

  // Rate limit: 1 OTP por número cada 60 segundos
  const recent = db.prepare(
    `SELECT id FROM web_otps WHERE phone = ? AND created_at > datetime('now', '-60 seconds')`
  ).get(phone)
  if (recent) {
    return NextResponse.json(
      { error: 'Esperá 60 segundos antes de pedir otro código' },
      { status: 429 }
    )
  }

  const code = generateOTP()
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

  db.prepare(
    'INSERT INTO web_otps (phone, code, expires_at) VALUES (?, ?, ?)'
  ).run(phone, code, expiresAt)

  return NextResponse.json({ ok: true })
}
