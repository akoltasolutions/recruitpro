import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, requireOrgAdmin } from '@/lib/auth-middleware';

// ── Helpers ──────────────────────────────────────────────────────────────────

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function isValidTime(value: string): boolean {
  return TIME_REGEX.test(value);
}

// ── POST /api/shifts/bulk — Bulk assign shifts via upsert ──────────────────

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth || !requireOrgAdmin(auth)) {
      return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 401 });
    }

    const body = await request.json();
    const { userIds, shiftStartTime, shiftEndTime, breakAllowedTime, workingHoursTotal, weeklyOff, allowOutsideShift } = body;

    // Validate required fields
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: 'userIds must be a non-empty array of user IDs' }, { status: 400 });
    }

    if (userIds.length > 100) {
      return NextResponse.json({ error: 'Cannot assign shifts to more than 100 users at once' }, { status: 400 });
    }

    if (!shiftStartTime || typeof shiftStartTime !== 'string') {
      return NextResponse.json({ error: 'shiftStartTime is required (HH:mm format)' }, { status: 400 });
    }

    if (!shiftEndTime || typeof shiftEndTime !== 'string') {
      return NextResponse.json({ error: 'shiftEndTime is required (HH:mm format)' }, { status: 400 });
    }

    // Validate time formats
    if (!isValidTime(shiftStartTime)) {
      return NextResponse.json({ error: 'Invalid shiftStartTime format. Use HH:mm (e.g. 09:00)' }, { status: 400 });
    }

    if (!isValidTime(shiftEndTime)) {
      return NextResponse.json({ error: 'Invalid shiftEndTime format. Use HH:mm (e.g. 18:00)' }, { status: 400 });
    }

    // Validate optional time fields if provided
    if (breakAllowedTime !== undefined && breakAllowedTime !== null) {
      if (typeof breakAllowedTime !== 'string' || !isValidTime(breakAllowedTime)) {
        return NextResponse.json({ error: 'Invalid breakAllowedTime format. Use HH:mm (e.g. 00:30)' }, { status: 400 });
      }
    }

    if (workingHoursTotal !== undefined && workingHoursTotal !== null) {
      if (typeof workingHoursTotal !== 'string' || !isValidTime(workingHoursTotal)) {
        return NextResponse.json({ error: 'Invalid workingHoursTotal format. Use HH:mm (e.g. 09:00)' }, { status: 400 });
      }
    }

    // Validate weeklyOff if provided
    if (weeklyOff !== undefined && weeklyOff !== null) {
      if (typeof weeklyOff !== 'string' || weeklyOff.trim().length === 0) {
        return NextResponse.json({ error: 'weeklyOff must be a non-empty string' }, { status: 400 });
      }
    }

    // Org scoping: verify all users belong to the admin's organization (for ORG_ADMIN)
    const users = await db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, organizationId: true, name: true },
    });

    if (users.length !== userIds.length) {
      const foundIds = new Set(users.map(u => u.id));
      const missingIds = userIds.filter((id: string) => !foundIds.has(id));
      return NextResponse.json(
        { error: `Users not found: ${missingIds.join(', ')}` },
        { status: 404 }
      );
    }

    // Check org access
    if (auth.role === 'ORG_ADMIN') {
      const unauthorizedUsers = users.filter(u => u.organizationId !== auth.organizationId);
      if (unauthorizedUsers.length > 0) {
        return NextResponse.json(
          { error: `Some users do not belong to your organization: ${unauthorizedUsers.map(u => u.name || u.id).join(', ')}` },
          { status: 403 }
        );
      }
    }

    // Bulk upsert using Prisma transactions
    const results = await db.$transaction(
      users.map((user) =>
        db.shiftAssignment.upsert({
          where: { userId: user.id },
          create: {
            userId: user.id,
            organizationId: user.organizationId || auth.organizationId,
            shiftStartTime,
            shiftEndTime,
            breakAllowedTime: breakAllowedTime || null,
            workingHoursTotal: workingHoursTotal || null,
            weeklyOff: weeklyOff || null,
            allowOutsideShift: typeof allowOutsideShift === 'boolean' ? allowOutsideShift : false,
          },
          update: {
            shiftStartTime,
            shiftEndTime,
            breakAllowedTime: breakAllowedTime || null,
            workingHoursTotal: workingHoursTotal || null,
            weeklyOff: weeklyOff || null,
            allowOutsideShift: typeof allowOutsideShift === 'boolean' ? allowOutsideShift : false,
          },
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        })
      )
    );

    return NextResponse.json({
      message: `Successfully assigned shifts to ${results.length} users`,
      shifts: results,
    }, { status: 200 });
  } catch (error) {
    console.error('Bulk shift assignment error:', error);
    const message = error instanceof Error ? error.message : 'Failed to bulk assign shifts';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
