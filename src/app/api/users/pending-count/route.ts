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
    const where: Record<string, unknown> = {
      role: 'RECRUITER',
      isActive: false,
    };

    if (auth.role !== 'SUPER_ADMIN' && auth.organizationId) {
      (where as Record<string, string>).organizationId = auth.organizationId;
    }

    const count = await db.user.count({ where });

    return NextResponse.json({ count });
  } catch (error) {
    console.error('Pending approval count error:', error);
    return NextResponse.json({ count: 0 });
  }
}
