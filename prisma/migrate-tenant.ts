/**
 * Migration script: Backfill organizationId on all existing rows
 * that were created before multi-tenant support was added.
 * 
 * This script:
 * 1. Finds or creates the default "Akolta" organization
 * 2. Updates all rows with NULL organizationId to belong to that org
 * 3. Also ensures the admin user is linked to the org
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Tenant Migration: Backfilling organizationId ===');

  // 1. Find the Akolta org (created by seed script)
  let akoltaOrg = await prisma.organization.findFirst({
    where: { slug: 'akolta' },
  });

  // If not found, create it
  if (!akoltaOrg) {
    console.log('Creating default Akolta organization...');
    akoltaOrg = await prisma.organization.create({
      data: {
        name: 'Akolta',
        slug: 'akolta',
        email: 'admin@akolta.com',
        subscriptionStatus: 'ACTIVE',
        isActive: true,
      },
    });
    console.log(`Created organization: ${akoltaOrg.id} (${akoltaOrg.name})`);
  } else {
    console.log(`Found existing organization: ${akoltaOrg.id} (${akoltaOrg.name})`);
  }

  const orgId = akoltaOrg.id;

  // 2. Backfill all tables with NULL organizationId
  const tables = [
    { name: 'User', count: 0 },
    { name: 'Client', count: 0 },
    { name: 'Disposition', count: 0 },
    { name: 'CallList', count: 0 },
    { name: 'Candidate', count: 0 },
    { name: 'CallListAssignment', count: 0 },
    { name: 'CallRecord', count: 0 },
    { name: 'MessageTemplate', count: 0 },
    { name: 'WhatsAppMessage', count: 0 },
    { name: 'Announcement', count: 0 },
    { name: 'ActivityLog', count: 0 },
  ];

  // Use raw SQL for each table
  const updateStatements = [
    { sql: `UPDATE "User" SET "organizationId" = '${orgId}' WHERE "organizationId" IS NULL`, table: 'User' },
    { sql: `UPDATE "Client" SET "organizationId" = '${orgId}' WHERE "organizationId" IS NULL`, table: 'Client' },
    { sql: `UPDATE "Disposition" SET "organizationId" = '${orgId}' WHERE "organizationId" IS NULL`, table: 'Disposition' },
    { sql: `UPDATE "CallList" SET "organizationId" = '${orgId}' WHERE "organizationId" IS NULL`, table: 'CallList' },
    { sql: `UPDATE "Candidate" SET "organizationId" = '${orgId}' WHERE "organizationId" IS NULL`, table: 'Candidate' },
    { sql: `UPDATE "CallListAssignment" SET "organizationId" = '${orgId}' WHERE "organizationId" IS NULL`, table: 'CallListAssignment' },
    { sql: `UPDATE "CallRecord" SET "organizationId" = '${orgId}' WHERE "organizationId" IS NULL`, table: 'CallRecord' },
    { sql: `UPDATE "MessageTemplate" SET "organizationId" = '${orgId}' WHERE "organizationId" IS NULL`, table: 'MessageTemplate' },
    { sql: `UPDATE "WhatsAppMessage" SET "organizationId" = '${orgId}' WHERE "organizationId" IS NULL`, table: 'WhatsAppMessage' },
    { sql: `UPDATE "Announcement" SET "organizationId" = '${orgId}' WHERE "organizationId" IS NULL`, table: 'Announcement' },
    { sql: `UPDATE "ActivityLog" SET "organizationId" = '${orgId}' WHERE "organizationId" IS NULL`, table: 'ActivityLog' },
  ];

  for (const { sql, table } of updateStatements) {
    try {
      const result = await prisma.$executeRawUnsafe(sql);
      const tableEntry = tables.find(t => t.name === table);
      if (tableEntry) tableEntry.count = result;
      console.log(`  ✓ ${table}: updated ${result} rows`);
    } catch (err: any) {
      console.log(`  ✗ ${table}: ${err.message || 'table may not exist yet'}`);
    }
  }

  // 3. Summary
  const totalUpdated = tables.reduce((sum, t) => sum + t.count, 0);
  console.log(`\n=== Migration complete: ${totalUpdated} total rows updated ===`);
  
  // Verify
  const orgStats = await prisma.$queryRawUnsafe(`
    SELECT 
      (SELECT COUNT(*) FROM "User" WHERE "organizationId" = '${orgId}') as users,
      (SELECT COUNT(*) FROM "CallList" WHERE "organizationId" = '${orgId}') as callLists,
      (SELECT COUNT(*) FROM "Candidate" WHERE "organizationId" = '${orgId}') as candidates,
      (SELECT COUNT(*) FROM "CallRecord" WHERE "organizationId" = '${orgId}') as callRecords,
      (SELECT COUNT(*) FROM "Client" WHERE "organizationId" = '${orgId}') as clients
  `);
  console.log('Organization stats after migration:', orgStats);
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
