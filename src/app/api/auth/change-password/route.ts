import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);

    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { currentPassword, newPassword } = await request.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'Current password and new password are required' },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: 'New password must be at least 8 characters long' },
        { status: 400 }
      );
    }

    const hasLetter = /[a-zA-Z]/.test(newPassword);
    const hasNumber = /[0-9]/.test(newPassword);

    if (!hasLetter || !hasNumber) {
      return NextResponse.json(
        { error: 'New password must contain at least one letter and one number' },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({
      where: { id: auth.userId },
      select: { id: true, password: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const isCurrentPasswordValid = await verifyPassword(currentPassword, user.password);

    if (!isCurrentPasswordValid) {
      return NextResponse.json(
        { error: 'Current password is incorrect' },
        { status: 400 }
      );
    }

    // ── Password history check — prevent reuse of recent passwords ──
    try {
      const { isPasswordReused } = await import('@/lib/password-history');
      const reused = await isPasswordReused(auth.userId, newPassword);
      if (reused) {
        return NextResponse.json(
          { error: 'This password has been used recently. Please choose a different one.' },
          { status: 400 }
        );
      }
    } catch (err) {
      console.error('[ChangePassword] Password history check failed (non-blocking):', err);
    }

    const hashedPassword = await hashPassword(newPassword);

    // Core password update — only essential fields
    await db.user.update({
      where: { id: auth.userId },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpires: null,
        otpCode: null,
        otpExpires: null,
      },
    });

    // Try to update tokenVersion and passwordChangedAt (may not exist in old schema)
    try {
      await db.user.update({
        where: { id: auth.userId },
        data: {
          tokenVersion: { increment: 1 },
          passwordChangedAt: new Date(),
        },
      });
    } catch (err) {
      console.error('[ChangePassword] Security fields update failed (non-blocking):', err);
    }

    // Try to add to password history (may not exist in old schema)
    try {
      const { addToPasswordHistory } = await import('@/lib/password-history');
      await addToPasswordHistory(auth.userId, newPassword);
    } catch (err) {
      console.error('[ChangePassword] Password history save failed (non-blocking):', err);
    }

    // Try to revoke all sessions (may not exist in old schema)
    try {
      const { revokeAllSessions } = await import('@/lib/session-manager');
      await revokeAllSessions(auth.userId);
    } catch (err) {
      console.error('[ChangePassword] Session revocation failed (non-blocking):', err);
    }

    // Try to log security event (may not exist in old schema)
    try {
      const { logSecurityEvent } = await import('@/lib/security-audit');
      const { getClientIp } = await import('@/lib/security-audit');
      await logSecurityEvent({
        userId: auth.userId,
        organizationId: auth.organizationId || undefined,
        action: 'PASSWORD_CHANGE',
        ipAddress: getClientIp(request),
      });
    } catch (err) {
      console.error('[ChangePassword] Audit logging failed (non-blocking):', err);
    }

    return NextResponse.json(
      { message: 'Password changed successfully. Please login again.', relogin: true },
      { status: 200 }
    );
  } catch (error) {
    console.error('Change password error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
