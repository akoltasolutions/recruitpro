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
    const { name, type, content, isActive } = await request.json();

    // Validate template type
    const validTypes = ['NOT_ANSWERED', 'SHORTLISTED', 'CUSTOM'];
    if (type && !validTypes.includes(type)) {
      return NextResponse.json({ error: 'Invalid template type' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (type !== undefined) updateData.type = type;
    if (content !== undefined) updateData.content = content;
    if (isActive !== undefined) updateData.isActive = isActive;

    const template = await db.messageTemplate.update({ where: { id }, data: updateData });
    return NextResponse.json({ template });
  } catch (error) {
    console.error('Update message template error:', error);
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
    await db.messageTemplate.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete message template error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
