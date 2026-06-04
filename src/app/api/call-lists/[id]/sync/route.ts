import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, requireOrgAdmin } from '@/lib/auth-middleware';
import { extractSpreadsheetId, parseCSVWithHeaders, splitCSVLine } from '@/lib/csv-parser';

/**
 * Parse a CSV string into columns and rows.
 */
function parseCSV(csv: string): { columns: string[]; rows: Record<string, string>[] } {
  return parseCSVWithHeaders(csv);
}

/**
 * Attempt to auto-detect which columns map to candidate fields.
 * Matches case-insensitively against common header names.
 */
function detectColumnMapping(columns: string[]): Record<string, string | null> {
  const lowerColumns = columns.map((c) => c.toLowerCase().trim());

  const fieldMatchers: Record<string, RegExp[]> = {
    name: [/^name$/, /^full\s*name$/, /^candidate\s*name$/, /^contact\s*name$/],
    phone: [/^phone$/, /^phone\s*number$/, /^mobile$/, /^cell$/, /^tel$/, /^telephone$/, /^contact\s*number$/],
    email: [/^email$/, /^e-?mail$/, /^email\s*address$/],
    role: [/^role$/, /^position$/, /^job\s*title$/, /^title$/, /^designation$/, /^profile$/],
    location: [/^location$/, /^city$/, /^state$/, /^country$/, /^address$/],
    company: [/^company$/, /^organization$/, /^org$/, /^employer$/, /^firm$/],
  };

  const mapping: Record<string, string | null> = {
    name: null,
    phone: null,
    email: null,
    role: null,
    location: null,
    company: null,
  };

  for (const [field, patterns] of Object.entries(fieldMatchers)) {
    for (let i = 0; i < lowerColumns.length; i++) {
      if (patterns.some((pat) => pat.test(lowerColumns[i]))) {
        mapping[field] = columns[i];
        break;
      }
    }
  }

  return mapping;
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateRequest(_request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can trigger sync
    if (!requireOrgAdmin(auth)) {
      return NextResponse.json({ error: 'Access denied. Only admins can trigger sync.' }, { status: 403 });
    }

    const { id } = await params;

    // Find the call list and verify it has Google Sheets config
    const callList = await db.callList.findUnique({
      where: { id },
      include: { candidates: true },
    });

    if (!callList) {
      return NextResponse.json({ error: 'Call list not found' }, { status: 404 });
    }

    if (!callList.googleSheetsUrl) {
      return NextResponse.json(
        { error: 'This call list does not have a Google Sheets URL configured' },
        { status: 400 },
      );
    }

    const spreadsheetId = extractSpreadsheetId(callList.googleSheetsUrl);
    if (!spreadsheetId) {
      return NextResponse.json(
        { error: 'The stored Google Sheets URL is invalid' },
        { status: 400 },
      );
    }

    const sheetGid = callList.googleSheetGid || '0';
    const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${sheetGid}`;

    // Fetch with timeout (15 seconds)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let response: Response;
    try {
      response = await fetch(csvUrl, { signal: controller.signal });
    } catch (fetchError: unknown) {
      clearTimeout(timeout);
      const message = fetchError instanceof Error && fetchError.name === 'AbortError'
        ? 'Request to Google Sheets timed out after 15 seconds'
        : 'Failed to reach Google Sheets. Please check the URL and ensure the spreadsheet is published to the web.';
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }
    clearTimeout(timeout);

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: `Google Sheets returned status ${response.status}. Make sure the spreadsheet is published to the web.` },
        { status: 400 },
      );
    }

    const csvText = await response.text();
    if (!csvText.trim()) {
      return NextResponse.json(
        { success: false, error: 'The spreadsheet appears to be empty' },
        { status: 400 },
      );
    }

    const { columns, rows } = parseCSV(csvText);
    if (columns.length === 0 || rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No data found in the spreadsheet' },
        { status: 400 },
      );
    }

    // Detect column mapping
    const mapping = detectColumnMapping(columns);

    if (!mapping.phone) {
      return NextResponse.json(
        { success: false, error: 'Could not detect a "Phone" column in the spreadsheet. Please ensure your sheet has a column named "Phone", "Phone Number", or "Mobile".' },
        { status: 400 },
      );
    }

    // Build index of existing candidates by phone for O(1) lookup
    const existingByPhone = new Map<string, string>();
    for (const candidate of callList.candidates) {
      const normalizedPhone = candidate.phone.replace(/[\s\-()]/g, '');
      existingByPhone.set(normalizedPhone, candidate.id);
    }

    let created = 0;
    let updated = 0;

    // Build list of operations, then batch them in groups of 500 to avoid transaction limits
    interface CandidateOp {
      type: 'update' | 'create';
      existingId?: string;
      name: string;
      phone: string;
      email: string | null;
      role: string | null;
      location: string | null;
      company: string | null;
    }

    const operations: CandidateOp[] = [];
    for (const row of rows) {
      const rawPhone = String(row[mapping.phone!] || '').trim();
      if (!rawPhone) continue;

      const normalizedPhone = rawPhone.replace(/[\s\-()]/g, '');
      if (!normalizedPhone) continue;

      const candidateName = mapping.name ? String(row[mapping.name] || '').trim() : '';
      const candidateEmail = mapping.email ? (String(row[mapping.email!] || '').trim() || null) : null;
      const candidateRole = mapping.role ? (String(row[mapping.role!] || '').trim() || null) : null;
      const candidateLocation = mapping.location ? (String(row[mapping.location!] || '').trim() || null) : null;
      const candidateCompany = mapping.company ? (String(row[mapping.company!] || '').trim() || null) : null;

      const existingId = existingByPhone.get(normalizedPhone);

      if (existingId) {
        operations.push({ type: 'update', existingId, name: candidateName, phone: rawPhone, email: candidateEmail, role: candidateRole, location: candidateLocation, company: candidateCompany });
      } else {
        operations.push({ type: 'create', name: candidateName || 'Unknown', phone: rawPhone, email: candidateEmail, role: candidateRole, location: candidateLocation, company: candidateCompany });
      }
    }

    // Process in batches of 500 to avoid SQLite transaction limits
    const BATCH_SIZE = 500;
    for (let i = 0; i < operations.length; i += BATCH_SIZE) {
      const batch = operations.slice(i, i + BATCH_SIZE);
      const txOps = batch.map(op => {
        if (op.type === 'update') {
          return db.candidate.update({
            where: { id: op.existingId! },
            data: {
              ...(op.name && { name: op.name }),
              ...(op.email !== null && { email: op.email }),
              ...(op.role !== null && { role: op.role }),
              ...(op.location !== null && { location: op.location }),
              ...(op.company !== null && { company: op.company }),
            },
          });
        }
        return db.candidate.create({
          data: {
            callListId: id,
            name: op.name,
            phone: op.phone,
            email: op.email,
            role: op.role,
            location: op.location,
            company: op.company,
          },
        });
      });

      const results = await db.$transaction(txOps, { timeout: 60000 });
      created += results.filter((_, idx) => batch[idx].type === 'create').length;
      updated += results.filter((_, idx) => batch[idx].type === 'update').length;
    }

    // Update lastSyncedAt
    await db.callList.update({
      where: { id },
      data: { lastSyncedAt: new Date() },
    });

    // Get total count after sync
    const totalAfterSync = await db.candidate.count({
      where: { callListId: id },
    });

    return NextResponse.json({
      success: true,
      created,
      updated,
      total: totalAfterSync,
    });
  } catch (error) {
    console.error('Google Sheets sync error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
