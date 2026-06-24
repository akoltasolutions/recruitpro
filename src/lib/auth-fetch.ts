'use client'

import { useAuthStore } from '@/stores/auth-store'

/**
 * Authenticated fetch wrapper that includes the auth token
 * in the Authorization header automatically.
 */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const { token } = useAuthStore.getState()

  const headers = new Headers(options.headers || {})

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  // Set Content-Type for JSON bodies if not already set
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  return fetch(url, {
    ...options,
    headers,
  })
}
