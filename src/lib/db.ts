import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Prisma Client singleton.
 *
 * In production we cache on globalThis to avoid exhausting connections.
 * In development we always create a fresh instance so that schema changes
 * (e.g. adding a new model) are picked up immediately without needing a
 * full server restart.
 */
function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : ['error'],
  })
}

export const db =
  process.env.NODE_ENV === 'production'
    ? (globalForPrisma.prisma ??= createPrismaClient())
    : createPrismaClient()
