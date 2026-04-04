import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPassword } from '@/lib/auth';
import { createToken } from '@/lib/auth-middleware';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    // Empty fields
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Please fill in all required fields.', code: 'EMPTY_FIELDS' },
        { status: 400 }
      );
    }

    // Trim whitespace from email
    const trimmedEmail = email.trim().toLowerCase();

    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return NextResponse.json(
        { error: 'Please enter a valid email address.', code: 'INVALID_EMAIL' },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({ where: { email: trimmedEmail } });

    // User not registered
    if (!user) {
      return NextResponse.json(
        { error: 'User is not registered. Please sign up or contact admin.', code: 'USER_NOT_FOUND' },
        { status: 404 }
      );
    }

    // Account disabled/inactive
    if (!user.isActive) {
      return NextResponse.json(
        { error: 'Your account is inactive. Please contact the administrator.', code: 'ACCOUNT_INACTIVE' },
        { status: 403 }
      );
    }

    // Wrong password
    const isValid = await verifyPassword(password, user.password);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Incorrect password. Please try again.', code: 'WRONG_PASSWORD' },
        { status: 401 }
      );
    }

    const token = createToken(user.id);

    // Log login activity for recruiter tracking
    if (user.role === 'RECRUITER') {
      try {
        await db.activityLog.create({
          data: {
            userId: user.id,
            action: 'LOGIN',
            status: 'ACTIVE',
            userAgent: request.headers.get('user-agent') || null,
          },
        });
      } catch (logErr) {
        console.error('Failed to log login activity:', logErr);
      }
    }

    const { password: _, ...safeUser } = user;
    return NextResponse.json({ user: safeUser, token });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again later.', code: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}
