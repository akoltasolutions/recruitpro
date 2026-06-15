import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  const response = NextResponse.next()
  
  // Security headers
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()')
  response.headers.set('X-DNS-Prefetch-Control', 'on')
  
  // HSTS - only in production
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
  
  // Content Security Policy
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // unsafe-eval needed for Next.js
    "style-src 'self' 'unsafe-inline'", // unsafe-inline needed for Tailwind
    "img-src 'self' data: blob: https://*.akolta.com",
    "font-src 'self'",
    "connect-src 'self' https://app.akolta.com wss://app.akolta.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
  response.headers.set('Content-Security-Policy', csp)
  
  return response
}

export const config = {
  matcher: [
    // Apply to all routes except API routes (API has its own middleware)
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}
