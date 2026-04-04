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

    const hashedPassword = await hashPassword(newPassword);

    await db.user.update({
      where: { id: auth.userId },
      data: {
        password: hashedPassword,
        resetToken: null,
        otpCode: null,
      },
    });

    return NextResponse.json({ message: 'Password changed successfully' }, { status: 200 });
  } catch (error) {
    console.error('Change password error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
