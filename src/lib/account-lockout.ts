import { db } from '@/lib/db'
import { logSecurityEvent } from './security-audit'

const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_DURATION_MINUTES = 30

export interface LoginCheckResult {
  allowed: boolean
  reason?: 'locked' | 'max_attempts'
  lockedUntil?: Date
  remainingAttempts?: number
}

/**
 * Check if a user account is allowed to attempt login.
 * Handles lockout status and failed attempt counting.
 */
export async function checkLoginAllowed(userId: string, ipAddress: string): Promise<LoginCheckResult> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      failedLoginAttempts: true,
      lockedUntil: true,
      isActive: true,
    },
  })

  if (!user) {
    return { allowed: true }
  }

  if (!user.isActive) {
    return { allowed: false, reason: 'locked', lockedUntil: new Date('2099-12-31') }
  }

  // Check if currently locked out
  if (user.lockedUntil && new Date() < new Date(user.lockedUntil)) {
    await logSecurityEvent({
      userId,
      action: 'LOGIN_LOCKED',
      ipAddress,
      status: 'BLOCKED',
    })
    return {
      allowed: false,
      reason: 'locked',
      lockedUntil: new Date(user.lockedUntil),
      remainingAttempts: 0,
    }
  }

  // Reset lockout if expired
  if (user.lockedUntil && new Date() >= new Date(user.lockedUntil)) {
    await db.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    })
  }

  const remaining = MAX_FAILED_ATTEMPTS - user.failedLoginAttempts
  return { allowed: true, remainingAttempts: remaining }
}

/**
 * Record a failed login attempt. Locks account if max attempts reached.
 */
export async function recordFailedLogin(
  userId: string,
  email: string,
  ipAddress: string,
  userAgent: string
): Promise<LoginCheckResult> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { failedLoginAttempts: true },
  })

  if (!user) return { allowed: true }

  const newAttempts = user.failedLoginAttempts + 1
  const shouldLock = newAttempts >= MAX_FAILED_ATTEMPTS

  const updateData: Record<string, unknown> = {
    failedLoginAttempts: newAttempts,
  }

  if (shouldLock) {
    updateData.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000)
  }

  await db.user.update({
    where: { id: userId },
    data: updateData,
  })

  await logSecurityEvent({
    userId,
    action: shouldLock ? 'LOGIN_LOCKED' : 'LOGIN_FAILURE',
    details: { email, failedAttempts: newAttempts, maxAttempts: MAX_FAILED_ATTEMPTS },
    ipAddress,
    userAgent,
    status: shouldLock ? 'BLOCKED' : 'FAILURE',
  })

  if (shouldLock) {
    return {
      allowed: false,
      reason: 'locked',
      lockedUntil: updateData.lockedUntil as Date,
      remainingAttempts: 0,
    }
  }

  return {
    allowed: true,
    remainingAttempts: MAX_FAILED_ATTEMPTS - newAttempts,
  }
}

/**
 * Clear failed login attempts after successful login.
 */
export async function clearFailedLogins(userId: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: { failedLoginAttempts: 0, lockedUntil: null },
  })
}
