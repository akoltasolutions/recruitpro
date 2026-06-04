import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

async function safeLogSecurityEvent(options: Record<string, unknown>, request: NextRequest) {
  try {
    const { logSecurityEvent, getClientIp } = await import('@/lib/security-audit');
    await logSecurityEvent({
      ...options,
      ipAddress: getClientIp(request),
    } as any);
  } catch {
    // non-critical
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Try to get sessions (table may not exist yet)
    try {
      const { getUserSessions } = await import('@/lib/session-manager');
      const sessions = await getUserSessions(auth.userId);
      return NextResponse.json({ sessions });
    } catch (err) {
      console.error('[Sessions] Session table not available:', err);
      return NextResponse.json({ sessions: [], message: 'Session management not available' });
    }
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
      try {
        const { revokeAllSessions } = await import('@/lib/session-manager');
        await revokeAllSessions(auth.userId);
      } catch (err) {
        console.error('[Sessions] revokeAll failed (non-blocking):', err);
      }

      await safeLogSecurityEvent({
        userId: auth.userId,
        organizationId: auth.organizationId || undefined,
        action: 'ALL_SESSIONS_REVOKED',
      }, request);

      return NextResponse.json({ message: 'All sessions revoked. You have been logged out from all devices.' });
    }

    if (sessionId) {
      try {
        await db.session.update({
          where: { id: sessionId, userId: auth.userId },
          data: { isActive: false },
        });
      } catch (err) {
        console.error('[Sessions] Revoke specific session failed (non-blocking):', err);
      }

      await safeLogSecurityEvent({
        userId: auth.userId,
        organizationId: auth.organizationId || undefined,
        action: 'SESSION_REVOKED',
        resourceId: sessionId,
      }, request);

      return NextResponse.json({ message: 'Session revoked' });
    }

    return NextResponse.json({ error: 'Specify sessionId or revokeAll' }, { status: 400 });
  } catch (error) {
    console.error('[Sessions] DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
