import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, requireOrgAdmin } from '@/lib/auth-middleware';
import { isValidTime } from '@/lib/time-utils';

// ── GET /api/shifts — List all shifts (admin only) ──────────────────────────

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 401 });
    }
    if (!requireOrgAdmin(auth)) {
      return NextResponse.json({ error: 'Access denied. Admin access required.' }, { status: 403 });
    }

    // Organization scoping: ORG_ADMIN sees only their org; SUPER_ADMIN sees all
    const whereClause = auth.role === 'ORG_ADMIN'
      ? { organizationId: auth.organizationId! }
      : {};

    const shifts = await db.shiftAssignment.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ shifts });
  } catch (error) {
    console.error('List shifts error:', error);
    return NextResponse.json({ error: 'Failed to fetch shifts' }, { status: 500 });
  }
}

// ── POST /api/shifts — Create a shift assignment ────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 401 });
    }
    if (!requireOrgAdmin(auth)) {
      return NextResponse.json({ error: 'Access denied. Admin access required.' }, { status: 403 });
    }

    const body = await request.json();
    const { userId, shiftStartTime, shiftEndTime, breakAllowedTime, workingHoursTotal, weeklyOff, allowOutsideShift } = body;

    // Validate required fields
    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
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
        return NextResponse.json({ error: 'weeklyOff must be a non-empty string (e.g. SUNDAY or SATURDAY,SUNDAY)' }, { status: 400 });
      }
    }

    // Determine organizationId for the shift assignment
    const targetUser = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, organizationId: true, name: true },
    });

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Org scoping: ORG_ADMIN can only assign shifts to users in their own org
    if (auth.role === 'ORG_ADMIN') {
      if (targetUser.organizationId !== auth.organizationId) {
        return NextResponse.json({ error: 'You can only assign shifts to users in your organization' }, { status: 403 });
      }
    }

    const shiftOrgId = targetUser.organizationId || auth.organizationId;

    // Check if user already has a shift assignment (userId is unique)
    const existing = await db.shiftAssignment.findUnique({
      where: { userId },
    });

    if (existing) {
      return NextResponse.json({ error: 'User already has a shift assignment. Use PUT to update it.' }, { status: 409 });
    }

    // Create the shift assignment
    const shift = await db.shiftAssignment.create({
      data: {
        userId,
        organizationId: shiftOrgId,
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
    });

    return NextResponse.json({ shift }, { status: 201 });
  } catch (error) {
    console.error('Create shift error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
