import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth-middleware';

type BulkAction = 'DELETE' | 'UPDATE_STATUS' | 'ADD';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;

    // Only admins can perform bulk operations
    if (auth.role !== 'SUPER_ADMIN' && auth.role !== 'ORG_ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const body = await request.json();
    const { action, candidateIds, data } = body as {
      action: BulkAction;
      candidateIds?: string[];
      data?: Record<string, unknown>;
    };

    if (!action || !['DELETE', 'UPDATE_STATUS', 'ADD'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be DELETE, UPDATE_STATUS, or ADD' },
        { status: 400 }
      );
    }

    // Verify target list exists
    const callList = await db.callList.findUnique({
      where: { id },
    });
    if (!callList) {
      return NextResponse.json({ error: 'Call list not found' }, { status: 404 });
    }

    if (action === 'DELETE') {
      if (!candidateIds || !Array.isArray(candidateIds) || candidateIds.length === 0) {
        return NextResponse.json({ error: 'candidateIds array is required for DELETE' }, { status: 400 });
      }

      const result = await db.candidate.deleteMany({
        where: {
          id: { in: candidateIds },
          callListId: id,
        },
      });

      return NextResponse.json({ count: result.count });
    }

    if (action === 'UPDATE_STATUS') {
      if (!candidateIds || !Array.isArray(candidateIds) || candidateIds.length === 0) {
        return NextResponse.json({ error: 'candidateIds array is required for UPDATE_STATUS' }, { status: 400 });
      }

      if (!data?.status || typeof data.status !== 'string') {
        return NextResponse.json({ error: 'data.status is required for UPDATE_STATUS' }, { status: 400 });
      }

      const validStatuses = ['PENDING', 'DONE', 'SCHEDULED', 'SKIPPED'];
      if (!validStatuses.includes(data.status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
          { status: 400 }
        );
      }

      const result = await db.candidate.updateMany({
        where: {
          id: { in: candidateIds },
          callListId: id,
        },
        data: { status: data.status },
      });

      return NextResponse.json({ count: result.count });
    }

    if (action === 'ADD') {
      const candidates = data?.candidates as Array<{
        name: string;
        phone: string;
        email?: string;
        role?: string;
        location?: string;
        company?: string;
        notes?: string;
      }> | undefined;

      if (!candidates || !Array.isArray(candidates) || candidates.length === 0) {
        return NextResponse.json({ error: 'data.candidates array is required for ADD' }, { status: 400 });
      }

      // Filter valid candidates
      const validCandidates = candidates.filter(c => c.name?.trim() && c.phone?.trim());
      if (validCandidates.length === 0) {
        return NextResponse.json({ error: 'No valid candidates found. Each candidate must have name and phone.' }, { status: 400 });
      }

      const result = await db.candidate.createMany({
        data: validCandidates.map(c => ({
          callListId: id,
          organizationId: callList.organizationId,
          name: c.name.trim(),
          phone: c.phone.trim(),
          email: c.email?.trim() || null,
          role: c.role?.trim() || null,
          location: c.location?.trim() || null,
          company: c.company?.trim() || null,
          notes: c.notes?.trim() || null,
        })),
      });

      return NextResponse.json({ count: result.count });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Bulk candidates error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
