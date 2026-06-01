import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, requireOrgAdmin } from '@/lib/auth-middleware';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.organizationId) return NextResponse.json({ error: 'Organization required' }, { status: 400 });

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    const dispositions = await db.customDisposition.findMany({
      where: {
        organizationId: auth.organizationId,
        projectId: projectId || null,
        isActive: true,
      },
      orderBy: { sortOrder: 'asc' },
    });

    return NextResponse.json({ dispositions });
  } catch (error) {
    console.error('Custom dispositions list error:', error);
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
    const { name, color, isPositive, projectId } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Validate color is a valid hex
    const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;
    const dispColor = color || '#6B7280';
    if (!hexColorRegex.test(dispColor)) {
      return NextResponse.json({ error: 'Color must be a valid hex color (e.g. #6B7280)' }, { status: 400 });
    }

    // Count existing dispositions to set sortOrder
    const count = await db.customDisposition.count({
      where: { organizationId: auth.organizationId, projectId: projectId || null },
    });

    const disposition = await db.customDisposition.create({
      data: {
        name: name.trim(),
        color: dispColor,
        isPositive: Boolean(isPositive),
        organizationId: auth.organizationId,
        projectId: projectId || null,
        sortOrder: count,
      },
    });

    return NextResponse.json({ disposition }, { status: 201 });
  } catch (error) {
    console.error('Create custom disposition error:', error);
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

    // Verify all items belong to the organization before updating
    const ownedItems = await db.customDisposition.findMany({
      where: { id: { in: items.map((item: { id: string }) => item.id) }, organizationId: auth.organizationId },
    });
    if (ownedItems.length !== items.length) {
      return NextResponse.json({ error: 'One or more dispositions not found in this organization' }, { status: 404 });
    }

    // Update sortOrder for each disposition in a transaction
    await db.$transaction(
      items.map((item: { id: string; sortOrder: number }) =>
        db.customDisposition.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        })
      )
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Reorder custom dispositions error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
