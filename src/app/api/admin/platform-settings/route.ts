import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, requireSuperAdmin } from '@/lib/auth-middleware'
import { getPlatformSetting, setPlatformSetting, getAllPlatformSettings } from '@/lib/platform-settings'

/**
 * GET /api/admin/platform-settings — get all settings
 * POST /api/admin/platform-settings — set a single setting { key, value }
 */

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!requireSuperAdmin(auth)) return NextResponse.json({ error: 'Super Admin only' }, { status: 403 })

    const settings = await getAllPlatformSettings()
    return NextResponse.json(settings)
  } catch (error) {
    console.error('[PlatformSettings GET] Error:', error)
    return NextResponse.json({ error: 'Failed to get settings' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!requireSuperAdmin(auth)) return NextResponse.json({ error: 'Super Admin only' }, { status: 403 })

    const { key, value } = await request.json()
    if (!key) return NextResponse.json({ error: 'key is required' }, { status: 400 })

    await setPlatformSetting(key, value)
    return NextResponse.json({ success: true, key, value })
  } catch (error) {
    console.error('[PlatformSettings POST] Error:', error)
    return NextResponse.json({ error: 'Failed to save setting' }, { status: 500 })
  }
}
