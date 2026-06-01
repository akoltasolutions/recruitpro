import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { createToken } from '@/lib/auth-middleware';
import { randomBytes } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, phone, password, companyName, companySlug, companyEmail } = body;

    // ── Validate required fields ──
    const missing: string[] = [];
    if (!name?.trim()) missing.push('name');
    if (!email?.trim()) missing.push('email');
    if (!password) missing.push('password');
    if (!companyName?.trim()) missing.push('companyName');
    if (!companySlug?.trim()) missing.push('companySlug');
    if (!companyEmail?.trim()) missing.push('companyEmail');

    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(', ')}`, code: 'MISSING_FIELDS' },
        { status: 400 }
      );
    }

    // ── Validate email format ──
    const trimmedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return NextResponse.json(
        { error: 'Please enter a valid email address.', code: 'INVALID_EMAIL' },
        { status: 400 }
      );
    }

    // ── Validate company email format ──
    const trimmedCompanyEmail = companyEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedCompanyEmail)) {
      return NextResponse.json(
        { error: 'Please enter a valid company email address.', code: 'INVALID_COMPANY_EMAIL' },
        { status: 400 }
      );
    }

    // ── Validate password (8+ chars, at least one letter and one number) ──
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password)) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters with at least one letter and one number.', code: 'INVALID_PASSWORD' },
        { status: 400 }
      );
    }

    // ── Validate company slug ──
    const normalizedSlug = companySlug.trim().toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedSlug)) {
      return NextResponse.json(
        { error: 'Company slug must be lowercase, alphanumeric with hyphens only (e.g. my-company).', code: 'INVALID_SLUG' },
        { status: 400 }
      );
    }

    // ── Check slug uniqueness ──
    const existingOrg = await db.organization.findUnique({
      where: { slug: normalizedSlug },
    });
    if (existingOrg) {
      return NextResponse.json(
        { error: 'This company slug is already taken. Please choose a different one.', code: 'SLUG_EXISTS' },
        { status: 409 }
      );
    }

    // ── Check email uniqueness ──
    const existingUser = await db.user.findUnique({
      where: { email: trimmedEmail },
    });
    if (existingUser) {
      return NextResponse.json(
        { error: 'This email is already registered. Please sign in or use a different email.', code: 'EMAIL_EXISTS' },
        { status: 409 }
      );
    }

    // ── Find FREE subscription plan ──
    const freePlan = await db.subscriptionPlan.findFirst({
      where: { type: 'FREE', isActive: true },
    });
    if (!freePlan) {
      return NextResponse.json(
        { error: 'No free plan available. Please contact support.', code: 'NO_FREE_PLAN' },
        { status: 500 }
      );
    }

    // ── Create Organization ──
    const organization = await db.organization.create({
      data: {
        name: companyName.trim(),
        slug: normalizedSlug,
        email: trimmedCompanyEmail,
        phone: phone?.trim() || null,
        subscriptionPlanId: freePlan.id,
        subscriptionStatus: 'ACTIVE',
        maxUsers: freePlan.maxUsers,
        maxNumbers: freePlan.maxNumbers,
        dailyUploadLimit: freePlan.dailyUploadLimit,
        subscriptionStartsAt: new Date(),
      },
    });

    // ── Create a default "Admin" designation for the org ──
    const adminDesignation = await db.customDesignation.create({
      data: {
        name: 'Admin',
        organizationId: organization.id,
      },
    });

    // ── Create User as ORG_ADMIN ──
    const hashedPassword = await hashPassword(password);
    const user = await db.user.create({
      data: {
        name: name.trim(),
        email: trimmedEmail,
        password: hashedPassword,
        phone: phone?.trim() || null,
        role: 'ORG_ADMIN',
        organizationId: organization.id,
        designationId: adminDesignation.id,
        designation: 'Admin',
      },
    });

    // ── Generate token ──
    const token = createToken(user.id);

    // ── Return user data (exclude password) ──
    const { password: _, organization: userOrg, designationRel, ...safeUser } = user;
    // Re-fetch with org data to match login response shape
    const userWithOrg = await db.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        isActive: true,
        avatarUrl: true,
        callModeOn: true,
        whatsappAccess: true,
        uploadPermission: true,
        createListPermission: true,
        organizationId: true,
        designation: true,
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

    return NextResponse.json({
      user: userWithOrg,
      token,
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        isActive: organization.isActive,
        subscriptionStatus: organization.subscriptionStatus,
        maxUsers: organization.maxUsers,
        maxNumbers: organization.maxNumbers,
        dailyUploadLimit: organization.dailyUploadLimit,
      },
    });
  } catch (error) {
    // Handle Prisma unique constraint violation (race condition)
    const prismaError = error as { code?: string };
    if (prismaError.code === 'P2002') {
      return NextResponse.json(
        { error: 'An account with this email or company slug already exists.', code: 'CONFLICT' },
        { status: 409 }
      );
    }
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again later.', code: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}
