import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { authenticateRequest, requireOrgAdmin, requireSuperAdmin } from '@/lib/auth-middleware';
import { getClientIp, getUserAgent } from '@/lib/security-audit';

// ── Config ──────────────────────────────────────────────────────────────
const TEMP_PASSWORD_LENGTH = 16;
const TEMP_PASSWORD_EXPIRY_HOURS = 24;

// ── Secure random password generator ────────────────────────────────────
function generateSecureTempPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%&*';
  const all = upper + lower + digits + special;

  // Guarantee at least 1 of each category
  const chars: string[] = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
  ];

  // Fill remaining
  for (let i = chars.length; i < TEMP_PASSWORD_LENGTH; i++) {
    chars.push(all[Math.floor(Math.random() * all.length)]);
  }

  // Fisher-Yates shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: targetUserId } = await params;
    const auth = await authenticateRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Permission check ──
    if (!requireOrgAdmin(auth)) {
      return NextResponse.json({ error: 'Only administrators can generate temporary passwords' }, { status: 403 });
    }

    // Corporate Admin can only generate for users in their organization
    if (!requireSuperAdmin(auth) && auth.organizationId) {
      const targetUser = await db.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, organizationId: true, isActive: true },
      });
      if (!targetUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
      if (targetUser.organizationId !== auth.organizationId) {
        return NextResponse.json({ error: 'You can only manage users in your own organization' }, { status: 403 });
      }
    }

    // ── Check target user exists ──
    const targetUser = await db.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, name: true, email: true, phone: true, organizationId: true, isActive: true, role: true },
    });
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // ── Prevent generating for self ──
    if (targetUserId === auth.userId) {
      return NextResponse.json({ error: 'You cannot generate a temporary password for yourself' }, { status: 400 });
    }

    // ── Prevent generating for other SUPER_ADMINs (only SUPER_ADMIN can target SUPER_ADMINs) ──
    if (targetUser.role === 'SUPER_ADMIN' && !requireSuperAdmin(auth)) {
      return NextResponse.json({ error: 'Cannot generate temporary password for this user' }, { status: 403 });
    }

    // ── Invalidate any existing unused temporary passwords ──
    await db.temporaryPassword.updateMany({
      where: {
        userId: targetUserId,
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
      data: {
        invalidatedAt: new Date(),
      },
    });

    // ── Generate the temporary password ──
    const plainPassword = generateSecureTempPassword();
    const passwordHash = await hashPassword(plainPassword);
    const expiresAt = new Date(Date.now() + TEMP_PASSWORD_EXPIRY_HOURS * 60 * 60 * 1000);
    const ipAddress = getClientIp(request);
    const userAgent = getUserAgent(request);

    // ── Store in database ──
    const tempPassword = await db.temporaryPassword.create({
      data: {
        userId: targetUserId,
        passwordHash,
        expiresAt,
      },
    });

    // ── Create audit log ──
    await db.tempPasswordAuditLog.create({
      data: {
        tempPasswordId: tempPassword.id,
        adminId: auth.userId,
        userId: targetUserId,
        organizationId: targetUser.organizationId || auth.organizationId,
        action: 'GENERATED',
        ipAddress,
        userAgent,
        expiresAt,
      },
    });

    // ── Return the plain password ONCE ──
    return NextResponse.json({
      message: 'Temporary password generated successfully',
      temporaryPassword: plainPassword,
      expiresAt: expiresAt.toISOString(),
      expiresHours: TEMP_PASSWORD_EXPIRY_HOURS,
      userId: targetUser.id,
      userName: targetUser.name,
      userEmail: targetUser.email,
      userPhone: targetUser.phone,
    });
  } catch (error) {
    console.error('[TempPassword] Generation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}