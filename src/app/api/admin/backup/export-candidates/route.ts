import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, requireSuperAdmin } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { formatDateTimeExport } from '@/lib/formatters';

export async function GET(request: NextRequest) {
  try {
    // ── Auth: Super Admin only ────────────────────────────────────────
    const auth = await authenticateRequest(request);
    if (!auth || !requireSuperAdmin(auth)) {
      return NextResponse.json({ error: 'Unauthorized. Super Admin access required.' }, { status: 401 });
    }

    // ── Query params ──────────────────────────────────────────────────
    const { searchParams } = new URL(request.url);
    const format = (searchParams.get('format') || 'csv').toLowerCase();

    if (format !== 'csv' && format !== 'excel') {
      return NextResponse.json({ error: 'Invalid format. Use "csv" or "excel".' }, { status: 400 });
    }

    // ── Fetch all candidates with relations ───────────────────────────
    const candidates = await db.candidate.findMany({
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        role: true,
        location: true,
        company: true,
        notes: true,
        status: true,
        pipelineStage: true,
        createdAt: true,
        callList: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100000, // safety limit: cap at 100K records
    });

    // ── Build rows ────────────────────────────────────────────────────
    const rows = candidates.map((candidate) => ({
      Name: candidate.name || '',
      Phone: candidate.phone || '',
      Email: candidate.email || '',
      'Job Role': candidate.role || '',
      Location: candidate.location || '',
      Company: candidate.company || '',
      Status: candidate.status || 'PENDING',
      'Call List': candidate.callList?.name || '',
      'Pipeline Stage': candidate.pipelineStage || 'NEW',
      'Created Date': formatDateTimeExport(candidate.createdAt),
      Notes: candidate.notes || '',
    }));

    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);

    // ── CSV format ─────────────────────────────────────────────────────
    if (format === 'csv') {
      const Papa = await import('papaparse');
      const csvOutput = Papa.default.unparse(rows);

      return new NextResponse(csvOutput, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="recruitpro-candidates-${timestamp}.csv"`,
          'Content-Length': String(Buffer.byteLength(csvOutput)),
        },
      });
    }

    // ── Excel format ───────────────────────────────────────────────────
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.default.Workbook();
    const worksheet = workbook.addWorksheet('Candidates');

    // Add header row
    const headers = Object.keys(rows[0] || {});
    worksheet.columns = headers.map((h) => ({
      header: h,
      key: h,
      width: h.length > 15 ? 25 : 18,
    }));

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE5E7EB' },
    };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
    headerRow.height = 22;

    // Add data rows
    rows.forEach((row) => worksheet.addRow(row));

    // Auto-fit column widths loosely
    worksheet.columns.forEach((column, i) => {
      const maxLen = Math.max(
        String(headers[i]).length,
        ...rows.map((r) => String(Object.values(r)[i] || '').length)
      );
      column.width = Math.min(Math.max(maxLen + 2, 12), 40);
    });

    // Write to buffer
    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="recruitpro-candidates-${timestamp}.xlsx"`,
        'Content-Length': String(buffer.byteLength),
      },
    });
  } catch (error) {
    console.error('[GET /api/admin/backup/export-candidates]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


