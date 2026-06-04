import { format, formatDistanceToNow, startOfDay, endOfDay, isToday, isYesterday } from 'date-fns'

/**
 * Format a date/time for display in the UI
 */
export function formatDateTime(date: string | Date, options?: { showRelative?: boolean }): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '—'

  if (options?.showRelative) {
    if (isToday(d)) return format(d, 'hh:mm a') + ' (Today)'
    if (isYesterday(d)) return format(d, 'hh:mm a') + ' (Yesterday)'
    return format(d, 'dd MMM yyyy, hh:mm a')
  }
  return format(d, 'dd MMM yyyy, hh:mm a')
}

/**
 * Format a date only (no time)
 */
export function formatDate(date: string | Date): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '—'
  return format(d, 'dd MMM yyyy')
}

/**
 * Format time duration in mm:ss or hh:mm:ss
 */
export function formatDuration(seconds: number): string {
  if (seconds < 0) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Parse a date string to start/end of day for database queries
 */
export function getDayRange(date: Date | string) {
  const d = typeof date === 'string' ? new Date(date) : date
  return {
    start: startOfDay(d),
    end: endOfDay(d),
  }
}

/**
 * Format a Date to a human-readable date-time string suitable for Excel exports.
 * Output: "YYYY-MM-DD hh:mm:ss AM/PM"
 */
export function formatDateTimeExport(date: string | Date): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return ''
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  let hours = d.getHours()
  const ampm = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12 || 12
  const minutes = String(d.getMinutes()).padStart(2, '0')
  const seconds = String(d.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${String(hours).padStart(2, '0')}:${minutes}:${seconds} ${ampm}`
}
