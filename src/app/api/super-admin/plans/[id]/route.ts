import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, requireSuperAdmin } from '@/lib/auth-middleware';

// GET /api/super-admin/plans/[id] — Get single plan
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth || !requireSuperAdmin(auth)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const plan = await db.subscriptionPlan.findUnique({
      where: { id },
      include: {
        _count: {
          select: { organizations: true },
        },
      },
    });

    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    return NextResponse.json(plan);
  } catch (error) {
    console.error('[GET /api/super-admin/plans/[id]]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/super-admin/plans/[id] — Update plan
export async function PUT(
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

    const existingPlan = await db.subscriptionPlan.findUnique({ where: { id } });
    if (!existingPlan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    const {
      name,
      description,
      type,
      monthlyPrice,
      yearlyPrice,
      maxUsers,
      maxNumbers,
      dailyUploadLimit,
      maxProjects,
      maxDepartments,
      isActive,
      isDefault,
      features,
      trialDays,
      monthlyCallLimit,
      dailyCallLimit,
      storageLimit,
      isUnlimited,
      featureAccess,
      sortOrder,
    } = body;

    const plan = await db.subscriptionPlan.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(description !== undefined ? { description: description || null } : {}),
        ...(type !== undefined ? { type } : {}),
        ...(monthlyPrice !== undefined ? { monthlyPrice } : {}),
        ...(yearlyPrice !== undefined ? { yearlyPrice } : {}),
        ...(maxUsers !== undefined ? { maxUsers } : {}),
        ...(maxNumbers !== undefined ? { maxNumbers } : {}),
        ...(dailyUploadLimit !== undefined ? { dailyUploadLimit } : {}),
        ...(maxProjects !== undefined ? { maxProjects } : {}),
        ...(maxDepartments !== undefined ? { maxDepartments } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
        ...(isDefault !== undefined ? { isDefault } : {}),
        ...(features !== undefined ? { features } : {}),
        ...(trialDays !== undefined ? { trialDays } : {}),
        ...(monthlyCallLimit !== undefined ? { monthlyCallLimit } : {}),
        ...(dailyCallLimit !== undefined ? { dailyCallLimit } : {}),
        ...(storageLimit !== undefined ? { storageLimit } : {}),
        ...(isUnlimited !== undefined ? { isUnlimited } : {}),
        ...(featureAccess !== undefined ? { featureAccess } : {}),
        ...(sortOrder !== undefined ? { sortOrder } : {}),
      },
    });

    return NextResponse.json(plan);
  } catch (error) {
    console.error('[PUT /api/super-admin/plans/[id]]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/super-admin/plans/[id] — Delete plan (only if no orgs using it)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth || !requireSuperAdmin(auth)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const existingPlan = await db.subscriptionPlan.findUnique({
      where: { id },
      include: {
        _count: {
          select: { organizations: true },
        },
      },
    });

    if (!existingPlan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    if (existingPlan._count.organizations > 0) {
      return NextResponse.json(
        { error: `Cannot delete plan "${existingPlan.name}" because ${existingPlan._count.organizations} organization(s) are using it.` },
        { status: 400 }
      );
    }

    await db.subscriptionPlan.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/super-admin/plans/[id]]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
