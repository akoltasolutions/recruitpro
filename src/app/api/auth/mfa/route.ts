import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyTOTP } from '@/lib/mfa';
import { createToken } from '@/lib/auth-middleware';
import { checkRateLimit } from '@/lib/rate-limiter';

// Temporary MFA tokens expire after 5 minutes
const MFA_TOKEN_EXPIRY_MS = 5 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    // Rate limiting: 5 attempts per 15 minutes per IP
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rateLimitResult = checkRateLimit(`mfa-verify:${ip}`, { maxRequests: 5, windowMs: 15 * 60 * 1000 });
    if (!rateLimitResult.success) {
      return NextResponse.json({ error: 'Too many attempts. Please try again later.', code: 'RATE_LIMITED' }, { status: 429 });
    }

    const { mfaToken, code } = await request.json();

    if (!mfaToken || !code) {
      return NextResponse.json({ error: 'MFA token and code are required' }, { status: 400 });
    }

    // Decode and validate the temporary MFA token
    let mfaData: { userId: string; mfaRequired: boolean; timestamp: number };
    try {
      const decoded = Buffer.from(mfaToken, 'base64').toString('utf-8');
      mfaData = JSON.parse(decoded);
    } catch {
      return NextResponse.json({ error: 'Invalid MFA token' }, { status: 400 });
    }

    // Check MFA token expiry
    if (Date.now() - mfaData.timestamp > MFA_TOKEN_EXPIRY_MS) {
      return NextResponse.json(
        { error: 'MFA token expired. Please login again.', code: 'MFA_EXPIRED' },
        { status: 401 }
      );
    }

    // Get user with MFA secret
    const user = await db.user.findUnique({
      where: { id: mfaData.userId },
      select: {
        id: true,
        mfaSecret: true,
        mfaBackupCodes: true,
        mfaEnabled: true,
        isActive: true,
        organizationId: true,
      },
    });

    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      return NextResponse.json({ error: 'MFA not configured for this account' }, { status: 400 });
    }

    // Get client IP for logging
    let clientIp = 'unknown';
    try {
      const { getClientIp } = await import('@/lib/security-audit');
      clientIp = getClientIp(request);
    } catch { /* non-critical */ }

    // Check backup codes first (6-digit code that matches a backup code)
    let usedBackupCode = false;
    if (user.mfaBackupCodes) {
      const backupCodes: string[] = JSON.parse(user.mfaBackupCodes);
      const codeIndex = backupCodes.indexOf(code);
      if (codeIndex !== -1) {
        usedBackupCode = true;
        // Remove the used backup code
        backupCodes.splice(codeIndex, 1);
        await db.user.update({
          where: { id: user.id },
          data: { mfaBackupCodes: JSON.stringify(backupCodes) },
        });
      }
    }

    // If not a backup code, verify TOTP
    if (!usedBackupCode) {
      const valid = verifyTOTP(user.mfaSecret, code);
      if (!valid) {
        try {
          const { logSecurityEvent } = await import('@/lib/security-audit');
          await logSecurityEvent({
            userId: user.id,
            organizationId: user.organizationId || undefined,
            action: 'MFA_FAILED',
            ipAddress: clientIp,
            userAgent: request.headers.get('user-agent') || undefined,
            status: 'FAILURE',
          });
        } catch { /* non-critical */ }
        return NextResponse.json({ error: 'Invalid verification code', code: 'MFA_INVALID' }, { status: 401 });
      }
    }

    // MFA verified — issue the real token
    const token = createToken(user.id);

    // Try to create session (non-blocking if table doesn't exist)
    try {
      const { createSession } = await import('@/lib/session-manager');
      await createSession({
        userId: user.id,
        token,
        ipAddress: clientIp,
        userAgent: request.headers.get('user-agent') || undefined,
      });
    } catch (err) {
      console.error('[MFA] Session creation failed (non-blocking):', err);
    }

    // Try to update last login (non-blocking if fields don't exist)
    try {
      await db.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date(), lastLoginIp: clientIp },
      });
    } catch (err) {
      console.error('[MFA] Last login update failed (non-blocking):', err);
    }

    // Try to audit log (non-blocking)
    try {
      const { logSecurityEvent } = await import('@/lib/security-audit');
      await logSecurityEvent({
        userId: user.id,
        organizationId: user.organizationId || undefined,
        action: 'MFA_VERIFIED',
        details: { method: usedBackupCode ? 'backup_code' : 'totp' },
        ipAddress: clientIp,
        userAgent: request.headers.get('user-agent') || undefined,
      });
    } catch { /* non-critical */ }

    // Get full user data for response
    const fullUser = await db.user.findUnique({
      where: { id: user.id },
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
        organizationId: true,
        designation: true,
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            isActive: true,
            subscriptionStatus: true,
            maxUsers: true,
            maxNumbers: true,
            dailyUploadLimit: true,
          },
        },
      },
    });

    const { password: _, ...safeUser } = fullUser!;
    return NextResponse.json({ user: safeUser, token });
  } catch (error) {
    console.error('[MFA] Verification error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
