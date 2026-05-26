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

    if (user.isActive) {
      return NextResponse.json({ error: 'User is already active' }, { status: 400 });
    }

    const updated = await db.user.update({
      where: { id },
      data: { isActive: true },
    });

    const { password: _, ...safeUser } = updated;
    return NextResponse.json({ user: safeUser, message: `User "${user.name}" has been approved` });
  } catch (error) {
    console.error('Approve user error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
