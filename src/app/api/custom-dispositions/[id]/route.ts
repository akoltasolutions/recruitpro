import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, requireOrgAdmin } from '@/lib/auth-middleware';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireOrgAdmin(auth)) return NextResponse.json({ error: 'Access denied. Org admin required.' }, { status: 403 });
    if (!auth.organizationId) return NextResponse.json({ error: 'Organization required' }, { status: 400 });

    const { id } = await params;
    const body = await request.json();
    const { name, color, isPositive, isActive } = body;

    const existing = await db.customDisposition.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    if (!existing) return NextResponse.json({ error: 'Disposition not found' }, { status: 404 });

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (color !== undefined) {
      const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;
      if (!hexColorRegex.test(color)) {
        return NextResponse.json({ error: 'Color must be a valid hex color (e.g. #6B7280)' }, { status: 400 });
      }
      updateData.color = color;
    }
    if (isPositive !== undefined) updateData.isPositive = Boolean(isPositive);
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);

    const disposition = await db.customDisposition.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ disposition });
  } catch (error) {
    console.error('Update custom disposition error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateRequest(_request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireOrgAdmin(auth)) return NextResponse.json({ error: 'Access denied. Org admin required.' }, { status: 403 });
    if (!auth.organizationId) return NextResponse.json({ error: 'Organization required' }, { status: 400 });

    const { id } = await params;

    const existing = await db.customDisposition.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    if (!existing) return NextResponse.json({ error: 'Disposition not found' }, { status: 404 });

    // Soft delete
    await db.customDisposition.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete custom disposition error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
