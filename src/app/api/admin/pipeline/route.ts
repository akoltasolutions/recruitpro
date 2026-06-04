import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, requireOrgAdmin } from '@/lib/auth-middleware';
import { formatDateTimeExport } from '@/lib/formatters';

// ── Valid pipeline stages (admin view excludes NEW) ──────────────────────
const ADMIN_STAGES = ['SHORTLISTED', 'FOLLOW_UP', 'INTERVIEWED', 'JOINED', 'BACKOUT'] as const;
const VALID_UPDATE_STAGES = ['NEW', ...ADMIN_STAGES];

// ── Date quick-range helpers ─────────────────────────────────────────────

function getQuickDateRange(quick: string): { from: Date; to: Date } | null {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (quick) {
    case 'today':
      return { from: todayStart, to: now };

    case 'yesterday': {
      const start = new Date(todayStart);
      start.setDate(start.getDate() - 1);
      const end = new Date(todayStart.getTime() - 1); // 23:59:59.999 of yesterday
      return { from: start, to: end };
    }

    case '7d': {
      const start = new Date(todayStart);
      start.setDate(start.getDate() - 7);
      return { from: start, to: now };
    }

    case '15d': {
      const start = new Date(todayStart);
      start.setDate(start.getDate() - 15);
      return { from: start, to: now };
    }

    case '30d': {
      const start = new Date(todayStart);
      start.setDate(start.getDate() - 30);
      return { from: start, to: now };
    }

    case 'month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: start, to: now };
    }

    default:
      return null;
  }
}

// ── CSV helpers ──────────────────────────────────────────────────────────

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatDateIso(date: Date): string {
  return date.toISOString();
}

function formatDateTimeReadable(date: Date): string {
  return formatDateTimeExport(date);
}

// ── GET /api/admin/pipeline ─────────────────────────────────────────────
// Returns paginated candidates for the admin pipeline view with filters,
// stage counts, and optional CSV/XLSX export.

