import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, requireOrgAdmin } from '@/lib/auth-middleware';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth || !requireOrgAdmin(auth)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Build the where clause — org-scoped for ORG_ADMIN, global for SUPER_ADMIN
    // Only count truly PENDING requests (not REJECTED, APPROVED, or DELETED)
    // Backward compat: also count isActive:false + approvalStatus:'APPROVED' for users
    // that existed before the approvalStatus migration
    const baseFilter: Record<string, unknown> = {
      role: 'RECRUITER',
    };

    if (auth.role !== 'SUPER_ADMIN' && auth.organizationId) {
      (baseFilter as Record<string, string>).organizationId = auth.organizationId;
    }

    // Count PENDING users (new model) + legacy pending (isActive:false, approvalStatus: APPROVED)
    const [pendingCount, legacyPendingCount] = await Promise.all([
      db.user.count({
        where: { ...baseFilter, approvalStatus: 'PENDING' },
      }),
      db.user.count({
        where: { ...baseFilter, isActive: false, approvalStatus: 'APPROVED' },
      }),
    ]);

    return NextResponse.json({ count: pendingCount + legacyPendingCount });
  } catch (error) {
    console.error('Pending approval count error:', error);
    return NextResponse.json({ count: 0 });
  }
}
