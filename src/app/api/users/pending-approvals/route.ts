import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, requireOrgAdmin } from '@/lib/auth-middleware';

/**
 * GET /api/users/pending-approvals
 *
 * Returns recruiter users who need approval review (PENDING or REJECTED).
 * Excludes APPROVED+active users and DELETED users.
 * Includes approvalStatus field for state management.
 *
 * Used by the Approval Requests page — separated from the generic /api/users
 * endpoint to avoid schema coupling issues.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth || !requireOrgAdmin(auth)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const where: Record<string, unknown> = {
      role: 'RECRUITER',
      approvalStatus: { not: 'DELETED' },
    };

    // OR: include legacy pending users (isActive=false, approvalStatus='APPROVED')
    // This handles backward compat for users created before approvalStatus was added
    const orConditions = [
      { approvalStatus: 'PENDING' },
      { approvalStatus: 'REJECTED' },
      { isActive: false, approvalStatus: 'APPROVED' },
    ];

    where.OR = orConditions;

    if (auth.role !== 'SUPER_ADMIN' && auth.organizationId) {
      // Need to scope each OR condition
      where.OR = orConditions.map((cond) => ({
        ...cond,
        organizationId: auth.organizationId,
      }));
    }

    const users = await db.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        approvalStatus: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error('Pending approvals error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
