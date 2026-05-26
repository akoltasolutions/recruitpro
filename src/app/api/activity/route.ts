import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth-middleware';

// Whitelist of valid actions for activity logging
const VALID_ACTIONS = [
  'LOGIN', 'LOGOUT', 'BREAK_START', 'BREAK_END', 'LUNCH',
  'IDLE', 'CALL_START', 'CALL_END', 'STATUS_CHANGE',
] as const;

// Whitelist of valid statuses for activity logging
const VALID_STATUSES = [
  'ACTIVE', 'ON_BREAK', 'ON_CALL', 'IDLE', 'OFFLINE',
  'LUNCH',
] as const;

// POST /api/activity — Log an activity event (login, logout, break, status change)
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { action, status, metadata } = body;

    if (!action || !status) {
      return NextResponse.json({ error: 'action and status are required' }, { status: 400 });
    }

    // Validate action against whitelist
    if (!VALID_ACTIONS.includes(action)) {
      return NextResponse.json(
        { error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}` },
        { status: 400 },
      );
    }

    // Validate status against whitelist
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 },
      );
    }

    // Admin can log activity for other users (e.g., break toggling)
    let targetUserId = auth.userId;
    if (metadata?.targetUserId && auth.role === 'ADMIN') {
      targetUserId = metadata.targetUserId;
    }

    const activityLog = await db.activityLog.create({
      data: {
        userId: targetUserId,
        action,
        status,
        metadata: metadata ? JSON.stringify(metadata) : null,
        userAgent: request.headers.get('user-agent') || null,
      },
    });

    return NextResponse.json({ activityLog }, { status: 201 });
  } catch (error) {
    console.error('Activity log create error:', error);
    return NextResponse.json({ error: 'Failed to log activity' }, { status: 500 });
  }
}

// GET /api/activity — Fetch activity logs (admin: all users, recruiter: own)
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    let limit = parseInt(searchParams.get('limit') || '200', 10);
    if (isNaN(limit) || limit < 1 || limit > 1000) limit = 200;

    const where: Record<string, unknown> = {};
    if (auth.role !== 'ADMIN') {
      where.userId = auth.userId;
    } else if (userId) {
      where.userId = userId;
    }
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) (where.createdAt as Record<string, unknown>).gte = new Date(dateFrom);
      if (dateTo) (where.createdAt as Record<string, unknown>).lte = new Date(dateTo);
    }

    const logs = await db.activityLog.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Get latest status per user for live status view (admin only)
    let liveStatuses: { userId: string; name: string; status: string; lastActivity: string; totalHoursToday: number }[] = [];
    if (auth.role === 'ADMIN') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const users = await db.user.findMany({
        where: { role: 'RECRUITER', isActive: true },
        select: {
          id: true,
          name: true,
          activityLogs: {
            where: { createdAt: { gte: today } },
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      liveStatuses = users.map((u) => {
        const latestLog = u.activityLogs[0];
        let currentStatus = 'OFFLINE';
        if (latestLog) {
          const minutesSince = (Date.now() - latestLog.createdAt.getTime()) / 60000;
          if (minutesSince <= 12) {
            currentStatus = latestLog.status;
          }
        }

        // Calculate total working hours today
        const allLogs = u.activityLogs;
        let totalMinutes = 0;
        const activePeriods: { start: Date; end?: Date }[] = [];

        for (let i = 0; i < allLogs.length; i++) {
          if (allLogs[i].status === 'ACTIVE' || allLogs[i].status === 'ON_CALL') {
            activePeriods.push({ start: allLogs[i].createdAt });
          } else if (activePeriods.length > 0 && !activePeriods[activePeriods.length - 1].end) {
            activePeriods[activePeriods.length - 1].end = allLogs[i].createdAt;
          }
        }

        for (const period of activePeriods) {
          const end = period.end || new Date();
          totalMinutes += (end.getTime() - period.start.getTime()) / 60000;
        }

        return {
          userId: u.id,
          name: u.name,
          status: currentStatus,
          lastActivity: latestLog?.createdAt?.toISOString() || '',
          totalHoursToday: Math.round(totalMinutes / 60 * 100) / 100,
        };
      });
    }

    return NextResponse.json({ logs, liveStatuses });
  } catch (error) {
    console.error('Activity log fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch activity logs' }, { status: 500 });
  }
}
