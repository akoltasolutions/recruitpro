import { db } from '@/lib/db'
import { createHash } from 'crypto'

/**
 * Hash a token for storage (never store raw tokens).
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Create a new session record when a user logs in.
 */
export async function createSession(params: {
  userId: string
  token: string
  ipAddress?: string
  userAgent?: string
  deviceFingerprint?: string
  expiresInDays?: number
}): Promise<void> {
  const expiresAt = new Date(Date.now() + (params.expiresInDays || 7) * 24 * 60 * 60 * 1000)
  
  await db.session.create({
    data: {
      userId: params.userId,
      token: hashToken(params.token),
      ipAddress: params.ipAddress || null,
      userAgent: params.userAgent || null,
      deviceFingerprint: params.deviceFingerprint || null,
      isActive: true,
      expiresAt,
    },
  })
}

/**
 * Validate that a session exists and is active.
 * Called during token verification.
 */
export async function validateSession(token: string): Promise<boolean> {
  const hashed = hashToken(token)
  const session = await db.session.findUnique({
    where: { token: hashed },
  })
  if (!session) return false
  if (!session.isActive) return false
  if (new Date() > new Date(session.expiresAt)) return false
  return true
}

/**
 * Revoke a single session (logout).
 */
export async function revokeSession(token: string): Promise<void> {
  const hashed = hashToken(token)
  await db.session.updateMany({
    where: { token: hashed },
    data: { isActive: false },
  })
}

/**
 * Revoke ALL active sessions for a user (force logout from all devices).
 */
export async function revokeAllSessions(userId: string): Promise<void> {
  await db.session.updateMany({
    where: { userId, isActive: true },
    data: { isActive: false },
  })
}

/**
 * Get all active sessions for a user (for session management UI).
 */
export async function getUserSessions(userId: string) {
  return db.session.findMany({
    where: { userId, isActive: true },
    orderBy: { lastActivityAt: 'desc' },
    select: {
      id: true,
      ipAddress: true,
      userAgent: true,
      deviceFingerprint: true,
      lastActivityAt: true,
      createdAt: true,
      expiresAt: true,
    },
  })
}

/**
 * Clean up expired sessions (call periodically).
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const result = await db.session.updateMany({
    where: { expiresAt: { lt: new Date() }, isActive: true },
    data: { isActive: false },
  })
  return result.count
}
