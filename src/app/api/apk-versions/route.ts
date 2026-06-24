import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { authenticateRequest } from '@/lib/auth-middleware'

/**
 * Public APK versions list API (any authenticated user).
 * Returns all uploaded APK versions (read-only) so users can select
 * a version to download from the Settings page.
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

    const versions = await readMeta()

    // Verify each file actually exists
    const verified: ApkVersion[] = []
    for (const v of versions) {
      const filePath = path.join(VERSIONS_DIR, v.fileName)
      try {
        await fs.access(filePath)
        verified.push(v)
      } catch {
        // File missing — skip it
      }
    }

    // Sort newest first
    verified.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())

    return NextResponse.json({ versions: verified })
  } catch (error) {
    console.error('[APK Versions GET] Error:', error)
    return NextResponse.json({ error: 'Failed to list versions' }, { status: 500 })
  }
}