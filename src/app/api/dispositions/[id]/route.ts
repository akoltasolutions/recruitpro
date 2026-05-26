import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth-middleware';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (auth.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    const { id } = await params;
    const { heading, type, isActive } = await request.json();

    // Validate disposition type
    const validTypes = ['SHORTLISTED', 'CONNECTED', 'NOT_CONNECTED', 'NOT_INTERESTED'];
    if (type && !validTypes.includes(type)) {
      return NextResponse.json({ error: 'Invalid disposition type' }, { status: 400 });
    }

    const existing = await db.disposition.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Disposition not found' }, { status: 404 });

    const updateData: Record<string, unknown> = {};
    if (heading !== undefined) updateData.heading = heading;
    if (type !== undefined) updateData.type = type;
    if (isActive !== undefined) updateData.isActive = isActive;

    const disposition = await db.disposition.update({ where: { id }, data: updateData });
    return NextResponse.json({ disposition });
  } catch (error) {
    console.error('Update disposition error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateRequest(_request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (auth.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    const { id } = await params;
    await db.disposition.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete disposition error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
