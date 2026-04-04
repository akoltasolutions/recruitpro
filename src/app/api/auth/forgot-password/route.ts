import { NextRequest, NextResponse } from 'next/server';
import * as crypto from 'crypto';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { method, identifier } = body;

    // Validate method
    if (method !== 'email' && method !== 'phone') {
      return NextResponse.json(
        { error: 'Method must be either "email" or "phone"' },
        { status: 400 }
      );
    }

    // Validate identifier
    if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
      return NextResponse.json(
        { error: 'Identifier is required' },
        { status: 400 }
      );
    }

    if (method === 'email') {
      const email = identifier.trim().toLowerCase();

      // Find user by email (case-insensitive)
      const user = await db.user.findUnique({
        where: { email },
      });

      if (!user) {
        // Don't leak user existence — return same success message
        return NextResponse.json({
          message: 'If an account exists, a reset code has been sent.',
        });
      }

      // Check if account is active
      if (!user.isActive) {
        // Don't leak user existence — return same success message
        return NextResponse.json({
          message: 'If an account exists, a reset code has been sent.',
        });
      }

      // Generate 6-digit alphanumeric reset token
      const token = crypto.randomBytes(3).toString('hex');
      const resetTokenExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      await db.user.update({
        where: { id: user.id },
        data: {
          resetToken: token,
          resetTokenExpires,
        },
      });

      return NextResponse.json({
        message: 'If an account exists, a reset code has been sent.',
        resetCode: token,
      });
    }

    // method === 'phone'
    // Normalize phone: strip non-digits, remove leading 0
    const normalizedPhone = identifier.replace(/\D/g, '').replace(/^0/, '');

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
      // Don't leak user existence — return same success message
      return NextResponse.json({
        message: 'If an account exists, a reset code has been sent.',
      });
    }

    // Check if account is active
    if (!user.isActive) {
      // Don't leak user existence — return same success message
      return NextResponse.json({
        message: 'If an account exists, a reset code has been sent.',
      });
    }

    // Generate 6-digit numeric OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await db.user.update({
      where: { id: user.id },
      data: {
        otpCode: otp,
        otpExpires,
      },
    });

    return NextResponse.json({
      message: 'If an account exists, a reset code has been sent.',
      otp,
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
