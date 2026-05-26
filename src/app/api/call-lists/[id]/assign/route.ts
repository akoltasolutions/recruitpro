import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth-middleware';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (auth.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    const { id } = await params;
    const { recruiterIds } = await request.json();

    if (!recruiterIds || !Array.isArray(recruiterIds)) {
      return NextResponse.json({ error: 'recruiterIds array is required' }, { status: 400 });
    }

    // Delete existing assignments for this call list
    await db.callListAssignment.deleteMany({ where: { callListId: id } });

    // Create new assignments
    const assignments = await db.callListAssignment.createMany({
      data: recruiterIds.map((recruiterId: string) => ({
        callListId: id,
        recruiterId,
      })),
    });

    return NextResponse.json({ count: assignments.count }, { status: 201 });
  } catch (error) {
    console.error('Assign call list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
