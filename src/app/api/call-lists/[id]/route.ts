import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth-middleware';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateRequest(_request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const callList = await db.callList.findUnique({
      where: { id },
      include: {
        candidates: true,
        assignments: {
          include: { recruiter: { select: { id: true, name: true, email: true } } },
        },
      },
    });
    if (!callList) return NextResponse.json({ error: 'Call list not found' }, { status: 404 });
    return NextResponse.json({ callList });
  } catch (error) {
    console.error('Get call list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const { name, description, syncInterval, googleSheetsUrl, googleSheetGid } = await request.json();

    const updateData: Record<string, unknown> = {};
    if (name) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (syncInterval !== undefined && syncInterval !== null) updateData.syncInterval = Number(syncInterval);
    if (googleSheetsUrl !== undefined && googleSheetsUrl !== null) updateData.googleSheetsUrl = String(googleSheetsUrl);
    if (googleSheetGid !== undefined && googleSheetGid !== null) updateData.googleSheetGid = String(googleSheetGid);

    const callList = await db.callList.update({
      where: { id },
      data: updateData,
    });
    return NextResponse.json({ callList });
  } catch (error) {
    console.error('Update call list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateRequest(_request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (auth.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Only admins can delete call lists' }, { status: 403 });
    }
    const { id } = await params;

    // Verify call list exists before deleting
    const existing = await db.callList.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Call list not found' }, { status: 404 });
    }

    await db.callList.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete call list error:', error);
    return NextResponse.json({ error: 'Failed to delete call list. It may have associated records that prevent deletion.' }, { status: 500 });
  }
}
