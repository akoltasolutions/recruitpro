import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import crypto from 'crypto'
import { authenticateRequest, requireSuperAdmin } from '@/lib/auth-middleware'
import { db } from '@/lib/db'
import { getPlatformSetting, setPlatformSetting } from '@/lib/platform-settings'

const VERSIONS_DIR = path.join(process.cwd(), 'upload', 'apk-versions')
const META_FILE = path.join(process.cwd(), 'db', 'android-versions.json')

// ── Legacy JSON helpers (backward compat) ──────────────────────────────

interface LegacyMeta {
  id: string
  version: string
  fileName: string
  originalName: string
  size: number
  uploadedAt: string
  releaseNotes: string
  isActive: boolean
}

function readLegacyMeta(): LegacyMeta[] {
  try {
    const raw = fs.readFileSync(META_FILE, 'utf-8')
    return JSON.parse(raw) as LegacyMeta[]
  } catch {
    return []
  }
}

async function writeLegacyMeta(versions: LegacyMeta[]) {
  await fs.writeFile(META_FILE, JSON.stringify(versions, null, 2), 'utf-8')
}

async function syncLegacyJson() {
  const dbVersions = await db.apkVersion.findMany({ orderBy: { createdAt: 'desc' } })
  const published = dbVersions.find(v => v.status === 'PUBLISHED')
  const legacy: LegacyMeta[] = dbVersions.map(v => ({
    id: v.id,
    version: v.versionName,
    fileName: v.fileName,
    originalName: v.originalName,
    size: v.size,
    uploadedAt: v.createdAt.toISOString(),
    releaseNotes: v.releaseNotes || '',
    isActive: v.status === 'PUBLISHED',
  }))
  await writeLegacyMeta(legacy)
  return published
}

// ── Auto-migration: import disk APKs if Prisma is empty ─────────────────

async function autoMigrate() {
  const count = await db.apkVersion.count()
  if (count > 0) return

  const legacy = readLegacyMeta()
  const hasLegacy = legacy.length > 0

  // Import v1.2.0 from public/RecruitPro.apk
  const publicApk = path.join(process.cwd(), 'public', 'RecruitPro.apk')
  const v120Exists = hasLegacy && legacy.some(l => l.version === '1.2.0')
  
  try {
    const stat = await fs.stat(publicApk)
    const buf = await fs.readFile(publicApk)
    const checksum = crypto.createHash('sha256').update(buf).digest('hex')
    const targetFile = 'akolta-dialer-1.2.0.apk'
    const targetPath = path.join(VERSIONS_DIR, targetFile)
    
    // Copy to upload dir if not already there
    try { await fs.access(targetPath) } catch {
      await fs.mkdir(VERSIONS_DIR, { recursive: true })
      await fs.copyFile(publicApk, targetPath)
    }
    
    if (!v120Exists) {
      await db.apkVersion.create({
        data: {
          appName: 'Akolta Dialer',
          versionName: '1.2.0',
          versionCode: 3,
          fileName: targetFile,
          originalName: 'RecruitPro.apk',
          size: stat.size,
          checksum,
          releaseNotes: 'Auto-imported from public directory',
          status: 'PUBLISHED',
          publishedAt: new Date(),
        },
      })
    }
  } catch { /* public APK may not exist */ }

  // Import v1.1.0 from upload/apk-versions/
  const v110File = path.join(VERSIONS_DIR, 'RecruitPro-v1.1.0.apk')
  const v110Exists = hasLegacy && legacy.some(l => l.version === '1.1.0')
  
  try {
    const stat = await fs.stat(v110File)
    const buf = await fs.readFile(v110File)
    const checksum = crypto.createHash('sha256').update(buf).digest('hex')

    if (!v110Exists) {
      await db.apkVersion.create({
        data: {
          appName: 'Akolta Dialer',
          versionName: '1.1.0',
          versionCode: 2,
          fileName: 'RecruitPro-v1.1.0.apk',
          originalName: 'RecruitPro-v1.1.0.apk',
          size: stat.size,
          checksum,
          releaseNotes: 'Auto-imported from upload directory',
          status: 'ARCHIVED',
        },
      })
    }
  } catch { /* v1.1.0 may not exist */ }

  // Copy active APK to upload/recruitpro.apk for backward compat
  const published = await db.apkVersion.findFirst({ where: { status: 'PUBLISHED' } })
  if (published) {
    const src = path.join(VERSIONS_DIR, published.fileName)
    try {
      await fs.access(src)
      await fs.copyFile(src, path.join(process.cwd(), 'upload', 'recruitpro.apk'))
    } catch { /* non-fatal */ }
  }

  await syncLegacyJson()
}

