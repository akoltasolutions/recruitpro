/**
 * Verify critical columns exist in the User table.
 * Run after prisma db push to ensure schema sync worked.
 * Exits with code 0 if OK, 1 if columns are missing.
 *
 * Usage: bun run prisma/migrate-verify-columns.ts
 */
import { PrismaClient } from '@prisma/client';

const CRITICAL_COLUMNS = [
  'approvalStatus',
  'mfaEnabled',
  'mfaVerified',
  'failedLoginAttempts',
  'lockedUntil',
  'tokenVersion',
  'passwordChangedAt',
  'lastLoginAt',
  'lastLoginIp',
];

async function main() {
  const db = new PrismaClient();

  try {
    const rows: { name: string }[] = await db.$queryRaw`
      SELECT name FROM pragma_table_info('User')
    `;
    const existingCols = new Set(rows.map((r) => r.name));
    const missing = CRITICAL_COLUMNS.filter((c) => !existingCols.has(c));

    if (missing.length > 0) {
      console.error(`MISSING_COLUMNS: ${missing.join(', ')}`);
      process.exit(1);
    }

    console.log('All critical columns present.');
    process.exit(0);
  } catch (error) {
    console.error(`DB CHECK ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

main();
