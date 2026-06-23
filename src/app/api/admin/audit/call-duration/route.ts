import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { authenticateRequest, requireOrgAdmin } from '@/lib/auth-middleware'

/**
 * POST /api/admin/audit/call-duration
 * 
 * Audits and fixes historical CallRecord entries where callDuration is 0
 * but we can reconstruct the duration from ActivityLog entries.
 * 
 * Strategy:
 * 1. Find CallRecords with callDuration = 0 and callStatus = 'COMPLETED'
 * 2. For each, look for the most recent CALL_SESSION_START activity log
 *    for the same recruiter before the calledAt timestamp
 * 3. Calculate duration = calledAt - CALL_SESSION_START.createdAt
 * 4. Update the CallRecord with the computed duration
 * 
 * This is safe: it only fixes records with callDuration = 0 and never deletes data.
 * It can be run multiple times without side effects (idempotent).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!requireOrgAdmin(auth)) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

    // Scope to organization if applicable
    const where: Record<string, unknown> = {
      callDuration: 0,
      callStatus: 'COMPLETED',
    }
    if (auth.organizationId) {
      where.organizationId = auth.organizationId
    }

    // Find all completed call records with 0 duration
    const zeroDurationRecords = await db.callRecord.findMany({
      where,
      select: { id: true, recruiterId: true, calledAt: true },
      orderBy: { calledAt: 'asc' },
      take: 5000, // Process in batches
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
    const details: { id: string; recruiterId: string; computedSeconds: number }[] = []

    // Process each record
    for (const record of zeroDurationRecords) {
      try {
        // Find the most recent CALL_SESSION_START for this recruiter
        // that happened BEFORE this call record's calledAt time
        const sessionStart = await db.activityLog.findFirst({
          where: {
            userId: record.recruiterId,
            action: 'CALL_SESSION_START',
            createdAt: { lt: record.calledAt },
          },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        })

        if (!sessionStart) {
          noActivityLog++
          continue
        }

        // Calculate duration in seconds
        const computedSeconds = Math.round(
          (record.calledAt.getTime() - sessionStart.createdAt.getTime()) / 1000
        )

        // Only update if the computed duration is reasonable (between 1s and 4 hours)
        if (computedSeconds >= 1 && computedSeconds <= 14400) {
          await db.callRecord.update({
            where: { id: record.id },
            data: {
              callDuration: computedSeconds,
              callStartedAt: sessionStart.createdAt,
            },
          })
          fixed++
          details.push({
            id: record.id,
            recruiterId: record.recruiterId,
            computedSeconds,
          })
        } else {
          noActivityLog++
        }
      } catch {
        // Skip individual record errors
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
    return NextResponse.json(
      { error: 'Audit failed' },
      { status: 500 }
    )
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
      db.callRecord.count({ where: { ...where, callDuration: 0, callStatus: 'COMPLETED' } }),
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