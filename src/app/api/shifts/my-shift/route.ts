import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth-middleware';

// ── GET /api/shifts/my-shift — Get current user's shift assignment ──────────

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const shift = await db.shiftAssignment.findUnique({
      where: { userId: auth.userId },
      select: {
        id: true,
        shiftStartTime: true,
        shiftEndTime: true,
        breakAllowedTime: true,
        workingHoursTotal: true,
        weeklyOff: true,
        allowOutsideShift: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!shift) {
      return NextResponse.json({ hasShift: false }, { status: 200 });
    }

    return NextResponse.json({ hasShift: true, shift });
  } catch (error) {
    console.error('Fetch my-shift error:', error);
    return NextResponse.json({ error: 'Failed to fetch shift assignment' }, { status: 500 });
  }
}
