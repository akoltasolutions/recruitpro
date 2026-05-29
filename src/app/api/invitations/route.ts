import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, requireOrgAdmin } from '@/lib/auth-middleware';
import { randomBytes } from 'crypto';

// GET /api/invitations — List pending invitations for the current organization
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth || !requireOrgAdmin(auth) || !auth.organizationId) {
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const invitations = await db.invitation.findMany({
      where: {
        organizationId: auth.organizationId,
        status: 'PENDING',
      },
      include: {
        organization: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ invitations });
  } catch (error) {
    console.error('Fetch invitations error:', error);
    return NextResponse.json(
      { error: 'Something went wrong.', code: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}

// POST /api/invitations — Create an invitation for a team member
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth || !requireOrgAdmin(auth) || !auth.organizationId) {
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { email, role, designation, departmentId } = body;

    // ── Validate required fields ──
    if (!email?.trim()) {
      return NextResponse.json(
        { error: 'Email is required.', code: 'MISSING_EMAIL' },
        { status: 400 }
      );
    }

    const trimmedEmail = email.trim().toLowerCase();

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return NextResponse.json(
        { error: 'Please enter a valid email address.', code: 'INVALID_EMAIL' },
        { status: 400 }
      );
    }

    // Validate role
    const validRoles = ['USER', 'ORG_ADMIN'];
    const normalizedRole = role ? role.toUpperCase().trim() : 'USER';
    if (!validRoles.includes(normalizedRole)) {
      return NextResponse.json(
        { error: 'Invalid role. Must be USER or ORG_ADMIN.', code: 'INVALID_ROLE' },
        { status: 400 }
      );
    }

    // ── Check user limit ──
    const org = await db.organization.findUnique({
      where: { id: auth.organizationId },
      select: {
        maxUsers: true,
        users: { select: { id: true } },
        invitations: { where: { status: 'PENDING' }, select: { id: true } },
      },
    });

    if (!org) {
      return NextResponse.json(
        { error: 'Organization not found.', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    const totalActiveUsers = org.users.length + org.invitations.length;
    if (totalActiveUsers >= org.maxUsers) {
      return NextResponse.json(
        { error: `User limit reached (${org.maxUsers}). Please upgrade your plan to invite more members.`, code: 'USER_LIMIT_REACHED' },
        { status: 403 }
      );
    }

    // ── Check email not already a user in same org ──
    const existingUser = await db.user.findFirst({
      where: {
        email: trimmedEmail,
        organizationId: auth.organizationId,
      },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'This email is already registered in your organization.', code: 'EMAIL_IN_ORG' },
        { status: 409 }
      );
    }

    // ── Check for existing pending invitation ──
    const existingInvitation = await db.invitation.findFirst({
      where: {
        email: trimmedEmail,
        organizationId: auth.organizationId,
        status: 'PENDING',
      },
    });

    if (existingInvitation) {
      return NextResponse.json(
        { error: 'An invitation has already been sent to this email. Please revoke it first.', code: 'INVITATION_EXISTS' },
        { status: 409 }
      );
    }

    // ── Generate token and expiry ──
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now

    // ── Create invitation ──
    const invitation = await db.invitation.create({
      data: {
        organizationId: auth.organizationId,
        email: trimmedEmail,
        role: normalizedRole,
        designation: designation?.trim() || null,
        departmentId: departmentId || null,
        token,
        invitedBy: auth.userId,
        expiresAt,
      },
    });

    return NextResponse.json({ invitation }, { status: 201 });
  } catch (error) {
    console.error('Create invitation error:', error);
    return NextResponse.json(
      { error: 'Something went wrong.', code: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}
