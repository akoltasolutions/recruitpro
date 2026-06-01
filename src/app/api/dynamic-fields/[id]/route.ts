import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, requireOrgAdmin } from '@/lib/auth-middleware';

const VALID_FIELD_TYPES = ['TEXT', 'NUMBER', 'DATE', 'EMAIL', 'PHONE', 'SELECT', 'MULTI_SELECT', 'BOOLEAN', 'TEXTAREA', 'URL'];

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireOrgAdmin(auth)) return NextResponse.json({ error: 'Access denied. Org admin required.' }, { status: 403 });
    if (!auth.organizationId) return NextResponse.json({ error: 'Organization required' }, { status: 400 });

    const { id } = await params;
    const body = await request.json();
    const { label, fieldType, options, isRequired, isActive } = body;

    const existing = await db.dynamicField.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    if (!existing) return NextResponse.json({ error: 'Field not found' }, { status: 404 });

    const updateData: Record<string, unknown> = {};
    if (label !== undefined) updateData.label = label.trim();
    if (fieldType !== undefined) {
      const type = fieldType.toUpperCase();
      if (!VALID_FIELD_TYPES.includes(type)) {
        return NextResponse.json({ error: `Invalid field type. Must be one of: ${VALID_FIELD_TYPES.join(', ')}` }, { status: 400 });
      }
      updateData.fieldType = type;
    }
    if (options !== undefined) {
      updateData.options = options ? (typeof options === 'string' ? options : JSON.stringify(options)) : null;
    }
    if (isRequired !== undefined) updateData.isRequired = Boolean(isRequired);
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);

    const field = await db.dynamicField.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ field });
  } catch (error) {
    console.error('Update dynamic field error:', error);
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

    const existing = await db.dynamicField.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    if (!existing) return NextResponse.json({ error: 'Field not found' }, { status: 404 });

    // Soft delete
    await db.dynamicField.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete dynamic field error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
