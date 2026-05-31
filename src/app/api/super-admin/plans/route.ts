import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, requireSuperAdmin } from '@/lib/auth-middleware';

// GET /api/super-admin/plans — List all plans ordered by sortOrder
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth || !requireSuperAdmin(auth)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const plans = await db.subscriptionPlan.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: {
          select: { organizations: true },
        },
      },
    });

    return NextResponse.json(plans);
  } catch (error) {
    console.error('[GET /api/super-admin/plans]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/super-admin/plans — Create a new plan
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth || !requireSuperAdmin(auth)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
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

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Plan name is required' }, { status: 400 });
    }

    const plan = await db.subscriptionPlan.create({
      data: {
        name: name.trim(),
        description: description || null,
        type: type || 'CUSTOM',
        monthlyPrice: typeof monthlyPrice === 'number' ? monthlyPrice : 0,
        yearlyPrice: typeof yearlyPrice === 'number' ? yearlyPrice : 0,
        maxUsers: typeof maxUsers === 'number' ? maxUsers : 10,
        maxNumbers: typeof maxNumbers === 'number' ? maxNumbers : 5000,
        dailyUploadLimit: typeof dailyUploadLimit === 'number' ? dailyUploadLimit : 500,
        maxProjects: typeof maxProjects === 'number' ? maxProjects : 5,
        maxDepartments: typeof maxDepartments === 'number' ? maxDepartments : 10,
        isActive: typeof isActive === 'boolean' ? isActive : true,
        isDefault: typeof isDefault === 'boolean' ? isDefault : false,
        features: typeof features === 'string' ? features : '[]',
        trialDays: typeof trialDays === 'number' ? trialDays : 0,
        monthlyCallLimit: typeof monthlyCallLimit === 'number' ? monthlyCallLimit : 0,
        dailyCallLimit: typeof dailyCallLimit === 'number' ? dailyCallLimit : 0,
        storageLimit: typeof storageLimit === 'number' ? storageLimit : 0,
        isUnlimited: typeof isUnlimited === 'boolean' ? isUnlimited : false,
        featureAccess: typeof featureAccess === 'string' ? featureAccess : '{}',
        sortOrder: typeof sortOrder === 'number' ? sortOrder : 0,
      },
    });

    return NextResponse.json(plan, { status: 201 });
  } catch (error) {
    console.error('[POST /api/super-admin/plans]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
