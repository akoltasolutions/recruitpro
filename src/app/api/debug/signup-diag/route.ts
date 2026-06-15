import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { Prisma } from '@prisma/client';

/**
 * TEMPORARY diagnostic endpoint for signup debugging.
 * DELETE THIS AFTER FIX IS VERIFIED ON PRODUCTION.
 *
 * Tests each step of the signup flow and returns diagnostics.
 * Requires SUPER_ADMIN authentication (uses auth-middleware).
 */
export async function POST() {
  try {
    // Step 1: Test DB read
    const userCount = await db.user.count();
    const step1 = `DB read OK (${userCount} users)`;

    // Step 2: Test Prisma schema introspection
    let step2 = '';
    try {
      const cols: { name: string }[] = await db.$queryRaw`
        SELECT name FROM pragma_table_info('User')
      `;
      const colNames = cols.map((c) => c.name);
      const hasApprovalStatus = colNames.includes('approvalStatus');
      const hasMfaEnabled = colNames.includes('mfaEnabled');
      const hasFailedLoginAttempts = colNames.includes('failedLoginAttempts');
      step2 = `Schema OK (approvalStatus=${hasApprovalStatus}, mfaEnabled=${hasMfaEnabled}, failedLoginAttempts=${hasFailedLoginAttempts}, total=${colNames.length} cols)`;
    } catch (e) {
      step2 = `Schema check FAILED: ${e instanceof Error ? e.message : String(e)}`;
    }

    // Step 3: Test password hashing
    let step3 = '';
    try {
      const start = Date.now();
      const hashed = await hashPassword('TestPass123');
      step3 = `Hash OK (${Date.now() - start}ms, len=${hashed.length})`;
    } catch (e) {
      step3 = `Hash FAILED: ${e instanceof Error ? e.message : String(e)}`;
    }

    // Step 4: Test user creation
    let step4 = '';
    let testUser = null;
    try {
      const hashedPassword = await hashPassword('DiagTest123');
      testUser = await db.user.create({
        data: {
          name: '__diag_test_user__',
          email: `diag-test-${Date.now()}@test.example.com`,
          phone: null,
          password: hashedPassword,
          role: 'RECRUITER',
          isActive: false,
          approvalStatus: 'PENDING',
        },
      });
      step4 = `Create OK (id=${testUser.id?.substring(0, 8)}, approvalStatus=${testUser.approvalStatus})`;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        const prismaErr = e as Prisma.PrismaClientKnownRequestError;
        step4 = `Create FAILED [Prisma ${prismaErr.code}]: ${prismaErr.message} | meta=${JSON.stringify(prismaErr.meta)}`;

        // Try fallback without approvalStatus
        if (prismaErr.code === 'P2021') {
          try {
            const hashedPassword = await hashPassword('DiagFallback123');
            testUser = await db.user.create({
              data: {
                name: '__diag_test_user_fallback__',
                email: `diag-fallback-${Date.now()}@test.example.com`,
                phone: null,
                password: hashedPassword,
                role: 'RECRUITER',
                isActive: false,
              },
            });
            step4 += ` | Fallback OK (id=${testUser.id?.substring(0, 8)})`;
          } catch (fb) {
            step4 += ` | Fallback FAILED: ${fb instanceof Error ? fb.message : String(fb)}`;
          }
        }
      } else {
        step4 = `Create FAILED [Non-Prisma]: ${e instanceof Error ? e.message : String(e)}`;
        if (e instanceof Error) step4 += ` | stack=${e.stack?.substring(0, 200)}`;
      }
    }

    // Step 5: Cleanup test user
    let step5 = '';
    if (testUser) {
      try {
        await db.user.delete({ where: { id: testUser.id } });
        step5 = 'Cleanup OK';
      } catch (e) {
        step5 = `Cleanup FAILED: ${e instanceof Error ? e.message : String(e)}`;
      }
    } else {
      step5 = 'Skipped (no user created)';
    }

    return NextResponse.json({
      diagnostics: {
        step1_dbRead: step1,
        step2_schema: step2,
        step3_hash: step3,
        step4_create: step4,
        step5_cleanup: step5,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({
      error: 'Diagnostic failed',
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
