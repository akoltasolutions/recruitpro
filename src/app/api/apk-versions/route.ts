import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth-middleware'
import { db } from '@/lib/db'

/**
 * Public APK versions list API (any authenticated user).
 * Returns all non-archived versions (read-only).
 * Kept for backward compatibility.
 */

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Try Prisma first
    try {
      const versions = await db.apkVersion.findMany({
        where: { status: { not: 'ARCHIVED' } },
        orderBy: { versionCode: 'desc' },
        select: {
          id: true,
          versionName: true,
          versionCode: true,
          fileName: true,
          originalName: true,
          size: true,
          releaseNotes: true,
          status: true,
          downloadCount: true,
          createdAt: true,
          publishedAt: true,
        },
      })

      // Map to legacy shape for backward compat
      const published = versions.find(v => v.status === 'PUBLISHED')
      const mapped = versions.map(v => ({
        id: v.id,
        version: v.versionName,
        fileName: v.fileName,
        originalName: v.originalName,
        size: v.size,
        uploadedAt: v.createdAt.toISOString(),
        releaseNotes: v.releaseNotes || '',
        isActive: v.status === 'PUBLISHED',
      }))

      return NextResponse.json({ versions: mapped, publishedVersion: published?.versionName || null })
    } catch {
      // Prisma may not have the table yet, return empty
    }

    return NextResponse.json({ versions: [] })
  } catch (error) {
    console.error('[APK Versions GET] Error:', error)
    return NextResponse.json({ error: 'Failed to list versions' }, { status: 500 })
  }
}
