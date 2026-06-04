/**
 * One-time migration: Update existing pending recruiter users to have
 * approvalStatus = 'PENDING' instead of the default 'APPROVED'.
 *
 * When the approvalStatus column was added with default 'APPROVED',
 * existing inactive (pending) recruiters still had 'APPROVED'.
 * This script fixes those records.
 *
 * Safe to run multiple times — uses updateMany which is idempotent.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function migrate() {
  try {
    const result = await prisma.user.updateMany({
      where: {
        isActive: false,
        approvalStatus: 'APPROVED',
      },
      data: {
        approvalStatus: 'PENDING',
      },
    })

    console.log(`Migrated ${result.count} users to PENDING approval status`)

    // Verify
    const remaining = await prisma.user.count({
      where: { isActive: false, approvalStatus: 'APPROVED' },
    })
    console.log(`Remaining legacy pending users: ${remaining}`)
  } catch (error) {
    console.error('Migration error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

migrate()