export async function GET(request: NextRequest) {
  try {
    // ── Auth: SUPER_ADMIN or ORG_ADMIN ──────────────────────────────────
    const auth = await authenticateRequest(request);
    if (!auth || !requireOrgAdmin(auth)) {
      return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 401 });
    }

    // ── Parse query params ──────────────────────────────────────────────
    const { searchParams } = new URL(request.url);
    const stage = searchParams.get('stage') || '';
    const search = searchParams.get('search') || '';
    const dateFrom = searchParams.get('dateFrom') || '';
    const dateTo = searchParams.get('dateTo') || '';
    const dateQuick = searchParams.get('dateQuick') || '';
    const recruiterId = searchParams.get('recruiterId') || '';
    const organizationId = searchParams.get('organizationId') || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const exportFormat = searchParams.get('export') || '';

    // ── Build where clause ──────────────────────────────────────────────
    const where: Record<string, unknown> = {};

    // Organization scoping
    if (auth.role === 'ORG_ADMIN') {
      // ORG_ADMIN can only see their own organization
      where.organizationId = auth.organizationId;
    } else if (organizationId) {
      // SUPER_ADMIN can optionally filter by a specific org
      where.organizationId = organizationId;
    }

    // Pipeline stage filter (admin view excludes NEW unless stage=ALL)
    if (stage && stage !== 'ALL') {
      if (!ADMIN_STAGES.includes(stage as typeof ADMIN_STAGES[number])) {
        return NextResponse.json(
          { error: `Invalid stage. Must be one of: ${ADMIN_STAGES.join(', ')}, ALL` },
          { status: 400 },
        );
      }
      where.pipelineStage = stage;
    } else {
      // Default: exclude NEW stage for admin pipeline view
      where.pipelineStage = { not: 'NEW' };
    }

    // Search filter (across name, phone, email, notes)
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { phone: { contains: search } },
        { email: { contains: search } },
        { notes: { contains: search } },
      ];
    }

    // Date range filter (dateQuick overrides dateFrom/dateTo)
    if (dateQuick) {
      const range = getQuickDateRange(dateQuick);
      if (range) {
        where.updatedAt = { gte: range.from, lte: range.to };
      }
    } else if (dateFrom || dateTo) {
      const dateFilter: Record<string, unknown> = {};
      if (dateFrom) dateFilter.gte = new Date(dateFrom);
      if (dateTo) dateFilter.lte = new Date(dateTo);
      if (Object.keys(dateFilter).length > 0) {
        where.updatedAt = dateFilter;
      }
    }

    // Recruiter filter — match candidates whose call list is assigned to this recruiter
    if (recruiterId) {
      (where as Record<string, Record<string, unknown>>).callList = {
        assignments: { some: { recruiterId } },
      };
    }

    // ── Fetch candidates (paginated) ─────────────────────────────────────
    const [candidates, totalCount] = await Promise.all([
      db.candidate.findMany({
        where,
        include: {
          organization: { select: { id: true, name: true } },
          callList: {
            select: {
              id: true,
              name: true,
              assignments: {
                select: {
                  recruiterId: true,
                  recruiter: { select: { id: true, name: true } },
                },
                take: 1,
                orderBy: { assignedAt: 'asc' },
              },
            },
          },
          callRecords: {
            orderBy: { calledAt: 'desc' },
            take: 1,
            select: {
              calledAt: true,
              disposition: { select: { heading: true, type: true } },
              client: { select: { name: true } },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.candidate.count({ where }),
    ]);

    // ── Get total call counts for fetched candidates ────────────────────
    const candidateIds = candidates.map((c) => c.id);
    let callCountMap = new Map<string, number>();

    if (candidateIds.length > 0) {
      const callCounts = await db.callRecord.groupBy({
        by: ['candidateId'],
        where: { candidateId: { in: candidateIds } },
        _count: true,
      });
      callCountMap = new Map(callCounts.map((cc) => [cc.candidateId, cc._count]));
    }

    // ── Get stage counts (scoped to same filters but without stage filter) ─
    const stageCountWhere: Record<string, unknown> = { ...where };
    // Remove stage filter to get counts for all stages
    delete stageCountWhere.pipelineStage;

    const stageCountsResult = await db.candidate.groupBy({
      by: ['pipelineStage'],
      where: stageCountWhere,
      _count: true,
    });

    const stageCounts: Record<string, number> = {};
    for (const s of ADMIN_STAGES) {
      stageCounts[s] = 0;
    }
    for (const sc of stageCountsResult) {
      if (sc.pipelineStage !== 'NEW' && sc.pipelineStage in stageCounts) {
        stageCounts[sc.pipelineStage] = sc._count;
      }
    }

    // ── Transform candidates to flat response shape ─────────────────────
    const flatCandidates = candidates.map((c) => {
      const lastCall = c.callRecords[0] || null;
      const assignment = c.callList?.assignments?.[0] || null;

      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        role: c.role,
        location: c.location,
        company: c.company,
        notes: c.notes,
        remarks: c.remarks,
        status: c.status,
        pipelineStage: c.pipelineStage,
        followUpDate: c.followUpDate ? formatDateIso(c.followUpDate) : null,
        interviewDate: c.interviewDate ? formatDateIso(c.interviewDate) : null,
        joinedDate: c.joinedDate ? formatDateIso(c.joinedDate) : null,
        backoutReason: c.backoutReason,
        lastDisposition: lastCall?.disposition?.heading ?? null,
        lastDispositionType: lastCall?.disposition?.type ?? null,
        clientName: lastCall?.client?.name ?? null,
        recruiterName: assignment?.recruiter?.name ?? null,
        recruiterId: assignment?.recruiterId ?? null,
        organizationName: c.organization?.name ?? null,
        organizationId: c.organization?.id ?? null,
        callListName: c.callList?.name ?? null,
        createdAt: formatDateIso(c.createdAt),
        updatedAt: formatDateIso(c.updatedAt),
        totalCalls: callCountMap.get(c.id) || 0,
        latestCallAt: lastCall?.calledAt ? formatDateIso(lastCall.calledAt) : null,
      };
    });

    // ── Handle CSV/XLSX export ──────────────────────────────────────────
    if (exportFormat === 'csv' || exportFormat === 'xlsx') {
      return handleExport(flatCandidates, exportFormat);
    }

    // ── Return paginated JSON response ───────────────────────────────────
    const totalPages = Math.ceil(totalCount / limit);

    return NextResponse.json({
      candidates: flatCandidates,
      counts: stageCounts,
      totalCount,
      page,
      totalPages,
    });
  } catch (error) {
    console.error('[GET /api/admin/pipeline]', error);
    return NextResponse.json({ error: 'Failed to fetch pipeline data' }, { status: 500 });
  }
}

// ── PATCH /api/admin/pipeline ────────────────────────────────────────────
// Update candidate pipeline fields. SUPER_ADMIN can edit any candidate;
// ORG_ADMIN can only edit candidates in their organization.

export async function PATCH(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth || !requireOrgAdmin(auth)) {
      return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 401 });
    }

    const body = await request.json();
    const {
      candidateId,
      pipelineStage,
      followUpDate,
      interviewDate,
      joinedDate,
      backoutReason,
      notes,
      remarks,
      status,
    } = body as {
      candidateId?: string;
      pipelineStage?: string;
      followUpDate?: string | null;
      interviewDate?: string | null;
      joinedDate?: string | null;
      backoutReason?: string | null;
      notes?: string | null;
      remarks?: string | null;
      status?: string | null;
    };

    if (!candidateId) {
      return NextResponse.json({ error: 'candidateId is required' }, { status: 400 });
    }

    // ── Ownership check for ORG_ADMIN ────────────────────────────────────
    if (auth.role === 'ORG_ADMIN') {
      const candidate = await db.candidate.findUnique({
        where: { id: candidateId },
        select: { organizationId: true },
      });
      if (!candidate) {
        return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
      }
      if (candidate.organizationId !== auth.organizationId) {
        return NextResponse.json(
          { error: 'Access denied: candidate is not in your organization' },
          { status: 403 },
        );
      }
    }

    // ── Validate and build update data ──────────────────────────────────
    const updateData: Record<string, unknown> = {};

    if (pipelineStage !== undefined) {
      if (!VALID_UPDATE_STAGES.includes(pipelineStage)) {
        return NextResponse.json(
          { error: `Invalid pipeline stage. Must be one of: ${VALID_UPDATE_STAGES.join(', ')}` },
          { status: 400 },
        );
      }
      updateData.pipelineStage = pipelineStage;
    }

    if (followUpDate !== undefined) {
      updateData.followUpDate = followUpDate ? new Date(followUpDate) : null;
    }

    if (interviewDate !== undefined) {
      updateData.interviewDate = interviewDate ? new Date(interviewDate) : null;
    }

    if (joinedDate !== undefined) {
      updateData.joinedDate = joinedDate ? new Date(joinedDate) : null;
    }

    if (backoutReason !== undefined) {
      updateData.backoutReason = backoutReason;
    }

    if (notes !== undefined) {
      updateData.notes = notes;
    }

    if (remarks !== undefined) {
      updateData.remarks = remarks;
    }

    if (status !== undefined) {
      const validStatuses = ['PENDING', 'DONE', 'SCHEDULED', 'SKIPPED'];
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
          { status: 400 },
        );
      }
      updateData.status = status;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    // ── Update candidate ─────────────────────────────────────────────────
    const updatedCandidate = await db.candidate.update({
      where: { id: candidateId },
      data: updateData,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        status: true,
        pipelineStage: true,
        followUpDate: true,
        interviewDate: true,
        joinedDate: true,
        backoutReason: true,
        notes: true,
        remarks: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ candidate: updatedCandidate });
  } catch (error) {
    console.error('[PATCH /api/admin/pipeline]', error);
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('Record to update not found')) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to update candidate' }, { status: 500 });
  }
}

