import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { authenticateRequest, requireSuperAdmin } from '@/lib/auth-middleware'
import { db } from '@/lib/db'

const VERSIONS_DIR = path.join(process.cwd(), 'upload', 'apk-versions')

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!requireSuperAdmin(auth)) return NextResponse.json({ error: 'Super Admin only' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Version ID is required' }, { status: 400 })

    // Try Prisma first, fall back to legacy JSON
    let target = await db.apkVersion.findUnique({ where: { id } })
    let fileName = target?.fileName || ''
    let versionName = target?.versionName || ''

    if (!target) {
      // Fallback to legacy JSON
      try {
        const raw = fs.readFileSync(path.join(process.cwd(), 'db', 'android-versions.json'), 'utf-8')
        const versions = JSON.parse(raw) as Array<{ id: string; version: string; fileName: string }>
        const legacy = versions.find(v => v.id === id)
        if (!legacy) return NextResponse.json({ error: 'Version not found' }, { status: 404 })
        fileName = legacy.fileName
        versionName = legacy.version
      } catch {
        return NextResponse.json({ error: 'Version not found' }, { status: 404 })
      }
    }

    const filePath = path.join(VERSIONS_DIR, fileName)
    try {
      await fs.access(filePath)
    } catch {
      return NextResponse.json({ error: 'APK file not found on disk' }, { status: 404 })
    }

    const buffer = await fs.readFile(filePath)
    const downloadName = `Akolta-Dialer-v${versionName}.apk`

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
