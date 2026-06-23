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
 * 
 * FIX (2026-06-23):
 * - Added _sum for totalTalkTime (was missing — caused Total Call Time to always show 0)
 * - Added shortlisted and notConnected counts to aggregate response
 * - Added activeHours calculation from first/last call timestamps
 * - All stats are now computed server-side from ALL matching records
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
        const fromDate = startOfDay(new Date(dateFrom + 'T00:00:00'))
        calledAtFilter.gte = fromDate
      }
      if (dateTo) {
        const toDate = endOfDay(new Date(dateTo + 'T00:00:00'))
        calledAtFilter.lte = toDate
      }
      where.calledAt = calledAtFilter
    }

    // Fetch paginated call records, total count, and aggregate stats in parallel
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
        _sum: { callDuration: true },
        _avg: { callDuration: true },
        _max: { calledAt: true },
        _min: { calledAt: true },
      }),
    ])

    // ─── Disposition-based counts (shortlisted, notConnected) ───
    // Use a single groupBy query + in-memory classification for efficiency
    const dispositionGroups = await db.callRecord.groupBy({
      by: ['dispositionId'],
      where: { ...where, dispositionId: { not: null } },
      _count: true,
    })

    // Fetch all dispositions referenced in the results
    const dispIds = dispositionGroups.map(d => d.dispositionId).filter(Boolean) as string[]
    const dispositions = dispIds.length > 0
      ? await db.disposition.findMany({ where: { id: { in: dispIds } }, select: { id: true, type: true } })
      : []

    const dispTypeMap = new Map(dispositions.map(d => [d.id, d.type]))
    const NOT_CONNECT_KEYWORDS = ['switched off', 'invalid number', 'call failed', 'busy', 'not answered']

    let shortlisted = 0
    let notConnected = 0

    for (const group of dispositionGroups) {
      if (!group.dispositionId) continue
      const type = dispTypeMap.get(group.dispositionId)
      if (!type) continue
      if (type === 'SHORTLISTED') {
        shortlisted += group._count
      } else if (type === 'NOT_CONNECTED') {
        notConnected += group._count
      }
    }

    // Also check by disposition heading keywords for NOT_CONNECTED dispositions
    // that might not have the correct type set
    if (notConnected === 0) {
      const allDisps = dispIds.length > 0
        ? await db.disposition.findMany({ where: { id: { in: dispIds } }, select: { id: true, heading: true } })
        : []
      const headingMap = new Map(allDisps.map(d => [d.id, d.heading.toLowerCase()]))
      for (const group of dispositionGroups) {
        if (!group.dispositionId) continue
        const heading = headingMap.get(group.dispositionId)
        if (heading && NOT_CONNECT_KEYWORDS.some(kw => heading.includes(kw))) {
          notConnected += group._count
        }
      }
    }

    // ─── Active Hours: time span between first and last call ───
    const earliestAt = aggregateStats._min.calledAt
    const latestAt = aggregateStats._max.calledAt
    let activeHours = 0
    if (earliestAt && latestAt) {
      activeHours = Math.round((latestAt.getTime() - earliestAt.getTime()) / 60000) / 60
      if (activeHours < 0) activeHours = 0
    }

    // Fetch all active recruiters for the dropdown
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
        totalTalkTime: aggregateStats._sum.callDuration ?? 0,
        avgTalkTime: aggregateStats._avg.callDuration ?? 0,
        activeHours,
        shortlisted,
        notConnected,
        latestCallAt: aggregateStats._max.calledAt?.toISOString() ?? null,
        earliestCallAt: aggregateStats._min.calledAt?.toISOString() ?? null,
      },
      recruiters,
    })
  } catch (error) {
    console.error('[TeamPerformance] Failed to fetch team performance data:', error)
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