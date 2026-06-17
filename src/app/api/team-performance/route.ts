import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { authenticateRequest, requireOrgAdmin } from '@/lib/auth-middleware'
import { startOfDay, endOfDay } from 'date-fns'

/**
 * GET /api/team-performance
 * 
 * Fetches call records and recruiter stats for the admin's Team Performance page.
 * 
 * CRITICAL FIX (2026-06-02):
 * - Uses startOfDay/endOfDay from date-fns instead of raw new Date()
 *   Previously, dateTo was parsed as midnight UTC, causing all calls made
 *   during the day (in IST timezone) to be excluded from results.
 * - Added organizationId scoping for multi-tenant data isolation.
 * - Added comprehensive error logging for call-tracking failures.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!requireOrgAdmin(auth)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const recruiterId = searchParams.get('recruiterId')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)))

    // Build where clause with filters
    const where: Record<string, unknown> = {}

    // Organization scoping — ensure multi-tenant isolation
    if (auth.organizationId) {
      where.organizationId = auth.organizationId
    }

    if (recruiterId) {
      where.recruiterId = recruiterId
    }

    if (dateFrom || dateTo) {
      const calledAtFilter: Record<string, unknown> = {}
      if (dateFrom) {
        // CRITICAL: Use startOfDay to get midnight of the date in LOCAL timezone,
        // not midnight UTC. Previously used new Date(dateFrom) which parses as UTC.
        const fromDate = startOfDay(new Date(dateFrom + 'T00:00:00'))
        calledAtFilter.gte = fromDate
      }
      if (dateTo) {
        // CRITICAL: Use endOfDay to get 23:59:59.999 of the date in LOCAL timezone.
        // Previously used new Date(dateTo) which is midnight UTC, excluding all calls
        // made during the day in IST (UTC+5:30).
        const toDate = endOfDay(new Date(dateTo + 'T00:00:00'))
        calledAtFilter.lte = toDate
      }
      where.calledAt = calledAtFilter
    }

    // Fetch paginated call records, total count, and aggregate stats (from ALL matching records) in parallel
    const [callRecords, totalCount, aggregateStats] = await Promise.all([
      db.callRecord.findMany({
        where,
        include: {
          candidate: {
            select: {
              name: true,
              phone: true,
              role: true,
              location: true,
            },
          },
          recruiter: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          disposition: {
            select: {
              id: true,
              heading: true,
              type: true,
            },
          },
          client: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          calledAt: 'desc',
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.callRecord.count({ where }),
      // Aggregate stats computed from ALL matching records (not just current page)
      db.callRecord.aggregate({
        where,
        _count: true,
        _avg: { callDuration: true },
        _max: { calledAt: true },
        _min: { calledAt: true },
      }),
    ])

    // Fetch all active recruiters for the dropdown
    // Include both USER and RECRUITER roles (system may use either)
    const recruiterWhere: Record<string, unknown> = { isActive: true }
    if (auth.organizationId) {
      recruiterWhere.organizationId = auth.organizationId
    }
    const recruiters = await db.user.findMany({
      where: {
        ...recruiterWhere,
        role: { in: ['USER', 'RECRUITER'] },
      },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({
      callRecords,
      totalCount,
      page,
      totalPages: Math.ceil(totalCount / limit),
      aggregateStats: {
        totalCalls: aggregateStats._count,
        avgTalkTime: aggregateStats._avg.callDuration ?? 0,
        latestCallAt: aggregateStats._max.calledAt?.toISOString() ?? null,
        earliestCallAt: aggregateStats._min.calledAt?.toISOString() ?? null,
      },
      recruiters,
    })
  } catch (error) {
    console.error('[TeamPerformance] Failed to fetch team performance data:', error)
    // Log full error details for debugging
    if (error instanceof Error) {
      console.error('[TeamPerformance] Error name:', error.name)
      console.error('[TeamPerformance] Error message:', error.message)
      console.error('[TeamPerformance] Error stack:', error.stack)
    }
    return NextResponse.json(
      { error: 'Failed to fetch team performance data' },
      { status: 500 }
    )
  }
}
