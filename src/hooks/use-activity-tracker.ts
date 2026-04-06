'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useAuthStore, authFetch } from '@/stores/auth-store'
import { toast } from 'sonner'
import { msSinceLastCall, resetCallActivity } from '@/lib/call-activity-tracker'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minutes of no call activity before auto-switching to IDLE (when ACTIVE) */
const AUTO_IDLE_MINUTES = 20
const AUTO_IDLE_MS = AUTO_IDLE_MINUTES * 60 * 1000

/** Show a warning when this many minutes remain before auto-idle */
const IDLE_WARNING_MINUTES = 5
const IDLE_WARNING_MS = IDLE_WARNING_MINUTES * 60 * 1000

/** Minutes of no app interaction before auto-logout */
const AUTO_LOGOUT_MINUTES = 30
const AUTO_LOGOUT_MS = AUTO_LOGOUT_MINUTES * 60 * 1000

/** Show a warning toast this many seconds before auto-logout */
const LOGOUT_WARNING_SECONDS = 60

/** How often to run the idle/logout checks (ms) */
const CHECK_INTERVAL_MS = 15_000 // 15 seconds

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseActivityTrackerOptions {
  /** Current recruiter status (IDLE | LUNCH | ON_BREAK | ACTIVE | OFFLINE) */
  currentStatus: string
  /** Called when the hook decides to auto-switch to IDLE */
  onAutoIdle: () => void
}

export function useActivityTracker({
  currentStatus,
  onAutoIdle,
}: UseActivityTrackerOptions) {
  const lastActivityRef = useRef(Date.now())
  const logoutWarningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasLogoutWarnedRef = useRef(false)
  const idleWarningShownRef = useRef(false)
  const logoutFn = useAuthStore((s) => s.logout)

  // ---- Record activity helper (called by all event sources) ---------------
  const recordActivity = useCallback(() => {
    lastActivityRef.current = Date.now()
    hasLogoutWarnedRef.current = false
  }, [])

  // ---- 1. DOM events: clicks, keys, scroll, touch, mouse ────────────────
  useEffect(() => {
    const events: (keyof WindowEventMap)[] = [
      'mousemove',
      'mousedown',
      'keydown',
      'scroll',
      'touchstart',
      'click',
    ]

    const handler = () => recordActivity()
    for (const evt of events) {
      window.addEventListener(evt, handler, { passive: true })
    }
    return () => {
      for (const evt of events) {
        window.removeEventListener(evt, handler)
      }
    }
  }, [recordActivity])

  // ---- 2. App foreground / background (visibilitychange + focus) ─────────
  useEffect(() => {
    const handleVisibilityChange = () => {
      // When app comes back to foreground → count as activity
      if (document.visibilityState === 'visible') {
        recordActivity()
        console.log('[ActivityTracker] App came to foreground — activity recorded')
      }
    }

    const handleWindowFocus = () => {
      recordActivity()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleWindowFocus)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleWindowFocus)
    }
  }, [recordActivity])

  // ---- 3. Cleanup on unmount ────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (logoutWarningTimerRef.current) clearTimeout(logoutWarningTimerRef.current)
    }
  }, [])

  // ---- 4. Main check loop (runs every 15 seconds) ──────────────────────
  useEffect(() => {
    const interval = setInterval(async () => {
      const now = Date.now()
      const inactiveMs = now - lastActivityRef.current

      // ── AUTO-LOGOUT CHECK (30 min no app activity) ─────────────────────
      if (inactiveMs >= AUTO_LOGOUT_MS) {
        if (logoutWarningTimerRef.current) clearTimeout(logoutWarningTimerRef.current)
        console.log('[ActivityTracker] Auto-logging out — 30 min inactivity')
        toast.error('Session expired — logged out due to inactivity.', {
          duration: 4000,
        })
        logoutFn()
        return
      }

      // Logout warning (60 seconds before logout)
      const timeUntilLogout = AUTO_LOGOUT_MS - inactiveMs
      if (
        timeUntilLogout <= LOGOUT_WARNING_SECONDS * 1000 &&
        !hasLogoutWarnedRef.current
      ) {
        hasLogoutWarnedRef.current = true
        toast.warning(
          'No activity detected. Auto-logging out in 1 minute. Tap anywhere to stay logged in.',
          { duration: LOGOUT_WARNING_SECONDS * 1000 }
        )

        // Schedule a re-check at exactly 30 min
        if (logoutWarningTimerRef.current) clearTimeout(logoutWarningTimerRef.current)
        logoutWarningTimerRef.current = setTimeout(() => {
          const recheck = Date.now() - lastActivityRef.current
          if (recheck >= AUTO_LOGOUT_MS) {
            console.log('[ActivityTracker] Auto-logout (delayed check)')
            toast.error('Session expired — logged out due to inactivity.')
            logoutFn()
          } else {
            hasLogoutWarnedRef.current = false
          }
        }, LOGOUT_WARNING_SECONDS * 1000)
      }

      // ── AUTO-IDLE CHECK (20 min no calls while ACTIVE) ─────────────────
      if (currentStatus === 'ACTIVE') {
        const callInactivityMs = msSinceLastCall()

        // Warning at 5 minutes remaining
        const timeUntilIdle = AUTO_IDLE_MS - callInactivityMs
        if (
          timeUntilIdle <= IDLE_WARNING_MS &&
          timeUntilIdle > 0 &&
          !idleWarningShownRef.current
        ) {
          idleWarningShownRef.current = true
          toast.info(
            `No calls made in the last ${AUTO_IDLE_MINUTES - IDLE_WARNING_MINUTES} minutes. You will be switched to Idle in ${IDLE_WARNING_MINUTES} minutes if no calls are made.`,
            { duration: 8000 }
          )
        }

        if (callInactivityMs >= AUTO_IDLE_MS) {
          console.log(
            `[ActivityTracker] Auto-switching to IDLE (no calls for ${AUTO_IDLE_MINUTES} min)`
          )
          idleWarningShownRef.current = false
          try {
            const res = await authFetch('/api/user-status', {
              method: 'POST',
              body: JSON.stringify({ status: 'IDLE' }),
            })
            if (res.ok) {
              try { localStorage.setItem('recruiter_current_status', 'IDLE') } catch { /* ignore */ }
              toast.warning(
                `Auto-switched to Idle — no calls made in the last ${AUTO_IDLE_MINUTES} minutes.`,
                { duration: 6000 }
              )
              onAutoIdle()
            }
          } catch (err) {
            console.error('[ActivityTracker] Failed to auto-idle:', err)
          }
        }
      } else {
        // Reset the idle warning flag when not in ACTIVE state
        idleWarningShownRef.current = false
      }
    }, CHECK_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [currentStatus, onAutoIdle, logoutFn])

  // ---- 5. Reset call activity timer on status changes ───────────────────
  useEffect(() => {
    if (currentStatus === 'ACTIVE' || currentStatus === 'LUNCH') {
      resetCallActivity()
    }
  }, [currentStatus])

  // Return the ref so the status card can display idle countdown if needed
  return { lastActivityRef }
}
