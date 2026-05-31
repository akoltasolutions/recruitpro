import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, requireSuperAdmin } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { hash } from 'bcryptjs';
import crypto from 'crypto';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    // ── Auth: Super Admin only ────────────────────────────────────────
    const auth = await authenticateRequest(request);
    if (!auth || !requireSuperAdmin(auth)) {
      return NextResponse.json({ error: 'Unauthorized. Super Admin access required.' }, { status: 401 });
    }

    // ── Query params ──────────────────────────────────────────────────
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'preview';

    // ── Parse FormData ────────────────────────────────────────────────
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
    }

    // ── Validate file type ────────────────────────────────────────────
    const originalName = file.name.toLowerCase();
    const isCSV = originalName.endsWith('.csv');
    const isExcel = originalName.endsWith('.xlsx') || originalName.endsWith('.xls');

    if (!isCSV && !isExcel) {
      return NextResponse.json({ error: 'Invalid file type. Only .csv, .xlsx, and .xls files are accepted.' }, { status: 400 });
    }

    // ── Read file buffer ──────────────────────────────────────────────
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // ── Parse file to get rows ────────────────────────────────────────
    let rows: Record<string, string>[];
    let headers: string[];

    if (isCSV) {
      const Papa = await import('papaparse');
      const parseResult = Papa.default.parse(fileBuffer.toString('utf-8'), {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h: string) => h.trim(),
      });
      headers = parseResult.meta.fields || [];
      rows = parseResult.data as Record<string, string>[];
    } else {
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.default.Workbook();
      await workbook.xlsx.load(fileBuffer);

      const worksheet = workbook.worksheets[0];
      if (!worksheet || worksheet.rowCount === 0) {
        return NextResponse.json({ error: 'The Excel file appears to be empty.' }, { status: 400 });
      }

      // Read header row
      const headerRow = worksheet.getRow(1);
      headers = [];
      headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        headers[colNumber] = String(cell.value || '').trim();
      });
      // Remove undefined gaps
      headers = headers.filter(Boolean);

      // Read data rows
      rows = [];
      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header row
        const rowData: Record<string, string> = {};
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          rowData[headers[colNumber - 1] || `col_${colNumber}`] = String(cell.value || '').trim();
        });
        rows.push(rowData);
      });
    }

    if (headers.length === 0 || rows.length === 0) {
      return NextResponse.json({ error: 'No data found in the file.' }, { status: 400 });
    }

    // ── Preview mode: return column headers and sample data ──────────
    if (action === 'preview') {
      const sampleRows = rows.slice(0, 3);
      return NextResponse.json({
        success: true,
        action: 'preview',
        totalRows: rows.length,
        headers,
        sampleData: sampleRows,
      });
    }

    // ── Import mode ───────────────────────────────────────────────────
    if (action === 'import') {
      // Get column mapping from form data
      const mappingJson = formData.get('mapping') as string | null;
      if (!mappingJson) {
        return NextResponse.json({ error: 'No column mapping provided.' }, { status: 400 });
      }

      let mapping: Record<string, string>;
      try {
        mapping = JSON.parse(mappingJson);
      } catch {
        return NextResponse.json({ error: 'Invalid column mapping format.' }, { status: 400 });
      }

      // Target fields we support
      const supportedFields = ['name', 'email', 'phone', 'role', 'designation', 'department', 'organization'];

      // Get all organizations and departments for lookup
      const organizations = await db.organization.findMany({
        select: { id: true, name: true },
      });
      const departments = await db.department.findMany({
        select: { id: true, name: true },
      });

      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        try {
          // Map fields from source columns
          const name = getMappedField(row, mapping, 'name');
          const email = getMappedField(row, mapping, 'email')?.toLowerCase();
          const phone = getMappedField(row, mapping, 'phone');
          const role = getMappedField(row, mapping, 'role') || 'USER';
          const designation = getMappedField(row, mapping, 'designation');
          const departmentName = getMappedField(row, mapping, 'department');
          const organizationName = getMappedField(row, mapping, 'organization');

          // Skip if no email or name
          if (!email || !name) {
            skipped++;
            continue;
          }

          // Check for duplicate email
          const existing = await db.user.findUnique({ where: { email } });
          if (existing) {
            skipped++;
            errors.push(`Row ${i + 1}: Email "${email}" already exists.`);
            continue;
          }

          // Resolve organization
          let organizationId: string | null = null;
          if (organizationName) {
            const org = organizations.find(
              (o) => o.name.toLowerCase() === organizationName.toLowerCase()
            );
            organizationId = org?.id || null;
          }

          // Resolve department
          let departmentId: string | null = null;
          if (departmentName) {
            const dept = departments.find(
              (d) => d.name.toLowerCase() === departmentName.toLowerCase()
            );
            departmentId = dept?.id || null;
          }

          // Normalize role
          const normalizedRole = ['super_admin', 'org_admin', 'user'].includes(role.toLowerCase())
            ? role.toUpperCase()
            : 'USER';

          // Auto-generate password (random 12 chars)
          const rawPassword = crypto.randomBytes(6).toString('hex'); // 12 chars
          const hashedPassword = await hash(rawPassword, 10);

          await db.user.create({
            data: {
              email,
              name,
              phone: phone || null,
              role: normalizedRole,
              password: hashedPassword,
              designation: designation || null,
              isActive: true,
              organizationId,
              departmentId,
            },
          });

          imported++;
        } catch (err) {
          skipped++;
          errors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }

      return NextResponse.json({
        success: true,
        action: 'import',
        imported,
        skipped,
        totalRows: rows.length,
        errors: errors.slice(0, 50), // Limit error messages
      });
    }

    return NextResponse.json({ error: 'Invalid action. Use "preview" or "import".' }, { status: 400 });
  } catch (error) {
    console.error('[POST /api/admin/backup/import-users]', error);
    return NextResponse.json(
      { error: 'Failed to process import. ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    );
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function getMappedField(
  row: Record<string, string>,
  mapping: Record<string, string>,
  targetField: string
): string | null {
  const sourceColumn = mapping[targetField];
  if (!sourceColumn || sourceColumn === '__skip__') return null;
  return row[sourceColumn]?.trim() || null;
}
