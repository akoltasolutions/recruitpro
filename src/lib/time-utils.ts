/** Regex for HH:mm format (24h) */
export const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/

/**
 * Validate a time string in HH:mm format
 */
export function isValidTime(time: string): boolean {
  return TIME_REGEX.test(time)
}

/**
 * Parse HH:mm to total minutes since midnight
 */
export function timeToMinutes(time: string): number {
  if (!isValidTime(time)) return -1
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/**
 * Format minutes to HH:mm
 */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}
