import { db } from '@/lib/db'
import { hashPassword } from './auth'

const MAX_HISTORY = 5 // Check last 5 passwords

/**
 * Add a password to the user's history.
 * Call this AFTER updating the user's password.
 */
export async function addToPasswordHistory(userId: string, newPassword: string): Promise<void> {
  const hashed = await hashPassword(newPassword)
  
  await db.passwordHistory.create({
    data: {
      userId,
      passwordHash: hashed,
    },
  })
  
  // Keep only last MAX_HISTORY entries
  const history = await db.passwordHistory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
  
  if (history.length > MAX_HISTORY) {
    const toDelete = history.slice(MAX_HISTORY)
    for (const entry of toDelete) {
      await db.passwordHistory.delete({ where: { id: entry.id } })
    }
  }
}

/**
 * Check if a password has been used recently.
 * Returns true if the password is in the history (should be rejected).
 */
export async function isPasswordReused(userId: string, newPassword: string): Promise<boolean> {
  const history = await db.passwordHistory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: MAX_HISTORY,
    select: { passwordHash: true },
  })
  
  const bcrypt = await import('bcryptjs')
  for (const entry of history) {
    const isMatch = await bcrypt.compare(newPassword, entry.passwordHash)
    if (isMatch) return true
  }
  return false
}