// ── Export handler ───────────────────────────────────────────────────────

async function handleExport(
  candidates: PipelineExportRow[],
  format: string,
) {
  const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  if (format === 'csv') {
    const headers = [
      'Candidate', 'Phone', 'Email', 'Role', 'Location', 'Company',
      'Stage', 'Disposition', 'Client', 'Recruiter', 'Organization',
      'Notes', 'Remarks', 'Follow-up Date', 'Last Call', 'Total Calls',
      'Created At', 'Updated At',
    ];

    const rows = candidates.map((c) =>
      [
        c.name,
        c.phone,
        c.email,
        c.role,
        c.location,
        c.company,
        c.pipelineStage,
        c.lastDisposition,
        c.clientName,
        c.recruiterName,
        c.organizationName,
        c.notes,
        c.remarks,
        c.followUpDate,
        c.latestCallAt,
        String(c.totalCalls),
        c.createdAt,
        c.updatedAt,
      ].map((v) => escapeCsvField(v || ''))
        .join(',')
    );

    const csvContent = [headers.join(','), ...rows].join('\n');

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="pipeline-export-${timestamp}.csv"`,
        'Content-Length': String(Buffer.byteLength(csvContent)),
      },
    });
  }

  // XLSX export
  if (format === 'xlsx') {
    const XLSX = await import('xlsx');

    const rows = candidates.map((c) => ({
      'Candidate': c.name || '',
      'Phone': c.phone || '',
      'Email': c.email || '',
      'Role': c.role || '',
      'Location': c.location || '',
      'Company': c.company || '',
      'Stage': c.pipelineStage || '',
      'Disposition': c.lastDisposition || '',
      'Client': c.clientName || '',
      'Recruiter': c.recruiterName || '',
      'Organization': c.organizationName || '',
      'Notes': c.notes || '',
      'Remarks': c.remarks || '',
      'Follow-up Date': c.followUpDate
        ? formatDateTimeReadable(new Date(c.followUpDate))
        : '',
      'Last Call': c.latestCallAt
        ? formatDateTimeReadable(new Date(c.latestCallAt))
        : '',
      'Total Calls': c.totalCalls,
      'Created At': c.createdAt
        ? formatDateTimeReadable(new Date(c.createdAt))
        : '',
      'Updated At': c.updatedAt
        ? formatDateTimeReadable(new Date(c.updatedAt))
        : '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);

    // Set column widths
    worksheet['!cols'] = [
      { wch: 25 }, // Candidate
      { wch: 18 }, // Phone
      { wch: 25 }, // Email
      { wch: 20 }, // Role
      { wch: 18 }, // Location
      { wch: 20 }, // Company
      { wch: 14 }, // Stage
      { wch: 20 }, // Disposition
      { wch: 18 }, // Client
      { wch: 20 }, // Recruiter
      { wch: 22 }, // Organization
      { wch: 35 }, // Notes
      { wch: 35 }, // Remarks
      { wch: 18 }, // Follow-up Date
      { wch: 20 }, // Last Call
      { wch: 12 }, // Total Calls
      { wch: 20 }, // Created At
      { wch: 20 }, // Updated At
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Pipeline');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="pipeline-export-${timestamp}.xlsx"`,
        'Content-Length': String(buffer.length),
      },
    });
  }

  // Fallback — should not reach here due to early check
  return NextResponse.json({ error: 'Invalid export format' }, { status: 400 });
}

// ── Pipeline candidate export row type ────────────────────────────────────

type PipelineExportRow = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  role: string | null;
  location: string | null;
  company: string | null;
  notes: string | null;
  remarks: string | null;
  status: string;
  pipelineStage: string;
  followUpDate: string | null;
  interviewDate: string | null;
  joinedDate: string | null;
  backoutReason: string | null;
  lastDisposition: string | null;
  lastDispositionType: string | null;
  clientName: string | null;
  recruiterName: string | null;
  recruiterId: string | null;
  organizationName: string | null;
  organizationId: string | null;
  callListName: string | null;
  createdAt: string;
  updatedAt: string;
  totalCalls: number;
  latestCallAt: string | null;
};
