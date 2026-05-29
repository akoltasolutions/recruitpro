import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth-middleware';

type DedupAction = 'LIST' | 'REMOVE';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;

    // Only admins can perform deduplication
    if (auth.role !== 'SUPER_ADMIN' && auth.role !== 'ORG_ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const body = await request.json();
    const { action } = body as { action: DedupAction };

    if (!action || !['LIST', 'REMOVE'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be LIST or REMOVE' },
        { status: 400 }
      );
    }

    // Verify call list exists
    const callList = await db.callList.findUnique({
      where: { id },
    });
    if (!callList) {
      return NextResponse.json({ error: 'Call list not found' }, { status: 404 });
    }

    // Fetch all candidates ordered by creation date (oldest first)
    const candidates = await db.candidate.findMany({
      where: { callListId: id },
      orderBy: { createdAt: 'asc' },
    });

    // Group by phone number
    const phoneGroups = new Map<string, typeof candidates>();
    for (const c of candidates) {
      const phone = c.phone;
      if (!phoneGroups.has(phone)) {
        phoneGroups.set(phone, []);
      }
      phoneGroups.get(phone)!.push(c);
    }

    // Find duplicates (phone numbers with more than 1 candidate)
    const duplicates: Array<{ phone: string; count: number; candidateIds: string[] }> = [];
    for (const [phone, group] of phoneGroups) {
      if (group.length > 1) {
        duplicates.push({
          phone,
          count: group.length,
          candidateIds: group.map(c => c.id),
        });
      }
    }

    // Sort by count descending
    duplicates.sort((a, b) => b.count - a.count);

    if (action === 'LIST') {
      return NextResponse.json({ duplicates });
    }

    if (action === 'REMOVE') {
      // For each group, keep the first (oldest) candidate and remove the rest
      const idsToRemove: string[] = [];
      for (const group of duplicates) {
        // Keep the first candidateId, remove the rest
        const ids = group.candidateIds;
        for (let i = 1; i < ids.length; i++) {
          idsToRemove.push(ids[i]);
        }
      }

      let removed = 0;
      if (idsToRemove.length > 0) {
        const result = await db.candidate.deleteMany({
          where: {
            id: { in: idsToRemove },
            callListId: id,
          },
        });
        removed = result.count;
      }

      return NextResponse.json({ removed });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Deduplicate error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
