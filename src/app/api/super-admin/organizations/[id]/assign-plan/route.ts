import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, requireSuperAdmin } from '@/lib/auth-middleware';

// POST /api/super-admin/organizations/[id]/assign-plan — Assign/change plan for an org
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
    const body = await request.json();
    const { planId, customMonthlyPrice, customYearlyPrice, customNotes } = body;

    if (!planId || typeof planId !== 'string') {
      return NextResponse.json({ error: 'planId is required' }, { status: 400 });
    }

    // Verify the organization exists
    const org = await db.organization.findUnique({ where: { id } });
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // Verify the plan exists and optionally get its limits
    const plan = await db.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    // Update the organization
    const updatedOrg = await db.organization.update({
      where: { id },
      data: {
        subscriptionPlanId: planId,
        ...(customMonthlyPrice !== undefined && customMonthlyPrice !== null
          ? { customMonthlyPrice: Number(customMonthlyPrice) }
          : { customMonthlyPrice: null }),
        ...(customYearlyPrice !== undefined && customYearlyPrice !== null
          ? { customYearlyPrice: Number(customYearlyPrice) }
          : { customYearlyPrice: null }),
        ...(customNotes !== undefined && customNotes !== null
          ? { customNotes: String(customNotes) }
          : { customNotes: null }),
        // Sync plan limits to organization
        maxUsers: plan.maxUsers,
        maxNumbers: plan.maxNumbers,
        dailyUploadLimit: plan.dailyUploadLimit,
      },
      include: {
        plan: true,
      },
    });

    return NextResponse.json(updatedOrg);
  } catch (error) {
    console.error('[POST /api/super-admin/organizations/[id]/assign-plan]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
