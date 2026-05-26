import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth-middleware';
import { startOfDay, endOfDay } from 'date-fns';

// GET /api/recruiter-stats — Daily stats for a recruiter
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const today = new Date();
    const dayStart = startOfDay(today);
    const dayEnd = endOfDay(today);
    const recruiterId = auth.userId;

    // Today's calls
    const todayCalls = await db.callRecord.count({
      where: { recruiterId, calledAt: { gte: dayStart, lte: dayEnd } },
    });

    // Today's completed calls with disposition
    const todayCompleted = await db.callRecord.count({
      where: {
        recruiterId,
        calledAt: { gte: dayStart, lte: dayEnd },
        dispositionId: { not: null },
      },
    });

    // Total call duration today
    const durationResult = await db.callRecord.aggregate({
      where: { recruiterId, calledAt: { gte: dayStart, lte: dayEnd } },
      _sum: { callDuration: true },
    });
    const totalDuration = durationResult._sum.callDuration || 0;

    // Disposition summary today
    const dispositionSummary = await db.callRecord.groupBy({
      by: ['dispositionId'],
      where: { recruiterId, calledAt: { gte: dayStart, lte: dayEnd }, dispositionId: { not: null } },
      _count: true,
    });
    const dispositions = await db.disposition.findMany({
      where: { id: { in: dispositionSummary.map((d) => d.dispositionId!) } },
    });
    const statusSummary = dispositionSummary.map((d) => {
      const disp = dispositions.find((dis) => dis.id === d.dispositionId);
      return {
        disposition: disp?.heading || 'Unknown',
        type: disp?.type || 'UNKNOWN',
        count: d._count,
      };
    });

    // Today's follow-ups (candidates with followUpDate today, scoped to assigned lists)
    const assignedListIds = (await db.callListAssignment.findMany({
      where: { recruiterId },
      select: { callListId: true },
    })).map((a) => a.callListId);

    const todayFollowUps = await db.candidate.count({
      where: {
        pipelineStage: 'FOLLOW_UP',
        followUpDate: { gte: dayStart, lte: dayEnd },
        callList: {
          assignments: {
            some: { recruiterId: recruiterId }
          }
        }
      },
    });

    const followUpCandidates = await db.candidate.findMany({
      where: {
        pipelineStage: 'FOLLOW_UP',
        followUpDate: { gte: dayStart, lte: dayEnd },
        callList: {
          assignments: {
            some: { recruiterId: recruiterId }
          }
        }
      },
      select: { id: true, name: true, phone: true, role: true, followUpDate: true, notes: true },
      take: 50,
    });

    // Scheduled calls for today
    const scheduledToday = await db.callRecord.count({
      where: {
        recruiterId,
        callStatus: 'SCHEDULED',
        scheduledAt: { gte: dayStart, lte: dayEnd },
      },
    });

    // Pending candidates across assigned lists
    const pendingCandidates = await db.candidate.count({
      where: { callListId: { in: assignedListIds }, status: { in: ['PENDING', 'SCHEDULED'] } },
    });

    return NextResponse.json({
      todayCalls,
      todayCompleted,
      totalDuration,
      statusSummary,
      todayFollowUps,
      followUpCandidates,
      scheduledToday,
      pendingCandidates,
    });
  } catch (error) {
    console.error('Recruiter stats error:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
