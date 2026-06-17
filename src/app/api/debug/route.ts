import { NextResponse } from 'next/server';
import { existsSync, statSync } from 'fs';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

/**
 * Diagnostic endpoint — verifies environment, database connectivity,
 * bcryptjs, and process info.
 *
 * NOT called from any frontend component. Intended for manual debugging
 * by developers (e.g., curl /api/debug).
 */
export async function GET() {
  const results: Record<string, string> = {};

  // 1. Check environment variables
  results['NODE_ENV'] = process.env.NODE_ENV || 'NOT SET';
  results['DATABASE_URL'] = process.env.DATABASE_URL || 'NOT SET';
  results['TOKEN_SECRET'] = process.env.TOKEN_SECRET ? 'SET (length: ' + process.env.TOKEN_SECRET.length + ')' : 'NOT SET';

  // 2. Check if DB file exists
  try {
    const dbPath = process.env.DATABASE_URL?.replace('file:', '') || '';
    results['DB_FILE_PATH'] = dbPath;
    results['DB_FILE_EXISTS'] = existsSync(dbPath) ? 'YES' : 'NO';
    if (existsSync(dbPath)) {
      const stats = statSync(dbPath);
      results['DB_FILE_SIZE'] = stats.size + ' bytes';
    }
  } catch (e: unknown) {
    results['DB_FILE_CHECK_ERROR'] = (e as Error).message;
  }

  // 3. Try using Prisma Client
  try {
    results['PRISMA_IMPORT'] = 'SUCCESS';

    const client = new PrismaClient({
      log: ['error', 'warn'],
    });
    results['PRISMA_CLIENT_CREATE'] = 'SUCCESS';

    // Try a simple query
    const userCount = await client.user.count();
    results['USER_COUNT'] = String(userCount);

    // Try finding admin user
    const admin = await client.user.findUnique({ where: { email: 'admin@recruitment.com' } });
    results['ADMIN_EXISTS'] = admin ? 'YES (id: ' + admin.id + ', role: ' + admin.role + ', active: ' + admin.isActive + ')' : 'NO';

    await client.$disconnect();
    results['PRISMA_DISCONNECT'] = 'SUCCESS';
  } catch (e: unknown) {
    results['PRISMA_ERROR'] = (e as Error).message || String(e);
    results['PRISMA_ERROR_STACK'] = (e as Error).stack?.split('\n').slice(0, 5).join('\n') || 'No stack';
  }

  // 4. Check if bcryptjs works
  try {
    const hash = await bcrypt.hash('test', 10);
    results['BCRYPTJS'] = 'OK (hash length: ' + hash.length + ')';
  } catch (e: unknown) {
    results['BCRYPTJS_ERROR'] = (e as Error).message || String(e);
  }

  // 5. Check process info
  results['CWD'] = process.cwd();
  results['NODE_VERSION'] = process.version;
  results['MEMORY'] = JSON.stringify(process.memoryUsage());

  return NextResponse.json(results, { status: 200 });
}
