import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const response = NextResponse.redirect(new URL('/', req.url))
  response.cookies.delete('aria_session')
  return response
}
