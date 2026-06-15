import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { generateTOTPSecret, getTOTPUri, generateBackupCodes, verifyTOTP } from '@/lib/mfa';

async function safeLogSecurityEvent(options: Record<string, unknown>, request: NextRequest) {
  try {
    const { logSecurityEvent, getClientIp } = await import('@/lib/security-audit');
    await logSecurityEvent({
      ...options,
      ipAddress: getClientIp(request),
    } as any);
  } catch {
    // non-critical — audit logging may fail if schema not synced
  }
}

/**
 * GET: Get MFA setup status (starts setup flow)
 * POST: Enable MFA (verify the code and enable)
 * DELETE: Disable MFA
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { id: auth.userId },
      select: { mfaEnabled: true, mfaVerified: true, email: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      mfaEnabled: user.mfaEnabled,
      mfaVerified: user.mfaVerified,
    });
  } catch (error) {
    console.error('[MFA Setup] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, code } = body;

    const user = await db.user.findUnique({
      where: { id: auth.userId },
      select: { mfaEnabled: true, mfaSecret: true, mfaVerified: true, email: true, role: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (action === 'generate') {
      // Step 1: Generate secret and return QR code URI
      const secret = generateTOTPSecret();
      const uri = getTOTPUri(user.email, secret, 'RecruitPro');

      // Store secret temporarily (not enabled until verified)
      await db.user.update({
        where: { id: auth.userId },
        data: { mfaSecret: secret, mfaVerified: false, mfaEnabled: false },
      });

      return NextResponse.json({ secret, uri, message: 'Scan QR code with your authenticator app' });
    }

    if (action === 'verify') {
      // Step 2: Verify the code and enable MFA
      if (!user.mfaSecret) {
        return NextResponse.json({ error: 'Please generate a secret first' }, { status: 400 });
      }

      if (!code) {
        return NextResponse.json({ error: 'Verification code is required' }, { status: 400 });
      }

      const valid = verifyTOTP(user.mfaSecret, code);
      if (!valid) {
        await safeLogSecurityEvent({
          userId: auth.userId,
          action: 'MFA_FAILED',
          status: 'FAILURE',
        }, request);
        return NextResponse.json({ error: 'Invalid verification code. Please try again.' }, { status: 400 });
      }

      // Generate backup codes
      const backupCodes = generateBackupCodes(10);

      // Enable MFA
      await db.user.update({
        where: { id: auth.userId },
        data: {
          mfaEnabled: true,
          mfaVerified: true,
          mfaBackupCodes: JSON.stringify(backupCodes),
        },
      });

      await safeLogSecurityEvent({
        userId: auth.userId,
        organizationId: auth.organizationId || undefined,
        action: 'MFA_ENABLED',
      }, request);

      return NextResponse.json({
        mfaEnabled: true,
        backupCodes,
        message: 'MFA enabled successfully. Save your backup codes in a secure location.',
      });
    }

    return NextResponse.json({ error: 'Invalid action. Use "generate" or "verify".' }, { status: 400 });
  } catch (error) {
    console.error('[MFA Setup] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Allow all users to disable MFA, but log it for audit trail
    await db.user.update({
      where: { id: auth.userId },
      data: {
        mfaEnabled: false,
        mfaVerified: false,
        mfaSecret: null,
        mfaBackupCodes: null,
      },
    });

    await safeLogSecurityEvent({
      userId: auth.userId,
      organizationId: auth.organizationId || undefined,
      action: 'MFA_DISABLED',
    }, request);

    return NextResponse.json({ message: 'MFA disabled successfully' });
  } catch (error) {
    console.error('[MFA Setup] DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
