import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth-middleware';
import { parseCSVWithHeaders, extractSpreadsheetId } from '@/lib/csv-parser';

/**
 * Parse a CSV string into columns and rows.
 * First row is treated as headers. Remaining rows are objects keyed by header name.
 */
function parseCSV(csv: string): { columns: string[]; rows: Record<string, string>[] } {
  return parseCSVWithHeaders(csv);
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
