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

    // ── Parse FormData ────────────────────────────────────────────────
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded. Please provide an .sql file.' }, { status: 400 });
    }

    // ── Validate file extension ──────────────────────────────────────
    const originalName = file.name.toLowerCase();
    if (!originalName.endsWith('.sql')) {
      return NextResponse.json(
        { error: 'Invalid file type. Only .sql files are accepted.' },
        { status: 400 }
      );
    }

    // ── Paths ─────────────────────────────────────────────────────────
    const projectRoot = process.cwd();
    const dbPath = path.join(projectRoot, 'db', 'custom.db');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-'));
    const tempFilePath = path.join(tempDir, 'restore.sql');

    // ── SAFETY: Auto-backup current database before restore ───────────
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
    const preRestoreBackupPath = path.join(projectRoot, 'db', `custom.db.pre-restore-${timestamp}`);

    try {
      if (fs.existsSync(dbPath)) {
        fs.copyFileSync(dbPath, preRestoreBackupPath);
        console.log(`[restore] Pre-restore backup created: ${preRestoreBackupPath}`);
      }
    } catch (backupErr) {
      console.error('[restore] Failed to create pre-restore backup:', backupErr);
      return NextResponse.json(
        { error: 'Safety check failed: Could not create backup of current database. Restore aborted.' },
        { status: 500 }
      );
    }

    // ── Write uploaded file to temp location ──────────────────────────
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(tempFilePath, fileBuffer);

    // ── Execute restore ────────────────────────────────────────────────
    try {
      // Drop all tables first, then import the SQL dump
      // sqlite3 approach: read the SQL file and execute it
      execSync(`sqlite3 "${dbPath}" < "${tempFilePath}"`, {
        timeout: 120000,
        stdio: 'pipe',
        maxBuffer: 50 * 1024 * 1024,
      });
    } catch (restoreErr) {
      console.error('[restore] Database restore failed:', restoreErr);
      // Attempt to recover from pre-restore backup
      try {
        fs.copyFileSync(preRestoreBackupPath, dbPath);
        console.log('[restore] Recovered database from pre-restore backup.');
      } catch (recoveryErr) {
        console.error('[restore] Recovery also failed:', recoveryErr);
      }
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }

    // ── Cleanup temp files ─────────────────────────────────────────────
    try {
      fs.unlinkSync(tempFilePath);
      fs.rmdirSync(tempDir);
    } catch { /* ignore cleanup errors */ }

    return NextResponse.json({
      success: true,
      message: 'Database restored successfully.',
      preRestoreBackup: preRestoreBackupPath,
    });
  } catch (error) {
    console.error('[POST /api/admin/backup/restore]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
