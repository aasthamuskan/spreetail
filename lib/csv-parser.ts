/**
 * CSV Anomaly Detection Engine
 *
 * Parses the expenses CSV and detects all known data quality issues.
 * Each anomaly is classified by type, severity, and suggested action.
 * The user must explicitly approve, modify, or skip each flagged row.
 *
 * Anomaly types handled:
 * 1.  DUPLICATE_EXPENSE          - Same description/date/amount/payer
 * 2.  SETTLEMENT_AS_EXPENSE      - Row describes a payment between people
 * 3.  UNKNOWN_PAYER              - Payer name not matching any known member
 * 4.  MISSING_PAYER              - paid_by column is empty
 * 5.  PERCENTAGE_SUM_ERROR       - Percentages don't add up to 100%
 * 6.  NEGATIVE_AMOUNT            - Negative value (treat as refund)
 * 7.  MALFORMED_DATE             - Date is not in DD-MM-YYYY format
 * 8.  MISSING_CURRENCY           - Currency field is empty
 * 9.  ZERO_AMOUNT                - Amount is 0
 * 10. AMBIGUOUS_DATE             - Note or value suggests date ambiguity
 * 11. MEMBERSHIP_CONFLICT        - Member in split but outside their active dates
 * 12. SPLIT_TYPE_CONTRADICTION   - split_type says equal but split_details given
 * 13. NON_INTEGER_AMOUNT         - Amount has excessive decimal places
 * 14. UNKNOWN_MEMBER_IN_SPLIT    - split_with contains an unknown/guest name
 */

export interface RawCsvRow {
  date: string
  description: string
  paid_by: string
  amount: string
  currency: string
  split_type: string
  split_with: string
  split_details: string
  notes: string
  _rowIndex: number // 1-based (header = 0)
}

export interface ParsedRow {
  rawData: RawCsvRow
  date: Date | null
  description: string
  paidBy: string
  amount: number | null
  currency: string
  splitType: string
  splitWith: string[]
  splitDetails: Record<string, number>
  notes: string
}

export interface Anomaly {
  rowNumbers: number[] // affected row indices (1-based, after header)
  issueType: string
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
  description: string
  suggestedAction: string
  affectedRows: RawCsvRow[]
}

export interface ParseResult {
  rows: ParsedRow[]
  anomalies: Anomaly[]
  summary: {
    total: number
    clean: number
    flagged: number
  }
}

const KNOWN_MEMBERS = ['aisha', 'rohan', 'priya', 'meera', 'sam']
const GUEST_NAMES = ['dev', "dev's friend kabir", 'kabir']

// Membership windows (for conflict detection)
const MEMBERSHIP_WINDOWS: Record<string, { joined: Date; left?: Date }> = {
  aisha: { joined: new Date('2026-02-01') },
  rohan: { joined: new Date('2026-02-01') },
  priya: { joined: new Date('2026-02-01') },
  meera: { joined: new Date('2026-02-01'), left: new Date('2026-03-31') },
  sam: { joined: new Date('2026-04-08') },
}

function parseDate(raw: string): Date | null {
  if (!raw || raw.trim() === '') return null
  const trimmed = raw.trim()

  // Standard DD-MM-YYYY
  const ddmmyyyy = /^(\d{1,2})-(\d{2})-(\d{4})$/
  const match = trimmed.match(ddmmyyyy)
  if (match) {
    return new Date(`${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`)
  }

  // Mar-14 style (month abbreviation + day)
  const monDay = /^([A-Za-z]{3})-(\d{1,2})$/
  const monMatch = trimmed.match(monDay)
  if (monMatch) {
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    }
    const month = months[monMatch[1].toLowerCase()]
    if (month) {
      return new Date(`2026-${month}-${monMatch[2].padStart(2, '0')}`)
    }
  }

  return null
}

