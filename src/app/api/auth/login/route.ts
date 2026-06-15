import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPassword } from '@/lib/auth';
import { createToken } from '@/lib/auth-middleware';

// ── In-memory rate limiter (per IP) ─────────────────────────────────────
const loginAttempts = new Map<string, { count: number; firstAttempt: number; lockedUntil: number }>()
const MAX_ATTEMPTS = 10
const LOCKOUT_MS = 5 * 60 * 1000 // 5 minutes
const WINDOW_MS = 15 * 60 * 1000 // 15 minute window

function getClientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

function checkRateLimit(ip: string): { allowed: boolean; remaining: number; lockedUntil?: number } {
  const now = Date.now()
  let entry = loginAttempts.get(ip)

  if (!entry) {
    entry = { count: 0, firstAttempt: now, lockedUntil: 0 }
    loginAttempts.set(ip, entry)
  }

  // If locked, check if lockout has expired
  if (entry.lockedUntil > now) {
    return { allowed: false, remaining: 0, lockedUntil: entry.lockedUntil }
  }

  // Reset window if expired
  if (now - entry.firstAttempt > WINDOW_MS) {
    entry.count = 0
    entry.firstAttempt = now
    entry.lockedUntil = 0
  }

  entry.count += 1

  // Lock if exceeded
  if (entry.count > MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOCKOUT_MS
    return { allowed: false, remaining: 0, lockedUntil: entry.lockedUntil }
  }

  return { allowed: true, remaining: MAX_ATTEMPTS - entry.count }
}

// Cleanup stale entries every 10 minutes
if (typeof globalThis !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [ip, entry] of loginAttempts) {
      if (entry.lockedUntil <= now && now - entry.firstAttempt > WINDOW_MS) {
        loginAttempts.delete(ip)
      }
    }
  }, 10 * 60 * 1000)
}

export async function POST(request: NextRequest) {
  try {
    const { identifier, email: legacyEmail, password } = await request.json();

    // Support both new `identifier` field and legacy `email` field
    const loginId = (identifier || legacyEmail || '').trim().toLowerCase();

    // Empty fields
    if (!loginId || !password) {
      return NextResponse.json(
        { error: 'Please fill in all required fields.', code: 'EMPTY_FIELDS' },
        { status: 400 }
      );
    }

    // Detect if input is email or phone number
    const isEmail = loginId.includes('@');
    const isPhone = /^\d{10,15}$/.test(loginId.replace(/[\s\-+()]/g, ''));

    if (!isEmail && !isPhone) {
      return NextResponse.json(
        { error: 'Please enter a valid email address or phone number.', code: 'INVALID_IDENTIFIER' },
        { status: 400 }
      );
    }

    // ── Rate limiting check ──
    const clientIp = getClientIp(request)
    const rateResult = checkRateLimit(clientIp)
    if (!rateResult.allowed) {
      const lockMinutes = Math.ceil((rateResult.lockedUntil! - Date.now()) / 60000)
      return NextResponse.json(
        { error: `Too many failed login attempts. Your IP is temporarily locked for ${lockMinutes} minutes. Please try again later.`, code: 'RATE_LIMITED', lockedUntil: rateResult.lockedUntil },
        { status: 429 }
      )
    }

    // Search user by email or phone
    let user;
    if (isEmail) {
      user = await db.user.findUnique({
        where: { email: loginId },
        include: {
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
    } else {
      const cleanPhone = loginId.replace(/[\s\-+()]/g, '');
      user = await db.user.findFirst({
        where: { phone: cleanPhone },
        include: {
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
    }

    // User not registered — distinct error code for UI
    if (!user) {
      console.error('[Auth] Login attempt for unregistered identifier:', loginId, 'IP:', clientIp);
      return NextResponse.json(
        { error: 'You are not a registered user. Please sign up to create your account or log in using your registered email address or phone number.', code: 'USER_NOT_FOUND', remainingAttempts: rateResult.remaining },
        { status: 401 }
      );
    }

    // Account disabled/inactive
    if (!user.isActive) {
      console.error('[Auth] Login attempt on inactive account:', loginId, 'IP:', clientIp);
      return NextResponse.json(
        { error: 'Your account is inactive. Please contact your administrator.', code: 'ACCOUNT_INACTIVE', remainingAttempts: rateResult.remaining },
        { status: 401 }
      );
    }

    // Wrong password — distinct error code for UI
    const isValid = await verifyPassword(password, user.password);
    if (!isValid) {
      console.error('[Auth] Wrong password attempt for:', loginId, 'IP:', clientIp);
      return NextResponse.json(
        { error: 'Incorrect password. Please try again.', code: 'WRONG_PASSWORD', remainingAttempts: rateResult.remaining },
        { status: 401 }
      );
    }

    // Check organization status before issuing token
    if (user.organizationId) {
      const org = await db.organization.findUnique({ where: { id: user.organizationId } });
      if (!org || !org.isActive) {
        return NextResponse.json(
          { error: 'Your organization is suspended. Contact your administrator.', code: 'ORG_SUSPENDED' },
          { status: 403 }
        );
      }
    }

    // Successful login — reset rate limit for this IP
    loginAttempts.delete(clientIp)

    const token = createToken(user.id);

    // Log login activity for recruiter tracking
    if (user.role !== 'SUPER_ADMIN') {
      try {
        await db.activityLog.create({
          data: {
            userId: user.id,
            action: 'IDLE',
            status: 'IDLE',
            userAgent: request.headers.get('user-agent') || null,
          },
        });
      } catch (logErr) {
        console.error('Failed to log login activity:', logErr);
      }
    }

    const { password: _, organization, ...safeUser } = user;
    if (safeUser.role === 'ADMIN') safeUser.role = 'ORG_ADMIN';
    return NextResponse.json({ user: safeUser, token, organization: organization || null });
  } catch (error) {
    console.error('[Auth] Login error:', error);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again later.', code: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}
