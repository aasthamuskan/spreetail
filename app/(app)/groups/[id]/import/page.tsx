'use client'
import { useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'

type Step = 1 | 2 | 3 | 4 | 5

interface ParsedRow {
  rowIndex: number
  description: string
  date: string | null
  amount: number | null
  currency: string
  paidBy: string
  splitType: string
  splitWith: string[]
  notes: string
}

interface Anomaly {
  rowNumbers: number[]
  issueType: string
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
  description: string
  suggestedAction: string
}

interface ParseResult {
  jobId: string
  summary: { total: number; clean: number; flagged: number }
  anomalies: Anomaly[]
  rows: ParsedRow[]
}

const SEVERITY_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 }
const ISSUE_TYPE_LABELS: Record<string, string> = {
  DUPLICATE_EXPENSE: 'Duplicate expense',
  SETTLEMENT_AS_EXPENSE: 'Settlement logged as expense',
  UNKNOWN_PAYER: 'Unknown payer',
  MISSING_PAYER: 'Missing payer',
  PERCENTAGE_SUM_ERROR: 'Percentage sum ≠ 100%',
  NEGATIVE_AMOUNT: 'Negative amount (refund)',
  MALFORMED_DATE: 'Malformed date',
  MISSING_CURRENCY: 'Missing currency',
  ZERO_AMOUNT: 'Zero amount',
  AMBIGUOUS_DATE: 'Ambiguous date',
  MEMBERSHIP_CONFLICT: 'Membership conflict',
  SPLIT_TYPE_CONTRADICTION: 'Split type contradiction',
  NON_INTEGER_AMOUNT: 'Non-standard amount',
  UNKNOWN_MEMBER_IN_SPLIT: 'Unknown member in split',
}