// ── GET: List all versions ──────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!requireSuperAdmin(auth)) return NextResponse.json({ error: 'Super Admin only' }, { status: 403 })

    await autoMigrate()

    const versions = await db.apkVersion.findMany({
      orderBy: { versionCode: 'desc' },
      include: {
        _count: { select: { userAssignments: true, orgAssignments: true, downloads: true } },
      },
    })

    const forceMinVersion = await getPlatformSetting('force_min_android_version')

    return NextResponse.json({ versions, forceMinVersion })
  } catch (error) {
    console.error('[AndroidVersions GET] Error:', error)
    return NextResponse.json({ error: 'Failed to list versions' }, { status: 500 })
  }
}

// ── POST: Upload a new APK ─────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!requireSuperAdmin(auth)) return NextResponse.json({ error: 'Super Admin only' }, { status: 403 })

    await fs.mkdir(VERSIONS_DIR, { recursive: true })

    const formData = await request.formData()
    const file = formData.get('apk') as File | null
    const appName = (formData.get('appName') as string || 'Akolta Dialer').trim()
    const versionName = (formData.get('versionName') as string || '').trim()
    const versionCode = parseInt(formData.get('versionCode') as string || '0', 10)
    const releaseNotes = (formData.get('releaseNotes') as string || '').trim()
    const setStatus = (formData.get('status') as string || 'DRAFT').trim().toUpperCase()
    const makeActive = formData.get('setActive') === 'true'

    if (!file) return NextResponse.json({ error: 'APK file is required' }, { status: 400 })
    if (!file.name.endsWith('.apk')) return NextResponse.json({ error: 'Only .apk files are allowed' }, { status: 400 })
    if (!versionName) return NextResponse.json({ error: 'Version name is required (e.g. 1.0.0)' }, { status: 400 })
    if (!versionCode || versionCode <= 0) return NextResponse.json({ error: 'Version code must be a positive integer' }, { status: 400 })

    // Check duplicate version name
    const existingName = await db.apkVersion.findFirst({ where: { versionName } })
    if (existingName) return NextResponse.json({ error: `Version ${versionName} already exists` }, { status: 409 })

    // Check duplicate version code
    const existingCode = await db.apkVersion.findFirst({ where: { versionCode } })
    if (existingCode) return NextResponse.json({ error: `Version code ${versionCode} already exists` }, { status: 409 })

    // Read file and compute checksum
    const buffer = Buffer.from(await file.arrayBuffer())
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex')

    const storedName = `akolta-dialer-${versionName}.apk`
    const filePath = path.join(VERSIONS_DIR, storedName)
    await fs.writeFile(filePath, buffer)

    // Determine status
    const status = makeActive ? 'PUBLISHED' : (['DRAFT', 'TESTING', 'PUBLISHED'].includes(setStatus) ? setStatus : 'DRAFT')

    // If publishing, deactivate all others
    if (status === 'PUBLISHED') {
      await db.apkVersion.updateMany({
        where: { status: 'PUBLISHED' },
        data: { status: 'ARCHIVED' },
      })
    }

    const record = await db.apkVersion.create({
      data: {
        appName,
        versionName,
        versionCode,
        fileName: storedName,
        originalName: file.name,
        size: buffer.length,
        checksum,
        releaseNotes: releaseNotes || null,
        status,
        uploadedBy: auth.userId,
        publishedBy: status === 'PUBLISHED' ? auth.userId : null,
        publishedAt: status === 'PUBLISHED' ? new Date() : null,
      },
    })

    // Backward compat: copy to upload/recruitpro.apk if published
    if (status === 'PUBLISHED') {
      try {
        await fs.copyFile(filePath, path.join(process.cwd(), 'upload', 'recruitpro.apk'))
      } catch { /* non-fatal */ }
    }

    await syncLegacyJson()

    return NextResponse.json({ version: record }, { status: 201 })
  } catch (error) {
    console.error('[AndroidVersions POST] Error:', error)
    return NextResponse.json({ error: 'Failed to upload APK' }, { status: 500 })
  }
}

