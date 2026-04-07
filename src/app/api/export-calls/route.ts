import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth-middleware';
import * as XLSX from 'xlsx';

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
    if (auth.role === 'RECRUITER') {
      // Recruiters can only export their own data — ignore any passed recruiterId
      recruiterId = auth.userId;
    }

    // ── Build where clause ────────────────────────────────────────────
    const where: Record<string, unknown> = {
      callStatus: 'COMPLETED',
    };

    if (recruiterId) {
      where.recruiterId = recruiterId;
    }

    if (dateFrom || dateTo) {
      where.calledAt = {};
      if (dateFrom) {
        (where.calledAt as Record<string, unknown>).gte = new Date(dateFrom);
      }
      if (dateTo) {
        // Include the entire end day by setting to 23:59:59.999
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        (where.calledAt as Record<string, unknown>).lte = toDate;
      }
    }

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
        ? formatDateTime(record.calledAt)
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
    console.error('[export-calls] Export failed:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Format a Date to a human-readable date-time string suitable for Excel.
 * Output: "YYYY-MM-DD hh:mm:ss AM/PM"
 */
function formatDateTime(date: Date): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  let hours = d.getHours();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${String(hours).padStart(2, '0')}:${minutes}:${seconds} ${ampm}`;
}
