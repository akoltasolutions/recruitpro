import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { authenticateRequest } from '@/lib/auth-middleware'

const SETTINGS_PATH = path.join(process.cwd(), 'db', 'platform-settings.json')

interface PlatformSettings {
  subscriptionEnforcement: boolean
  defaultMaxUsers: number
  defaultMaxNumbers: number
  defaultDailyUploadLimit: number
  includeDispositionTime: boolean
}

const defaults: PlatformSettings = {
  subscriptionEnforcement: false,
  defaultMaxUsers: 10,
  defaultMaxNumbers: 5000,
  defaultDailyUploadLimit: 500,
  includeDispositionTime: true,
}

// GET /api/settings/call-timer-config
// Public endpoint for any authenticated user to read call timer configuration.
// Used by the AutoDialer to determine whether to include disposition time.
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
      const data = await fs.readFile(SETTINGS_PATH, 'utf-8')
      const settings = JSON.parse(data) as PlatformSettings
      return NextResponse.json({
        includeDispositionTime: settings.includeDispositionTime ?? true,
      })
    } catch {
      // Settings file doesn't exist — return defaults
      return NextResponse.json({
        includeDispositionTime: defaults.includeDispositionTime,
      })
    }
  } catch {
    return NextResponse.json({ error: 'Failed to read settings' }, { status: 500 })
  }
}
