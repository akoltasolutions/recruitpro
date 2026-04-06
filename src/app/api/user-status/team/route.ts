import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, requireAdmin } from '@/lib/auth-middleware';

// Helper: Get today's start (midnight) in local time
function getTodayStart(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

// Helper: Calculate status info for a given user from today's ActivityLog entries
interface TeamMemberStatus {
  userId: string;
  name: string;
  status: string;
  loginTime: string | null;
  breakStartTime: string | null;
  totalBreakDurationToday: number;
  totalActiveDurationToday: number;
  lastActivity: string | null;
}

function calculateMemberStatus(
  logs: { action: string; status: string; createdAt: Date }[]
): Omit<TeamMemberStatus, 'userId' | 'name'> {
  if (logs.length === 0) {
    return {
      status: 'OFFLINE',
      loginTime: null,
      breakStartTime: null,
      totalBreakDurationToday: 0,
      totalActiveDurationToday: 0,
      lastActivity: null,
    };
  }

  // Find login time — use the first activity log of the day (any action)
  const loginTime = logs.length > 0 ? logs[0].createdAt?.toISOString() || null : null;

  // Calculate total break duration from BREAK_START / BREAK_END pairs
  let totalBreakDurationMs = 0;
  let breakStartTime: string | null = null;
  let breakStart: Date | null = null;

  for (const log of logs) {
    if (log.action === 'BREAK_START') {
      breakStart = log.createdAt;
    } else if (log.action === 'BREAK_END' && breakStart) {
      totalBreakDurationMs += log.createdAt.getTime() - breakStart.getTime();
      breakStart = null;
    }
  }

  // If still on break, include current break duration
  // But cap orphaned breaks at 2 hours (session may have ended without BREAK_END)
  if (breakStart) {
    const breakElapsed = Date.now() - breakStart.getTime();
    const maxBreakMs = 2 * 60 * 60 * 1000; // 2 hours cap
    if (breakElapsed > maxBreakMs) {
      totalBreakDurationMs += maxBreakMs;
      breakStart = null;
      breakStartTime = null;
    } else {
      breakStartTime = breakStart.toISOString();
      totalBreakDurationMs += breakElapsed;
    }
  }

  // Calculate total idle duration from IDLE action pairs
  // An IDLE or LOGIN log starts the idle period; LAUNCH, ACTIVE, or BREAK_START ends it
  let totalIdleDurationMs = 0;
  let idleStart: Date | null = null;

  for (const log of logs) {
    if (log.action === 'IDLE' || log.action === 'LOGIN') {
      idleStart = log.createdAt;
    } else if (
      (log.action === 'LAUNCH' || log.action === 'ACTIVE' || log.action === 'BREAK_START') &&
      idleStart
    ) {
      totalIdleDurationMs += log.createdAt.getTime() - idleStart.getTime();
      idleStart = null;
    }
  }

  // If currently idle, include current idle duration
  if (idleStart) {
    totalIdleDurationMs += Date.now() - idleStart.getTime();
  }

  // Calculate total active duration: from first activity to now, minus break and idle
  let totalActiveDurationMs = 0;
  if (loginTime) {
    const loginDate = new Date(loginTime);
    totalActiveDurationMs = Date.now() - loginDate.getTime() - totalBreakDurationMs - totalIdleDurationMs;
    if (totalActiveDurationMs < 0) totalActiveDurationMs = 0;
  }

  // Determine current status from the most recent log entry
  const latestLog = logs[logs.length - 1];
  let status = 'OFFLINE';

  if (latestLog) {
    if (latestLog.action === 'LAUNCH') {
      status = 'LAUNCH';
    } else if (latestLog.action === 'LOGIN') {
      // Old login entries treated as IDLE (default state)
      status = 'IDLE';
    } else if (latestLog.action === 'BREAK_START') {
      status = 'ON_BREAK';
    } else if (latestLog.action === 'BREAK_END' || latestLog.action === 'ACTIVE') {
      status = 'ACTIVE';
    } else if (latestLog.action === 'IDLE') {
      status = 'IDLE';
    } else if (latestLog.status === 'ON_BREAK') {
      status = 'ON_BREAK';
    } else if (latestLog.status === 'ACTIVE') {
      status = 'ACTIVE';
    } else if (latestLog.status === 'IDLE') {
      status = 'IDLE';
    }
  }

  // Last activity is from the most recent log
  const lastActivity = latestLog?.createdAt?.toISOString() || null;

  return {
    status,
    loginTime,
    breakStartTime,
    totalBreakDurationToday: totalBreakDurationMs,
    totalActiveDurationToday: totalActiveDurationMs,
    lastActivity,
  };
}

// GET /api/user-status/team — Get all team members' statuses (admin only)
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!requireAdmin(auth.role)) {
      return NextResponse.json({ error: 'Access denied. Admin only.' }, { status: 403 });
    }

    const todayStart = getTodayStart();

    // Get all active users (recruiters + admins)
    const users = await db.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        activityLogs: {
          where: { createdAt: { gte: todayStart } },
          orderBy: { createdAt: 'asc' },
          select: {
            action: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    const teamStatuses: TeamMemberStatus[] = users.map((user) => {
      const statusInfo = calculateMemberStatus(user.activityLogs);
      return {
        userId: user.id,
        name: user.name,
        ...statusInfo,
      };
    });

    return NextResponse.json({ team: teamStatuses });
  } catch (error) {
    console.error('Team status fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch team statuses' }, { status: 500 });
  }
}
