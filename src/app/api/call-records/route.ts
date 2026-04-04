import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth-middleware';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { searchParams } = new URL(request.url);
    const recruiterId = searchParams.get('recruiterId');
    const callListId = searchParams.get('callListId');
    const dispositionType = searchParams.get('dispositionType');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    const where: Record<string, unknown> = {};
    if (recruiterId) where.recruiterId = recruiterId;
    if (callListId) where.candidate = { callListId };
    if (dispositionType) where.disposition = { type: dispositionType };
    if (dateFrom || dateTo) {
      where.calledAt = {};
      if (dateFrom) (where.calledAt as Record<string, unknown>).gte = new Date(dateFrom);
      if (dateTo) (where.calledAt as Record<string, unknown>).lte = new Date(dateTo);
    }

    const callRecords = await db.callRecord.findMany({
      where,
      include: {
        candidate: { select: { id: true, name: true, phone: true, role: true, location: true } },
        recruiter: { select: { id: true, name: true, email: true } },
        disposition: { select: { id: true, heading: true, type: true } },
        client: { select: { id: true, name: true } },
      },
      orderBy: { calledAt: 'desc' },
    });

    return NextResponse.json({ callRecords });
  } catch (error) {
    console.error('Call records error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();

    // Force recruiterId to authenticated user (prevent impersonation)
    if (auth.role !== 'ADMIN') {
      body.recruiterId = auth.userId;
    }

    const { candidateId, recruiterId, dispositionId, clientId, customClientName, notes, callDuration, callStatus, scheduledAt, f2fInterviewDate } = body;

    if (!candidateId || !recruiterId) {
      return NextResponse.json({ error: 'candidateId and recruiterId are required' }, { status: 400 });
    }

    const callRecord = await db.callRecord.create({
      data: {
        candidateId,
        recruiterId,
        dispositionId: dispositionId || null,
        clientId: clientId || null,
        customClientName: customClientName || null,
        notes: notes || null,
        callDuration: callDuration || 0,
        callStatus: callStatus || 'COMPLETED',
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        f2fInterviewDate: f2fInterviewDate ? new Date(f2fInterviewDate) : null,
      },
      include: {
        candidate: true,
        recruiter: { select: { id: true, name: true } },
        disposition: true,
        client: true,
      },
    });

    // Log activity for recruiter tracking
    try {
      const candidate = await db.candidate.findUnique({ where: { id: candidateId }, select: { name: true, phone: true } });
      await db.activityLog.create({
        data: {
          userId: recruiterId,
          action: 'CALL_END',
          status: 'ACTIVE',
          metadata: JSON.stringify({
            candidateId,
            candidateName: candidate?.name,
            phone: candidate?.phone,
            disposition: dispositionId,
            duration: callDuration || 0,
          }),
        },
      });
    } catch {
      // Activity logging is best-effort, don't fail the call record save
    }

    // Update candidate status and pipeline stage
    if (callStatus === 'COMPLETED' || callStatus === 'SKIPPED') {
      // Determine pipeline stage from disposition type
      let pipelineUpdate: Record<string, unknown> = {};
      if (dispositionId) {
        const disp = await db.disposition.findUnique({ where: { id: dispositionId } });
        if (disp) {
          if (disp.type === 'SHORTLISTED') {
            pipelineUpdate = { pipelineStage: 'SHORTLISTED' };
          } else if (disp.type === 'CONNECTED') {
            pipelineUpdate = { pipelineStage: 'FOLLOW_UP', followUpDate: scheduledAt ? new Date(scheduledAt) : null };
          }
        }
      }
      await db.candidate.update({
        where: { id: candidateId },
        data: { status: 'DONE', ...pipelineUpdate },
      });
    } else if (callStatus === 'SCHEDULED') {
      await db.candidate.update({
        where: { id: candidateId },
        data: { status: 'SCHEDULED' },
      });
    }

    return NextResponse.json({ callRecord }, { status: 201 });
  } catch (error) {
    console.error('Create call record error:', error);
    // Provide specific error messages for common Prisma errors
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('Foreign key constraint')) {
      return NextResponse.json({ error: 'Invalid reference: selected candidate, client, or disposition does not exist' }, { status: 400 });
    }
    if (msg.includes('Unique constraint')) {
      return NextResponse.json({ error: 'This call record already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to save call record. Please try again.' }, { status: 500 });
  }
}
