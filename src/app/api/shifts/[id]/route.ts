import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, requireOrgAdmin } from '@/lib/auth-middleware';

// ── Helpers ──────────────────────────────────────────────────────────────────

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function isValidTime(value: string): boolean {
  return TIME_REGEX.test(value);
}

// ── PUT /api/shifts/[id] — Update a shift assignment ─────────────────────────

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth || !requireOrgAdmin(auth)) {
      return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 401 });
    }

    const { id } = await params;

    // Check if shift assignment exists
    const existing = await db.shiftAssignment.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, organizationId: true, name: true },
        },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Shift assignment not found' }, { status: 404 });
    }

    // Org scoping: ORG_ADMIN can only update shifts in their org
    if (auth.role === 'ORG_ADMIN') {
      if (existing.organizationId !== auth.organizationId) {
        return NextResponse.json({ error: 'You can only update shifts in your organization' }, { status: 403 });
      }
    }

    const body = await request.json();
    const { shiftStartTime, shiftEndTime, breakAllowedTime, workingHoursTotal, weeklyOff, allowOutsideShift } = body;

    // Build update data with only provided fields
    const updateData: {
      shiftStartTime?: string;
      shiftEndTime?: string;
      breakAllowedTime?: string | null;
      workingHoursTotal?: string | null;
      weeklyOff?: string | null;
      allowOutsideShift?: boolean;
    } = {};

    if (shiftStartTime !== undefined) {
      if (typeof shiftStartTime !== 'string' || !isValidTime(shiftStartTime)) {
        return NextResponse.json({ error: 'Invalid shiftStartTime format. Use HH:mm (e.g. 09:00)' }, { status: 400 });
      }
      updateData.shiftStartTime = shiftStartTime;
    }

    if (shiftEndTime !== undefined) {
      if (typeof shiftEndTime !== 'string' || !isValidTime(shiftEndTime)) {
        return NextResponse.json({ error: 'Invalid shiftEndTime format. Use HH:mm (e.g. 18:00)' }, { status: 400 });
      }
      updateData.shiftEndTime = shiftEndTime;
    }

    if (breakAllowedTime !== undefined) {
      if (breakAllowedTime === null) {
        updateData.breakAllowedTime = null;
      } else if (typeof breakAllowedTime !== 'string' || !isValidTime(breakAllowedTime)) {
        return NextResponse.json({ error: 'Invalid breakAllowedTime format. Use HH:mm (e.g. 00:30)' }, { status: 400 });
      } else {
        updateData.breakAllowedTime = breakAllowedTime;
      }
    }

    if (workingHoursTotal !== undefined) {
      if (workingHoursTotal === null) {
        updateData.workingHoursTotal = null;
      } else if (typeof workingHoursTotal !== 'string' || !isValidTime(workingHoursTotal)) {
        return NextResponse.json({ error: 'Invalid workingHoursTotal format. Use HH:mm (e.g. 09:00)' }, { status: 400 });
      } else {
        updateData.workingHoursTotal = workingHoursTotal;
      }
    }

    if (weeklyOff !== undefined) {
      if (weeklyOff === null) {
        updateData.weeklyOff = null;
      } else if (typeof weeklyOff !== 'string' || weeklyOff.trim().length === 0) {
        return NextResponse.json({ error: 'weeklyOff must be a non-empty string' }, { status: 400 });
      } else {
        updateData.weeklyOff = weeklyOff;
      }
    }

    if (allowOutsideShift !== undefined) {
      if (typeof allowOutsideShift !== 'boolean') {
        return NextResponse.json({ error: 'allowOutsideShift must be a boolean' }, { status: 400 });
      }
      updateData.allowOutsideShift = allowOutsideShift;
    }

    // Check if there's anything to update
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update. Provide at least one field to update.' },
        { status: 400 }
      );
    }

    // Update the shift assignment
    const shift = await db.shiftAssignment.update({
      where: { id },
      data: updateData,
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return NextResponse.json({ shift });
  } catch (error) {
    console.error('Shift update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── DELETE /api/shifts/[id] — Delete a shift assignment ─────────────────────

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth || !requireOrgAdmin(auth)) {
      return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 401 });
    }

    const { id } = await params;

    // Check if shift assignment exists
    const existing = await db.shiftAssignment.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Shift assignment not found' }, { status: 404 });
    }

    // Org scoping: ORG_ADMIN can only delete shifts in their org
    if (auth.role === 'ORG_ADMIN') {
      if (existing.organizationId !== auth.organizationId) {
        return NextResponse.json({ error: 'You can only delete shifts in your organization' }, { status: 403 });
      }
    }

    await db.shiftAssignment.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'Shift assignment deleted successfully' });
  } catch (error) {
    console.error('Shift delete error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
