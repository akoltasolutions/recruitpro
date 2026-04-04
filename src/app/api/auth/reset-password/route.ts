import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { method, code, email, phone, newPassword } = body;

    // Validate method
    if (method !== 'email' && method !== 'phone') {
      return NextResponse.json(
        { error: 'Method must be either "email" or "phone"' },
        { status: 400 }
      );
    }

    // Validate code
    if (!code || typeof code !== 'string' || !code.trim()) {
      return NextResponse.json(
        { error: 'Reset code is required' },
        { status: 400 }
      );
    }

    // Validate newPassword
    if (!newPassword || typeof newPassword !== 'string') {
      return NextResponse.json(
        { error: 'New password is required' },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters long' },
        { status: 400 }
      );
    }

    if (!/[a-zA-Z]/.test(newPassword)) {
      return NextResponse.json(
        { error: 'Password must contain at least one letter' },
        { status: 400 }
      );
    }

    if (!/[0-9]/.test(newPassword)) {
      return NextResponse.json(
        { error: 'Password must contain at least one number' },
        { status: 400 }
      );
    }

    if (method === 'email') {
      // Validate email is provided
      if (!email || typeof email !== 'string' || !email.trim()) {
        return NextResponse.json(
          { error: 'Email is required for email reset method' },
          { status: 400 }
        );
      }

      const normalizedEmail = email.trim().toLowerCase();

      // Find user by email (case-insensitive)
      const user = await db.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (!user) {
        return NextResponse.json(
          { error: 'No account found' },
          { status: 404 }
        );
      }

      // Verify reset token matches and has not expired
      if (!user.resetToken || !user.resetTokenExpires) {
        return NextResponse.json(
          { error: 'No reset code found. Please request a new one.' },
          { status: 400 }
        );
      }

      if (user.resetTokenExpires.getTime() < Date.now()) {
        return NextResponse.json(
          { error: 'Reset code has expired. Please request a new one.' },
          { status: 400 }
        );
      }

      if (user.resetToken !== code.trim()) {
        return NextResponse.json(
          { error: 'Invalid reset code' },
          { status: 400 }
        );
      }

      // Hash new password and update user
      const hashedPassword = await hashPassword(newPassword);

      await db.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          resetToken: null,
          resetTokenExpires: null,
          otpCode: null,
          otpExpires: null,
        },
      });

      return NextResponse.json({
        message: 'Password reset successfully. You can now log in with your new password.',
      });
    }

    // method === 'phone'
    if (!phone || typeof phone !== 'string' || !phone.trim()) {
      return NextResponse.json(
        { error: 'Phone number is required for phone reset method' },
        { status: 400 }
      );
    }

    // Normalize phone: strip non-digits, remove leading 0
    const normalizedPhone = phone.replace(/\D/g, '').replace(/^0/, '');

    if (!normalizedPhone) {
      return NextResponse.json(
        { error: 'Invalid phone number' },
        { status: 400 }
      );
    }

    // Try to find user by phone — try with and without leading 0
    const phoneVariants = [
      normalizedPhone,
      `0${normalizedPhone}`,
    ];

    const user = await db.user.findFirst({
      where: { phone: { in: phoneVariants } },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'No account found' },
        { status: 404 }
      );
    }

    // Verify OTP matches and has not expired
    if (!user.otpCode || !user.otpExpires) {
      return NextResponse.json(
        { error: 'No OTP code found. Please request a new one.' },
        { status: 400 }
      );
    }

    if (user.otpExpires.getTime() < Date.now()) {
      return NextResponse.json(
        { error: 'OTP has expired. Please request a new one.' },
        { status: 400 }
      );
    }

    if (user.otpCode !== code.trim()) {
      return NextResponse.json(
        { error: 'Invalid OTP code' },
        { status: 400 }
      );
    }

    // Hash new password and update user
    const hashedPassword = await hashPassword(newPassword);

    await db.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpires: null,
        otpCode: null,
        otpExpires: null,
      },
    });

    return NextResponse.json({
      message: 'Password reset successfully. You can now log in with your new password.',
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
