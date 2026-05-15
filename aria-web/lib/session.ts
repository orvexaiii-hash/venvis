import { cookies } from 'next/headers'
import { verifyJWT } from './auth'

const COOKIE = 'aria_session'

export async function getSession(): Promise<{ phone: string } | null> {
  const token = (await cookies()).get(COOKIE)?.value
  if (!token) return null
  return verifyJWT(token)
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 30 * 24 * 60 * 60,
    path: '/'
  }
}
