import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth-middleware';

// GET /api/pipeline — Get candidates grouped by pipeline stage
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const stage = searchParams.get('stage'); // SHORTLISTED, FOLLOW_UP, INTERVIEWED, JOINED, BACKOUT
    const search = searchParams.get('search');

    const where: Record<string, unknown> = {
      // Only show candidates that have been dispositioned (not NEW/PENDING)
      pipelineStage: { not: 'NEW' },
    };
    if (stage) where.pipelineStage = stage;
    if (auth.role === 'RECRUITER') {
      // Recruiters see only from their assigned lists
      where.callList = { assignments: { some: { recruiterId: auth.userId } } };
    }
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { phone: { contains: search } },
      ];
    }

    const candidates = await db.candidate.findMany({
      where,
      include: {
        callRecords: {
          orderBy: { calledAt: 'desc' },
          take: 1,
          include: {
            disposition: { select: { heading: true, type: true } },
            client: { select: { name: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Transform to flat shape matching frontend PipelineCandidate interface
    const flatCandidates = candidates.map((c) => {
      const lastCall = c.callRecords[0] || null;
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        role: c.role,
        location: c.location,
        notes: c.notes,
        pipelineStage: c.pipelineStage,
        followUpDate: c.followUpDate ? c.followUpDate.toISOString() : null,
        interviewDate: c.interviewDate ? c.interviewDate.toISOString() : null,
        joinedDate: c.joinedDate ? c.joinedDate.toISOString() : null,
        backoutReason: c.backoutReason,
        lastDisposition: lastCall?.disposition?.heading || null,
        clientName: lastCall?.client?.name || null,
      };
    });

    // Group by pipeline stage
    const grouped = flatCandidates.reduce((acc, c) => {
      const s = c.pipelineStage || 'SHORTLISTED';
      if (!acc[s]) acc[s] = [];
      acc[s].push(c);
      return acc;
    }, {} as Record<string, typeof flatCandidates>);

    // Stage counts (all stages for tab badges) — scoped to recruiter's assigned lists
    const stageCountWhere: Record<string, unknown> = { pipelineStage: { not: 'NEW' } };
    if (auth.role === 'RECRUITER') {
      stageCountWhere.callList = { assignments: { some: { recruiterId: auth.userId } } };
    }
    const stageCounts = await db.candidate.groupBy({
      by: ['pipelineStage'],
      where: stageCountWhere,
      _count: true,
    });

    const counts = stageCounts.reduce((acc, s) => {
      acc[s.pipelineStage] = s._count;
      return acc;
    }, {} as Record<string, number>);

    return NextResponse.json({
      candidates: stage ? (grouped[stage] || []) : flatCandidates,
      grouped,
      counts,
    });
  } catch (error) {
    console.error('Pipeline fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch pipeline' }, { status: 500 });
  }
}

// PATCH /api/pipeline — Update candidate pipeline stage and related fields
export async function PATCH(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { candidateId, pipelineStage, followUpDate, interviewDate, joinedDate, backoutReason, notes } = body;

    if (!candidateId) {
      return NextResponse.json({ error: 'candidateId is required' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (pipelineStage) {
      const validStages = ['NEW', 'SHORTLISTED', 'FOLLOW_UP', 'INTERVIEWED', 'JOINED', 'BACKOUT'];
      if (!validStages.includes(pipelineStage)) {
        return NextResponse.json({ error: `Invalid pipeline stage. Must be one of: ${validStages.join(', ')}` }, { status: 400 });
      }
      updateData.pipelineStage = pipelineStage;
    }
    if (followUpDate !== undefined) {
      updateData.followUpDate = followUpDate ? new Date(followUpDate) : null;
    }
    if (interviewDate !== undefined) {
      updateData.interviewDate = interviewDate ? new Date(interviewDate) : null;
    }
    if (joinedDate !== undefined) {
      updateData.joinedDate = joinedDate ? new Date(joinedDate) : null;
    }
    if (backoutReason !== undefined) {
      updateData.backoutReason = backoutReason;
    }
    if (notes !== undefined) {
      updateData.notes = notes;
    }

    const candidate = await db.candidate.update({
      where: { id: candidateId },
      data: updateData,
    });

    return NextResponse.json({ candidate });
  } catch (error) {
    console.error('Pipeline update error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('Record to update not found')) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to update pipeline stage' }, { status: 500 });
  }
}
