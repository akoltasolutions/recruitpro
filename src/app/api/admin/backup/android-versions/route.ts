import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { authenticateRequest, requireSuperAdmin } from '@/lib/auth-middleware'

/**
 * Android APK Version Management API
 * 
 * Stores APK files in /upload/apk-versions/
 * Stores metadata in /db/android-versions.json
 * 
 * GET  — List all versions
 * POST — Upload a new APK version
 * DELETE — Delete a version by ID
 * PATCH — Set a version as active (the one served to users)
 */

const VERSIONS_DIR = path.join(process.cwd(), 'upload', 'apk-versions')
const META_FILE = path.join(process.cwd(), 'db', 'android-versions.json')

interface ApkVersion {
  id: string          // unique ID (timestamp-based)
  version: string     // e.g. "1.0.0"
  fileName: string    // stored file name
  originalName: string // original uploaded file name
  size: number        // bytes
  uploadedAt: string  // ISO date
  releaseNotes: string
  isActive: boolean   // only one can be active
}

function readMeta(): ApkVersion[] {
  try {
    const raw = fs.readFileSync(META_FILE, 'utf-8')
    return JSON.parse(raw) as ApkVersion[]
  } catch {
    return []
  }
}

async function writeMeta(versions: ApkVersion[]) {
  await fs.writeFile(META_FILE, JSON.stringify(versions, null, 2), 'utf-8')
}

function ensureDir() {
  return fs.mkdir(VERSIONS_DIR, { recursive: true })
}

// ── GET: List all versions ──────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!requireSuperAdmin(auth)) return NextResponse.json({ error: 'Super Admin only' }, { status: 403 })

    const versions = readMeta()

    // Verify each file exists
    const verified = []
    for (const v of versions) {
      const filePath = path.join(VERSIONS_DIR, v.fileName)
      try {
        await fs.access(filePath)
        verified.push(v)
      } catch {
        // File missing — skip it
      }
    }

    // If verified list differs from stored, clean up meta
    if (verified.length !== versions.length) {
      await writeMeta(verified)
    }

    return NextResponse.json({ versions: verified })
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

    await ensureDir()

    const formData = await request.formData()
    const file = formData.get('apk') as File | null
    const version = (formData.get('version') as string || '').trim()
    const releaseNotes = (formData.get('releaseNotes') as string || '').trim()

    if (!file) {
      return NextResponse.json({ error: 'APK file is required' }, { status: 400 })
    }
    if (!file.name.endsWith('.apk')) {
      return NextResponse.json({ error: 'Only .apk files are allowed' }, { status: 400 })
    }
    if (!version) {
      return NextResponse.json({ error: 'Version is required (e.g. 1.0.0)' }, { status: 400 })
    }

    // Check for duplicate version
    const existing = readMeta()
    if (existing.some(v => v.version === version)) {
      return NextResponse.json({ error: `Version ${version} already exists. Delete it first or use a different version.` }, { status: 409 })
    }

    // Save file with safe name
    const id = `v${version.replace(/\./g, '_')}_${Date.now()}`
    const storedName = `${id}.apk`
    const filePath = path.join(VERSIONS_DIR, storedName)

    const buffer = Buffer.from(await file.arrayBuffer())
    await fs.writeFile(filePath, buffer)

    // Determine if this should be active (first version, or explicitly requested)
    const makeActive = existing.length === 0 || formData.get('setActive') === 'true'

    // If making active, deactivate all others
    if (makeActive) {
      for (const v of existing) {
        v.isActive = false
      }
    }

    const newVersion: ApkVersion = {
      id,
      version,
      fileName: storedName,
      originalName: file.name,
      size: buffer.length,
      uploadedAt: new Date().toISOString(),
      releaseNotes,
      isActive: makeActive,
    }

    existing.push(newVersion)
    await writeMeta(existing)

    // If this is the active version, also copy to upload/recruitpro.apk
    // so the existing /api/download-apk endpoint serves it
    if (makeActive) {
      try {
        const activePath = path.join(process.cwd(), 'upload', 'recruitpro.apk')
        await fs.copyFile(filePath, activePath)
      } catch (copyErr) {
        console.error('[AndroidVersions POST] Failed to copy to active location:', copyErr)
      }
    }

    return NextResponse.json({ version: newVersion }, { status: 201 })
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
    if (!id) {
      return NextResponse.json({ error: 'Version ID is required' }, { status: 400 })
    }

    const versions = readMeta()
    const idx = versions.findIndex(v => v.id === id)
    if (idx === -1) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 })
    }

    const removed = versions[idx]
    versions.splice(idx, 1)

    // If the deleted version was active, activate the most recent remaining version
    if (removed.isActive && versions.length > 0) {
      // Sort by upload date, pick latest
      const sorted = [...versions].sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
      sorted[0].isActive = true
      // Copy to active location
      try {
        const activePath = path.join(process.cwd(), 'upload', 'recruitpro.apk')
        await fs.copyFile(path.join(VERSIONS_DIR, sorted[0].fileName), activePath)
      } catch { /* non-fatal */ }
    }

    await writeMeta(versions)

    // Delete the file
    try {
      await fs.unlink(path.join(VERSIONS_DIR, removed.fileName))
    } catch { /* file may already be gone */ }

    return NextResponse.json({ deleted: true, id })
  } catch (error) {
    console.error('[AndroidVersions DELETE] Error:', error)
    return NextResponse.json({ error: 'Failed to delete version' }, { status: 500 })
  }
}

// ── PATCH: Set a version as active ─────────────────────────────────
export async function PATCH(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!requireSuperAdmin(auth)) return NextResponse.json({ error: 'Super Admin only' }, { status: 403 })

    const body = await request.json()
    const { id } = body
    if (!id) {
      return NextResponse.json({ error: 'Version ID is required' }, { status: 400 })
    }

    const versions = readMeta()
    const target = versions.find(v => v.id === id)
    if (!target) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 })
    }

    // Deactivate all, activate target
    for (const v of versions) {
      v.isActive = (v.id === id)
    }

    await writeMeta(versions)

    // Copy to active location
    try {
      const activePath = path.join(process.cwd(), 'upload', 'recruitpro.apk')
      await fs.copyFile(path.join(VERSIONS_DIR, target.fileName), activePath)
    } catch (copyErr) {
      console.error('[AndroidVersions PATCH] Failed to copy to active location:', copyErr)
    }

    return NextResponse.json({ success: true, activeId: id, version: target.version })
  } catch (error) {
    console.error('[AndroidVersions PATCH] Error:', error)
    return NextResponse.json({ error: 'Failed to set active version' }, { status: 500 })
  }
}

