import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, requireOrgAdmin } from '@/lib/auth-middleware';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const clients = await db.client.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ clients });
  } catch (error) {
    console.error('[GET /api/clients] Error:', error);
    return NextResponse.json({ error: 'Failed to load clients' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Step 1: Authenticate
    const auth = await authenticateRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!requireOrgAdmin(auth)) {
      return NextResponse.json({ error: 'Access denied. Admin permission required.' }, { status: 403 });
    }

    // Step 2: Parse request body (with error handling for malformed body)
    let body: { name?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body. Expected JSON.' }, { status: 400 });
    }

    const { name } = body;

    // Step 3: Validate required fields
    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Client name is required.' }, { status: 400 });
    }
    const trimmed = name.trim();
    if (!trimmed) {
      return NextResponse.json({ error: 'Client name cannot be empty.' }, { status: 400 });
    }

    // Step 4: Check for duplicate (globally unique name)
    try {
      const existing = await db.client.findUnique({ where: { name: trimmed } });
      if (existing) {
        return NextResponse.json({ error: 'Client already exists.' }, { status: 409 });
      }
    } catch (dbErr) {
      console.error('[POST /api/clients] DB findUnique error:', dbErr);
      return NextResponse.json({ error: 'Failed to check existing clients.' }, { status: 500 });
    }

    // Step 5: Create client with organizationId if available
    try {
      const client = await db.client.create({
        data: {
          name: trimmed,
          ...(auth.organizationId ? { organizationId: auth.organizationId } : {}),
        },
      });
      return NextResponse.json({ client }, { status: 201 });
    } catch (createErr) {
      const err = createErr as { code?: string; message?: string; meta?: Record<string, unknown> };
      console.error('[POST /api/clients] DB create error:', {
        code: err.code,
        message: err.message,
        meta: err.meta,
      });

      // Unique constraint violation (P2002) — safety net duplicate check
      if (err.code === 'P2002') {
        return NextResponse.json({ error: 'Client already exists.' }, { status: 409 });
      }

      // Foreign key constraint violation (P2003) — invalid organizationId
      if (err.code === 'P2003') {
        console.error('[POST /api/clients] Foreign key violation — organizationId:', auth.organizationId);
        // Retry without organizationId
        try {
          const client = await db.client.create({ data: { name: trimmed } });
          return NextResponse.json({ client }, { status: 201 });
        } catch (retryErr) {
          console.error('[POST /api/clients] Retry without orgId failed:', retryErr);
          return NextResponse.json({ error: 'Failed to create client.' }, { status: 500 });
        }
      }

      return NextResponse.json({ error: 'Failed to create client.' }, { status: 500 });
    }
  } catch (error) {
    console.error('[POST /api/clients] Unhandled error:', error);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
