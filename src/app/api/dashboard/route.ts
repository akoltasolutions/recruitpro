import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { format, subDays, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { authenticateRequest, requireAdmin } from '@/lib/auth-middleware';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth || !requireAdmin(auth.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'daily';
    const customFrom = searchParams.get('from');
    const customTo = searchParams.get('to');

    let dateFrom: Date;
    let dateTo: Date;
    const now = new Date();

    switch (period) {
      case 'daily':
        dateFrom = startOfDay(now);
        dateTo = endOfDay(now);
        break;
      case 'weekly':
        dateFrom = startOfWeek(now);
        dateTo = endOfWeek(now);
        break;
      case 'monthly':
        dateFrom = startOfMonth(now);
        dateTo = endOfMonth(now);
        break;
      case 'custom':
        if (!customFrom || !customTo) {
          return NextResponse.json({ error: 'Custom date range requires from and to' }, { status: 400 });
        }
        dateFrom = new Date(customFrom);
        dateTo = new Date(customTo);
        // Validate that dates are valid
        if (isNaN(dateFrom.getTime()) || isNaN(dateTo.getTime())) {
          return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
        }
        if (dateFrom > dateTo) {
          return NextResponse.json({ error: 'Start date must be before end date' }, { status: 400 });
        }
        break;
      default:
        dateFrom = startOfDay(now);
        dateTo = endOfDay(now);
    }

    // Total calls
    const totalCalls = await db.callRecord.count({
      where: { calledAt: { gte: dateFrom, lte: dateTo } },
    });

    // Total call duration
    const durationResult = await db.callRecord.aggregate({
      where: { calledAt: { gte: dateFrom, lte: dateTo } },
      _sum: { callDuration: true },
    });
    const totalCallDuration = durationResult._sum.callDuration || 0;

    // Average call time
    const avgCallTime = totalCalls > 0 ? Math.round(totalCallDuration / totalCalls) : 0;

    // Disposition counts
    const dispositionCounts = await db.callRecord.groupBy({
      by: ['dispositionId'],
      where: { calledAt: { gte: dateFrom, lte: dateTo }, dispositionId: { not: null } },
      _count: true,
    });

    const dispositions = await db.disposition.findMany({
      where: { id: { in: dispositionCounts.map(d => d.dispositionId!) } },
    });

    const shortlistedCount = dispositionCounts
      .filter(d => {
        const disp = dispositions.find(dis => dis.id === d.dispositionId);
        return disp?.type === 'SHORTLISTED';
      })
      .reduce((sum, d) => sum + d._count, 0);

    const notConnectedCount = dispositionCounts
      .filter(d => {
        const disp = dispositions.find(dis => dis.id === d.dispositionId);
        return disp?.type === 'NOT_CONNECTED';
      })
      .reduce((sum, d) => sum + d._count, 0);

    // WhatsApp sent count
    const whatsappCount = await db.whatsAppMessage.count({
      where: { sentAt: { gte: dateFrom, lte: dateTo }, status: 'SENT' },
    });

    // Recruiter-wise analytics (include disposition info for shortlisted count per recruiter)
    const recruiterStats = await db.user.findMany({
      where: { role: 'RECRUITER', isActive: true },
      select: {
        id: true, name: true,
        callRecords: {
          where: { calledAt: { gte: dateFrom, lte: dateTo } },
          select: { callDuration: true, calledAt: true, dispositionId: true },
        },
      },
    });

    const recruiterAnalytics = recruiterStats.map(r => {
      const calls = r.callRecords.length;
      const duration = r.callRecords.reduce((sum, c) => sum + c.callDuration, 0);
      const avgTime = calls > 0 ? Math.round(duration / calls) : 0;

      // Calculate shortlisted count for this recruiter
      const shortlistedIds = r.callRecords
        .filter(c => c.dispositionId && dispositions.find(d => d.id === c.dispositionId && d.type === 'SHORTLISTED'))
        .length;

      // Calculate active time (time between first and last call)
      let activeTime = 0;
      if (r.callRecords.length > 1) {
        const times = r.callRecords.map(c => c.calledAt.getTime()).sort();
        activeTime = Math.round((times[times.length - 1] - times[0]) / 60000); // minutes
      } else if (r.callRecords.length === 1) {
        activeTime = 5; // minimum 5 minutes for a single call
      }
      const productivity = activeTime > 0 ? Math.round((calls / activeTime) * 100) / 100 : 0;

      return {
        id: r.id,
        name: r.name,
        totalCalls: calls,
        totalDuration: duration,
        avgCallTime: avgTime,
        activeTime,
        productivity,
        shortlistedCount: shortlistedIds,
      };
    });

    // Daily call trend — scoped to selected period range
    let dailyData: { date: string; calls: number }[] = [];
    const totalDays = Math.max(1, Math.round((dateTo.getTime() - dateFrom.getTime()) / (1000 * 60 * 60 * 24)));
    const chartDays = Math.min(totalDays, 30);

    for (let i = chartDays - 1; i >= 0; i--) {
      const day = new Date(dateTo.getTime() - i * 24 * 60 * 60 * 1000);
      const dayStart = startOfDay(day);
      const dayEnd = endOfDay(day);
      const count = await db.callRecord.count({
        where: { calledAt: { gte: dayStart, lte: dayEnd } },
      });
      dailyData.push({
        date: format(day, 'MMM dd'),
        calls: count,
      });
    }

    // Shortlisted by client
    const shortlistedRecords = await db.callRecord.findMany({
      where: {
        calledAt: { gte: dateFrom, lte: dateTo },
        disposition: { type: 'SHORTLISTED' },
        clientId: { not: null },
      },
      include: { client: { select: { name: true } } },
    });

    const shortlistedByClient: Record<string, number> = {};
    shortlistedRecords.forEach(r => {
      const clientName = r.client?.name || 'Unknown';
      shortlistedByClient[clientName] = (shortlistedByClient[clientName] || 0) + 1;
    });

    // Leaderboard
    const leaderboard = [...recruiterAnalytics].sort((a, b) => b.totalCalls - a.totalCalls);

    return NextResponse.json({
      totalCalls,
      totalCallDuration,
      avgCallTime,
      shortlistedCount,
      notConnectedCount,
      whatsappCount,
      dailyData,
      shortlistedByClient,
      recruiterAnalytics,
      leaderboard,
      period: {
        from: dateFrom.toISOString(),
        to: dateTo.toISOString(),
      },
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
