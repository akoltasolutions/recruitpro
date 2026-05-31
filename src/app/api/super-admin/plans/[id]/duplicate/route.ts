import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, requireSuperAdmin } from '@/lib/auth-middleware';

// POST /api/super-admin/plans/[id]/duplicate — Duplicate a plan
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth || !requireSuperAdmin(auth)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const sourcePlan = await db.subscriptionPlan.findUnique({ where: { id } });
    if (!sourcePlan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    // Get max sortOrder to place the copy after all existing plans
    const maxSort = await db.subscriptionPlan.aggregate({
      _max: { sortOrder: true },
    });
    const nextSort = (maxSort._max.sortOrder ?? 0) + 1;

    const duplicatedPlan = await db.subscriptionPlan.create({
      data: {
        name: `${sourcePlan.name} (Copy)`,
        description: sourcePlan.description,
        type: sourcePlan.type,
        monthlyPrice: sourcePlan.monthlyPrice,
        yearlyPrice: sourcePlan.yearlyPrice,
        maxUsers: sourcePlan.maxUsers,
        maxNumbers: sourcePlan.maxNumbers,
        dailyUploadLimit: sourcePlan.dailyUploadLimit,
        maxProjects: sourcePlan.maxProjects,
        maxDepartments: sourcePlan.maxDepartments,
        isActive: sourcePlan.isActive,
        isDefault: false, // copied plans are never default
        features: sourcePlan.features,
        trialDays: sourcePlan.trialDays,
        monthlyCallLimit: sourcePlan.monthlyCallLimit,
        dailyCallLimit: sourcePlan.dailyCallLimit,
        storageLimit: sourcePlan.storageLimit,
        isUnlimited: sourcePlan.isUnlimited,
        featureAccess: sourcePlan.featureAccess,
        sortOrder: nextSort,
      },
    });

    return NextResponse.json(duplicatedPlan, { status: 201 });
  } catch (error) {
    console.error('[POST /api/super-admin/plans/[id]/duplicate]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
