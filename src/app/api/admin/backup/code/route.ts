import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, requireSuperAdmin } from '@/lib/auth-middleware';
import { execSync } from 'child_process';
import { ZipArchive, TarArchive } from 'archiver';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { PassThrough } from 'stream';

// ── Shared helpers ──────────────────────────────────────────────────────────

/** Directories that should be excluded entirely (not recursed into). */
const EXCLUDE_DIR_NAMES = new Set([
  'node_modules',
  '.next',
  '.git',
  'upload',
  'skills',
  '.zscripts',
  'backups',
]);

/** Files that should be excluded at the project root. */
const EXCLUDE_FILE_NAMES = new Set([
  'dev.log',
  'worklog.md',
]);

function getTimestamp(): string {
  return new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15); // YYYYMMDDHHmmss
}

function getProjectRoot(): string {
  return path.resolve(process.cwd());
}

/**
 * Check whether a CLI tool is available on the system.
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
 * Determine if a path should be excluded from the archive.
 */
function shouldExclude(relativePath: string): boolean {
  const parts = relativePath.split(/[/\\]/);
  for (const part of parts) {
    if (EXCLUDE_DIR_NAMES.has(part)) return true;
    if (EXCLUDE_FILE_NAMES.has(part) && parts.length === 1) return true;
    // Exclude hidden directories (starting with .) except .env*, .prisma, .vscode
    if (part.startsWith('.') && !part.startsWith('.env') && part !== '.prisma' && part !== '.vscode') return true;
  }
  return false;
}

/**
 * Recursively collect all files to archive, respecting exclusions.
 * Skips files larger than 50MB to avoid memory issues.
 */
function collectFiles(dir: string, baseDir: string): string[] {
  const results: string[] = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);

    if (shouldExclude(relativePath)) continue;

    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      try {
        const stat = fs.statSync(fullPath);
        if (stat.size <= 50 * 1024 * 1024) {
          results.push(relativePath);
        }
      } catch {
        // skip files we can't stat
      }
    }
  }

  return results;
}

// ── Format configuration ────────────────────────────────────────────────────

interface FormatInfo {
  ext: string;
  contentType: string;
}

const SUPPORTED_FORMATS: Record<string, FormatInfo> = {
  zip: { ext: 'zip', contentType: 'application/zip' },
  tar: { ext: 'tar', contentType: 'application/x-tar' },
  'tar.gz': { ext: 'tar.gz', contentType: 'application/gzip' },
  '7z': { ext: '7z', contentType: 'application/x-7z-compressed' },
};

