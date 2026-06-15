import { NextResponse } from 'next/server';

export async function GET() {
  const results: Record<string, string> = {};

  // 1. Check environment variables
  results['NODE_ENV'] = process.env.NODE_ENV || 'NOT SET';
  results['DATABASE_URL'] = process.env.DATABASE_URL || 'NOT SET';
  results['TOKEN_SECRET'] = process.env.TOKEN_SECRET ? 'SET (length: ' + process.env.TOKEN_SECRET.length + ')' : 'NOT SET';

  // 2. Check if DB file exists
  try {
    const fs = require('fs');
    const dbPath = process.env.DATABASE_URL?.replace('file:', '') || '';
    results['DB_FILE_PATH'] = dbPath;
    results['DB_FILE_EXISTS'] = fs.existsSync(dbPath) ? 'YES' : 'NO';
    if (fs.existsSync(dbPath)) {
      const stats = fs.statSync(dbPath);
      results['DB_FILE_SIZE'] = stats.size + ' bytes';
    }
  } catch (e: any) {
    results['DB_FILE_CHECK_ERROR'] = e.message;
  }

  // 3. Try importing and using Prisma Client
  try {
    const { PrismaClient } = require('@prisma/client');
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
  } catch (e: any) {
    results['PRISMA_ERROR'] = e.message || String(e);
    results['PRISMA_ERROR_STACK'] = e.stack?.split('\n').slice(0, 5).join('\n') || 'No stack';
  }

  // 4. Check if bcryptjs works
  try {
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('test', 10);
    results['BCRYPTJS'] = 'OK (hash length: ' + hash.length + ')';
  } catch (e: any) {
    results['BCRYPTJS_ERROR'] = e.message || String(e);
  }

  // 5. Check process info
  results['CWD'] = process.cwd();
  results['NODE_VERSION'] = process.version;
  results['MEMORY'] = JSON.stringify(process.memoryUsage());

  return NextResponse.json(results, { status: 200 });
}