export default function ImportPage() {
  const router = useRouter()
  const params = useParams()
  const groupId = params.id as string

  const [step, setStep] = useState<Step>(1)
  const [file, setFile] = useState<File | null>(null)
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [resolutions, setResolutions] = useState<Record<string, string>>({}) // issueId → 'KEEP'|'SKIP'|'MODIFIED'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [importResult, setImportResult] = useState<{ importedCount: number; skippedCount: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f?.name.endsWith('.csv')) setFile(f)
  }

  async function handleParse() {
    if (!file) return
    setLoading(true)
    setError('')

    const fd = new FormData()
    fd.append('file', file)

    const res = await fetch(`/api/groups/${groupId}/import`, {
      method: 'POST',
      body: fd,
    })

    if (!res.ok) {
      setError('Parse failed')
      setLoading(false)
      return
    }

    const data = await res.json()
    setParseResult(data)

    // Initialize resolutions
    const init: Record<string, string> = {}
    for (const anomaly of data.anomalies) {
      init[`${anomaly.issueType}-${anomaly.rowNumbers[0]}`] = anomaly.severity === 'LOW' ? 'SKIP' : 'KEEP'
    }
    setResolutions(init)

    setLoading(false)
    setStep(3)
  }

  async function handleCommit() {
    if (!parseResult) return
    setLoading(true)
    setError('')

    // Build clean rows (those not flagged by any anomaly)
    const flaggedRows = new Set(parseResult.anomalies.flatMap((a) => a.rowNumbers))
    const cleanRows = parseResult.rows.filter((r) => !flaggedRows.has(r.rowIndex))

    // Build resolution payload
    const jobIssues = await fetch(`/api/groups/${groupId}/import/${parseResult.jobId}`).then((r) => r.json())

    const resolutionPayload = (jobIssues.issues ?? []).map((issue: { id: string; issueType: string; rowNumber: number }) => {
      const key = `${issue.issueType}-${issue.rowNumber}`
      return {
        issueId: issue.id,
        resolution: resolutions[key] ?? 'SKIP',
        resolvedData: resolutions[key] === 'KEEP'
          ? parseResult.rows.find((r) => r.rowIndex === issue.rowNumber)
          : null,
      }
    })

    const res = await fetch(`/api/groups/${groupId}/import/${parseResult.jobId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolutions: resolutionPayload, cleanRows }),
    })

    if (!res.ok) {
      setError('Import failed')
      setLoading(false)
      return
    }

    const result = await res.json()
    setImportResult(result)
    setLoading(false)
    setStep(5)
  }

  const sortedAnomalies = parseResult?.anomalies.slice().sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  ) ?? []

  return (
    <>
      <div className="page-header">
        <div>
          <h1 style={{ fontSize: '1rem', fontWeight: 600 }}>Import CSV</h1>
          <p className="text-caption" style={{ marginTop: 2 }}>
            Upload → Scan → Review → Resolve → Confirm
          </p>
        </div>
      </div>

      {/* Stepper */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--color-slate-200)', background: 'white' }}>
        <div className="stepper">
          {(['Upload', 'Parse', 'Review', 'Resolve', 'Confirm'] as const).map((label, i) => {
            const stepNum = (i + 1) as Step
            const status = step > stepNum ? 'done' : step === stepNum ? 'active' : 'pending'
            return (
              <div key={label} className="step">
                <div className={`step-num ${status}`}>
                  {status === 'done' ? '✓' : stepNum}
                </div>
                <span className={`step-label ${status}`}>{label}</span>
                {i < 4 && <div className={`step-line ${step > stepNum ? 'done' : ''}`} />}
              </div>
            )
          })}
        </div>
      </div>

      <div className="page-body">
        {/* STEP 1: Upload */}
        {step === 1 && (
          <div style={{ maxWidth: 560 }}>
            <div
              style={{
                border: `2px dashed ${dragging ? 'var(--color-accent)' : 'var(--color-slate-300)'}`,
                borderRadius: 8,
                padding: '48px 24px',
                textAlign: 'center',
                background: dragging ? 'var(--color-accent-muted)' : 'white',
                cursor: 'pointer',
                transition: 'all 0.1s',
              }}
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => document.getElementById('csv-input')?.click()}
              id="csv-dropzone"
            >
              <div style={{ fontSize: '2rem', marginBottom: 12 }}>↑</div>
              <div style={{ fontWeight: 600, fontSize: '0.9375rem', marginBottom: 6 }}>
                Drop your CSV here or click to browse
              </div>
              <div className="text-caption">expenses_export.csv — headers must include: date, description, paid_by, amount, currency, split_type, split_with</div>
              {file && (
                <div style={{
                  marginTop: 16,
                  padding: '8px 12px',
                  background: 'var(--color-success-muted)',
                  borderRadius: 6,
                  fontSize: '0.875rem',
                  color: 'var(--color-success)',
                  fontWeight: 500,
                }}>
                  ✓ {file.name} ({(file.size / 1024).toFixed(1)} KB)
                </div>
              )}
              <input
                id="csv-input"
                type="file"
                accept=".csv"
                style={{ display: 'none' }}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>

            <div className="alert alert-info" style={{ marginTop: 16 }}>
              <span>ℹ</span>
              <div>
                The importer detects <strong>14 types of data anomalies</strong> including duplicates,
                settlement records logged as expenses, missing currencies, membership conflicts, and more.
                You will review each issue before anything is saved.
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button
                className="btn btn-primary"
                onClick={() => setStep(2)}
                disabled={!file}
                id="next-to-parse-btn"
              >
                Next: scan file →
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Parse / scanning */}
        {step === 2 && (
          <div style={{ maxWidth: 480, textAlign: 'center', paddingTop: 40 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Scanning {file?.name}…</div>
            <p className="text-caption" style={{ marginBottom: 24 }}>
              Running anomaly detection across all rows
            </p>
            {error && <div className="alert alert-danger" style={{ marginBottom: 16 }}>⚠ {error}</div>}
            <button
              className="btn btn-primary btn-lg"
              onClick={handleParse}
              disabled={loading}
              id="scan-btn"
            >
              {loading ? 'Scanning…' : 'Start scan'}
            </button>
          </div>
        )}

        {/* STEP 3: Review results */}
        {step === 3 && parseResult && (
          <div>
            {/* Summary stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
              <div className="stat-card">
                <div className="stat-label">Total rows</div>
                <div className="stat-value">{parseResult.summary.total}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Clean rows</div>
                <div className="stat-value" style={{ color: 'var(--color-success)' }}>
                  {parseResult.summary.clean}
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Flagged rows</div>
                <div className="stat-value" style={{ color: parseResult.summary.flagged > 0 ? 'var(--color-warning)' : 'var(--color-success)' }}>
                  {parseResult.summary.flagged}
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Anomalies</div>
                <div className="stat-value">{parseResult.anomalies.length}</div>
              </div>
            </div>

            {/* All rows table */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>All rows</span>
              </div>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Date</th>
                      <th>Description</th>
                      <th>Paid by</th>
                      <th>Amount</th>
                      <th>Currency</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parseResult.rows.map((row) => {
                      const flagged = parseResult.anomalies.some((a) => a.rowNumbers.includes(row.rowIndex))
                      return (
                        <tr key={row.rowIndex} style={{ background: flagged ? '#fffbeb' : 'white' }}>
                          <td className="text-mono" style={{ color: 'var(--color-slate-400)', fontSize: '0.75rem' }}>
                            {row.rowIndex}
                          </td>
                          <td className="text-mono" style={{ fontSize: '0.8125rem' }}>
                            {row.date ? new Date(row.date).toLocaleDateString('en-IN') : <span style={{ color: 'var(--color-danger)' }}>invalid</span>}
                          </td>
                          <td style={{ fontWeight: 500, fontSize: '0.875rem' }}>{row.description}</td>
                          <td style={{ fontSize: '0.8125rem' }}>{row.paidBy || <span style={{ color: 'var(--color-danger)' }}>missing</span>}</td>
                          <td className="text-mono" style={{ fontSize: '0.8125rem' }}>
                            {row.amount !== null ? row.amount : <span style={{ color: 'var(--color-danger)' }}>—</span>}
                          </td>
                          <td style={{ fontSize: '0.8125rem' }}>
                            {row.currency || <span style={{ color: 'var(--color-warning)' }}>missing</span>}
                          </td>
                          <td>
                            {flagged ? (
                              <span className="badge badge-yellow">⚠ flagged</span>
                            ) : (
                              <span className="badge badge-green">✓ clean</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setStep(1)}>← Back</button>
              <button className="btn btn-primary" onClick={() => setStep(4)} id="go-to-resolve-btn">
                Resolve {parseResult.anomalies.length} issue{parseResult.anomalies.length !== 1 ? 's' : ''} →
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Resolve anomalies — Meera's request */}
        {step === 4 && parseResult && (
          <div>
            <div className="alert alert-info" style={{ marginBottom: 16 }}>
              <span>ℹ</span>
              <div>
                For each flagged issue, choose an action. <strong>Keep</strong> = import as-is.{' '}
                <strong>Skip</strong> = don't import this row.{' '}
                Nothing is saved until you hit "Confirm import".
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              {sortedAnomalies.map((anomaly, i) => {
                const key = `${anomaly.issueType}-${anomaly.rowNumbers[0]}`
                const resolution = resolutions[key] ?? 'KEEP'

                return (
                  <div key={i} className="card">
                    <div className="card-header" style={{ gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                        <span className={`badge severity-${anomaly.severity}`}>
                          {anomaly.severity}
                        </span>
                        <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                          {ISSUE_TYPE_LABELS[anomaly.issueType] ?? anomaly.issueType}
                        </span>
                        <span className="text-caption">row{anomaly.rowNumbers.length > 1 ? 's' : ''} {anomaly.rowNumbers.join(', ')}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => setResolutions({ ...resolutions, [key]: 'KEEP' })}
                          className={`btn btn-sm ${resolution === 'KEEP' ? 'btn-primary' : 'btn-secondary'}`}
                          id={`keep-${key}`}
                        >
                          Keep
                        </button>
                        <button
                          type="button"
                          onClick={() => setResolutions({ ...resolutions, [key]: 'SKIP' })}
                          className={`btn btn-sm ${resolution === 'SKIP' ? 'btn-danger' : 'btn-secondary'}`}
                          id={`skip-${key}`}
                        >
                          Skip
                        </button>
                      </div>
                    </div>
                    <div className="card-body" style={{ padding: '10px 16px' }}>
                      <p style={{ fontSize: '0.875rem', marginBottom: 6 }}>{anomaly.description}</p>
                      <p style={{ fontSize: '0.8125rem', color: 'var(--color-accent)' }}>
                        💡 Suggested: {anomaly.suggestedAction}
                      </p>
                    </div>
                    {resolution === 'SKIP' && (
                      <div className="card-footer">
                        <span className="text-caption" style={{ color: 'var(--color-danger)' }}>
                          ✕ Row{anomaly.rowNumbers.length > 1 ? 's' : ''} {anomaly.rowNumbers.join(', ')} will be skipped
                        </span>
                      </div>
                    )}
                    {resolution === 'KEEP' && (
                      <div className="card-footer">
                        <span className="text-caption" style={{ color: 'var(--color-success)' }}>
                          ✓ Row{anomaly.rowNumbers.length > 1 ? 's' : ''} {anomaly.rowNumbers.join(', ')} will be imported despite this issue
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setStep(3)}>← Back</button>
              <button
                className="btn btn-primary"
                onClick={handleCommit}
                disabled={loading}
                id="confirm-import-btn"
              >
                {loading ? 'Importing…' : `Confirm import →`}
              </button>
            </div>
          </div>
        )}

        {/* STEP 5: Import report */}
        {step === 5 && importResult && (
          <div style={{ maxWidth: 560 }}>
            <div className="card">
              <div className="card-header">
                <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Import report</span>
                <span className="badge badge-green">Complete</span>
              </div>
              <div className="card-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 0 }}>
                <div className="stat-card">
                  <div className="stat-label">Rows imported</div>
                  <div className="stat-value" style={{ color: 'var(--color-success)' }}>
                    {importResult.importedCount}
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Rows skipped</div>
                  <div className="stat-value" style={{ color: 'var(--color-slate-500)' }}>
                    {importResult.skippedCount}
                  </div>
                </div>
              </div>
              <div className="card-body">
                <div className="alert alert-success">
                  <span>✓</span>
                  <div>
                    Import complete. All flagged rows were reviewed by you before being imported or skipped.
                    This audit trail is preserved in the import job record.
                  </div>
                </div>
              </div>
              <div className="card-footer" style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => { setStep(1); setFile(null); setParseResult(null); setImportResult(null) }}
                >
                  Import another file
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => router.push(`/groups/${groupId}/expenses`)}
                  id="view-expenses-after-import"
                >
                  View expenses →
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
