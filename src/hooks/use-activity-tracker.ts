'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useAuthStore, authFetch } from '@/stores/auth-store'
import { toast } from 'sonner'
import { msSinceLastCall, resetCallActivity, recordCallActivity } from '@/lib/call-activity-tracker'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minutes of no call activity before auto-switching to IDLE (when ACTIVE) */
const AUTO_IDLE_MINUTES = 20
const AUTO_IDLE_MS = AUTO_IDLE_MINUTES * 60 * 1000

/** Minutes of no app interaction before auto-logout */
const AUTO_LOGOUT_MINUTES = 30
const AUTO_LOGOUT_MS = AUTO_LOGOUT_MINUTES * 60 * 1000

/** Show a warning toast this many seconds before auto-logout */
const LOGOUT_WARNING_SECONDS = 60

/** How often to run the idle/logout checks (ms) */
const CHECK_INTERVAL_MS = 15_000 // 15 seconds

// ---------------------------------------------------------------------------
// DOM events that count as "user activity"
// ---------------------------------------------------------------------------

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'mousemove',
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
  'click',
]

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseActivityTrackerOptions {
  /** Current recruiter status (IDLE | LAUNCH | BREAK | ACTIVE | OFFLINE) */
  currentStatus: string
  /** Called when the hook decides to auto-switch to IDLE */
  onAutoIdle: () => void
}

export function useActivityTracker({
  currentStatus,
  onAutoIdle,
}: UseActivityTrackerOptions) {
  const lastActivityRef = useRef(Date.now())
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasWarnedRef = useRef(false)
  const logoutFn = useAuthStore((s) => s.logout)

  // ---- Record DOM activity ------------------------------------------------
  useEffect(() => {
    const handleActivity = () => {
      lastActivityRef.current = Date.now()
      hasWarnedRef.current = false
    }

    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, handleActivity, { passive: true })
    }

    return () => {
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, handleActivity)
      }
    }
  }, [])

  // ---- Clear any pending warning on unmount ------------------------------
  useEffect(() => {
    return () => {
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current)
    }
  }, [])

  // ---- Main check loop ----------------------------------------------------
  useEffect(() => {
    // Only run for authenticated recruiters
    const interval = setInterval(async () => {
      const now = Date.now()
      const inactiveMs = now - lastActivityRef.current

      // ── AUTO-LOGOUT CHECK (30 min no activity) ────────────────────────
      if (inactiveMs >= AUTO_LOGOUT_MS) {
        // Perform logout
        if (warningTimerRef.current) clearTimeout(warningTimerRef.current)
        console.log('[ActivityTracker] Auto-logging out due to 30 min inactivity')
        toast.error('Session expired — logged out due to inactivity.', {
          duration: 4000,
        })
        logoutFn()
        return
      }

      // Show warning 60 seconds before auto-logout
      const timeUntilLogout = AUTO_LOGOUT_MS - inactiveMs
      if (
        timeUntilLogout <= LOGOUT_WARNING_SECONDS * 1000 &&
        !hasWarnedRef.current
      ) {
        hasWarnedRef.current = true
        const remainingMin = Math.ceil(LOGOUT_WARNING_SECONDS / 60)
        toast.warning(
          `No activity detected. Auto-logging out in ${remainingMin} minute. Move your mouse or press any key to stay logged in.`,
          { duration: LOGOUT_WARNING_SECONDS * 1000 }
        )

        // Schedule the actual logout
        if (warningTimerRef.current) clearTimeout(warningTimerRef.current)
        warningTimerRef.current = setTimeout(() => {
          // Double-check the user is still inactive
          const recheck = Date.now() - lastActivityRef.current
          if (recheck >= AUTO_LOGOUT_MS) {
            console.log('[ActivityTracker] Auto-logging out (delayed check)')
            toast.error('Session expired — logged out due to inactivity.')
            logoutFn()
          } else {
            hasWarnedRef.current = false
          }
        }, LOGOUT_WARNING_SECONDS * 1000)
      }

      // ── AUTO-IDLE CHECK (20 min no calls while ACTIVE) ────────────────
      if (currentStatus === 'ACTIVE') {
        const callInactivityMs = msSinceLastCall()
        if (callInactivityMs >= AUTO_IDLE_MS) {
          console.log(
            `[ActivityTracker] Auto-switching to IDLE (no calls for ${AUTO_IDLE_MINUTES} min)`
          )
          // Switch to IDLE via API
          try {
            const res = await authFetch('/api/user-status', {
              method: 'POST',
              body: JSON.stringify({ status: 'IDLE' }),
            })
            if (res.ok) {
              try { localStorage.setItem('recruiter_current_status', 'IDLE') } catch { /* ignore */ }
              toast.warning(
                `Auto-switched to Idle — no calls made in the last ${AUTO_IDLE_MINUTES} minutes.`,
                { duration: 5000 }
              )
              onAutoIdle()
            }
          } catch (err) {
            console.error('[ActivityTracker] Failed to auto-idle:', err)
          }
        }
      }
    }, CHECK_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [currentStatus, onAutoIdle, logoutFn])

  // Reset call activity on status changes
  useEffect(() => {
    if (currentStatus === 'ACTIVE' || currentStatus === 'LAUNCH') {
      resetCallActivity()
    }
  }, [currentStatus])
}

// Re-export recordCallActivity so components can import from this hook file
export { recordCallActivity }
