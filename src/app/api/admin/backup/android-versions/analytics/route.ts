import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, requireSuperAdmin } from '@/lib/auth-middleware'
import { db } from '@/lib/db'

/**
 * GET /api/admin/backup/android-versions/analytics
 * ?versionId=xxx — optional filter
 */

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!requireSuperAdmin(auth)) return NextResponse.json({ error: 'Super Admin only' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const versionId = searchParams.get('versionId')

    const where = versionId ? { versionId } : {}

    // Total downloads
    const totalDownloads = await db.apkDownload.count({ where })

    // This week
    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const thisWeekDownloads = await db.apkDownload.count({
      where: { ...where, createdAt: { gte: weekAgo } },
    })

    // Today
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayDownloads = await db.apkDownload.count({
      where: { ...where, createdAt: { gte: todayStart } },
    })

    // Downloads per version (grouped)
    const perVersion = await db.apkDownload.groupBy({
      by: ['versionId'],
      where,
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    })

    const versionIds = perVersion.map(p => p.versionId)
    const versionInfo = versionIds.length > 0
      ? await db.apkVersion.findMany({
          where: { id: { in: versionIds } },
          select: { id: true, versionName: true, versionCode: true },
        })
      : []
    const versionMap = new Map(versionInfo.map(v => [v.id, v]))

    const downloadsPerVersion = perVersion.map(p => ({
      versionId: p.versionId,
      versionName: versionMap.get(p.versionId)?.versionName || 'Unknown',
      versionCode: versionMap.get(p.versionId)?.versionCode || 0,
      count: p._count.id,
    }))

    // Recent 50 downloads with user info
    const recentDownloads = await db.apkDownload.findMany({
      where,
      take: 50,
      orderBy: { createdAt: 'desc' },
      include: {
        version: { select: { versionName: true, versionCode: true } },
      },
    })

    // Enrich recent downloads with user names
    const recentUserIds = [...new Set(recentDownloads.map(d => d.userId))]
    const recentUsers = recentUserIds.length > 0
      ? await db.user.findMany({
          where: { id: { in: recentUserIds } },
          select: { id: true, name: true, email: true, organizationId: true },
        })
      : []
    const recentUserMap = new Map(recentUsers.map(u => [u.id, u]))

    const enrichedRecent = recentDownloads.map(d => ({
      id: d.id,
      userId: d.userId,
      userName: recentUserMap.get(d.userId)?.name || 'Unknown',
      userEmail: recentUserMap.get(d.userId)?.email || '',
      organizationId: d.organizationId,
      versionName: d.version.versionName,
      versionCode: d.version.versionCode,
      ipAddress: d.ipAddress,
      userAgent: d.userAgent,
      createdAt: d.createdAt,
    }))

    return NextResponse.json({
      totalDownloads,
      thisWeekDownloads,
      todayDownloads,
      downloadsPerVersion,
      recentDownloads: enrichedRecent,
    })
  } catch (error) {
    console.error('[Analytics GET] Error:', error)
    return NextResponse.json({ error: 'Failed to get analytics' }, { status: 500 })
  }
}