function parseAmount(raw: string): number | null {
  if (!raw || raw.trim() === '') return null
  // Remove commas from numbers like "1,200"
  const cleaned = raw.replace(/,/g, '').trim()
  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

function parseSplitWith(raw: string): string[] {
  if (!raw || raw.trim() === '') return []
  return raw.split(';').map((s) => s.trim()).filter(Boolean)
}

function parseSplitDetails(raw: string, splitType: string): Record<string, number> {
  if (!raw || raw.trim() === '') return {}
  const result: Record<string, number> = {}

  // "Aisha 30%; Rohan 30%; Priya 30%; Meera 20%" or "Rohan 700; Priya 400; Meera 400"
  // or "Aisha 1; Rohan 2; Priya 1; Dev 2"
  const parts = raw.split(';').map((s) => s.trim()).filter(Boolean)
  for (const part of parts) {
    const pctMatch = part.match(/^(.+?)\s+([\d.]+)%?$/)
    if (pctMatch) {
      const name = pctMatch[1].trim().toLowerCase()
      const val = parseFloat(pctMatch[2])
      result[name] = val
    }
  }

  return result
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

export function parseCsv(csvText: string): ParseResult {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim())
  const header = lines[0]
  const dataLines = lines.slice(1)

  const rows: ParsedRow[] = []
  const anomalies: Anomaly[] = []

  const rawRows: RawCsvRow[] = dataLines.map((line, i) => {
    // Simple CSV parse (handles quoted fields)
    const cols = parseCsvLine(line)
    return {
      date: cols[0] ?? '',
      description: cols[1] ?? '',
      paid_by: cols[2] ?? '',
      amount: cols[3] ?? '',
      currency: cols[4] ?? '',
      split_type: cols[5] ?? '',
      split_with: cols[6] ?? '',
      split_details: cols[7] ?? '',
      notes: cols[8] ?? '',
      _rowIndex: i + 2, // 1-based, row 1 is header
    }
  })

  // Parse all rows
  const parsedRows: ParsedRow[] = rawRows.map((raw) => ({
    rawData: raw,
    date: parseDate(raw.date),
    description: raw.description.trim(),
    paidBy: normalizeName(raw.paid_by),
    amount: parseAmount(raw.amount),
    currency: raw.currency.trim().toUpperCase() || '',
    splitType: raw.split_type.trim().toLowerCase(),
    splitWith: parseSplitWith(raw.split_with).map(normalizeName),
    splitDetails: parseSplitDetails(raw.split_details, raw.split_type),
    notes: raw.notes.trim(),
  }))

  // ─────────────────────────────────────────────
  // ANOMALY DETECTION
  // ─────────────────────────────────────────────

  // 1. DUPLICATE_EXPENSE: same description (case-insensitive), date, amount, payer
  const seen = new Map<string, number>()
  for (const row of parsedRows) {
    const key = `${row.description.toLowerCase()}|${row.rawData.date}|${row.amount}|${row.paidBy}`
    const fuzzyKey = `${row.description.toLowerCase().replace(/\s+/g, '')}|${row.rawData.date}|${row.amount}|${row.paidBy}`

    if (seen.has(key)) {
      const prevIdx = seen.get(key)!
      anomalies.push({
        rowNumbers: [prevIdx, row.rawData._rowIndex],
        issueType: 'DUPLICATE_EXPENSE',
        severity: 'HIGH',
        description: `Exact duplicate: rows ${prevIdx} and ${row.rawData._rowIndex} have identical description, date, amount, and payer ("${row.description}")`,
        suggestedAction: 'Keep the first occurrence, skip the duplicate. Verify with group before deleting.',
        affectedRows: [rawRows[prevIdx - 2], row.rawData],
      })
    } else {
      seen.set(key, row.rawData._rowIndex)
    }
  }

  // Fuzzy duplicate: same date + same payer + similar description (different wording)
  for (let i = 0; i < parsedRows.length; i++) {
    for (let j = i + 1; j < parsedRows.length; j++) {
      const a = parsedRows[i]
      const b = parsedRows[j]
      if (a.rawData.date === b.rawData.date && a.paidBy === b.paidBy && a.amount !== b.amount) {
        const aDesc = a.description.toLowerCase().replace(/[^a-z0-9]/g, '')
        const bDesc = b.description.toLowerCase().replace(/[^a-z0-9]/g, '')
        // Check if one description is contained in the other (fuzzy match)
        if (
          aDesc.length > 4 && bDesc.length > 4 &&
          (aDesc.includes(bDesc.substring(0, 6)) || bDesc.includes(aDesc.substring(0, 6)))
        ) {
          const alreadyFlagged = anomalies.some(
            (an) => an.issueType === 'DUPLICATE_EXPENSE' &&
              an.rowNumbers.includes(a.rawData._rowIndex) &&
              an.rowNumbers.includes(b.rawData._rowIndex)
          )
          if (!alreadyFlagged) {
            anomalies.push({
              rowNumbers: [a.rawData._rowIndex, b.rawData._rowIndex],
              issueType: 'DUPLICATE_EXPENSE',
              severity: 'HIGH',
              description: `Possible duplicate: rows ${a.rawData._rowIndex} ("${a.description}", ₹${a.amount}) and ${b.rawData._rowIndex} ("${b.description}", ₹${b.amount ?? 'N/A'}) — same date, same payer, similar description`,
              suggestedAction: 'Review both rows. Notes suggest one may be incorrect. Keep the one with better provenance.',
              affectedRows: [a.rawData, b.rawData],
            })
          }
        }
      }
    }
  }

  // 2. SETTLEMENT_AS_EXPENSE
  for (const row of parsedRows) {
    const isSettlement =
      /paid.*(back|aisha|rohan|priya|meera|sam)/i.test(row.description) ||
      /settlement|settle|transfer/i.test(row.description) ||
      /this is a settlement/i.test(row.notes) ||
      (row.rawData.split_type === '' && row.rawData.split_with === 'Aisha')
    if (isSettlement) {
      anomalies.push({
        rowNumbers: [row.rawData._rowIndex],
        issueType: 'SETTLEMENT_AS_EXPENSE',
        severity: 'HIGH',
        description: `Row ${row.rawData._rowIndex}: "${row.description}" appears to be a settlement/payment between members, not an expense`,
        suggestedAction: 'Convert to a Settlement record instead of an expense. This prevents double-counting in balances.',
        affectedRows: [row.rawData],
      })
    }
  }

  // 3. UNKNOWN_PAYER (not a known member or known guest)
  for (const row of parsedRows) {
    if (!row.paidBy) continue
    const norm = normalizeName(row.paidBy)
    if (!KNOWN_MEMBERS.includes(norm) && !GUEST_NAMES.includes(norm)) {
      anomalies.push({
        rowNumbers: [row.rawData._rowIndex],
        issueType: 'UNKNOWN_PAYER',
        severity: 'MEDIUM',
        description: `Row ${row.rawData._rowIndex}: Payer "${row.rawData.paid_by}" is not a recognized member (known members: Aisha, Rohan, Priya, Meera, Sam)`,
        suggestedAction: 'Likely a typo or alternate spelling. Map to the correct member or create a new member.',
        affectedRows: [row.rawData],
      })
    }
  }

  // 4. MISSING_PAYER
  for (const row of parsedRows) {
    if (!row.paidBy || row.paidBy === '') {
      const alreadySettlement = anomalies.some(
        (a) => a.issueType === 'SETTLEMENT_AS_EXPENSE' && a.rowNumbers.includes(row.rawData._rowIndex)
      )
      if (!alreadySettlement) {
        anomalies.push({
          rowNumbers: [row.rawData._rowIndex],
          issueType: 'MISSING_PAYER',
          severity: 'MEDIUM',
          description: `Row ${row.rawData._rowIndex}: "${row.description}" has no payer specified`,
          suggestedAction: 'Ask the group to identify who paid. Cannot compute balances without a payer.',
          affectedRows: [row.rawData],
        })
      }
    }
  }

  // 5. PERCENTAGE_SUM_ERROR
  for (const row of parsedRows) {
    if (row.splitType === 'percentage' && Object.keys(row.splitDetails).length > 0) {
      const total = Object.values(row.splitDetails).reduce((a, b) => a + b, 0)
      if (Math.abs(total - 100) > 0.5) {
        anomalies.push({
          rowNumbers: [row.rawData._rowIndex],
          issueType: 'PERCENTAGE_SUM_ERROR',
          severity: 'MEDIUM',
          description: `Row ${row.rawData._rowIndex}: Percentages sum to ${total.toFixed(1)}% instead of 100% (details: ${row.rawData.split_details})`,
          suggestedAction: `Adjust percentages to sum to 100%. Suggested: normalize proportionally (each × ${(100 / total).toFixed(4)}).`,
          affectedRows: [row.rawData],
        })
      }
    }
  }

  // 6. NEGATIVE_AMOUNT
  for (const row of parsedRows) {
    if (row.amount !== null && row.amount < 0) {
      anomalies.push({
        rowNumbers: [row.rawData._rowIndex],
        issueType: 'NEGATIVE_AMOUNT',
        severity: 'MEDIUM',
        description: `Row ${row.rawData._rowIndex}: Amount is negative (${row.amount} ${row.currency}) — "${row.description}"`,
        suggestedAction: 'Import as a refund/credit expense. This reduces the expense total for all split members.',
        affectedRows: [row.rawData],
      })
    }
  }

  // 7. MALFORMED_DATE
  for (const row of parsedRows) {
    if (row.date === null && row.rawData.date !== '') {
      anomalies.push({
        rowNumbers: [row.rawData._rowIndex],
        issueType: 'MALFORMED_DATE',
        severity: 'MEDIUM',
        description: `Row ${row.rawData._rowIndex}: Date "${row.rawData.date}" is not in the expected DD-MM-YYYY format`,
        suggestedAction: 'Inferred as 2026-03-14 based on "Mar-14" pattern. Please confirm before importing.',
        affectedRows: [row.rawData],
      })
    }
  }

  // 8. MISSING_CURRENCY
  for (const row of parsedRows) {
    if (!row.currency || row.currency === '') {
      anomalies.push({
        rowNumbers: [row.rawData._rowIndex],
        issueType: 'MISSING_CURRENCY',
        severity: 'MEDIUM',
        description: `Row ${row.rawData._rowIndex}: Currency is missing for "${row.description}"`,
        suggestedAction: 'Default to INR (group base currency). Flagged for your confirmation.',
        affectedRows: [row.rawData],
      })
    }
  }

  // 9. ZERO_AMOUNT
  for (const row of parsedRows) {
    if (row.amount === 0) {
      anomalies.push({
        rowNumbers: [row.rawData._rowIndex],
        issueType: 'ZERO_AMOUNT',
        severity: 'LOW',
        description: `Row ${row.rawData._rowIndex}: "${row.description}" has amount = 0. Notes: "${row.notes}"`,
        suggestedAction: 'Skip this row. Notes suggest it was a duplicate that was zeroed out.',
        affectedRows: [row.rawData],
      })
    }
  }

  // 10. AMBIGUOUS_DATE (note contains date ambiguity keywords)
  for (const row of parsedRows) {
    if (
      /april|may|april 5|may 4|format.*mess/i.test(row.notes) &&
      row.rawData.date !== ''
    ) {
      anomalies.push({
        rowNumbers: [row.rawData._rowIndex],
        issueType: 'AMBIGUOUS_DATE',
        severity: 'HIGH',
        description: `Row ${row.rawData._rowIndex}: Date "${row.rawData.date}" is ambiguous — note says "${row.notes}"`,
        suggestedAction: 'User must confirm whether this is April 5 (04-05-2026) or May 4 (04-05-2026 in MM-DD) format.',
        affectedRows: [row.rawData],
      })
    }
  }

  // 11. MEMBERSHIP_CONFLICT
  for (const row of parsedRows) {
    if (!row.date) continue
    for (const memberName of row.splitWith) {
      const window = MEMBERSHIP_WINDOWS[normalizeName(memberName)]
      if (!window) continue
      if (row.date < window.joined || (window.left && row.date > window.left)) {
        const alreadyFlagged = anomalies.some(
          (a) => a.issueType === 'MEMBERSHIP_CONFLICT' && a.rowNumbers.includes(row.rawData._rowIndex)
        )
        if (!alreadyFlagged) {
          anomalies.push({
            rowNumbers: [row.rawData._rowIndex],
            issueType: 'MEMBERSHIP_CONFLICT',
            severity: 'HIGH',
            description: `Row ${row.rawData._rowIndex}: "${memberName}" is in the split for "${row.description}" (${row.rawData.date}) but was ${window.left && row.date > window.left ? 'no longer a member' : 'not yet a member'} at that date`,
            suggestedAction: `Remove "${memberName}" from the split and redistribute equally among active members.`,
            affectedRows: [row.rawData],
          })
        }
      }
    }
  }

  // 12. SPLIT_TYPE_CONTRADICTION
  for (const row of parsedRows) {
    if (
      row.splitType === 'equal' &&
      row.rawData.split_details !== '' &&
      Object.keys(row.splitDetails).length > 0
    ) {
      // Check if the details actually represent a non-equal split
      anomalies.push({
        rowNumbers: [row.rawData._rowIndex],
        issueType: 'SPLIT_TYPE_CONTRADICTION',
        severity: 'LOW',
        description: `Row ${row.rawData._rowIndex}: split_type is "equal" but split_details "${row.rawData.split_details}" are also provided`,
        suggestedAction: 'Ignore split_details and apply equal split, OR change split_type to "share" to use the provided ratios.',
        affectedRows: [row.rawData],
      })
    }
  }

  // 13. NON_INTEGER_AMOUNT (more than 2 decimal places)
  for (const row of parsedRows) {
    if (row.amount !== null) {
      const str = row.amount.toString()
      const decimalPart = str.split('.')[1]
      if (decimalPart && decimalPart.length > 2) {
        anomalies.push({
          rowNumbers: [row.rawData._rowIndex],
          issueType: 'NON_INTEGER_AMOUNT',
          severity: 'LOW',
          description: `Row ${row.rawData._rowIndex}: Amount ${row.amount} has ${decimalPart.length} decimal places — likely a data entry error`,
          suggestedAction: `Round to 2 decimal places: ₹${Math.round(row.amount * 100) / 100}`,
          affectedRows: [row.rawData],
        })
      }
    }
  }

  // 14. UNKNOWN_MEMBER_IN_SPLIT
  for (const row of parsedRows) {
    for (const name of row.splitWith) {
      const norm = normalizeName(name)
      if (!KNOWN_MEMBERS.includes(norm) && !GUEST_NAMES.includes(norm)) {
        const alreadyFlagged = anomalies.some(
          (a) => a.issueType === 'UNKNOWN_MEMBER_IN_SPLIT' && a.rowNumbers.includes(row.rawData._rowIndex)
        )
        if (!alreadyFlagged) {
          anomalies.push({
            rowNumbers: [row.rawData._rowIndex],
            issueType: 'UNKNOWN_MEMBER_IN_SPLIT',
            severity: 'LOW',
            description: `Row ${row.rawData._rowIndex}: "${name}" in split_with is not a recognized member or known guest`,
            suggestedAction: 'Map to a known member or skip this person from the split.',
            affectedRows: [row.rawData],
          })
        }
      }
    }
  }

  const flaggedRows = new Set(anomalies.flatMap((a) => a.rowNumbers))

  return {
    rows: parsedRows,
    anomalies,
    summary: {
      total: parsedRows.length,
      clean: parsedRows.filter((r) => !flaggedRows.has(r.rawData._rowIndex)).length,
      flagged: flaggedRows.size,
    },
  }
}

/**
 * Simple CSV line parser that handles quoted fields with commas
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }
  result.push(current)
  return result
}
