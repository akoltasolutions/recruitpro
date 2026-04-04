import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth';

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

    const hashedPassword = await hashPassword(password);

    // Create recruiter with isActive: false → requires admin approval
    const user = await db.user.create({
      data: {
        name,
        email: normalizedEmail,
        phone: phone || null,
        password: hashedPassword,
        role: 'RECRUITER',
        isActive: false, // Pending admin approval
      },
    });

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
    console.error('Signup error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
