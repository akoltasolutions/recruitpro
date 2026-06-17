import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, requireOrgAdmin } from '@/lib/auth-middleware';
import { startOfDay, endOfDay } from 'date-fns';

/**
 * GET /api/call-records
 * Fetches call records with optional filters.
 * 
 * CRITICAL FIX (2026-06-02):
 * - Uses startOfDay/endOfDay from date-fns instead of raw new Date()
 *   Previously, dateTo was midnight UTC, excluding all daytime calls.
 * - Added organizationId scoping for multi-tenant data isolation.
 */
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
    const search = searchParams.get('search');

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));

    const where: Record<string, unknown> = {};

    // Organization scoping — ensure multi-tenant isolation
    if (auth.organizationId) {
      where.organizationId = auth.organizationId;
    }

    // Non-admin users can only see their own call records
    if (!requireOrgAdmin(auth)) {
      where.recruiterId = auth.userId;
    } else if (recruiterId) {
      where.recruiterId = recruiterId;
    }
    if (callListId) where.candidate = { callListId };
    if (dispositionType) where.disposition = { type: dispositionType };

    // CRITICAL FIX: Use startOfDay/endOfDay instead of raw new Date()
    if (dateFrom || dateTo) {
      where.calledAt = {};
      if (dateFrom) {
        (where.calledAt as Record<string, unknown>).gte = startOfDay(new Date(dateFrom + 'T00:00:00'));
      }
      if (dateTo) {
        (where.calledAt as Record<string, unknown>).lte = endOfDay(new Date(dateTo + 'T00:00:00'));
      }
    }

    // Search filter across candidate and disposition fields
    if (search) {
      where.OR = [
        { candidate: { name: { contains: search } } },
        { candidate: { phone: { contains: search } } },
        { candidate: { email: { contains: search } } },
        { disposition: { heading: { contains: search } } },
      ];
    }

    const [callRecords, totalCount] = await Promise.all([
      db.callRecord.findMany({
        where,
        include: {
          candidate: { select: { id: true, name: true, phone: true, role: true, location: true } },
          recruiter: { select: { id: true, name: true, email: true } },
          disposition: { select: { id: true, heading: true, type: true } },
          client: { select: { id: true, name: true } },
        },
        orderBy: { calledAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.callRecord.count({ where }),
    ]);

    return NextResponse.json({
      callRecords,
      totalCount,
      page,
      totalPages: Math.ceil(totalCount / limit),
    });
  } catch (error) {
    console.error('[CallRecords GET] Error:', error);
    if (error instanceof Error) {
      console.error('[CallRecords GET] Error message:', error.message);
      console.error('[CallRecords GET] Error stack:', error.stack);
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/call-records
 * Creates a new call record.
 * 
 * CRITICAL FIX (2026-06-02):
 * - Sets organizationId from recruiter's organization (was always null before).
 * - Added comprehensive error logging for failed call-tracking events.
 * - Prevents data loss by ensuring call records are always persisted.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();

    // Force recruiterId to authenticated user (prevent impersonation)
    if (!requireOrgAdmin(auth)) {
      body.recruiterId = auth.userId;
    }

    const { candidateId, recruiterId, dispositionId, clientId, customClientName, notes, callDuration, callStatus, scheduledAt, f2fInterviewDate } = body;

    if (!candidateId || !recruiterId) {
      return NextResponse.json({ error: 'candidateId and recruiterId are required' }, { status: 400 });
    }

    // Validate callStatus against whitelist
    const VALID_CALL_STATUSES = ['COMPLETED', 'SKIPPED', 'SCHEDULED', 'FAILED'];
    if (callStatus && !VALID_CALL_STATUSES.includes(callStatus)) {
      return NextResponse.json({ error: 'Invalid callStatus. Must be one of: COMPLETED, SKIPPED, SCHEDULED, FAILED' }, { status: 400 });
    }

    // CRITICAL FIX: Derive organizationId from the recruiter's organization
    // This ensures call records are properly scoped to the organization
    // and will appear in Team Performance and other org-scoped views.
    let organizationId = auth.organizationId || null;
    if (!organizationId && recruiterId) {
      try {
        const recruiter = await db.user.findUnique({
          where: { id: recruiterId },
          select: { organizationId: true },
        });
        organizationId = recruiter?.organizationId || null;
      } catch (orgErr) {
        console.error('[CallRecords POST] Failed to fetch recruiter org:', orgErr);
        // Non-fatal: continue without organizationId
      }
    }

    const callRecord = await db.callRecord.create({
      data: {
        candidateId,
        recruiterId,
        organizationId, // CRITICAL FIX: Now properly set
        dispositionId: dispositionId || null,
        clientId: clientId || null,
        customClientName: customClientName || null,
        notes: notes || null,
        callDuration: Math.max(0, callDuration || 0),
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
          organizationId, // Also set org on activity log
          metadata: JSON.stringify({
            candidateId,
            candidateName: candidate?.name,
            phone: candidate?.phone,
            disposition: dispositionId,
            duration: callDuration || 0,
          }),
        },
      });
    } catch (activityErr) {
      // Activity logging is best-effort, don't fail the call record save
      console.error('[CallRecords POST] Activity log creation failed (non-fatal):', activityErr);
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
    console.error('[CallRecords POST] Create call record error:', error);
    // Provide specific error messages for common Prisma errors
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('Foreign key constraint')) {
      return NextResponse.json({ error: 'Invalid reference: selected candidate, client, or disposition does not exist' }, { status: 400 });
    }
    if (msg.includes('Unique constraint')) {
      return NextResponse.json({ error: 'This call record already exists' }, { status: 409 });
    }
    // Log full error for debugging call-tracking failures
    console.error('[CallRecords POST] Full error details:', {
      message: msg,
      stack: error instanceof Error ? error.stack : 'N/A',
    });
    return NextResponse.json({ error: 'Failed to save call record. Please try again.' }, { status: 500 });
  }
}
