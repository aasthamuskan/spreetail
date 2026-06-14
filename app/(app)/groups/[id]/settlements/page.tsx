'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter, useParams } from 'next/navigation'
import { formatCurrency } from '@/lib/currency'

interface Member {
  userId: string
  user: { id: string; name: string }
}

interface Settlement {
  id: string
  fromUser: { name: string }
  toUser: { name: string }
  amount: string
  currency: string
  date: string
  notes: string | null
}

function SettlementsContent() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const groupId = params.id as string

  const [members, setMembers] = useState<Member[]>([])
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [form, setForm] = useState({
    fromUserId: searchParams.get('from') ?? '',
    toUserId: searchParams.get('to') ?? '',
    amount: searchParams.get('amount') ?? '',
    currency: 'INR',
    date: new Date().toISOString().split('T')[0],
    notes: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      fetch(`/api/groups/${groupId}/members`).then((r) => r.json()),
      fetch(`/api/groups/${groupId}/settlements`).then((r) => r.json()),
    ]).then(([m, s]) => {
      setMembers(m)
      setSettlements(s)
    })
  }, [groupId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch(`/api/groups/${groupId}/settlements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromUserId: form.fromUserId,
        toUserId: form.toUserId,
        amount: parseFloat(form.amount),
        currency: form.currency,
        date: form.date,
        notes: form.notes,
      }),
    })

    if (!res.ok) {
      const d = await res.json()
      setError(d.error ?? 'Failed to record settlement')
      setLoading(false)
      return
    }

    // Refresh
    const updated = await fetch(`/api/groups/${groupId}/settlements`).then((r) => r.json())
    setSettlements(updated)
    setForm({ ...form, notes: '', fromUserId: '', toUserId: '', amount: '' })
    setLoading(false)
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 style={{ fontSize: '1rem', fontWeight: 600 }}>Settlements</h1>
          <p className="text-caption" style={{ marginTop: 2 }}>Record payments between members</p>
        </div>
      </div>

      <div className="page-body">
        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 16 }}>
          {/* Record settlement form */}
          <div className="card" style={{ alignSelf: 'start' }}>
            <div className="card-header">
              <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Record payment</span>
            </div>
            <div className="card-body">
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="from-user">Who paid</label>
                  <select
                    id="from-user"
                    className="input"
                    value={form.fromUserId}
                    onChange={(e) => setForm({ ...form, fromUserId: e.target.value })}
                    required
                  >
                    <option value="">— select —</option>
                    {members.map((m) => (
                      <option key={m.userId} value={m.userId}>{m.user.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="to-user">Paid to</label>
                  <select
                    id="to-user"
                    className="input"
                    value={form.toUserId}
                    onChange={(e) => setForm({ ...form, toUserId: e.target.value })}
                    required
                  >
                    <option value="">— select —</option>
                    {members.map((m) => (
                      <option key={m.userId} value={m.userId}>{m.user.name}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 8 }}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="settle-amount">Amount</label>
                    <input
                      id="settle-amount"
                      className="input"
                      type="number"
                      step="0.01"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                      placeholder="0.00"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="settle-currency">Currency</label>
                    <select
                      id="settle-currency"
                      className="input"
                      value={form.currency}
                      onChange={(e) => setForm({ ...form, currency: e.target.value })}
                    >
                      <option value="INR">INR</option>
                      <option value="USD">USD</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="settle-date">Date</label>
                  <input
                    id="settle-date"
                    className="input"
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="settle-notes">Notes</label>
                  <input
                    id="settle-notes"
                    className="input"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Optional"
                  />
                </div>

                {error && <div className="alert alert-danger">⚠ {error}</div>}

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                  id="record-settlement-btn"
                >
                  {loading ? 'Recording…' : '✓ Record payment'}
                </button>
              </form>
            </div>
          </div>

          {/* Settlement history */}
          <div className="card">
            <div className="card-header">
              <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Payment history</span>
              <span className="text-caption">{settlements.length} records</span>
            </div>
            {settlements.length === 0 ? (
              <div className="card-body" style={{ textAlign: 'center', color: 'var(--color-slate-400)', padding: '32px' }}>
                No payments recorded yet
              </div>
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>From</th>
                      <th>To</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settlements.map((s) => (
                      <tr key={s.id}>
                        <td className="text-mono" style={{ fontSize: '0.8125rem', color: 'var(--color-slate-500)' }}>
                          {formatDate(new Date(s.date))}
                        </td>
                        <td style={{ fontWeight: 500 }}>{s.fromUser.name}</td>
                        <td>{s.toUser.name}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                          {s.currency !== 'INR' && <span className="badge badge-blue" style={{ marginRight: 4 }}>{s.currency}</span>}
                          {formatCurrency(parseFloat(s.amount), s.currency)}
                        </td>
                        <td style={{ fontSize: '0.8125rem', color: 'var(--color-slate-500)' }}>
                          {s.notes ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

export default function SettlementsPage() {
  return (
    <Suspense fallback={<div className="page-body">Loading…</div>}>
      <SettlementsContent />
    </Suspense>
  )
}

function formatDate(d: Date) {
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric'
  })
}