// ── DELETE: Remove a version ────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!requireSuperAdmin(auth)) return NextResponse.json({ error: 'Super Admin only' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Version ID is required' }, { status: 400 })

    const record = await db.apkVersion.findUnique({ where: { id } })
    if (!record) return NextResponse.json({ error: 'Version not found' }, { status: 404 })

    const wasPublished = record.status === 'PUBLISHED'

    // Delete file from disk
    try { await fs.unlink(path.join(VERSIONS_DIR, record.fileName)) } catch { /* already gone */ }

    // Cascade deletes assignments and downloads
    await db.apkVersion.delete({ where: { id } })

    // If deleted version was published, publish the most recent non-archived version
    if (wasPublished) {
      const next = await db.apkVersion.findFirst({
        where: { status: { in: ['DRAFT', 'TESTING'] } },
        orderBy: { versionCode: 'desc' },
      })
      if (next) {
        await db.apkVersion.update({
          where: { id: next.id },
          data: { status: 'PUBLISHED', publishedBy: auth.userId, publishedAt: new Date() },
        })
        try {
          await fs.copyFile(path.join(VERSIONS_DIR, next.fileName), path.join(process.cwd(), 'upload', 'recruitpro.apk'))
        } catch { /* non-fatal */ }
      }
    }

    await syncLegacyJson()

    return NextResponse.json({ deleted: true, id })
  } catch (error) {
    console.error('[AndroidVersions DELETE] Error:', error)
    return NextResponse.json({ error: 'Failed to delete version' }, { status: 500 })
  }
}

// ── PATCH: Multiple operations via action field ─────────────────────

export async function PATCH(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!requireSuperAdmin(auth)) return NextResponse.json({ error: 'Super Admin only' }, { status: 403 })

    const body = await request.json()
    const { action, id } = body

    if (!id) return NextResponse.json({ error: 'Version ID is required' }, { status: 400 })

    const record = await db.apkVersion.findUnique({ where: { id } })
    if (!record) return NextResponse.json({ error: 'Version not found' }, { status: 404 })

    switch (action) {
      case 'set_active': {
        // Archive current published, set this one as published
        await db.apkVersion.updateMany({
          where: { status: 'PUBLISHED' },
          data: { status: 'ARCHIVED' },
        })
        const updated = await db.apkVersion.update({
          where: { id },
          data: { status: 'PUBLISHED', publishedBy: auth.userId, publishedAt: new Date() },
        })
        try {
          await fs.copyFile(path.join(VERSIONS_DIR, updated.fileName), path.join(process.cwd(), 'upload', 'recruitpro.apk'))
        } catch { /* non-fatal */ }
        await syncLegacyJson()
        return NextResponse.json({ success: true, version: updated })
      }

      case 'publish': {
        const updated = await db.apkVersion.update({
          where: { id },
          data: { status: 'PUBLISHED', publishedBy: auth.userId, publishedAt: new Date() },
        })
        await syncLegacyJson()
        return NextResponse.json({ success: true, version: updated })
      }

      case 'archive': {
        const updated = await db.apkVersion.update({
          where: { id },
          data: { status: 'ARCHIVED' },
        })
        await syncLegacyJson()
        return NextResponse.json({ success: true, version: updated })
      }

      case 'update': {
        const { versionName, versionCode, releaseNotes, status, appName } = body
        const updateData: Record<string, unknown> = {}
        if (appName !== undefined) updateData.appName = appName
        if (versionName !== undefined) updateData.versionName = versionName
        if (versionCode !== undefined) updateData.versionCode = versionCode
        if (releaseNotes !== undefined) updateData.releaseNotes = releaseNotes || null
        if (status !== undefined && ['DRAFT', 'TESTING', 'PUBLISHED', 'ARCHIVED'].includes(status)) {
          if (status === 'PUBLISHED') {
            await db.apkVersion.updateMany({
              where: { status: 'PUBLISHED', id: { not } },
              data: { status: 'ARCHIVED' },
            })
            updateData.publishedBy = auth.userId
            updateData.publishedAt = new Date()
            try {
              await fs.copyFile(path.join(VERSIONS_DIR, record.fileName), path.join(process.cwd(), 'upload', 'recruitpro.apk'))
            } catch { /* non-fatal */ }
          }
          updateData.status = status
        }
        const updated = await db.apkVersion.update({
          where: { id },
          data: updateData,
        })
        await syncLegacyJson()
        return NextResponse.json({ success: true, version: updated })
      }

      case 'rollback': {
        // Archive current published, set this one as published
        await db.apkVersion.updateMany({
          where: { status: 'PUBLISHED' },
          data: { status: 'ARCHIVED' },
        })
        const updated = await db.apkVersion.update({
          where: { id },
          data: { status: 'PUBLISHED', publishedBy: auth.userId, publishedAt: new Date() },
        })
        try {
          await fs.copyFile(path.join(VERSIONS_DIR, updated.fileName), path.join(process.cwd(), 'upload', 'recruitpro.apk'))
        } catch { /* non-fatal */ }
        await syncLegacyJson()
        return NextResponse.json({ success: true, version: updated })
      }

      default:
        return NextResponse.json({ error: 'Invalid action. Use: set_active, publish, archive, update, rollback' }, { status: 400 })
    }
  } catch (error) {
    console.error('[AndroidVersions PATCH] Error:', error)
    return NextResponse.json({ error: 'Failed to update version' }, { status: 500 })
  }
}
