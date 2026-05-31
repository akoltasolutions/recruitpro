import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, requireSuperAdmin } from '@/lib/auth-middleware';
import { execSync } from 'child_process';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    // ── Auth: Super Admin only ────────────────────────────────────────
    const auth = await authenticateRequest(request);
    if (!auth || !requireSuperAdmin(auth)) {
      return NextResponse.json({ error: 'Unauthorized. Super Admin access required.' }, { status: 401 });
    }

    // ── Generate timestamp for filename ───────────────────────────────
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15); // YYYYMMDDHHmmss
    const filename = `recruitpro-db-backup-${timestamp}.sql`;

    // ── Determine db path ─────────────────────────────────────────────
    const projectRoot = process.cwd();
    const dbPath = path.join(projectRoot, 'db', 'custom.db');

    // Verify db file exists
    const fs = await import('fs');
    if (!fs.existsSync(dbPath)) {
      return NextResponse.json(
        { error: 'Database file not found.' },
        { status: 404 }
      );
    }

    // ── Generate SQL dump using sqlite3 ───────────────────────────────
    const sqlDump = execSync(`sqlite3 "${dbPath}" .dump`, {
      timeout: 60000,
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer
    });

    if (!sqlDump || sqlDump.trim().length === 0) {
      return NextResponse.json(
        { error: 'Database dump is empty.' },
        { status: 500 }
      );
    }

    return new NextResponse(sqlDump, {
      status: 200,
      headers: {
        'Content-Type': 'application/sql',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(Buffer.byteLength(sqlDump)),
      },
    });
  } catch (error) {
    console.error('[POST /api/admin/backup/database]', error);
    return NextResponse.json(
      { error: 'Failed to create database backup. ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    );
  }
}
