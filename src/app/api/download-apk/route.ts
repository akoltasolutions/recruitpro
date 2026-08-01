import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { db } from '@/lib/db'

const UPLOAD_DIR = path.join(process.cwd(), 'upload')
const PUBLIC_DIR = path.join(process.cwd(), 'public')
const APK_VERSIONS_DIR = path.join(UPLOAD_DIR, 'apk-versions')
const META_FILE = path.join(process.cwd(), 'db', 'android-versions.json')

interface LegacyApkVersion {
  id: string
  version: string
  fileName: string
  originalName: string
  size: number
  uploadedAt: string
  releaseNotes: string
  isActive: boolean
}

async function getVersionsMeta(): Promise<LegacyApkVersion[]> {
  try {
    const raw = await fs.readFile(META_FILE, 'utf-8')
    return JSON.parse(raw) as LegacyApkVersion[]
  } catch {
    return []
  }
}

/**
 * Find the APK file across multiple locations (backward compat for login page).
 * Priority: Prisma PUBLISHED → upload/apk-versions/{active} → upload/recruitpro.apk → public/RecruitPro.apk
 */
async function findApkPath(): Promise<{ path: string | null; activeVersion: LegacyApkVersion | null; dbVersion?: { versionName: string } | null }> {
  // 1. Try Prisma for latest PUBLISHED
  try {
    const published = await db.apkVersion.findFirst({
      where: { status: 'PUBLISHED' },
      orderBy: { versionCode: 'desc' },
    })
    if (published) {
      const versionPath = path.join(APK_VERSIONS_DIR, published.fileName)
      try {
        await fs.access(versionPath)
        return { path: versionPath, activeVersion: null, dbVersion: { versionName: published.versionName } }
      } catch { /* file missing, fall through */ }
    }
  } catch { /* prisma not available, fall through */ }

  // 2. Legacy JSON metadata
  try {
    const versions = await getVersionsMeta()
    const active = versions.find(v => v.isActive)
    if (active) {
      const versionPath = path.join(APK_VERSIONS_DIR, active.fileName)
      try {
        await fs.access(versionPath)
        return { path: versionPath, activeVersion: active }
      } catch { /* fall through */ }
    }
  } catch { /* fall through */ }

  // 3. Legacy disk locations
  const legacyPaths = [
    path.join(UPLOAD_DIR, 'recruitpro.apk'),
    path.join(PUBLIC_DIR, 'RecruitPro.apk'),
  ]
  for (const loc of legacyPaths) {
    try {
      await fs.access(loc)
      return { path: loc, activeVersion: null }
    } catch { /* not found */ }
  }

  return { path: null, activeVersion: null }
}

export async function GET(request: NextRequest) {
  try {
    const { path: filePath, activeVersion, dbVersion } = await findApkPath()
    const fileExists = !!filePath

    // JSON metadata endpoint (used by frontend)
    if (request.nextUrl.searchParams.get('info') === '1') {
      return NextResponse.json({
        available: fileExists,
        downloadUrl: '/api/download-apk',
        fileName: 'RecruitPro.apk',
        version: dbVersion?.versionName || activeVersion?.version || '1.0',
        releaseDate: activeVersion?.uploadedAt || null,
        releaseNotes: activeVersion?.releaseNotes || null,
        size: fileExists && filePath ? (await fs.stat(filePath)).size : 0,
      })
    }

    if (!fileExists || !filePath) {
      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Akolta Dialer — Android App</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f1f5f9; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
    .card { background: white; border-radius: 16px; padding: 40px 32px; max-width: 400px; width: 100%; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .icon { width: 72px; height: 72px; background: #059669; border-radius: 16px; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; }
    .icon svg { width: 36px; height: 36px; fill: white; }
    h1 { font-size: 22px; font-weight: 700; color: #0f172a; margin-bottom: 8px; }
    p { font-size: 14px; color: #64748b; line-height: 1.6; margin-bottom: 20px; }
    .badge { display: inline-block; background: #fef3c7; color: #92400e; font-size: 12px; font-weight: 600; padding: 4px 12px; border-radius: 20px; }
    a.back { display: inline-block; margin-top: 20px; color: #059669; text-decoration: none; font-weight: 600; font-size: 14px; }
    a.back:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">
      <svg viewBox="0 0 24 24"><path d="M17.523 2.577a.75.75 0 00-.955-.46l-4 1.5a.75.75 0 00.528 1.404l4-1.5a.75.75 0 00.427-.944zm-11.046 0a.75.75 0 01.955-.46l4 1.5a.75.75 0 01-.528 1.404l-4-1.5a.75.75 0 01-.427-.944zM12 6a8 8 0 018 8c0 1.5-.4 2.9-1.1 4.1l1.4 1.4a.75.75 0 01-1.06 1.06l-1.3-1.3A7.96 7.96 0 0112 21a7.96 7.96 0 01-5.94-2.74l-1.3 1.3a.75.75 0 01-1.06-1.06l1.4-1.4A7.97 7.97 0 014 14a8 8 0 018-8zm0 2a3 3 0 00-3 3v2a3 3 0 006 0v-2a3 3 0 00-3-3zm-1.5 3a1.5 1.5 0 013 0v2a1.5 1.5 0 01-3 0v-2z"/></svg>
    </div>
    <h1>Android App Coming Soon</h1>
    <p>The Akolta Dialer Android app is being prepared. Please check back later or contact your administrator for the APK file.</p>
    <span class="badge">APK Not Uploaded Yet</span>
    <br>
    <a href="/" class="back">&larr; Back to Login</a>
  </div>
</body>
</html>`
      return new NextResponse(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    const fileBuffer = await fs.readFile(filePath)
    const stats = await fs.stat(filePath)
    const versionStr = dbVersion?.versionName || activeVersion?.version || '1.0'
    const downloadName = `Akolta-Dialer-v${versionStr}.apk`

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
    console.error('APK download error:', error)
    return NextResponse.json({ error: 'Download failed. Please try again later.' }, { status: 500 })
  }
}
