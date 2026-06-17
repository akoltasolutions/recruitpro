import { NextRequest, NextResponse } from 'next/server';
import * as crypto from 'crypto';
import { db } from '@/lib/db';
import { checkRateLimit } from '@/lib/rate-limiter';
import { getClientIp } from '@/lib/security-audit';

/**
 * Send password reset email via Resend.
 * Falls back gracefully if Resend is not configured.
 */
async function sendResetEmail(to: string, name: string, code: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[ForgotPassword] RESEND_API_KEY not set — email not sent');
    return false;
  }

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);
    const fromAddress = process.env.EMAIL_FROM || 'RecruitPro <noreply@app.akolta.com>';

    const { data, error: resendError } = await resend.emails.send({
      from: fromAddress,
      to,
      subject: 'RecruitPro — Password Reset Code',
      html: `
        <div style="max-width:480px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f9fafb;border-radius:12px;overflow:hidden">
          <div style="background:#059669;padding:24px 32px;text-align:center">
            <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700">RecruitPro</h1>
            <p style="color:#d1fae5;margin:4px 0 0;font-size:13px">Password Reset</p>
          </div>
          <div style="padding:32px;background:#fff">
            <p style="margin:0 0 8px;font-size:15px;color:#111827">Hello ${name},</p>
            <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.5">
              We received a request to reset your password. Use the verification code below to set a new password. This code expires in <strong>15 minutes</strong>.
            </p>
            <div style="background:#f0fdf4;border:2px dashed #059669;border-radius:8px;padding:20px;text-align:center;margin:0 0 24px">
              <span style="font-size:32px;font-weight:700;letter-spacing:6px;color:#059669;font-family:monospace">${code}</span>
            </div>
            <p style="margin:0 0 8px;font-size:13px;color:#9ca3af">
              If you did not request a password reset, please ignore this email. Your password will remain unchanged.
            </p>
            <p style="margin:0;font-size:12px;color:#d1d5db">
              — The RecruitPro Team
            </p>
          </div>
          <div style="background:#f9fafb;padding:16px 32px;text-align:center;border-top:1px solid #e5e7eb">
            <p style="margin:0;font-size:11px;color:#9ca3af">
              &copy; ${new Date().getFullYear()} RecruitPro. All rights reserved.
            </p>
          </div>
        </div>
      `,
    });

    if (resendError) {
      console.error('[ForgotPassword] Resend returned error:', JSON.stringify(resendError));
      return false;
    }

    return true;
  } catch (error) {
    console.error('[ForgotPassword] Exception sending email via Resend:', error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    // ── Rate limiting — max 3 reset requests per 15 minutes per IP ──
    const clientIp = getClientIp(request);
    const rateLimit = checkRateLimit(`reset:${clientIp}`, { maxRequests: 3, windowMs: 15 * 60 * 1000 });
    if (!rateLimit.success) {
      return NextResponse.json(
        { message: 'Too many password reset attempts. Please try again later.', code: 'RATE_LIMITED' },
        { status: 429 }
      );
    }

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
          message: 'If an account exists, a reset code has been sent to your email.',
        });
      }

      // Check if account is active
      if (!user.isActive) {
        // Don't leak user existence — return same success message
        return NextResponse.json({
          message: 'If an account exists, a reset code has been sent to your email.',
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

      // Send email via Resend (non-blocking — don't fail the request if email fails)
      const emailSent = await sendResetEmail(email, user.name || 'User', token);

      const response: Record<string, unknown> = {
        message: emailSent
          ? 'A password reset code has been sent to your email.'
          : 'If an account exists, a reset code has been sent.',
        emailSent,
      };

      // In non-production, include the code for testing
      if (process.env.NODE_ENV !== 'production') {
        response.resetCode = token;
      }

      return NextResponse.json(response);
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

    const response: Record<string, unknown> = {
      message: 'If an account exists, a reset code has been sent.',
    };

    // In non-production, include the code for testing
    if (process.env.NODE_ENV !== 'production') {
      response.otp = otp;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
