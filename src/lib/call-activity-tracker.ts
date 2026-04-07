/**
 * Call Activity Tracker — shared module-level state
 *
 * Allows any component to record when a call was last made.
 * The useActivityTracker hook reads this to decide when to auto-idle.
 */

let _lastCallActivity = Date.now()

/** Call this whenever a recruiter makes or logs a call. */
export function recordCallActivity(): void {
  _lastCallActivity = Date.now()
}

/** Returns milliseconds since the last recorded call activity. */
export function msSinceLastCall(): number {
  return Date.now() - _lastCallActivity
}

/** Reset (e.g. on login or status change). */
export function resetCallActivity(): void {
  _lastCallActivity = Date.now()
}
