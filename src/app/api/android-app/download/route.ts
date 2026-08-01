import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { authenticateRequest } from '@/lib/auth-middleware'
import { db } from '@/lib/db'

const VERSIONS_DIR = path.join(process.cwd(), 'upload', 'apk-versions')

/**
 * GET /api/android-app/download
 * Resolves correct version for user, streams APK, records download.
 */

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Resolve version using same priority logic as /version
    let targetVersionId: string | null = null

    // 1. User assignment
    const userAssignment = await db.apkUserAssignment.findUnique({
      where: { userId: auth.userId },
      select: { versionId: true },
    })
    if (userAssignment) {
      targetVersionId = userAssignment.versionId
    }

    // 2. Org assignment
    if (!targetVersionId && auth.organizationId) {
      const orgAssignment = await db.apkOrgAssignment.findUnique({
        where: { organizationId: auth.organizationId },
        select: { versionId: true },
      })
      if (orgAssignment) {
        targetVersionId = orgAssignment.versionId
      }
    }

    // 3. Latest published
    if (!targetVersionId) {
      const published = await db.apkVersion.findFirst({
        where: { status: 'PUBLISHED' },
        orderBy: { versionCode: 'desc' },
        select: { id: true },
      })
      targetVersionId = published?.id || null
    }

    if (!targetVersionId) {
      return NextResponse.json({ error: 'No APK version available' }, { status: 404 })
    }

    const version = await db.apkVersion.findUnique({ where: { id: targetVersionId } })
    if (!version) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 })
    }

    const filePath = path.join(VERSIONS_DIR, version.fileName)
    try {
      await fs.access(filePath)
    } catch {
      return NextResponse.json({ error: 'APK file not found on disk' }, { status: 404 })
    }

    // Record download
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || null
    const ua = request.headers.get('user-agent') || null

    await Promise.all([
      db.apkDownload.create({
        data: {
          userId: auth.userId,
          versionId: version.id,
          organizationId: auth.organizationId,
          ipAddress: ip,
          userAgent: ua,
        },
      }),
      db.apkVersion.update({
        where: { id: version.id },
        data: { downloadCount: { increment: 1 } },
      }),
    ])

    const buffer = await fs.readFile(filePath)
    const downloadName = `Akolta-Dialer-v${version.versionName}.apk`

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Disposition': `attachment; filename="${downloadName}"`,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
  } catch (error) {
    console.error('[AndroidApp Download] Error:', error)
    return NextResponse.json({ error: 'Download failed' }, { status: 500 })
  }
}
