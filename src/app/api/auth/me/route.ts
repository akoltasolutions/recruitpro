import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth-middleware';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Core user fields that always exist
    const user = await db.user.findUnique({
      where: { id: auth.userId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        isActive: true,
        avatarUrl: true,
        callModeOn: true,
        whatsappAccess: true,
        uploadPermission: true,
        createListPermission: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    // Try to fetch MFA fields separately (may not exist in old schema)
    try {
      const mfaUser = await db.user.findUnique({
        where: { id: auth.userId },
        select: { mfaEnabled: true, mfaVerified: true },
      });
      if (mfaUser) {
        (user as Record<string, unknown>).mfaEnabled = mfaUser.mfaEnabled;
        (user as Record<string, unknown>).mfaVerified = mfaUser.mfaVerified;
      }
    } catch {
      // MFA fields don't exist in schema yet — that's fine
    }

    return NextResponse.json({ user });
  } catch (error) {
    console.error('Me error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
