/**
 * Production migration: Ensure the super admin account exists.
 *
 * Creates or updates the primary super admin account:
 * - Email: ompratap@akolta.com
 * - Default Password: Admin@123 (user will change it later)
 * - Role: SUPER_ADMIN
 * - Status: Active, Approved
 *
 * Also migrates any legacy admin@recruitment.com SUPER_ADMIN to the new email.
 *
 * Safe to run multiple times — idempotent.
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const SALT_ROUNDS = 10

const prisma = new PrismaClient()

async function migrate() {
  try {
    // 1. Check if target email already exists
    const existingAdmin = await prisma.user.findUnique({
      where: { email: 'ompratap@akolta.com' },
    })

    if (existingAdmin) {
      // Ensure it has SUPER_ADMIN role and is active
      if (existingAdmin.role !== 'SUPER_ADMIN' || !existingAdmin.isActive) {
        await prisma.user.update({
          where: { email: 'ompratap@akolta.com' },
          data: {
            role: 'SUPER_ADMIN',
            isActive: true,
            approvalStatus: 'APPROVED',
          },
        })
        console.log('Updated ompratap@akolta.com to SUPER_ADMIN (was role:', existingAdmin.role, ', active:', existingAdmin.isActive, ')')
      } else {
        console.log('ompratap@akolta.com already exists as SUPER_ADMIN — no changes needed')
      }
    } else {
      // 2. Check if there's a legacy admin@recruitment.com to migrate from
      const legacyAdmin = await prisma.user.findUnique({
        where: { email: 'admin@recruitment.com' },
      })

      const hashedPassword = await bcrypt.hash('Admin@123', SALT_ROUNDS)

      if (legacyAdmin) {
        // Migrate legacy admin to new email
        await prisma.user.update({
          where: { email: 'admin@recruitment.com' },
          data: {
            email: 'ompratap@akolta.com',
            password: hashedPassword,
            role: 'SUPER_ADMIN',
            isActive: true,
            approvalStatus: 'APPROVED',
            name: 'Admin',
          },
        })
        console.log('Migrated admin@recruitment.com → ompratap@akolta.com')
      } else {
        // 3. Get the Akolta organization
        const org = await prisma.organization.findFirst({
          where: { slug: 'akolta' },
        })

        await prisma.user.create({
          data: {
            email: 'ompratap@akolta.com',
            name: 'Admin',
            password: hashedPassword,
            role: 'SUPER_ADMIN',
            isActive: true,
            approvalStatus: 'APPROVED',
            organizationId: org?.id || null,
            uploadPermission: true,
            createListPermission: true,
          },
        })
        console.log('Created new SUPER_ADMIN account: ompratap@akolta.com')
      }
    }

    // Verify
    const admin = await prisma.user.findUnique({
      where: { email: 'ompratap@akolta.com' },
      select: { id: true, email: true, name: true, role: true, isActive: true, approvalStatus: true },
    })
    console.log('Verification:', JSON.stringify(admin, null, 2))
  } catch (error) {
    console.error('Migration error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

migrate()
