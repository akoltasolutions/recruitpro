import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth-middleware';

/**
 * Diagnostic endpoint to test client creation and return detailed error info.
 * Call: GET /api/clients/diagnostics
 * Only accessible by authenticated admin users.
 * IMPORTANT: Remove after debugging.
 */
export async function GET(request: Request) {
  try {
    const auth = await authenticateRequest(request as unknown as Parameters<typeof authenticateRequest>[0]);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const diagnostics: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      auth: {
        userId: auth.userId,
        role: auth.role,
        organizationId: auth.organizationId,
        orgName: auth.organization?.name ?? null,
      },
    };

    // Test 1: Can we query the Client table?
    try {
      const count = await db.client.count();
      diagnostics.dbClientCount = count;
      diagnostics.dbAccess = 'OK';
    } catch (err) {
      diagnostics.dbAccess = 'FAILED';
      diagnostics.dbError = String(err);
    }

    // Test 2: Can we read clients?
    try {
      const clients = await db.client.findMany({ take: 3 });
      diagnostics.sampleClients = clients.map(c => ({ id: c.id, name: c.name }));
    } catch (err) {
      diagnostics.readError = String(err);
    }

    // Test 3: Can we create a test client?
    const testName = `_diag_test_${Date.now()}`;
    try {
      const created = await db.client.create({
        data: {
          name: testName,
          ...(auth.organizationId ? { organizationId: auth.organizationId } : {}),
        },
      });
      diagnostics.createTest = 'OK';
      diagnostics.createdId = created.id;

      // Clean up immediately
      await db.client.delete({ where: { id: created.id } });
      diagnostics.cleanup = 'OK';
    } catch (err) {
      diagnostics.createTest = 'FAILED';
      const prismaErr = err as { code?: string; message?: string; meta?: unknown };
      diagnostics.createErrorCode = prismaErr.code;
      diagnostics.createErrorMsg = prismaErr.message;
      diagnostics.createErrorMeta = prismaErr.meta;

      // Try without organizationId
      try {
        const created = await db.client.create({ data: { name: testName } });
        diagnostics.createWithoutOrg = 'OK';
        diagnostics.createdId = created.id;
        await db.client.delete({ where: { id: created.id } });
        diagnostics.cleanup = 'OK';
      } catch (retryErr) {
        diagnostics.createWithoutOrg = 'FAILED';
        diagnostics.retryError = String(retryErr);
      }
    }

    // Test 4: Check Client table schema via raw query
    try {
      const schema = await db.$queryRaw<Array<{ sql: string }>>(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='Client'"
      );
      diagnostics.clientSchema = schema?.[0]?.sql ?? 'NOT FOUND';
    } catch (err) {
      diagnostics.schemaError = String(err);
    }

    return NextResponse.json({ diagnostics });
  } catch (error) {
    return NextResponse.json({
      error: 'Diagnostics failed',
      details: String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }, { status: 500 });
  }
}
