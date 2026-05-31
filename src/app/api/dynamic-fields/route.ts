import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, requireOrgAdmin } from '@/lib/auth-middleware';

const VALID_FIELD_TYPES = ['TEXT', 'NUMBER', 'DATE', 'EMAIL', 'PHONE', 'SELECT', 'MULTI_SELECT', 'BOOLEAN', 'TEXTAREA', 'URL'];

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.organizationId) return NextResponse.json({ error: 'Organization required' }, { status: 400 });

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    const fields = await db.dynamicField.findMany({
      where: {
        organizationId: auth.organizationId,
        projectId: projectId || null,
        isActive: true,
      },
      orderBy: { sortOrder: 'asc' },
    });

    return NextResponse.json({ fields });
  } catch (error) {
    console.error('Dynamic fields list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireOrgAdmin(auth)) return NextResponse.json({ error: 'Access denied. Org admin required.' }, { status: 403 });
    if (!auth.organizationId) return NextResponse.json({ error: 'Organization required' }, { status: 400 });

    const body = await request.json();
    const { name, label, fieldType, options, isRequired, projectId } = body;

    if (!label || typeof label !== 'string' || !label.trim()) {
      return NextResponse.json({ error: 'Label is required' }, { status: 400 });
    }

    const type = fieldType?.toUpperCase() || 'TEXT';
    if (!VALID_FIELD_TYPES.includes(type)) {
      return NextResponse.json({ error: `Invalid field type. Must be one of: ${VALID_FIELD_TYPES.join(', ')}` }, { status: 400 });
    }

    // Validate options for SELECT / MULTI_SELECT
    if ((type === 'SELECT' || type === 'MULTI_SELECT') && options) {
      try {
        const parsed = typeof options === 'string' ? JSON.parse(options) : options;
        if (!Array.isArray(parsed) || parsed.length === 0) {
          return NextResponse.json({ error: 'Options must be a non-empty JSON array for SELECT/MULTI_SELECT' }, { status: 400 });
        }
      } catch {
        return NextResponse.json({ error: 'Options must be a valid JSON array' }, { status: 400 });
      }
    }

    // Auto-generate name from label if not provided
    const fieldName = name || label
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');

    // Count existing fields to set sortOrder
    const count = await db.dynamicField.count({
      where: { organizationId: auth.organizationId, projectId: projectId || null },
    });

    const field = await db.dynamicField.create({
      data: {
        name: fieldName,
        label: label.trim(),
        fieldType: type,
        options: options ? (typeof options === 'string' ? options : JSON.stringify(options)) : null,
        isRequired: Boolean(isRequired),
        organizationId: auth.organizationId,
        projectId: projectId || null,
        sortOrder: count,
      },
    });

    return NextResponse.json({ field }, { status: 201 });
  } catch (error) {
    console.error('Create dynamic field error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireOrgAdmin(auth)) return NextResponse.json({ error: 'Access denied. Org admin required.' }, { status: 403 });
    if (!auth.organizationId) return NextResponse.json({ error: 'Organization required' }, { status: 400 });

    const { items } = await request.json();

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'items array is required' }, { status: 400 });
    }

    for (const item of items) {
      if (!item.id || typeof item.sortOrder !== 'number') {
        return NextResponse.json({ error: 'Each item must have id and sortOrder' }, { status: 400 });
      }
    }

    // Update sortOrder for each field in a transaction
    await db.$transaction(
      items.map((item: { id: string; sortOrder: number }) =>
        db.dynamicField.update({
          where: { id: item.id, organizationId: auth.organizationId },
          data: { sortOrder: item.sortOrder },
        })
      )
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Reorder dynamic fields error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
