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

    // Delete the user entirely (rejection = account removed)
    await db.user.delete({ where: { id } });

    return NextResponse.json({ message: `Registration for "${user.name}" has been rejected and the account has been removed.` });
  } catch (error) {
    console.error('Reject user error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
