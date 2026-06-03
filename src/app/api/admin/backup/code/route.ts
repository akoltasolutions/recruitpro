import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, requireSuperAdmin } from '@/lib/auth-middleware';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

// ── Shared helpers ──────────────────────────────────────────────────────────

const EXCLUDE_DIRS = [
  'node_modules',
  '.next',
  '.git',
  'upload',
  'skills',
  'dev.log',
  'worklog.md',
  '.zscripts',
];

function getTimestamp(): string {
  return new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15); // YYYYMMDDHHmmss
}

function getProjectRoot(): string {
  return path.resolve(process.cwd());
}

/**
 * Check whether a CLI tool is available on the system.
 * Uses `which` (Unix) to avoid actually running the tool.
 */
function isCommandAvailable(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: 'pipe', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Build a tar exclude flag list.
 */
function tarExcludes(): string {
  return EXCLUDE_DIRS.map(d => `--exclude=${d}`).join(' ');
}

/**
 * Build a zip exclude flag list.
 * Uses the `-x` pattern that works across common zip versions.
 */
function zipExcludes(): string {
  return EXCLUDE_DIRS.map(d => `"${d}"`).join(' ');
}

// ── Format configuration map ─────────────────────────────────────────────────

interface FormatConfig {
  ext: string;
  contentType: string;
  buildCommand: (archivePath: string) => string;
}

function getFormatConfig(format: string): FormatConfig {
  const projectRoot = getProjectRoot();
  const ts = getTimestamp();

  switch (format) {
    case 'zip':
      return {
        ext: 'zip',
        contentType: 'application/zip',
        buildCommand: (ap) =>
          `cd "${projectRoot}" && zip -r "${ap}" . -x ${zipExcludes()} 2>/dev/null`,
      };

    case 'tar':
      return {
        ext: 'tar',
        contentType: 'application/x-tar',
        buildCommand: (ap) =>
          `cd "${projectRoot}" && tar -cf "${ap}" ${tarExcludes()} .`,
      };

    case '7z': {
      // 7z uses different exclude syntax
      const excludes = EXCLUDE_DIRS.map(d => `-xr!${d}`).join(' ');
      return {
        ext: '7z',
        contentType: 'application/x-7z-compressed',
        buildCommand: (ap) =>
          `cd "${projectRoot}" && 7z a "${ap}" . ${excludes} -bso0 -bse0`,
      };
    }

    case 'tar.gz':
    default:
      return {
        ext: 'tar.gz',
        contentType: 'application/gzip',
        buildCommand: (ap) =>
          `cd "${projectRoot}" && tar -czf "${ap}" ${tarExcludes()} .`,
      };
  }
}

// ── GET: Stream a code backup to the client ──────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    // ── Auth ───────────────────────────────────────────────────────────────
    const auth = await authenticateRequest(request);
    if (!auth || !requireSuperAdmin(auth)) {
      return NextResponse.json(
        { error: 'Unauthorized. Super Admin access required.' },
        { status: 401 },
      );
    }

    // ── Parse format ───────────────────────────────────────────────────────
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'tar.gz';

    // ── Validate format ────────────────────────────────────────────────────
    const validFormats = ['zip', 'tar', 'tar.gz', '7z'];
    if (!validFormats.includes(format)) {
      return NextResponse.json(
        { error: `Invalid format "${format}". Supported: ${validFormats.join(', ')}` },
        { status: 400 },
      );
    }

    // ── Check for required CLI tools ───────────────────────────────────────
    const requiredCmd = format === 'tar.gz' ? 'tar'
      : format === 'tar' ? 'tar'
      : format === 'zip' ? 'zip'
      : '7z';

    if (!isCommandAvailable(requiredCmd)) {
      return NextResponse.json(
        {
          error: `The "${requiredCmd}" command is not installed on the server. ` +
            `Please install it or choose a different format (tar.gz is always available).`,
        },
        { status: 400 },
      );
    }

    // ── Build archive ──────────────────────────────────────────────────────
    const config = getFormatConfig(format);
    const tempDir = os.tmpdir();
    const archivePath = path.join(tempDir, `recruitpro-backup-${getTimestamp()}.${config.ext}`);

    try {
      execSync(config.buildCommand(archivePath), {
        timeout: 120_000,
        stdio: 'pipe',
      });
    } catch (execErr) {
      // Clean up partial archive if any
      try { fs.unlinkSync(archivePath); } catch { /* ignore */ }
      console.error(`[GET /api/admin/backup/code] Archive creation failed:`, execErr);
      return NextResponse.json(
        { error: 'Failed to create archive. The server command returned an error.' },
        { status: 500 },
      );
    }

    // ── Stream the file to avoid OOM on low-memory servers ─────────────────
    const stat = fs.statSync(archivePath);
    const filename = `recruitpro-backup-${getTimestamp()}.${config.ext}`;

    // Create a ReadableStream that reads chunks from disk
    const fileStream = fs.createReadStream(archivePath);

    const readableStream = new ReadableStream({
      start(controller) {
        fileStream.on('data', (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk));
        });
        fileStream.on('end', () => {
          controller.close();
          // Clean up temp file after streaming completes
          try { fs.unlinkSync(archivePath); } catch { /* ignore */ }
        });
        fileStream.on('error', (err) => {
          console.error('[GET /api/admin/backup/code] Stream error:', err);
          controller.error(err);
          // Attempt cleanup
          try { fs.unlinkSync(archivePath); } catch { /* ignore */ }
        });
      },
      cancel() {
        fileStream.destroy();
        try { fs.unlinkSync(archivePath); } catch { /* ignore */ }
      },
    });

    return new NextResponse(readableStream, {
      status: 200,
      headers: {
        'Content-Type': config.contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(stat.size),
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[GET /api/admin/backup/code]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ── POST: Pre-deploy backup (saves to server disk) ──────────────────────────

export async function POST(request: NextRequest) {
  try {
    // ── Auth ───────────────────────────────────────────────────────────────
    const auth = await authenticateRequest(request);
    if (!auth || !requireSuperAdmin(auth)) {
      return NextResponse.json(
        { error: 'Unauthorized. Super Admin access required.' },
        { status: 401 },
      );
    }

    // ── Parse body ─────────────────────────────────────────────────────────
    let body: { action?: string; format?: string } = {};
    try {
      const raw = await request.text();
      if (raw) body = JSON.parse(raw);
    } catch { /* empty body is fine */ }

    if (body.action !== 'pre-deploy') {
      return NextResponse.json(
        { error: 'Unknown action. Use { "action": "pre-deploy" }.' },
        { status: 400 },
      );
    }

    // ── Ensure tar is available (always should be on Ubuntu) ────────────────
    if (!isCommandAvailable('tar')) {
      return NextResponse.json(
        { error: 'The "tar" command is not available on this server.' },
        { status: 500 },
      );
    }

    // ── Ensure backups directory exists ────────────────────────────────────
    const projectRoot = getProjectRoot();
    const backupsDir = path.join(projectRoot, 'backups');
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    // ── Create tar.gz archive ───────────────────────────────────────────────
    const ts = getTimestamp();
    const filename = `pre-deploy-${ts}.tar.gz`;
    const archivePath = path.join(backupsDir, filename);

    try {
      execSync(
        `cd "${projectRoot}" && tar -czf "${archivePath}" ${tarExcludes()} .`,
        { timeout: 120_000, stdio: 'pipe' },
      );
    } catch (execErr) {
      console.error('[POST /api/admin/backup/code] Pre-deploy archive failed:', execErr);
      return NextResponse.json(
        { error: 'Failed to create pre-deploy archive.' },
        { status: 500 },
      );
    }

    // ── Get file size ──────────────────────────────────────────────────────
    const stat = fs.statSync(archivePath);
    const sizeKB = (stat.size / 1024).toFixed(1);
    const sizeMB = (stat.size / (1024 * 1024)).toFixed(2);
    const sizeDisplay = stat.size > 1024 * 1024 ? `${sizeMB} MB` : `${sizeKB} KB`;

    // ── Keep only the last 5 pre-deploy backups ───────────────────────────
    try {
      const files = fs.readdirSync(backupsDir)
        .filter(f => f.startsWith('pre-deploy-') && f.endsWith('.tar.gz'))
        .sort()
        .reverse(); // newest first

      // Remove oldest beyond the 5th
      for (let i = 5; i < files.length; i++) {
        try { fs.unlinkSync(path.join(backupsDir, files[i])); } catch { /* ignore */ }
      }
    } catch { /* ignore cleanup errors */ }

    return NextResponse.json({
      success: true,
      message: 'Pre-deploy backup created successfully',
      filename,
      path: archivePath,
      size: sizeDisplay,
      sizeBytes: stat.size,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[POST /api/admin/backup/code]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
