import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth-middleware'
import { db } from '@/lib/db'
import { getPlatformSetting } from '@/lib/platform-settings'

/**
 * GET /api/android-app/version
 * Returns the version info the CURRENT user should see.
 * Priority: User override > Org override > Latest published
 */

function compareVersionNames(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0
    const nb = pb[i] || 0
    if (na !== nb) return na - nb
  }
  return 0
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let assignedVersion: { id: string; versionName: string; versionCode: number; size: number; checksum: string | null; releaseNotes: string | null; publishedAt: Date | null } | null = null
    let assignmentSource: 'LATEST' | 'USER_OVERRIDE' | 'ORG_OVERRIDE' = 'LATEST'

    // 1. Check user assignment
    const userAssignment = await db.apkUserAssignment.findUnique({
      where: { userId: auth.userId },
      include: { version: true },
    })
    if (userAssignment) {
      assignedVersion = userAssignment.version
      assignmentSource = 'USER_OVERRIDE'
    }

    // 2. Check org assignment
    if (!assignedVersion && auth.organizationId) {
      const orgAssignment = await db.apkOrgAssignment.findUnique({
        where: { organizationId: auth.organizationId },
        include: { version: true },
      })
      if (orgAssignment) {
        assignedVersion = orgAssignment.version
        assignmentSource = 'ORG_OVERRIDE'
      }
    }

    // 3. Fall back to latest PUBLISHED
    let latestVersion: { id: string; versionName: string; versionCode: number } | null = null
    if (!assignedVersion) {
      const published = await db.apkVersion.findFirst({
        where: { status: 'PUBLISHED' },
        orderBy: { versionCode: 'desc' },
      })
      if (published) {
        assignedVersion = published
        assignmentSource = 'LATEST'
      }
    }

    // Always get latest published for comparison
    latestVersion = await db.apkVersion.findFirst({
      where: { status: 'PUBLISHED' },
      orderBy: { versionCode: 'desc' },
      select: { id: true, versionName: true, versionCode: true },
    })

    const forceMinVersion = await getPlatformSetting('force_min_android_version')

    if (!assignedVersion) {
      return NextResponse.json({
        assignedVersion: null,
        latestVersion,
        forceMinVersion,
        assignmentSource: 'LATEST',
        updateAvailable: false,
      })
    }

    const updateAvailable = latestVersion
      ? assignedVersion.versionCode < latestVersion.versionCode
      : false

    return NextResponse.json({
      assignedVersion: {
        id: assignedVersion.id,
        versionName: assignedVersion.versionName,
        versionCode: assignedVersion.versionCode,
        size: assignedVersion.size,
        checksum: assignedVersion.checksum,
        releaseNotes: assignedVersion.releaseNotes,
        downloadUrl: '/api/android-app/download',
        publishedAt: assignedVersion.publishedAt?.toISOString() || null,
      },
      latestVersion,
      forceMinVersion,
      assignmentSource,
      updateAvailable,
    })
  } catch (error) {
    console.error('[AndroidApp Version] Error:', error)
    return NextResponse.json({ error: 'Failed to get version info' }, { status: 500 })
  }
}
