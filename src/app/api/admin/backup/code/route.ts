import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, requireSuperAdmin } from '@/lib/auth-middleware';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

export async function POST(request: NextRequest) {
  try {
    // ── Auth: Super Admin only ────────────────────────────────────────
    const auth = await authenticateRequest(request);
    if (!auth || !requireSuperAdmin(auth)) {
      return NextResponse.json({ error: 'Unauthorized. Super Admin access required.' }, { status: 401 });
    }

    // ── Query params ──────────────────────────────────────────────────
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'tar'; // 'tar' or 'zip'

    // ── Determine project root ────────────────────────────────────────
    const projectRoot = path.resolve(process.cwd());
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15); // YYYYMMDDHHmmss

    // ── Temp file path ────────────────────────────────────────────────
    const tempDir = os.tmpdir();
    let archivePath: string;
    let contentType: string;
    let filename: string;

    if (format === 'zip') {
      archivePath = path.join(tempDir, `recruitpro-backup-${timestamp}.zip`);
      filename = `recruitpro-backup-${timestamp}.zip`;
      contentType = 'application/zip';

      // Create zip archive excluding specified directories
      const excludePattern = [
        'node_modules',
        '.next',
        '.git',
        'upload',
        'skills',
        'dev.log',
        'worklog.md',
        '.zscripts',
      ].map(d => `-x "${d}/*" -x "${d}"`).join(' ');

      execSync(
        `cd "${projectRoot}" && zip -r "${archivePath}" . ${excludePattern}`,
        { timeout: 120000, stdio: 'pipe' }
      );
    } else {
      archivePath = path.join(tempDir, `recruitpro-backup-${timestamp}.tar.gz`);
      filename = `recruitpro-backup-${timestamp}.tar.gz`;
      contentType = 'application/gzip';

      // Create tar.gz archive excluding specified directories
      const excludes = [
        'node_modules',
        '.next',
        '.git',
        'upload',
        'skills',
        'dev.log',
        'worklog.md',
        '.zscripts',
      ].map(d => `--exclude=${d}`).join(' ');

      execSync(
        `cd "${projectRoot}" && tar -czf "${archivePath}" ${excludes} .`,
        { timeout: 120000, stdio: 'pipe' }
      );
    }

    // ── Read file and return as download ───────────────────────────────
    const fileBuffer = fs.readFileSync(archivePath);

    // Clean up temp file
    try {
      fs.unlinkSync(archivePath);
    } catch { /* ignore cleanup errors */ }

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(fileBuffer.length),
      },
    });
  } catch (error) {
    console.error('[POST /api/admin/backup/code]', error);
    return NextResponse.json(
      { error: 'Failed to create code backup. ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    );
  }
}
