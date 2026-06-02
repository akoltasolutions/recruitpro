'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { authFetch } from '@/stores/auth-store'

// ── Global single-writer / many-reader store for the pending count ──
// This lets approval-requests.tsx bump the count after approve/reject
// without needing to prop-drill or use a heavy state manager.

let globalPendingCount: number | null = null
const listeners = new Set<(count: number | null) => void>()

function setGlobalPendingCount(count: number | null) {
  globalPendingCount = count
  listeners.forEach((fn) => fn(count))
}

export function getGlobalPendingCount(): number | null {
  return globalPendingCount
}

/**
 * Notify the global store that the count should be refreshed.
 * Call this after approve / reject actions so the badge updates instantly.
 */
export function invalidateApprovalBadgeCount() {
  setGlobalPendingCount(null) // force next fetch cycle to re-fetch
}

/**
 * Hook that returns the current pending approval request count.
 *
 * • Fetches `/api/users/pending-count` on mount and then every 30 s.
 * • Subscribes to global count changes (from other components).
 * • Returns `null` while loading, so you can hide the badge until the
 *   first value arrives.
 */
export function useApprovalPendingCount(): number | null {
  const [count, setCount] = useState<number | null>(globalPendingCount)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Subscribe to global changes
  useEffect(() => {
    const handler = (c: number | null) => setCount(c)
    listeners.add(handler)
    return () => { listeners.delete(handler) }
  }, [])

  const fetchCount = useCallback(async () => {
    try {
      const res = await authFetch('/api/users/pending-count')
      if (res.ok) {
        const data = await res.json()
        const c: number = data.count ?? 0
        setGlobalPendingCount(c)
      }
    } catch {
      // silently ignore — badge simply won't show
    }
  }, [])

  // Fetch on mount + polling every 30s
  useEffect(() => {
    fetchCount()
    intervalRef.current = setInterval(fetchCount, 30_000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchCount])

  return count
}
