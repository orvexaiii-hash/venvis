import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const PUBLIC_PATHS = ['/', '/api/auth/request-otp', '/api/auth/verify-otp']

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname

  const isPublic = PUBLIC_PATHS.includes(path) || path.startsWith('/_next') || path.startsWith('/favicon')
  if (isPublic) return NextResponse.next()

  const token = req.cookies.get('aria_session')?.value
  if (!token) return NextResponse.redirect(new URL('/', req.url))

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? '')
    await jwtVerify(token, secret)
    return NextResponse.next()
  } catch {
    return NextResponse.redirect(new URL('/', req.url))
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
}
