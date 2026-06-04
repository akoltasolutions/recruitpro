import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { getUserSessions, revokeSession, revokeAllSessions } from '@/lib/session-manager';
import { logSecurityEvent, getClientIp } from '@/lib/security-audit';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sessions = await getUserSessions(auth.userId);
    return NextResponse.json({ sessions });
  } catch (error) {
    console.error('[Sessions] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { sessionId, revokeAll } = body;

    if (revokeAll) {
      // Revoke ALL sessions (force logout from all devices)
      await revokeAllSessions(auth.userId);

      await logSecurityEvent({
        userId: auth.userId,
        organizationId: auth.organizationId || undefined,
        action: 'ALL_SESSIONS_REVOKED',
        ipAddress: getClientIp(request),
      });

      return NextResponse.json({ message: 'All sessions revoked. You have been logged out from all devices.' });
    }

    if (sessionId) {
      // Revoke a specific session
      await db.session.update({
        where: { id: sessionId, userId: auth.userId },
        data: { isActive: false },
      });

      await logSecurityEvent({
        userId: auth.userId,
        organizationId: auth.organizationId || undefined,
        action: 'SESSION_REVOKED',
        resourceId: sessionId,
        ipAddress: getClientIp(request),
      });

      return NextResponse.json({ message: 'Session revoked' });
    }

    return NextResponse.json({ error: 'Specify sessionId or revokeAll' }, { status: 400 });
  } catch (error) {
    console.error('[Sessions] DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
