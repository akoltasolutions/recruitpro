import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { createToken } from '@/lib/auth-middleware';

// POST /api/invitations/accept — Accept an invitation
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, name, phone, password } = body;

    // ── Validate required fields ──
    if (!token?.trim()) {
      return NextResponse.json(
        { error: 'Invitation token is required.', code: 'MISSING_TOKEN' },
        { status: 400 }
      );
    }

    if (!name?.trim()) {
      return NextResponse.json(
        { error: 'Name is required.', code: 'MISSING_NAME' },
        { status: 400 }
      );
    }

    if (!password) {
      return NextResponse.json(
        { error: 'Password is required.', code: 'MISSING_PASSWORD' },
        { status: 400 }
      );
    }

    // ── Validate password ──
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password)) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters with at least one letter and one number.', code: 'INVALID_PASSWORD' },
        { status: 400 }
      );
    }

    // ── Find invitation by token ──
    const invitation = await db.invitation.findUnique({
      where: { token: token.trim() },
      include: {
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

    if (!invitation) {
      return NextResponse.json(
        { error: 'Invalid invitation token.', code: 'INVALID_TOKEN' },
        { status: 404 }
      );
    }

    // ── Check invitation is still pending ──
    if (invitation.status !== 'PENDING') {
      const statusMessages: Record<string, string> = {
        ACCEPTED: 'This invitation has already been accepted.',
        EXPIRED: 'This invitation has expired.',
        REVOKED: 'This invitation has been revoked.',
      };
      return NextResponse.json(
        { error: statusMessages[invitation.status] || 'This invitation is no longer valid.', code: `INVITATION_${invitation.status}` },
        { status: 410 }
      );
    }

    // ── Check invitation has not expired ──
    if (invitation.expiresAt < new Date()) {
      // Mark as expired
      await db.invitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' },
      });
      return NextResponse.json(
        { error: 'This invitation has expired. Please request a new one.', code: 'INVITATION_EXPIRED' },
        { status: 410 }
      );
    }

    // ── Check email from invitation is not already registered ──
    const existingUser = await db.user.findUnique({
      where: { email: invitation.email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'This email is already registered. Please sign in instead.', code: 'EMAIL_EXISTS' },
        { status: 409 }
      );
    }

    // ── Create User with role and organization from invitation ──
    const hashedPassword = await hashPassword(password);
    const user = await db.user.create({
      data: {
        name: name.trim(),
        email: invitation.email,
        password: hashedPassword,
        phone: phone?.trim() || null,
        role: invitation.role,
        organizationId: invitation.organizationId,
        departmentId: invitation.departmentId || null,
        designation: invitation.designation || null,
      },
    });

    // ── Mark invitation as accepted ──
    await db.invitation.update({
      where: { id: invitation.id },
      data: { status: 'ACCEPTED' },
    });

    // ── Generate auth token ──
    const authToken = createToken(user.id);

    // ── Fetch user with org data ──
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
      token: authToken,
      organization: invitation.organization,
    });
  } catch (error) {
    console.error('Accept invitation error:', error);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again later.', code: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}
