import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, requireSuperAdmin } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import path from 'path';
import { existsSync } from 'fs';

/**
 * Pure TypeScript SQLite dump generator.
 * No external CLI (sqlite3) dependency — works on any server.
 * Automatically discovers all tables from sqlite_master and
 * dumps CREATE TABLE + INSERT statements.
 */

interface SqliteMasterRow {
  name: string;
  sql: string | null;
  type: string;
}

/** Escape a value for SQL INSERT statement */
function sqlEscape(val: unknown): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number' || typeof val === 'bigint') return String(val);
  if (typeof val === 'number' && isNaN(val as number)) return '0';
  if (val instanceof Date) {
    // ISO string in single quotes
    return `'${val.toISOString().replace(/'/g, "''")}'`;
  }
  if (typeof val === 'string') {
    // Escape single quotes by doubling them
    const escaped = val.replace(/'/g, "''");
    return `'${escaped}'`;
  }
  if (Buffer.isBuffer(val)) {
    // BLOB → hex literal
    return `X'${val.toString('hex')}'`;
  }
  // Fallback: JSON stringify + escape
  const str = JSON.stringify(val).replace(/'/g, "''");
  return `'${str}'`;
}

/** Generate INSERT INTO ... VALUES (...) for all rows of a table */
async function dumpTableData(tableName: string): Promise<string> {
  const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT * FROM "${tableName}"`
  );

  if (!rows || rows.length === 0) return '';

  const lines: string[] = [];

  for (const row of rows) {
    const columns = Object.keys(row);
    const values = columns.map((col) => sqlEscape(row[col]));
    // Use multi-row INSERT for efficiency, but single-row for safety with large data
    lines.push(`INSERT INTO "${tableName}" ("${columns.join('", "')}") VALUES (${values.join(', ')});`);
  }

  return lines.join('\n');
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

    // ── Verify database file exists ──────────────────────────────────
    const dbPath = path.join(process.cwd(), 'db', 'custom.db');
    if (!existsSync(dbPath)) {
      return NextResponse.json(
        { error: 'Database file not found.' },
        { status: 404 }
      );
    }

    // ── Generate timestamp for filename ───────────────────────────────
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:T]/g, '')
      .slice(0, 15);
    const filename = `recruitpro-db-backup-${timestamp}.sql`;

    // ── Step 1: Get all table schemas from sqlite_master ─────────────
    const tables = await db.$queryRawUnsafe<SqliteMasterRow[]>(
      `SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
    );

    if (!tables || tables.length === 0) {
      return NextResponse.json(
        { error: 'No tables found in database.' },
        { status: 500 }
      );
    }

    // ── Step 2: Build SQL dump ───────────────────────────────────────
    const dumpLines: string[] = [];

    // Header
    dumpLines.push(`-- RecruitPro Database Backup`);
    dumpLines.push(`-- Generated: ${new Date().toISOString()}`);
    dumpLines.push(`-- Tables: ${tables.length}`);
    dumpLines.push(`--`);
    dumpLines.push(`BEGIN TRANSACTION;`);
    dumpLines.push('');

    for (const table of tables) {
      // CREATE TABLE statement
      if (table.sql) {
        dumpLines.push(`-- Table: ${table.name}`);
        dumpLines.push(`DROP TABLE IF EXISTS "${table.name}";`);
        dumpLines.push(`${table.sql};`);
        dumpLines.push('');
      }

      // INSERT data
      const insertStatements = await dumpTableData(table.name);
      if (insertStatements) {
        dumpLines.push(`-- Data: ${table.name}`);
        dumpLines.push(insertStatements);
        dumpLines.push('');
      }
    }

    // Also dump indexes
    const indexes = await db.$queryRawUnsafe<SqliteMasterRow[]>(
      `SELECT name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY name`
    );
    if (indexes && indexes.length > 0) {
      dumpLines.push(`-- Indexes`);
      for (const idx of indexes) {
        if (idx.sql) {
          dumpLines.push(`DROP INDEX IF EXISTS "${idx.name}";`);
          dumpLines.push(`${idx.sql};`);
        }
      }
      dumpLines.push('');
    }

    dumpLines.push('COMMIT;');
    dumpLines.push('');
    dumpLines.push(`-- Backup complete. ${tables.length} tables backed up.`);

    const sqlDump = dumpLines.join('\n');

    if (sqlDump.trim().length === 0) {
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
        'Content-Length': String(Buffer.byteLength(sqlDump, 'utf-8')),
      },
    });
  } catch (error) {
    console.error('[POST /api/admin/backup/database]', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to generate database backup: ${message}` },
      { status: 500 }
    );
  }
}