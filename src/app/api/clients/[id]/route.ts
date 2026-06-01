import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, requireOrgAdmin } from '@/lib/auth-middleware';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Step 1: Authenticate
    const auth = await authenticateRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!requireOrgAdmin(auth)) {
      return NextResponse.json({ error: 'Access denied. Admin permission required.' }, { status: 403 });
    }

    // Step 2: Parse params
    const { id } = await params;

    // Step 3: Parse request body
    let body: { name?: string; isActive?: boolean };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    const { name, isActive } = body;

    // Step 4: Check client exists
    const existing = await db.client.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
    }

    // Step 5: Build update data
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) {
        return NextResponse.json({ error: 'Client name cannot be empty.' }, { status: 400 });
      }
      updateData.name = trimmed;
    }
    if (isActive !== undefined) {
      updateData.isActive = Boolean(isActive);
    }

    // Step 6: Update
    const client = await db.client.update({ where: { id }, data: updateData });
    return NextResponse.json({ client });
  } catch (error) {
    const err = error as { code?: string; message?: string };
    console.error('[PUT /api/clients/:id] Error:', { code: err.code, message: err.message });

    if (err.code === 'P2002') {
      return NextResponse.json({ error: 'Client name already exists.' }, { status: 409 });
    }
    if (err.code === 'P2025') {
      return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to update client.' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Step 1: Authenticate
    const auth = await authenticateRequest(_request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!requireOrgAdmin(auth)) {
      return NextResponse.json({ error: 'Access denied. Admin permission required.' }, { status: 403 });
    }

    // Step 2: Parse params
    const { id } = await params;

    // Step 3: Delete
    await db.client.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    const err = error as { code?: string; message?: string };
    console.error('[DELETE /api/clients/:id] Error:', { code: err.code, message: err.message });

    if (err.code === 'P2003') {
      return NextResponse.json({ error: 'Cannot delete client with existing call records.' }, { status: 409 });
    }
    if (err.code === 'P2025') {
      return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to delete client.' }, { status: 500 });
  }
}
