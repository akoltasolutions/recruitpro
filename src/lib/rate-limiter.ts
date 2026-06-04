/**
 * In-memory rate limiter for API endpoints.
 * Uses a sliding window counter approach.
 * Suitable for single-server deployment (SQLite).
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key)
  }
}, 5 * 60 * 1000)

export interface RateLimitOptions {
  /** Maximum number of requests in the window (default: 10) */
  maxRequests?: number
  /** Window duration in milliseconds (default: 60000 = 1 minute) */
  windowMs?: number
  /** Custom key prefix (default: 'rl') */
  keyPrefix?: string
}

export interface RateLimitResult {
  success: boolean
  remaining: number
  resetAt: number
  limit: number
}

/**
 * Check rate limit for a given identifier.
 * Returns true if the request is allowed, false if rate limited.
 */
export function checkRateLimit(
  identifier: string,
  options: RateLimitOptions = {}
): RateLimitResult {
  const {
    maxRequests = 10,
    windowMs = 60 * 1000,
    keyPrefix = 'rl',
  } = options

  const key = `${keyPrefix}:${identifier}`
  const now = Date.now()

  const entry = store.get(key)
  
  if (!entry || entry.resetAt <= now) {
    // Create new window
    const newEntry: RateLimitEntry = {
      count: 1,
      resetAt: now + windowMs,
    }
    store.set(key, newEntry)
    return {
      success: true,
      remaining: maxRequests - 1,
      resetAt: newEntry.resetAt,
      limit: maxRequests,
    }
  }

  if (entry.count >= maxRequests) {
    return {
      success: false,
      remaining: 0,
      resetAt: entry.resetAt,
      limit: maxRequests,
    }
  }

  entry.count++
  store.set(key, entry)
  return {
    success: true,
    remaining: maxRequests - entry.count,
    resetAt: entry.resetAt,
    limit: maxRequests,
  }
}

/**
 * Reset rate limit for a given identifier (e.g., after successful login)
 */
export function resetRateLimit(identifier: string, keyPrefix = 'rl'): void {
  store.delete(`${keyPrefix}:${identifier}`)
}
