import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, requireOrgAdmin } from '@/lib/auth-middleware';

// ── GET /api/admin/pipeline/notes?candidateId=xxx ───────────────────────
// Returns all pipeline notes for a candidate, ordered by newest first,
// with author name included.

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth || !requireOrgAdmin(auth)) {
      return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const candidateId = searchParams.get('candidateId');

    if (!candidateId) {
      return NextResponse.json({ error: 'candidateId query parameter is required' }, { status: 400 });
    }

    // Verify candidate exists and is accessible to this admin
    const candidate = await db.candidate.findUnique({
      where: { id: candidateId },
      select: { id: true, organizationId: true },
    });

    if (!candidate) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }

    // ORG_ADMIN can only view notes for candidates in their org
    if (auth.role === 'ORG_ADMIN' && candidate.organizationId !== auth.organizationId) {
      return NextResponse.json(
        { error: 'Access denied: candidate is not in your organization' },
        { status: 403 },
      );
    }

    const notes = await db.pipelineNote.findMany({
      where: { candidateId },
      orderBy: { createdAt: 'desc' },
      include: {
        author: {
          select: { id: true, name: true },
        },
      },
    });

    const flatNotes = notes.map((n) => ({
      id: n.id,
      candidateId: n.candidateId,
      authorId: n.authorId,
      authorName: n.author.name,
      note: n.note,
      createdAt: n.createdAt.toISOString(),
    }));

    return NextResponse.json({ notes: flatNotes });
  } catch (error) {
    console.error('[GET /api/admin/pipeline/notes]', error);
    return NextResponse.json({ error: 'Failed to fetch pipeline notes' }, { status: 500 });
  }
}

// ── POST /api/admin/pipeline/notes ──────────────────────────────────────
// Adds a new pipeline note to a candidate. Body: { candidateId, note }.
// The author is automatically set to the authenticated user.

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth || !requireOrgAdmin(auth)) {
      return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 401 });
    }

    const body = await request.json();
    const { candidateId, note } = body as { candidateId?: string; note?: string };

    if (!candidateId) {
      return NextResponse.json({ error: 'candidateId is required' }, { status: 400 });
    }

    if (!note || typeof note !== 'string' || note.trim().length === 0) {
      return NextResponse.json({ error: 'note is required and must be non-empty' }, { status: 400 });
    }

    // Verify candidate exists and is accessible to this admin
    const candidate = await db.candidate.findUnique({
      where: { id: candidateId },
      select: { id: true, organizationId: true },
    });

    if (!candidate) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }

    // ORG_ADMIN can only add notes to candidates in their org
    if (auth.role === 'ORG_ADMIN' && candidate.organizationId !== auth.organizationId) {
      return NextResponse.json(
        { error: 'Access denied: candidate is not in your organization' },
        { status: 403 },
      );
    }

    // Create the note
    const createdNote = await db.pipelineNote.create({
      data: {
        candidateId,
        authorId: auth.userId,
        note: note.trim(),
        organizationId: candidate.organizationId,
      },
      include: {
        author: {
          select: { id: true, name: true },
        },
      },
    });

    return NextResponse.json(
      {
        note: {
          id: createdNote.id,
          candidateId: createdNote.candidateId,
          authorId: createdNote.authorId,
          authorName: createdNote.author.name,
          note: createdNote.note,
          createdAt: createdNote.createdAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('[POST /api/admin/pipeline/notes]', error);
    return NextResponse.json({ error: 'Failed to create pipeline note' }, { status: 500 });
  }
}
