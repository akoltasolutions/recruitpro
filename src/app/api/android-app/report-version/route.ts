import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth-middleware'
import { db } from '@/lib/db'

/**
 * POST /api/android-app/report-version
 * Android app calls this after login to report its installed version.
 * Body: { versionName: "1.2.0", versionCode: 120 }
 */

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { versionName, versionCode } = body

    if (!versionName) {
      return NextResponse.json({ error: 'versionName is required' }, { status: 400 })
    }

    // Log as activity
    await db.activityLog.create({
      data: {
        userId: auth.userId,
        action: 'ANDROID_VERSION_REPORT',
        status: 'ACTIVE',
        metadata: JSON.stringify({ versionName, versionCode: versionCode || null }),
        organizationId: auth.organizationId,
        userAgent: request.headers.get('user-agent') || null,
      },
    })

    // Get latest published version for update check
    const latest = await db.apkVersion.findFirst({
      where: { status: 'PUBLISHED' },
      orderBy: { versionCode: 'desc' },
      select: {
        id: true,
        versionName: true,
        versionCode: true,
        releaseNotes: true,
      },
    })

    const reportedCode = versionCode || 0
    const updateAvailable = latest ? reportedCode < latest.versionCode : false

    return NextResponse.json({
      recorded: true,
      latestVersion: latest,
      updateAvailable,
    })
  } catch (error) {
    console.error('[AndroidApp ReportVersion] Error:', error)
    return NextResponse.json({ error: 'Failed to report version' }, { status: 500 })
  }
}
