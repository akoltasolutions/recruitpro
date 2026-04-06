import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth-middleware';

// Helper: Get today's start (midnight) in local time
function getTodayStart(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

// Helper: Calculate status info from today's ActivityLog entries
interface StatusInfo {
  status: string;
  loginTime: string | null;
  totalBreakDurationMs: number;
  totalActiveDurationMs: number;
  currentBreakStartTime: string | null;
}

async function calculateStatusInfo(userId: string): Promise<StatusInfo> {
  const todayStart = getTodayStart();

  const logs = await db.activityLog.findMany({
    where: {
      userId,
      createdAt: { gte: todayStart },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (logs.length === 0) {
    return {
      status: 'OFFLINE',
      loginTime: null,
      totalBreakDurationMs: 0,
      totalActiveDurationMs: 0,
      currentBreakStartTime: null,
    };
  }

  // Find login time — use the first activity log of the day (any action)
  const loginTime = logs.length > 0 ? logs[0].createdAt?.toISOString() || null : null;

  // Calculate total break duration from BREAK_START / BREAK_END pairs
  let totalBreakDurationMs = 0;
  let currentBreakStartTime: string | null = null;
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
  if (breakStart) {
    currentBreakStartTime = breakStart.toISOString();
    totalBreakDurationMs += Date.now() - breakStart.getTime();
  }

  // Calculate total idle duration from IDLE action pairs
  // An IDLE log starts the idle period; a LOGIN, ACTIVE, or BREAK_START ends it
  let totalIdleDurationMs = 0;
  let idleStart: Date | null = null;

  for (const log of logs) {
    if (log.action === 'IDLE') {
      idleStart = log.createdAt;
    } else if (
      (log.action === 'LOGIN' || log.action === 'ACTIVE' || log.action === 'BREAK_START') &&
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

  // Calculate total active duration:
  // From first activity to now, minus total break and idle durations
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
    if (latestLog.action === 'LOGIN') {
      status = 'LAUNCH';
    } else if (latestLog.action === 'BREAK_START') {
      status = 'BREAK';
    } else if (latestLog.action === 'BREAK_END' || latestLog.action === 'ACTIVE') {
      status = 'ACTIVE';
    } else if (latestLog.action === 'IDLE') {
      status = 'IDLE';
    } else if (latestLog.status === 'ON_BREAK') {
      status = 'BREAK';
    } else if (latestLog.status === 'ACTIVE') {
      status = 'ACTIVE';
    } else if (latestLog.status === 'IDLE') {
      status = 'IDLE';
    }
  }

  return {
    status,
    loginTime,
    totalBreakDurationMs,
    totalActiveDurationMs,
    currentBreakStartTime,
  };
}

// GET /api/user-status — Get current user's status and shift info
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const statusInfo = await calculateStatusInfo(auth.userId);

    return NextResponse.json({
      ...statusInfo,
      userId: auth.userId,
    });
  } catch (error) {
    console.error('User status fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch user status' }, { status: 500 });
  }
}

// POST /api/user-status — Update user status (IDLE, LAUNCH, BREAK, ACTIVE)
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { status } = body;

    const validStatuses = ['IDLE', 'LAUNCH', 'BREAK', 'ACTIVE'];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be one of: IDLE, LAUNCH, BREAK, ACTIVE' },
        { status: 400 }
      );
    }

    // Get current status info to check transitions
    const currentInfo = await calculateStatusInfo(auth.userId);

    let action: string;
    let logStatus: string;

    switch (status) {
      case 'IDLE':
        // If on break, end the break first
        if (currentInfo.status === 'BREAK') {
          await db.activityLog.create({
            data: {
              userId: auth.userId,
              action: 'BREAK_END',
              status: 'IDLE',
              userAgent: request.headers.get('user-agent') || null,
            },
          });
        }
        action = 'IDLE';
        logStatus = 'IDLE';
        break;
      case 'LAUNCH':
        action = 'LOGIN';
        logStatus = 'ACTIVE';
        break;
      case 'BREAK':
        // Prevent going to BREAK if already on break
        if (currentInfo.status === 'BREAK') {
          return NextResponse.json({ error: 'Already on break' }, { status: 400 });
        }
        action = 'BREAK_START';
        logStatus = 'ON_BREAK';
        break;
      case 'ACTIVE':
        // When switching to ACTIVE, if was on break, create BREAK_END first
        if (currentInfo.status === 'BREAK') {
          await db.activityLog.create({
            data: {
              userId: auth.userId,
              action: 'BREAK_END',
              status: 'ACTIVE',
              userAgent: request.headers.get('user-agent') || null,
            },
          });
        }
        action = 'ACTIVE';
        logStatus = 'ACTIVE';
        break;
      default:
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    // Create the ActivityLog entry
    const activityLog = await db.activityLog.create({
      data: {
        userId: auth.userId,
        action,
        status: logStatus,
        userAgent: request.headers.get('user-agent') || null,
      },
    });

    // Recalculate status info after update
    const updatedInfo = await calculateStatusInfo(auth.userId);

    return NextResponse.json({
      message: `Status updated to ${status}`,
      activityLog,
      status: updatedInfo.status,
      loginTime: updatedInfo.loginTime,
      totalBreakDurationMs: updatedInfo.totalBreakDurationMs,
      totalActiveDurationMs: updatedInfo.totalActiveDurationMs,
      currentBreakStartTime: updatedInfo.currentBreakStartTime,
    });
  } catch (error) {
    console.error('User status update error:', error);
    return NextResponse.json({ error: 'Failed to update user status' }, { status: 500 });
  }
}
