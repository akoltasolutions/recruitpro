import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, requireAdmin } from '@/lib/auth-middleware';

// PUT /api/announcements/[id] — Update announcement (admin only)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!requireAdmin(auth.role)) {
      return NextResponse.json({ error: 'Access denied. Admin only.' }, { status: 403 });
    }

    const { id } = await params;

    // Check if announcement exists
    const existing = await db.announcement.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Announcement not found' }, { status: 404 });
    }

    const body = await request.json();
    const { title, content, isActive } = body;

    // Build update data with only provided fields
    const updateData: {
      title?: string;
      content?: string;
      isActive?: boolean;
    } = {};

    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length === 0) {
        return NextResponse.json({ error: 'Title must be a non-empty string' }, { status: 400 });
      }
      updateData.title = title.trim();
    }

    if (content !== undefined) {
      if (typeof content !== 'string' || content.trim().length === 0) {
        return NextResponse.json({ error: 'Content must be a non-empty string' }, { status: 400 });
      }
      updateData.content = content.trim();
    }

    if (isActive !== undefined) {
      if (typeof isActive !== 'boolean') {
        return NextResponse.json({ error: 'isActive must be a boolean' }, { status: 400 });
      }
      updateData.isActive = isActive;
    }

    // Check if there's anything to update
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update. Provide title, content, or isActive.' },
        { status: 400 }
      );
    }

    const announcement = await db.announcement.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ announcement });
  } catch (error) {
    console.error('Announcement update error:', error);
    return NextResponse.json({ error: 'Failed to update announcement' }, { status: 500 });
  }
}

// DELETE /api/announcements/[id] — Delete announcement (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!requireAdmin(auth.role)) {
      return NextResponse.json({ error: 'Access denied. Admin only.' }, { status: 403 });
    }

    const { id } = await params;

    // Check if announcement exists
    const existing = await db.announcement.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Announcement not found' }, { status: 404 });
    }

    await db.announcement.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'Announcement deleted successfully' });
  } catch (error) {
    console.error('Announcement delete error:', error);
    return NextResponse.json({ error: 'Failed to delete announcement' }, { status: 500 });
  }
}
