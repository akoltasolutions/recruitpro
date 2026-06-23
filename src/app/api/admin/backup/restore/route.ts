import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, requireSuperAdmin } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import path from 'path';
import fs from 'fs';
import os from 'os';

/** Format a date as a file-safe timestamp: YYYY-MM-DD_HH-mm-ss */
function formatFileTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

/**
 * Pure TypeScript SQLite restore.
 * No external CLI (sqlite3) dependency — works on any server.
 * Parses the SQL dump and executes statements via Prisma.
 */

/**
 * Split a SQL string into individual statements,
 * respecting single-quoted strings that may contain semicolons.
 */
function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inString = false;
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];

    if (inString) {
      current += ch;
      if (ch === "'") {
        // Check for escaped quote ('')
        if (i + 1 < sql.length && sql[i + 1] === "'") {
          current += sql[i + 1];
          i += 2;
          continue;
        }
        inString = false;
      }
    } else if (ch === "'") {
      inString = true;
      current += ch;
    } else if (ch === '-') {
      // Line comment: skip until end of line
      if (i + 1 < sql.length && sql[i + 1] === '-') {
        // Find end of line
        const endOfLine = sql.indexOf('\n', i);
        if (endOfLine === -1) break; // Rest is comment
        i = endOfLine + 1;
        continue;
      }
      current += ch;
    } else if (ch === ';') {
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        statements.push(trimmed);
      }
      current = '';
    } else {
      current += ch;
    }

    i++;
  }

  // Handle last statement without trailing semicolon
  const trimmed = current.trim();
  if (trimmed.length > 0) {
    statements.push(trimmed);
  }

  return statements;
}

/** Categories of SQL statements */
function getStatementType(stmt: string): 'ddl' | 'dml' | 'tx' | 'other' {
  const upper = stmt.trimStart().toUpperCase();
  if (upper.startsWith('CREATE') || upper.startsWith('DROP') || upper.startsWith('ALTER') || upper.startsWith('INDEX')) return 'ddl';
  if (upper.startsWith('INSERT') || upper.startsWith('UPDATE') || upper.startsWith('DELETE')) return 'dml';
  if (upper.startsWith('BEGIN') || upper.startsWith('COMMIT') || upper.startsWith('ROLLBACK')) return 'tx';
  return 'other';
}

export async function POST(request: NextRequest) {
  try {
    // ── Auth: Super Admin only ────────────────────────────────────────
    const auth = await authenticateRequest(request);
    if (!auth || !requireSuperAdmin(auth)) {
      return NextResponse.json(
        { error: 'Unauthorized. Super Admin access required.' },
        { status: 401 }
      );
    }

    // ── Parse FormData ────────────────────────────────────────────────
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded. Please provide an .sql file.' },
        { status: 400 }
      );
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
    const dbPath = path.join(process.cwd(), 'db', 'custom.db');

    // ── SAFETY: Auto-backup current database before restore ───────────
    const timestamp = formatFileTimestamp(new Date());
    const preRestoreBackupPath = path.join(path.dirname(dbPath), `custom.db.pre-restore-${timestamp}`);

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

    // ── Read uploaded SQL file ─────────────────────────────────────────
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const sqlContent = fileBuffer.toString('utf-8');

    // ── Parse SQL statements ──────────────────────────────────────────
    const statements = splitSqlStatements(sqlContent);
    console.log(`[restore] Parsed ${statements.length} SQL statements from uploaded file`);

    if (statements.length === 0) {
      return NextResponse.json(
        { error: 'No SQL statements found in the uploaded file.' },
        { status: 400 }
      );
    }

    // ── Execute statements sequentially via Prisma ────────────────────
    let executed = 0;
    let ddlCount = 0;
    let dmlCount = 0;
    const errors: string[] = [];

    try {
      for (const stmt of statements) {
        const stmtType = getStatementType(stmt);

        try {
          if (stmtType === 'tx') {
            // Handle transaction markers — Prisma manages its own transactions
            // Just skip BEGIN/COMMIT/ROLLBACK
            executed++;
          } else {
            await db.$executeRawUnsafe(stmt);
            if (stmtType === 'ddl') ddlCount++;
            if (stmtType === 'dml') dmlCount++;
            executed++;
          }
        } catch (stmtErr) {
          const errMsg = stmtErr instanceof Error ? stmtErr.message : String(stmtErr);
          console.error(`[restore] Statement failed (#${executed + 1}): ${errMsg}`);
          console.error(`[restore] Statement: ${stmt.substring(0, 200)}...`);
          errors.push(`Statement #${executed + 1}: ${errMsg}`);
        }
      }
    } catch (execErr) {
      console.error('[restore] Execution error:', execErr);
      // Attempt recovery
      try {
        if (fs.existsSync(preRestoreBackupPath)) {
          fs.copyFileSync(preRestoreBackupPath, dbPath);
          console.log('[restore] Recovered database from pre-restore backup.');
        }
      } catch (recoveryErr) {
        console.error('[restore] Recovery also failed:', recoveryErr);
      }
      return NextResponse.json(
        {
          error: 'Database restore failed during execution.',
          details: errors,
          executed,
        },
        { status: 500 }
      );
    }

    // ── Summary ───────────────────────────────────────────────────────
    const success = executed === statements.length && errors.length === 0;

    return NextResponse.json({
      success,
      message: success
        ? 'Database restored successfully.'
        : `Restore completed with ${errors.length} errors.`,
      stats: {
        totalStatements: statements.length,
        executed,
        ddlStatements: ddlCount,
        dmlStatements: dmlCount,
        errors: errors.length,
      },
      errors: errors.length > 0 ? errors : undefined,
      preRestoreBackup: preRestoreBackupPath,
    });
  } catch (error) {
    console.error('[POST /api/admin/backup/restore]', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to restore database: ${message}` },
      { status: 500 }
    );
  }
}