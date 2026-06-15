import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { Prisma } from '@prisma/client';

export async function POST(request: NextRequest) {
  try {
    const { name, email, phone, password } = await request.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: 'Name, email, and password are required' }, { status: 400 });
    }

    // Normalize email
    const normalizedEmail = email.trim().toLowerCase();

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    // Validate password strength
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
    if (!passwordRegex.test(password)) {
      return NextResponse.json({ error: 'Password must be at least 8 characters with at least 1 letter and 1 number' }, { status: 400 });
    }

    const existingUser = await db.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
    }

    // Validate phone format if provided (10-12 digits after stripping non-digits)
    if (phone) {
      const digitsOnly = phone.replace(/\D/g, '');
      if (digitsOnly.length < 10 || digitsOnly.length > 12) {
        return NextResponse.json({ error: 'Phone number must be 10-12 digits' }, { status: 400 });
      }
    }

    const hashedPassword = await hashPassword(password);

    // Create recruiter with isActive: false → requires admin approval
    // Wrap in try/catch for Prisma-specific errors (schema mismatch, constraints, etc.)
    let user;
    try {
      user = await db.user.create({
        data: {
          name,
          email: normalizedEmail,
          phone: phone || null,
          password: hashedPassword,
          role: 'RECRUITER',
          isActive: false, // Pending admin approval
          approvalStatus: 'PENDING',
        },
      });
    } catch (createError) {
      // Handle Prisma-specific errors
      if (createError instanceof Prisma.PrismaClientKnownRequestError) {
        const prismaError = createError as Prisma.PrismaClientKnownRequestError;

        // P2002: Unique constraint violation
        if (prismaError.code === 'P2002') {
          const target = Array.isArray(prismaError.meta?.target) ? prismaError.meta.target.join(', ') : 'field';
          console.error('[Signup] Unique constraint violation on:', target);
          return NextResponse.json(
            { error: 'An account with this email or phone number already exists.' },
            { status: 409 }
          );
        }

        // P2021: Column does not exist (schema out of sync)
        if (prismaError.code === 'P2021') {
          const column = String(prismaError.meta?.column_name || 'unknown');
          console.error(`[Signup] Column does not exist: ${column} — schema out of sync!`);
          // Attempt fallback create without the missing column
          try {
            user = await db.user.create({
              data: {
                name,
                email: normalizedEmail,
                phone: phone || null,
                password: hashedPassword,
                role: 'RECRUITER',
                isActive: false,
              },
            });
            console.error('[Signup] Fallback create succeeded (without approvalStatus column).');
          } catch (fallbackError) {
            console.error('[Signup] Fallback create also failed:', fallbackError);
            return NextResponse.json(
              { error: 'Registration is temporarily unavailable. Please try again later or contact support.', code: 'SCHEMA_MISMATCH' },
              { status: 503 }
            );
          }
        }
      }

      // P2025: Record not found (shouldn't happen on create, but handle it)
        if (prismaError.code === 'P2025') {
          console.error('[Signup] Record not found error:', prismaError.message);
          return NextResponse.json(
            { error: 'Registration failed due to a data error. Please contact support.', code: 'RECORD_ERROR' },
            { status: 400 }
          );
        }

        // Log unhandled Prisma errors with code for diagnostics
        console.error(`[Signup] Unhandled Prisma error (${prismaError.code}):`, prismaError.message, prismaError.meta);
      }

      // Log non-Prisma create errors
      console.error('[Signup] User create error:', createError instanceof Error ? createError.message : String(createError));

      // Re-throw if not handled above
      if (!user) throw createError;
    }

    // Don't return a token — user cannot log in until approved
    const { password: _, ...safeUser } = user;
    return NextResponse.json(
      {
        user: safeUser,
        message: 'Your account has been created and is pending admin approval. You will be able to log in once an admin approves your account.',
        pendingApproval: true,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[Signup] Error:', error);
    // Return a user-friendly message; log details server-side only
    return NextResponse.json(
      { error: 'Registration failed. Please try again later.' },
      { status: 500 }
    );
  }
}
