import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, requireSuperAdmin } from '@/lib/auth-middleware';

// GET /api/super-admin/organizations — List all organizations with plan data
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth || !requireSuperAdmin(auth)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizations = await db.organization.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        plan: {
          select: {
            id: true,
            name: true,
            type: true,
            monthlyPrice: true,
            yearlyPrice: true,
            maxUsers: true,
          },
        },
        _count: {
          select: { users: true },
        },
      },
    });

    // Transform the response to include computed fields
    const result = organizations.map((org) => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
      email: org.email,
      phone: org.phone,
      address: org.address,
      logo: org.logo,
      isActive: org.isActive,
      maxUsers: org.maxUsers,
      maxNumbers: org.maxNumbers,
      dailyUploadLimit: org.dailyUploadLimit,
      subscriptionPlanId: org.subscriptionPlanId,
      subscriptionStatus: org.subscriptionStatus,
      trialEndsAt: org.trialEndsAt,
      subscriptionStartsAt: org.subscriptionStartsAt,
      subscriptionEndsAt: org.subscriptionEndsAt,
      customMonthlyPrice: org.customMonthlyPrice,
      customYearlyPrice: org.customYearlyPrice,
      customNotes: org.customNotes,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
      plan: org.plan,
      usersCount: org._count.users,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('[GET /api/super-admin/organizations]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
