import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, requireSuperAdmin } from '@/lib/auth-middleware'
import { db } from '@/lib/db'

/**
 * GET  — List all user and org assignments
 * POST — Create assignment: { type: 'user' | 'org', targetId: string, versionId: string }
 * DELETE — Remove assignment: ?type=user&targetId=xxx or ?type=org&targetId=xxx
 */

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!requireSuperAdmin(auth)) return NextResponse.json({ error: 'Super Admin only' }, { status: 403 })

    const [userAssignments, orgAssignments] = await Promise.all([
      db.apkUserAssignment.findMany({
        include: {
          version: { select: { id: true, versionName: true, versionCode: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.apkOrgAssignment.findMany({
        include: {
          version: { select: { id: true, versionName: true, versionCode: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    // Enrich with user/org names
    const userIds = userAssignments.map(a => a.userId)
    const orgIds = orgAssignments.map(a => a.organizationId)

    const [users, orgs] = await Promise.all([
      userIds.length > 0
        ? db.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, email: true, organizationId: true },
          })
        : [],
      orgIds.length > 0
        ? db.organization.findMany({
            where: { id: { in: orgIds } },
            select: { id: true, name: true, email: true },
          })
        : [],
    ])

    const userMap = new Map(users.map(u => [u.id, u]))
    const orgMap = new Map(orgs.map(o => [o.id, o]))

    const enrichedUsers = userAssignments.map(a => ({
      ...a,
      user: userMap.get(a.userId) || null,
    }))

    const enrichedOrgs = orgAssignments.map(a => ({
      ...a,
      organization: orgMap.get(a.organizationId) || null,
    }))

    return NextResponse.json({ userAssignments: enrichedUsers, orgAssignments: enrichedOrgs })
  } catch (error) {
    console.error('[Assignments GET] Error:', error)
    return NextResponse.json({ error: 'Failed to list assignments' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!requireSuperAdmin(auth)) return NextResponse.json({ error: 'Super Admin only' }, { status: 403 })

    const body = await request.json()
    const { type, targetId, versionId } = body

    if (!type || !targetId || !versionId) {
      return NextResponse.json({ error: 'type, targetId, and versionId are required' }, { status: 400 })
    }
    if (type !== 'user' && type !== 'org') {
      return NextResponse.json({ error: 'type must be "user" or "org"' }, { status: 400 })
    }

    // Verify version exists
    const version = await db.apkVersion.findUnique({ where: { id: versionId } })
    if (!version) return NextResponse.json({ error: 'Version not found' }, { status: 404 })

    if (type === 'user') {
      // Upsert
      const assignment = await db.apkUserAssignment.upsert({
        where: { userId: targetId },
        update: { versionId, assignedBy: auth.userId },
        create: { userId: targetId, versionId, assignedBy: auth.userId },
        include: { version: { select: { versionName: true, versionCode: true } } },
      })
      return NextResponse.json({ success: true, assignment }, { status: 201 })
    } else {
      const assignment = await db.apkOrgAssignment.upsert({
        where: { organizationId: targetId },
        update: { versionId, assignedBy: auth.userId },
        create: { organizationId: targetId, versionId, assignedBy: auth.userId },
        include: { version: { select: { versionName: true, versionCode: true } } },
      })
      return NextResponse.json({ success: true, assignment }, { status: 201 })
    }
  } catch (error) {
    console.error('[Assignments POST] Error:', error)
    return NextResponse.json({ error: 'Failed to create assignment' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!requireSuperAdmin(auth)) return NextResponse.json({ error: 'Super Admin only' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const targetId = searchParams.get('targetId')

    if (!type || !targetId) {
      return NextResponse.json({ error: 'type and targetId query params are required' }, { status: 400 })
    }

    if (type === 'user') {
      await db.apkUserAssignment.deleteMany({ where: { userId: targetId } })
    } else if (type === 'org') {
      await db.apkOrgAssignment.deleteMany({ where: { organizationId: targetId } })
    } else {
      return NextResponse.json({ error: 'type must be "user" or "org"' }, { status: 400 })
    }

    return NextResponse.json({ deleted: true })
  } catch (error) {
    console.error('[Assignments DELETE] Error:', error)
    return NextResponse.json({ error: 'Failed to remove assignment' }, { status: 500 })
  }
}
