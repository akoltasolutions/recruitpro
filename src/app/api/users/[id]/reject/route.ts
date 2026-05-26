import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, requireAdmin } from '@/lib/auth-middleware';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await authenticateRequest(request);
    if (!auth || !requireAdmin(auth.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await db.user.findUnique({ where: { id } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Deactivate the user instead of deleting (preserves audit trail)
    await db.user.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ message: `Registration for "${user.name}" has been rejected and the account has been deactivated.` });
  } catch (error) {
    console.error('Reject user error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
