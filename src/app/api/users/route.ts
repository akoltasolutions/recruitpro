import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { authenticateRequest, requireAdmin } from '@/lib/auth-middleware';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth || !requireAdmin(auth.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const users = await db.user.findMany({
      where: { role: 'RECRUITER' },
      select: {
        id: true, email: true, name: true, phone: true, role: true,
        isActive: true, avatarUrl: true, callModeOn: true,
        whatsappAccess: true, uploadPermission: true, createListPermission: true, createdAt: true, updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ users });
  } catch (error) {
    console.error('Users list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth || !requireAdmin(auth.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, email, phone, password, callModeOn, whatsappAccess, uploadPermission, createListPermission } = await request.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: 'Name, email, and password are required' }, { status: 400 });
    }

    // Normalize email
    const normalizedEmail = email.trim().toLowerCase();

    if (typeof password !== 'string') {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 });
    }

    // Validate password strength
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
    if (!passwordRegex.test(password)) {
      return NextResponse.json({ error: 'Password must be at least 8 characters with at least 1 letter and 1 number' }, { status: 400 });
    }

    const existing = await db.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 409 });
    }

    const hashedPassword = await hashPassword(password);
    const user = await db.user.create({
      data: {
        name, email: normalizedEmail, phone: phone || null, password: hashedPassword,
        role: 'RECRUITER',
        callModeOn: callModeOn ?? true,
        whatsappAccess: whatsappAccess ?? true,
        uploadPermission: uploadPermission ?? false,
        createListPermission: createListPermission ?? false,
      },
    });

    const { password: _, ...safeUser } = user;
    return NextResponse.json({ user: safeUser }, { status: 201 });
  } catch (error) {
    console.error('Create user error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
