import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth-middleware';

type MergeMode = 'APPEND' | 'SKIP_DUPLICATES' | 'REPLACE_DUPLICATES';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;

    // Only admins can merge lists
    if (auth.role !== 'SUPER_ADMIN' && auth.role !== 'ORG_ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const body = await request.json();
    const { sourceListId, mergeMode, keepOldNotes } = body as {
      sourceListId: string;
      mergeMode: MergeMode;
      keepOldNotes: boolean;
    };

    if (!sourceListId || !mergeMode) {
      return NextResponse.json(
        { error: 'sourceListId and mergeMode are required' },
        { status: 400 }
      );
    }

    if (!['APPEND', 'SKIP_DUPLICATES', 'REPLACE_DUPLICATES'].includes(mergeMode)) {
      return NextResponse.json(
        { error: 'Invalid mergeMode. Must be APPEND, SKIP_DUPLICATES, or REPLACE_DUPLICATES' },
        { status: 400 }
      );
    }

    // Verify target list exists
    const targetList = await db.callList.findUnique({
      where: { id },
    });
    if (!targetList) {
      return NextResponse.json({ error: 'Target call list not found' }, { status: 404 });
    }

    // Verify source list exists
    const sourceList = await db.callList.findUnique({
      where: { id: sourceListId },
    });
    if (!sourceList) {
      return NextResponse.json({ error: 'Source call list not found' }, { status: 404 });
    }

    if (sourceListId === id) {
      return NextResponse.json({ error: 'Cannot merge a list with itself' }, { status: 400 });
    }

    // Fetch all candidates from both lists
    const targetCandidates = await db.candidate.findMany({
      where: { callListId: id },
    });

    const sourceCandidates = await db.candidate.findMany({
      where: { callListId: sourceListId },
    });

    // Build a map of phone -> target candidate for quick lookup
    const targetPhoneMap = new Map<string, typeof targetCandidates[0]>();
    for (const c of targetCandidates) {
      targetPhoneMap.set(c.phone, c);
    }

    let added = 0;
    let skipped = 0;
    let replaced = 0;

    // Candidates to create
    const toCreate: Array<{
      callListId: string;
      organizationId: string;
      name: string;
      phone: string;
      email: string | null;
      role: string | null;
      location: string | null;
      company: string | null;
      notes: string | null;
    }> = [];

    // Candidate IDs and updates for replacements
    const toUpdate: Array<{ id: string; data: Record<string, unknown> }> = [];

    for (const src of sourceCandidates) {
      const existing = targetPhoneMap.get(src.phone);

      if (!existing) {
        // No duplicate — always append
        toCreate.push({
          callListId: id,
          organizationId: targetList.organizationId,
          name: src.name,
          phone: src.phone,
          email: src.email,
          role: src.role,
          location: src.location,
          company: src.company,
          notes: src.notes,
        });
        added++;
      } else {
        // Duplicate found
        if (mergeMode === 'SKIP_DUPLICATES') {
          skipped++;
        } else if (mergeMode === 'APPEND') {
          // Even duplicates get appended (create a new record)
          toCreate.push({
            callListId: id,
            organizationId: targetList.organizationId,
            name: src.name,
            phone: src.phone,
            email: src.email,
            role: src.role,
            location: src.location,
            company: src.company,
            notes: src.notes,
          });
          added++;
        } else if (mergeMode === 'REPLACE_DUPLICATES') {
          // Replace existing with new data
          const updateData: Record<string, unknown> = {
            name: src.name,
            email: src.email,
            role: src.role,
            location: src.location,
            company: src.company,
          };

          // Merge notes if keepOldNotes is true
          if (keepOldNotes) {
            const oldNotes = existing.notes || '';
            const newNotes = src.notes || '';
            if (oldNotes && newNotes) {
              updateData.notes = `${oldNotes}\n---\n${newNotes}`;
            } else if (oldNotes) {
              updateData.notes = oldNotes;
            } else {
              updateData.notes = newNotes;
            }
          } else {
            updateData.notes = src.notes;
          }

          toUpdate.push({ id: existing.id, data: updateData });
          replaced++;
        }
      }
    }

    // Execute bulk create
    if (toCreate.length > 0) {
      await db.candidate.createMany({ data: toCreate });
    }

    // Execute updates in a single transaction to avoid N+1 queries
    if (toUpdate.length > 0) {
      await db.$transaction(
        toUpdate.map(({ id, data }) =>
          db.candidate.update({
            where: { id },
            data,
          })
        )
      )
    }

    const total = sourceCandidates.length;

    return NextResponse.json({
      added,
      skipped,
      replaced,
      total,
    });
  } catch (error) {
    console.error('Merge candidates error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
