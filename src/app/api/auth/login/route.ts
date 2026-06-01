import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPassword } from '@/lib/auth';
import { createToken } from '@/lib/auth-middleware';

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

    // User not registered — log specific reason server-side, return generic message to client
    if (!user) {
      console.error('Login attempt for unregistered identifier:', loginId);
      return NextResponse.json(
        { error: 'Invalid email/phone or password', code: 'INVALID_CREDENTIALS' },
        { status: 401 }
      );
    }

    // Account disabled/inactive — log specific reason server-side, return generic message to client
    if (!user.isActive) {
      console.error('Login attempt on inactive account:', loginId);
      return NextResponse.json(
        { error: 'Invalid email/phone or password', code: 'INVALID_CREDENTIALS' },
        { status: 401 }
      );
    }

    // Wrong password — log specific reason server-side, return generic message to client
    const isValid = await verifyPassword(password, user.password);
    if (!isValid) {
      console.error('Login attempt with wrong password for:', loginId);
      return NextResponse.json(
        { error: 'Invalid email/phone or password', code: 'INVALID_CREDENTIALS' },
        { status: 401 }
      );
    }

    const token = createToken(user.id);

    // Log login activity for recruiter tracking — default to IDLE so time
    // does not start counting until the recruiter explicitly picks a status.
    if (user.role === 'RECRUITER') {
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
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again later.', code: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}
