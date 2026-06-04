/**
 * Split a CSV line respecting quoted fields (handles commas within quotes)
 */
export function splitCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"'
        i++ // skip escaped quote
      } else if (char === '"') {
        inQuotes = false
      } else {
        current += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === ',') {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
  }
  result.push(current.trim())
  return result
}

/**
 * Parse CSV text into array of rows (first row = headers, rest = data objects)
 */
export function parseCSVWithHeaders(csv: string): { columns: string[]; rows: Record<string, string>[] } {
  const lines: string[] = []
  let current = ''

  for (let i = 0; i < csv.length; i++) {
    const char = csv[i]
    if (char === '"') {
      let field = ''
      i++
      while (i < csv.length) {
        if (csv[i] === '"') {
          if (i + 1 < csv.length && csv[i + 1] === '"') {
            field += '"'
            i += 2
          } else {
            i++
            break
          }
        } else {
          field += csv[i]
          i++
        }
      }
      current += field
      while (i < csv.length && csv[i] !== ',' && csv[i] !== '\n' && csv[i] !== '\r') {
        i++
      }
      i--
    } else if (char === '\n' || (char === '\r' && csv[i + 1] === '\n')) {
      lines.push(current)
      current = ''
      if (char === '\r') i++
    } else {
      current += char
    }
  }
  if (current.trim()) {
    lines.push(current)
  }

  if (lines.length < 2) {
    return { columns: [], rows: [] }
  }

  const columns = splitCSVLine(lines[0])
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const values = splitCSVLine(line)
    const row: Record<string, string> = {}
    for (let j = 0; j < columns.length; j++) {
      row[columns[j]] = (values[j] || '').trim()
    }
    rows.push(row)
  }

  return { columns, rows }
}

/**
 * Parse CSV text into array of raw rows (string[][])
 */
export function parseCSV(text: string): string[][] {
  return text.split(/\r?\n/).filter(line => line.trim()).map(splitCSVLine)
}

/**
 * Extract Google Sheets ID from a URL
 */
export function extractSpreadsheetId(url: string): string | null {
  const trimmed = url.trim()
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
  if (match) return match[1]
  // If it looks like a raw ID (no slashes or dots, at least 20 chars)
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed
  return null
}
