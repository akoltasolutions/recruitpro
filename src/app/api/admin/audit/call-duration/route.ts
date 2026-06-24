import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { authenticateRequest, requireOrgAdmin } from '@/lib/auth-middleware'

/**
 * POST /api/admin/audit/call-duration
 *
 * Audits and fixes historical CallRecord entries where callDuration is 0.
 *
 * 3-tier strategy + minimum enforcement:
 * 1. Check if callStartedAt exists on the record
 * 2. Find CALL_SESSION_START activity log within 4h before calledAt
 * 3. If record has a disposition, enforce minimum 1 second
 *
 * Safe: only fixes records with callDuration = 0, never deletes data, idempotent.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!requireOrgAdmin(auth)) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    const where: Record<string, unknown> = {
      callDuration: 0,
      callStatus: { in: ['COMPLETED', 'SCHEDULED'] },
    }
    if (auth.organizationId) {
      where.organizationId = auth.organizationId
    }

    const zeroDurationRecords = await db.callRecord.findMany({
      where,
      select: { id: true, recruiterId: true, calledAt: true, callStartedAt: true, dispositionId: true },
      orderBy: { calledAt: 'asc' },
      take: 5000,
    })

    if (zeroDurationRecords.length === 0) {
      return NextResponse.json({
        message: 'No records with zero call duration found',
        totalChecked: 0,
        fixed: 0,
        alreadyCorrect: 0,
        noActivityLog: 0,
        details: [],
      })
    }

    let fixed = 0
    let noActivityLog = 0
    const details: { id: string; recruiterId: string; computedSeconds: number; source: string }[] = []

    for (const record of zeroDurationRecords) {
      try {
        let computedSeconds = 0
        let source = 'none'

        // Tier 1: callStartedAt exists on record
        if (record.callStartedAt) {
          computedSeconds = Math.round((record.calledAt.getTime() - record.callStartedAt.getTime()) / 1000)
          source = 'callStartedAt'
        }

        // Tier 2: Find CALL_SESSION_START activity log
        if (computedSeconds <= 0) {
          const sessionStart = await db.activityLog.findFirst({
            where: {
              userId: record.recruiterId,
              action: 'CALL_SESSION_START',
              createdAt: {
                lt: record.calledAt,
                gte: new Date(record.calledAt.getTime() - 4 * 60 * 60 * 1000),
              },
            },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true },
          })

          if (sessionStart) {
            computedSeconds = Math.round((record.calledAt.getTime() - sessionStart.createdAt.getTime()) / 1000)
            source = 'activityLog'
          }
        }

        // Tier 3: Has disposition = real call = minimum 1 second
        if (computedSeconds <= 0 && record.dispositionId) {
          computedSeconds = 1
          source = 'minimum_enforced'
        }

        if (computedSeconds >= 1 && computedSeconds <= 14400) {
          const updateData: Record<string, unknown> = { callDuration: computedSeconds }

          if (source === 'activityLog') {
            const sessionStart = await db.activityLog.findFirst({
              where: {
                userId: record.recruiterId,
                action: 'CALL_SESSION_START',
                createdAt: {
                  lt: record.calledAt,
                  gte: new Date(record.calledAt.getTime() - 4 * 60 * 60 * 1000),
                },
              },
              orderBy: { createdAt: 'desc' },
              select: { createdAt: true },
            })
            if (sessionStart) updateData.callStartedAt = sessionStart.createdAt
          }

          await db.callRecord.update({ where: { id: record.id }, data: updateData })
          fixed++
          details.push({ id: record.id, recruiterId: record.recruiterId, computedSeconds, source })
        } else {
          noActivityLog++
        }
      } catch {
        noActivityLog++
      }
    }

    return NextResponse.json({
      message: `Audit complete. Fixed ${fixed} of ${zeroDurationRecords.length} records.`,
      totalChecked: zeroDurationRecords.length,
      fixed,
      alreadyCorrect: 0,
      noActivityLog,
      details,
    })
  } catch (error) {
    console.error('[Audit CallDuration] Error:', error)
    return NextResponse.json({ error: 'Audit failed' }, { status: 500 })
  }
}

/**
 * GET /api/admin/audit/call-duration
 * Returns a summary of call duration health without making any changes.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!requireOrgAdmin(auth)) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    const where: Record<string, unknown> = {}
    if (auth.organizationId) {
      where.organizationId = auth.organizationId
    }

    const [total, withDuration, zeroDuration, avgResult] = await Promise.all([
      db.callRecord.count({ where }),
      db.callRecord.count({ where: { ...where, callDuration: { gt: 0 } } }),
      db.callRecord.count({ where: { ...where, callDuration: 0, callStatus: { in: ['COMPLETED', 'SCHEDULED'] } } }),
      db.callRecord.aggregate({
        where: { ...where, callDuration: { gt: 0 } },
        _avg: { callDuration: true },
        _sum: { callDuration: true },
      }),
    ])

    return NextResponse.json({
      totalRecords: total,
      recordsWithDuration: withDuration,
      recordsWithZeroDuration: zeroDuration,
      averageDuration: avgResult._avg.callDuration ?? 0,
      totalDuration: avgResult._sum.callDuration ?? 0,
      healthPercentage: total > 0 ? Math.round((withDuration / total) * 100) : 100,
    })
  } catch (error) {
    console.error('[Audit CallDuration GET] Error:', error)
    return NextResponse.json({ error: 'Failed to get audit summary' }, { status: 500 })
  }
}