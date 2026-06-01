import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { authenticateRequest, requireSuperAdmin } from '@/lib/auth-middleware'

const SETTINGS_PATH = path.join(process.cwd(), 'db', 'platform-settings.json')

interface PlatformSettings {
  subscriptionEnforcement: boolean
  defaultMaxUsers: number
  defaultMaxNumbers: number
  defaultDailyUploadLimit: number
}

const defaultSettings: PlatformSettings = {
  subscriptionEnforcement: false,
  defaultMaxUsers: 10,
  defaultMaxNumbers: 5000,
  defaultDailyUploadLimit: 500,
}

async function ensureSettingsFile(): Promise<PlatformSettings> {
  try {
    const data = await fs.readFile(SETTINGS_PATH, 'utf-8')
    return JSON.parse(data) as PlatformSettings
  } catch {
    // File doesn't exist or is invalid, create with defaults
    const dir = path.dirname(SETTINGS_PATH)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(SETTINGS_PATH, JSON.stringify(defaultSettings, null, 2), 'utf-8')
    return defaultSettings
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request)
    if (!auth || !requireSuperAdmin(auth)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const settings = await ensureSettingsFile()
    return NextResponse.json(settings)
  } catch (error) {
    console.error('Failed to read platform settings:', error)
    return NextResponse.json({ error: 'Failed to read settings' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request)
    if (!auth || !requireSuperAdmin(auth)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json() as Partial<PlatformSettings>

    const existing = await ensureSettingsFile()
    const updated: PlatformSettings = {
      subscriptionEnforcement: body.subscriptionEnforcement ?? existing.subscriptionEnforcement,
      defaultMaxUsers: body.defaultMaxUsers ?? existing.defaultMaxUsers,
      defaultMaxNumbers: body.defaultMaxNumbers ?? existing.defaultMaxNumbers,
      defaultDailyUploadLimit: body.defaultDailyUploadLimit ?? existing.defaultDailyUploadLimit,
    }

    const dir = path.dirname(SETTINGS_PATH)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(SETTINGS_PATH, JSON.stringify(updated, null, 2), 'utf-8')

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Failed to save platform settings:', error)
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
  }
}
