import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, requireOrgAdmin } from '@/lib/auth-middleware';
import * as XLSX from 'xlsx';
import { startOfDay, endOfDay } from 'date-fns';
import { formatDateTimeExport } from '@/lib/formatters';

/**
 * GET /api/export-calls
 * Export call records to Excel.
 * 
 * FIX (2026-06-02):
 * - Uses startOfDay/endOfDay from date-fns for proper timezone-aware date filtering.
 * - Added organizationId scoping for multi-tenant data isolation.
 */
export async function GET(request: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────
    const auth = await authenticateRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Query Params ──────────────────────────────────────────────────
    const { searchParams } = new URL(request.url);
    let recruiterId = searchParams.get('recruiterId');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    // ── Role-based access ─────────────────────────────────────────────
    if (!requireOrgAdmin(auth)) {
      // Non-admin users can only export their own data — ignore any passed recruiterId
      recruiterId = auth.userId;
    }

    // ── Build where clause ────────────────────────────────────────────
    const where: Record<string, unknown> = {
      callStatus: 'COMPLETED',
    };

    // Organization scoping
    if (auth.organizationId) {
      where.organizationId = auth.organizationId;
    }

    if (recruiterId) {
      where.recruiterId = recruiterId;
    }

    // FIX: Use startOfDay/endOfDay for proper timezone-aware date filtering
    if (dateFrom || dateTo) {
      where.calledAt = {};
      if (dateFrom) {
        (where.calledAt as Record<string, unknown>).gte = startOfDay(new Date(dateFrom + 'T00:00:00'));
      }
      if (dateTo) {
        (where.calledAt as Record<string, unknown>).lte = endOfDay(new Date(dateTo + 'T00:00:00'));
      }
    }

    console.log('[ExportCalls] Query where:', JSON.stringify(where));

    // ── Fetch records ─────────────────────────────────────────────────
    const callRecords = await db.callRecord.findMany({
      where,
      include: {
        candidate: {
          select: { name: true, phone: true, role: true, location: true },
        },
        disposition: {
          select: { heading: true },
        },
        recruiter: {
          select: { name: true },
        },
      },
      orderBy: { calledAt: 'desc' },
      take: 100000, // safety limit: cap at 100K records
    });

    if (callRecords.length === 0) {
      // Return a meaningful message instead of an empty file
      return NextResponse.json(
        { error: 'No completed call records found for the given filters.' },
        { status: 404 },
      );
    }

    // ── Build worksheet data ──────────────────────────────────────────
    const rows = callRecords.map((record) => ({
      'Candidate Name': record.candidate?.name ?? '',
      'Phone Number': record.candidate?.phone ?? '',
      'Job Role': record.candidate?.role ?? '',
      'Location': record.candidate?.location ?? '',
      'Call Status': record.disposition?.heading ?? '',
      'Notes': record.notes ?? '',
      'Call Date & Time': record.calledAt
        ? formatDateTimeExport(record.calledAt)
        : '',
      'Recruiter Name': record.recruiter?.name ?? '',
    }));

    // ── Generate Excel workbook ───────────────────────────────────────
    const worksheet = XLSX.utils.json_to_sheet(rows);

    // Set reasonable column widths
    worksheet['!cols'] = [
      { wch: 25 }, // Candidate Name
      { wch: 18 }, // Phone Number
      { wch: 25 }, // Job Role
      { wch: 20 }, // Location
      { wch: 22 }, // Call Status (Disposition)
      { wch: 40 }, // Notes
      { wch: 22 }, // Call Date & Time
      { wch: 22 }, // Recruiter Name
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Calling Report');

    // Write to buffer (xlsx returns a Buffer in Node.js)
    const buffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
    });

    // ── Build filename ────────────────────────────────────────────────
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const filename = `Calling_Report_${today}.xlsx`;

    // ── Return as downloadable file ───────────────────────────────────
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buffer.length),
      },
    });
  } catch (error) {
    console.error('[ExportCalls] Export failed:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}


