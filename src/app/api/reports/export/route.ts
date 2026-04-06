import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, requireAdmin } from '@/lib/auth-middleware';
import ExcelJS from 'exceljs';

// ---------------------------------------------------------------------------
// GET /api/reports/export?dateFrom=...&dateTo=...&format=json
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!requireAdmin(auth.role)) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const dateFromStr = searchParams.get('dateFrom');
    const dateToStr = searchParams.get('dateTo');

    // ── IST helpers (all inline to avoid Turbopack TDZ) ──────────
    const offsetMs = 19_800_000; // 5.5h in ms

    const toIST = (d: Date) => new Date(d.getTime() + offsetMs);
    const fromIST = (d: Date) => new Date(d.getTime() - offsetMs);
    const workStart = (d: Date) => { const ist = toIST(d); ist.setHours(8,0,0,0); return fromIST(ist); };
    const workEnd = (d: Date) => { const ist = toIST(d); ist.setHours(19,0,0,0); return fromIST(ist); };

    // Default: today in IST
    const now = new Date();
    const todayStart = toIST(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayISTStart = fromIST(todayStart);

    const dateFrom = dateFromStr ? new Date(dateFromStr) : todayISTStart;
    const dateTo = dateToStr
      ? (() => { const d = new Date(dateToStr); d.setHours(23,59,59,999); return d; })()
      : new Date();

    // ── Fetch data ────────────────────────────────────────────────────
    const recruiters = await db.user.findMany({
      where: { role: 'RECRUITER', isActive: true },
      select: { id: true, name: true, email: true, phone: true },
    });

    const dispositions = await db.disposition.findMany({
      select: { id: true, heading: true, type: true },
    });
    const dispMap = new Map(dispositions.map((d) => [d.id, d]));

    const [allLogs, allCalls] = await Promise.all([
      db.activityLog.findMany({
        where: { createdAt: { gte: dateFrom, lte: dateTo }, userId: { in: recruiters.map((r) => r.id) } },
        orderBy: { createdAt: 'asc' },
        select: { userId: true, action: true, status: true, createdAt: true },
      }),
      db.callRecord.findMany({
        where: { calledAt: { gte: dateFrom, lte: dateTo }, recruiterId: { in: recruiters.map((r) => r.id) } },
        select: { recruiterId: true, dispositionId: true, callStatus: true, callDuration: true },
      }),
    ]);

    // ── Group by user ────────────────────────────────────────────────
    const logsByUser = new Map<string, typeof allLogs>();
    for (const l of allLogs) { const a = logsByUser.get(l.userId) || []; a.push(l); logsByUser.set(l.userId, a); }
    const callsByUser = new Map<string, typeof allCalls>();
    for (const c of allCalls) { const a = callsByUser.get(c.recruiterId) || []; a.push(c); callsByUser.set(c.recruiterId, a); }

    // ── Calculate status hours per recruiter ──────────────────────────
    const calcHours = (logs: typeof allLogs) => {
      const h = { LOGIN: 0, ACTIVE: 0, ON_CALL: 0, ON_BREAK: 0, IDLE: 0, LUNCH: 0 };
      const sorted = [...logs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      for (let i = 0; i < sorted.length; i++) {
        const pStart = sorted[i].createdAt;
        const pEnd = sorted[i + 1]?.createdAt ?? new Date();
        if (pStart > dateTo) break;
        const eEnd = pEnd > dateTo ? dateTo : pEnd;
        if (eEnd <= pStart) continue;

        const sk = sorted[i].status?.toUpperCase();
        const ak = sorted[i].action?.toUpperCase();
        let bucket = 'LOGIN';
        if (sk === 'ACTIVE' || sk === 'ON_CALL') bucket = sk;
        else if (sk === 'ON_BREAK' || ak === 'BREAK_START') bucket = 'ON_BREAK';
        else if (sk === 'IDLE' || ak === 'IDLE') bucket = 'IDLE';
        else if (ak === 'LUNCH') bucket = 'LUNCH';

        const cur = new Date(pStart);
        while (cur < eEnd) {
          const ws = workStart(cur);
          const we = workEnd(cur);
          const ss = cur < ws ? ws : cur;
          const se = eEnd > we ? we : eEnd;
          if (ss < se && ss < we && se > ws) h[bucket] = (h[bucket] || 0) + (se.getTime() - ss.getTime()) / 3_600_000;
          const nx = new Date(we.getTime() + 1);
          if (nx <= cur) break;
          cur.setTime(nx.getTime());
        }
      }
      h.LOGIN = Object.entries(h).filter(([k]) => k !== 'LOGIN').reduce((s, [, v]) => s + v, 0);
      return h;
    };

    // ── Build report ──────────────────────────────────────────────────
    const reportData = recruiters.map((r) => {
      const logs = logsByUser.get(r.id) || [];
      const calls = callsByUser.get(r.id) || [];
      const sh = calcHours(logs);
      let connected = 0, notAnswered = 0, shortlisted = 0;
      const other: Record<string, number> = {};

      for (const c of calls) {
        const d = c.dispositionId ? dispMap.get(c.dispositionId) : null;
        const dt = d?.type?.toUpperCase() || '';
        if (c.callStatus === 'FAILED' || dt === 'NOT_CONNECTED') notAnswered++;
        else if (dt === 'CONNECTED') connected++;
        else if (dt === 'SHORTLISTED') shortlisted++;
        else if (d) other[d.heading] = (other[d.heading] || 0) + 1;
        else if (c.callStatus === 'COMPLETED') connected++;
      }

      return {
        name: r.name, email: r.email, phone: r.phone || '',
        totalLoginHours: Math.round(sh.LOGIN * 100) / 100,
        activeHours: Math.round(sh.ACTIVE * 100) / 100,
        breakHours: Math.round(sh.ON_BREAK * 100) / 100,
        idleHours: Math.round(sh.IDLE * 100) / 100,
        lunchHours: Math.round(sh.LUNCH * 100) / 100,
        totalCalls: calls.length, connected, notAnswered, shortlisted,
        otherDispositions: other,
      };
    });

    // ── JSON preview ──────────────────────────────────────────────────
    if (searchParams.get('format') === 'json') {
      return NextResponse.json({
        report: reportData.map((r) => ({ ...r, otherDispositions: JSON.stringify(r.otherDispositions) })),
      });
    }

    // ── Excel generation ───────────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    wb.creator = 'RecruitPro';
    wb.created = new Date();

    const sheet = wb.addWorksheet('Recruiter Report', {
      properties: { tabColor: { argb: '059669' } },
    });

    const tRow = sheet.addRow(['Recruiter Performance Report']);
    tRow.getCell(1).font = { bold: true, size: 16, name: 'Arial' };
    tRow.getCell(1).alignment = { vertical: 'middle' };
    sheet.mergeCells('A1:N1');
    sheet.getRow(1).height = 36;

    const fI = toIST(dateFrom);
    const tI = toIST(dateTo);
    const ds = `${fI.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} — ${tI.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;
    const pRow = sheet.addRow([`Period: ${ds} (IST, 08:00 AM – 07:00 PM)`]);
    pRow.getCell(1).font = { size: 10, italic: true, color: { argb: '666666' }, name: 'Arial' };
    sheet.mergeCells('A2:N2');
    sheet.addRow([]);

    const hRow = sheet.addRow([
      'S.No', 'Recruiter Name', 'Email', 'Phone',
      'Login Hours', 'Active Hours', 'Break Hours', 'Idle Hours', 'Lunch Hours',
      'Total Calls', 'Connected', 'Not Answered', 'Shortlisted', 'Other',
    ]);
    hRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFF' }, size: 10, name: 'Arial' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '333333' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    sheet.getRow(4).height = 28;

    reportData.forEach((row, idx) => {
      const otherCt = Object.values(row.otherDispositions).reduce((a, b) => a + b, 0);
      const dr = sheet.addRow([
        idx + 1, row.name, row.email, row.phone,
        row.totalLoginHours, row.activeHours, row.breakHours, row.idleHours, row.lunchHours,
        row.totalCalls, row.connected, row.notAnswered, row.shortlisted, otherCt,
      ]);
      if (idx % 2 === 1) {
        dr.eachCell({ includeEmpty: true }, (c) => {
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F5F5F5' } };
        });
      }
      dr.eachCell({ includeEmpty: true }, (c, col) => {
        c.font = { size: 10, name: 'Arial' };
        if (col >= 5 && col <= 9) { c.numFmt = '0.00'; c.alignment = { horizontal: 'center' }; }
        else if (col >= 10) c.alignment = { horizontal: 'center' };
      });
    });

    sheet.getColumn(1).width = 6;
    sheet.getColumn(2).width = 22;
    sheet.getColumn(3).width = 28;
    sheet.getColumn(4).width = 16;
    for (let c = 5; c <= 14; c++) sheet.getColumn(c).width = 12;

    sheet.autoFilter = { from: 'A4', to: `N${4 + reportData.length}` };

    const buf = await wb.xlsx.writeBuffer();
    const fn = `Recruiter_Report_${fI.toISOString().slice(0, 10)}_to_${tI.toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fn}"`,
      },
    });
  } catch (error) {
    console.error('Report export error:', error);
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
  }
}
