import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth-middleware';

/**
 * Extract the Google Spreadsheet ID from various URL formats:
 * - https://docs.google.com/spreadsheets/d/{ID}/edit
 * - https://docs.google.com/spreadsheets/d/{ID}/...
 * - Just the raw ID
 */
function extractSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();

  // Try to match URL format: /d/{ID}/
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (urlMatch) {
    return urlMatch[1];
  }

  // If it looks like a raw ID (no slashes or dots, at least 20 chars)
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Parse a CSV string into columns and rows.
 * First row is treated as headers. Remaining rows are objects keyed by header name.
 */
function parseCSV(csv: string): { columns: string[]; rows: Record<string, string>[] } {
  const lines: string[] = [];
  let current = '';

  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];

    if (char === '"') {
      // Quoted field: read until closing quote
      let field = '';
      i++;
      while (i < csv.length) {
        if (csv[i] === '"') {
          if (i + 1 < csv.length && csv[i + 1] === '"') {
            // Escaped quote
            field += '"';
            i += 2;
          } else {
            // End of quoted field
            i++;
            break;
          }
        } else {
          field += csv[i];
          i++;
        }
      }
      current += field;
      // After closing quote, skip until comma or newline
      while (i < csv.length && csv[i] !== ',' && csv[i] !== '\n' && csv[i] !== '\r') {
        i++;
      }
      // Back up one so the outer loop processes the comma/newline
      i--;
    } else if (char === '\n' || (char === '\r' && csv[i + 1] === '\n')) {
      lines.push(current);
      current = '';
      if (char === '\r') i++; // skip \n in \r\n
    } else {
      current += char;
    }
  }
  // Don't forget the last line
  if (current.trim()) {
    lines.push(current);
  }

  if (lines.length < 2) {
    return { columns: [], rows: [] };
  }

  // Split first line into columns
  const columns = splitCSVLine(lines[0]);

  // Remaining lines into row objects
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

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { url, gid } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { success: false, error: 'A Google Sheets URL is required' },
        { status: 400 },
      );
    }

    const spreadsheetId = extractSpreadsheetId(url);
    if (!spreadsheetId) {
      return NextResponse.json(
        { success: false, error: 'Could not extract a valid Google Spreadsheet ID from the provided URL' },
        { status: 400 },
      );
    }

    const sheetGid = gid || '0';

    // Validate sheetGid — must be numeric to prevent injection
    if (!/^\d+$/.test(sheetGid)) {
      return NextResponse.json(
        { success: false, error: 'Invalid sheet GID. Must be a non-negative integer.' },
        { status: 400 },
      );
    }

    const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${sheetGid}`;

    // Fetch with timeout (15 seconds)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let response: Response;
    try {
      response = await fetch(csvUrl, {
        signal: controller.signal,
        // No auth headers — the sheet must be published to the web
      });
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
        { success: false, error: `Google Sheets returned status ${response.status}. Make sure the spreadsheet is published to the web (File → Share → Publish to web).` },
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

    if (columns.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Could not parse any columns from the spreadsheet' },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true, columns, rows });
  } catch (error) {
    console.error('Google Sheets fetch error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
