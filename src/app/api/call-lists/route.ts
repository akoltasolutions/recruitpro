import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth-middleware';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const callLists = await db.callList.findMany({
      where: auth.role !== 'ADMIN' ? {
        assignments: {
          some: {
            recruiterId: auth.userId,
          },
        },
      } : undefined,
      include: {
        candidates: true,
        assignments: {
          include: {
            recruiter: { select: { id: true, name: true, email: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ callLists });
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
    if (auth.role !== 'ADMIN') {
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