// ── GET: Stream a code backup to the client using pure JS archiver ─────────

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
    const validFormats = Object.keys(SUPPORTED_FORMATS);
    if (!validFormats.includes(format)) {
      return NextResponse.json(
        { error: `Invalid format "${format}". Supported: ${validFormats.join(', ')}` },
        { status: 400 },
      );
    }

    const formatInfo = SUPPORTED_FORMATS[format];
    const projectRoot = getProjectRoot();
    const ts = getTimestamp();
    const filename = `recruitpro-backup-${ts}.${formatInfo.ext}`;

    // ── 7z requires system tool ────────────────────────────────────────────
    if (format === '7z') {
      if (!isCommandAvailable('7z')) {
        return NextResponse.json(
          {
            error: `The "7z" command is not installed on this server. ` +
              `Please install p7zip-full (sudo apt install p7zip-full) or choose ZIP/TAR.GZ which work without any system tools.`,
          },
          { status: 400 },
        );
      }
      return handle7zDownload(projectRoot, filename);
    }

    // ── Collect files ──────────────────────────────────────────────────────
    const files = collectFiles(projectRoot, projectRoot);

    if (files.length === 0) {
      return NextResponse.json(
        { error: 'No files found to archive.' },
        { status: 500 },
      );
    }

    // ── Create archive via PassThrough → stream to response ────────────────
    const passthrough = new PassThrough();

    let archive: ZipArchive | TarArchive;
    if (format === 'tar' || format === 'tar.gz') {
      archive = new TarArchive({
        gzip: format === 'tar.gz',
        gzipOptions: { level: 6 },
      });
    } else {
      archive = new ZipArchive({
        zlib: { level: 6 },
      });
    }

    archive.pipe(passthrough);

    // Track errors
    let archiveError: Error | null = null;
    archive.on('error', (err) => {
      archiveError = err;
      console.error('[GET /api/admin/backup/code] Archiver error:', err);
      passthrough.destroy(err);
    });

    // ── Add files ─────────────────────────────────────────────────────────
    for (const filePath of files) {
      const fullPath = path.join(projectRoot, filePath);
      try {
        const stat = fs.statSync(fullPath);
        archive.append(fs.createReadStream(fullPath), {
          name: filePath.replace(/\\/g, '/'),
          date: stat.mtime,
          mode: stat.mode,
        });
      } catch (err) {
        console.warn(`[backup/code] Skipping ${filePath}:`, err);
      }
    }

    // Finalize
    archive.finalize();

    // ── Stream response ───────────────────────────────────────────────────
    return new NextResponse(passthrough as any, {
      status: 200,
      headers: {
        'Content-Type': formatInfo.contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
        'Transfer-Encoding': 'chunked',
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

/**
 * Handle 7z format download using system command (with temp file).
 */
async function handle7zDownload(projectRoot: string, filename: string) {
  const tempDir = os.tmpdir();
  const archivePath = path.join(tempDir, filename);

  const excludes = [
    'node_modules', '.next', '.git', 'upload', 'skills',
    'dev.log', 'worklog.md', '.zscripts', 'backups',
  ].map(d => `-xr!${d}`).join(' ');

  try {
    execSync(`cd "${projectRoot}" && 7z a "${archivePath}" . ${excludes} -bso0 -bse0`, {
      timeout: 120_000,
      stdio: 'pipe',
    });
  } catch (execErr) {
    console.error('[GET /api/admin/backup/code] 7z creation failed:', execErr);
    return NextResponse.json(
      { error: 'Failed to create 7z archive. The server 7z command returned an error.' },
      { status: 500 },
    );
  }

  // Stream the temp file
  const stat = fs.statSync(archivePath);
  const fileStream = fs.createReadStream(archivePath);

  const readableStream = new ReadableStream({
    start(controller) {
      fileStream.on('data', (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      fileStream.on('end', () => {
        controller.close();
        try { fs.unlinkSync(archivePath); } catch { /* ignore */ }
      });
      fileStream.on('error', (err) => {
        controller.error(err);
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
      'Content-Type': 'application/x-7z-compressed',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(stat.size),
      'Cache-Control': 'no-store',
    },
  });
}

// ── POST: Pre-deploy backup (saves .tar.gz to server disk) ─────────────────

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
    let body: { action?: string } = {};
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

    // ── Ensure backups directory exists ────────────────────────────────────
    const projectRoot = getProjectRoot();
    const backupsDir = path.join(projectRoot, 'backups');
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    // ── Create .tar.gz using pure JS archiver (no system tar needed) ───────
    const ts = getTimestamp();
    const filename = `pre-deploy-${ts}.tar.gz`;
    const archivePath = path.join(backupsDir, filename);

    const files = collectFiles(projectRoot, projectRoot);

    if (files.length === 0) {
      return NextResponse.json(
        { error: 'No files found to archive.' },
        { status: 500 },
      );
    }

    // Create write stream and archive
    const output = fs.createWriteStream(archivePath);
    const archive = new TarArchive({
      gzip: true,
      gzipOptions: { level: 6 },
    });

    archive.pipe(output);

    // Track errors
    let writeError: Error | null = null;
    output.on('error', (err) => {
      writeError = err;
      console.error('[POST backup/code] Write stream error:', err);
    });

    // Add files
    for (const filePath of files) {
      const fullPath = path.join(projectRoot, filePath);
      try {
        const stat = fs.statSync(fullPath);
        archive.append(fs.createReadStream(fullPath), {
          name: filePath.replace(/\\/g, '/'),
          date: stat.mtime,
          mode: stat.mode,
        });
      } catch (err) {
        console.warn(`[POST backup/code] Skipping file ${filePath}:`, err);
      }
    }

    // Wait for completion
    await new Promise<void>((resolve, reject) => {
      archive.on('finish', () => resolve());
      archive.on('error', (err) => reject(err));
      output.on('error', (err) => reject(err));
      archive.finalize();
    });

    // Check for errors
    if (writeError) {
      return NextResponse.json(
        { error: 'Failed to write archive file.' },
        { status: 500 },
      );
    }

    // Verify the file was written
    if (!fs.existsSync(archivePath)) {
      return NextResponse.json(
        { error: 'Archive file was not created.' },
        { status: 500 },
      );
    }

    // ── Get file size ──────────────────────────────────────────────────────
    const stat = fs.statSync(archivePath);
    const sizeKB = (stat.size / 1024).toFixed(1);
    const sizeMB = (stat.size / (1024 * 1024)).toFixed(2);
    const sizeDisplay = stat.size > 1024 * 1024 ? `${sizeMB} MB` : `${sizeKB} KB`;

    // ── Keep only the last 5 pre-deploy backups ─────────────────────────────
    try {
      const existingFiles = fs.readdirSync(backupsDir)
        .filter(f => f.startsWith('pre-deploy-') && f.endsWith('.tar.gz'))
        .sort()
        .reverse(); // newest first

      for (let i = 5; i < existingFiles.length; i++) {
        try { fs.unlinkSync(path.join(backupsDir, existingFiles[i])); } catch { /* ignore */ }
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
      { error: 'Failed to create pre-deploy archive. ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 },
    );
  }
}
