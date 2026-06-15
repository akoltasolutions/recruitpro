import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, requireOrgAdmin } from '@/lib/auth-middleware';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await authenticateRequest(request);
    if (!auth || !requireOrgAdmin(auth)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await db.user.findUnique({ where: { id } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.approvalStatus === 'DELETED') {
      return NextResponse.json({ error: 'User is already permanently deleted' }, { status: 400 });
    }

    // Mark as permanently deleted — removed from all views
    await db.user.update({
      where: { id },
      data: {
        isActive: false,
        approvalStatus: 'DELETED',
      },
    });

    return NextResponse.json({ message: `"${user.name}" has been permanently deleted.` });
  } catch (error) {
    console.error('Delete user error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
