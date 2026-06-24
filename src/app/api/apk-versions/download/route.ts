import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { authenticateRequest } from '@/lib/auth-middleware'

/**
 * APK download by specific version ID (any authenticated user).
 * Downloads a specific APK version by its ID from the query string.
 */

const VERSIONS_DIR = path.join(process.cwd(), 'upload', 'apk-versions')
const META_FILE = path.join(process.cwd(), 'db', 'android-versions.json')

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

async function readMeta(): Promise<ApkVersion[]> {
  try {
    const raw = await fs.readFile(META_FILE, 'utf-8')
    return JSON.parse(raw) as ApkVersion[]
  } catch {
    return []
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Version ID is required' }, { status: 400 })
    }

    const versions = await readMeta()
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

    const fileBuffer = await fs.readFile(filePath)
    const stats = await fs.stat(filePath)
    const downloadName = `RecruitPro-v${target.version}.apk`

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Disposition': `attachment; filename="${downloadName}"`,
        'Content-Length': stats.size.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    })
  } catch (error) {
    console.error('[APK Versions Download] Error:', error)
    return NextResponse.json({ error: 'Download failed' }, { status: 500 })
  }
}