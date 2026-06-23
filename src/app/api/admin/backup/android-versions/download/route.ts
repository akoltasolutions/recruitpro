import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { authenticateRequest, requireSuperAdmin } from '@/lib/auth-middleware'

/**
 * Android APK Version Download API
 * 
 * GET /api/admin/backup/android-versions/download?id=xxx
 * Downloads a specific APK version file.
 */

const VERSIONS_DIR = path.join(process.cwd(), 'upload', 'apk-versions')

interface ApkVersion {
  id: string
  version: string
  fileName: string
  originalName: string
  size: number
  uploadedAt: string
  releaseNotes: string
  isActive: boolean
}

function readMeta(): ApkVersion[] {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), 'db', 'android-versions.json'), 'utf-8')
    return JSON.parse(raw) as ApkVersion[]
  } catch {
    return []
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!requireSuperAdmin(auth)) return NextResponse.json({ error: 'Super Admin only' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Version ID is required' }, { status: 400 })
    }

    const versions = readMeta()
    const target = versions.find(v => v.id === id)
    if (!target) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 })
    }

    const filePath = path.join(VERSIONS_DIR, target.fileName)
    try {
      await fs.access(filePath)
    } catch {
      return NextResponse.json({ error: 'APK file not found on disk' }, { status: 404 })
    }

    const buffer = await fs.readFile(filePath)
    const downloadName = `RecruitPro-v${target.version}.apk`

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Disposition': `attachment; filename="${downloadName}"`,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    console.error('[AndroidVersions Download] Error:', error)
    return NextResponse.json({ error: 'Download failed' }, { status: 500 })
  }
}