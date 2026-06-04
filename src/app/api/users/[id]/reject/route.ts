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
      return NextResponse.json({ error: 'User has been permanently deleted' }, { status: 400 });
    }

    if (user.approvalStatus === 'REJECTED') {
      return NextResponse.json({ error: 'User is already rejected' }, { status: 400 });
    }

    // Mark as rejected with explicit approvalStatus
    await db.user.update({
      where: { id },
      data: {
        isActive: false,
        approvalStatus: 'REJECTED',
      },
    });

    return NextResponse.json({ message: `Registration for "${user.name}" has been rejected.` });
  } catch (error) {
    console.error('Reject user error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
