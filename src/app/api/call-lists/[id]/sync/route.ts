import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth-middleware';

/**
 * Extract the Google Spreadsheet ID from various URL formats.
 */
function extractSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (urlMatch) return urlMatch[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

/**
 * Parse a CSV string into columns and rows.
 */
function parseCSV(csv: string): { columns: string[]; rows: Record<string, string>[] } {
  const lines: string[] = [];
  let current = '';

  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (char === '"') {
      let field = '';
      i++;
      while (i < csv.length) {
        if (csv[i] === '"') {
          if (i + 1 < csv.length && csv[i + 1] === '"') {
            field += '"';
            i += 2;
          } else {
            i++;
            break;
          }
        } else {
          field += csv[i];
          i++;
        }
      }
      current += field;
      while (i < csv.length && csv[i] !== ',' && csv[i] !== '\n' && csv[i] !== '\r') {
        i++;
      }
      i--;
    } else if (char === '\n' || (char === '\r' && csv[i + 1] === '\n')) {
      lines.push(current);
      current = '';
      if (char === '\r') i++;
    } else {
      current += char;
    }
  }
  if (current.trim()) {
    lines.push(current);
  }

  if (lines.length < 2) {
    return { columns: [], rows: [] };
  }

  const columns = splitCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = splitCSVLine(line);
    const row: Record<string, string> = {};
    for (let j = 0; j < columns.length; j++) {
      row[columns[j]] = (values[j] || '').trim();
    }
    rows.push(row);
  }

  return { columns, rows };
}

/**
 * Split a single CSV line by commas, respecting quoted fields.
 */
function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }
  result.push(current);
  return result;
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
    if (auth.role !== 'ADMIN') {
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

    // Process each row
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
        // Update existing candidate
        await db.candidate.update({
          where: { id: existingId },
          data: {
            ...(candidateName && { name: candidateName }),
            ...(candidateEmail !== null && { email: candidateEmail }),
            ...(candidateRole !== null && { role: candidateRole }),
            ...(candidateLocation !== null && { location: candidateLocation }),
            ...(candidateCompany !== null && { company: candidateCompany }),
          },
        });
        updated++;
      } else {
        // Create new candidate
        await db.candidate.create({
          data: {
            callListId: id,
            name: candidateName || 'Unknown',
            phone: rawPhone,
            email: candidateEmail,
            role: candidateRole,
            location: candidateLocation,
            company: candidateCompany,
          },
        });
        created++;
      }
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
