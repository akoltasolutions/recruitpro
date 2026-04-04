import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a phone number for WhatsApp wa.me links.
 * - Strips all non-digit characters
 * - Removes leading zero (e.g. "09876543210" → "9876543210")
 * - Prepends India country code 91 if not already present
 *
 * Examples:
 *   "9876543210"     → "919876543210"
 *   "09876543210"    → "919876543210"
 *   "+91 98765 43210" → "919876543210"
 *   "919876543210"   → "919876543210" (already has 91)
 */
export function formatPhoneForWhatsApp(phone: string): string {
  let digits = phone.replace(/[^0-9]/g, '')
  // Remove leading zero
  if (digits.startsWith('0')) {
    digits = digits.slice(1)
  }
  // Prepend India country code 91 if not already present
  if (!digits.startsWith('91')) {
    digits = '91' + digits
  }
  return digits
}

// ==================== Validation Utilities ====================

/** Check if a string looks like a valid email */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

/** Check if a string looks like a valid Indian phone number (10-12 digits) */
export function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 10 && digits.length <= 12
}

/** Check if value is non-empty after trimming */
export function isRequired(value: string): boolean {
  return value.trim().length > 0
}

/** Password strength: min 8 chars, at least one letter and one number */
export function isStrongPassword(password: string): { valid: boolean; message: string } {
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long.' }
  }
  if (!/[a-zA-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one letter.' }
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number.' }
  }
  return { valid: true, message: '' }
}

/** Signup password: min 6 chars */
export function isSignupPassword(password: string): { valid: boolean; message: string } {
  if (password.length < 6) {
    return { valid: false, message: 'Password must be at least 6 characters.' }
  }
  return { valid: true, message: '' }
}
