import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, requireOrgAdmin } from '@/lib/auth-middleware';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));

    const where: Record<string, unknown> = {};

    // Non-admin users only see their assigned call lists
    if (!requireOrgAdmin(auth)) {
      where.assignments = {
        some: {
          recruiterId: auth.userId,
        },
      };
    }

    // Search filter across name and description
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { description: { contains: search } },
      ];
    }

    const [callLists, totalCount] = await Promise.all([
      db.callList.findMany({
        where,
        include: {
          candidates: { select: { id: true } },
          assignments: {
            include: {
              recruiter: { select: { id: true, name: true, email: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.callList.count({ where }),
    ]);

    return NextResponse.json({
      callLists,
      totalCount,
      page,
      totalPages: Math.ceil(totalCount / limit),
    });
  } catch (error) {
    console.error('Call lists error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check createListPermission (admins can always create)
    if (!requireOrgAdmin(auth)) {
      const user = await db.user.findUnique({
        where: { id: auth.userId },
        select: { createListPermission: true },
      });
      if (!user?.createListPermission) {
        return NextResponse.json({ error: 'You do not have permission to create call lists' }, { status: 403 });
      }
    }

    const {
      name,
      description,
      source,
      candidates,
      googleSheetsUrl,
      googleSheetGid,
      syncInterval,
      autoAssignRecruiter,
    } = await request.json();

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Force createdBy to authenticated user to prevent impersonation
    const createdBy = auth.userId;

    const callList = await db.callList.create({
      data: {
        name,
        description: description || null,
        source: source || 'MANUAL',
        createdBy,
        ...(googleSheetsUrl && { googleSheetsUrl: String(googleSheetsUrl) }),
        ...(googleSheetGid !== undefined && googleSheetGid !== null && { googleSheetGid: String(googleSheetGid) }),
        ...(syncInterval !== undefined && syncInterval !== null && { syncInterval: Number(syncInterval) }),
        candidates: candidates ? {
          create: candidates.map((c: Record<string, unknown>) => ({
            name: String(c.name || ''),
            phone: String(c.phone || ''),
            email: c.email ? String(c.email) : null,
            role: c.role ? String(c.role) : null,
            location: c.location ? String(c.location) : null,
            company: c.company ? String(c.company) : null,
            notes: c.notes ? String(c.notes) : null,
          })),
        } : undefined,
        // Auto-assign to the recruiter who created the list
        ...(autoAssignRecruiter && {
          assignments: {
            create: {
              recruiterId: createdBy,
            },
          },
        }),
      },
      include: { candidates: true, assignments: true },
    });

    return NextResponse.json({ callList }, { status: 201 });
  } catch (error) {
    console.error('Create call list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
