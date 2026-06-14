'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { formatCurrency } from '@/lib/currency'

interface Member {
  userId: string
  user: { id: string; name: string }
  joinedAt: string
  leftAt: string | null
}

export default function NewExpensePage() {
  const router = useRouter()
  const params = useParams()
  const groupId = params.id as string

  const [members, setMembers] = useState<Member[]>([])
  const [form, setForm] = useState({
    description: '',
    amount: '',
    currency: 'INR',
    paidById: '',
    date: new Date().toISOString().split('T')[0],
    splitType: 'EQUAL' as 'EQUAL' | 'UNEQUAL' | 'PERCENTAGE' | 'SHARE',
    splitWith: [] as string[],
    notes: '',
    exchangeRate: '84',
    isRefund: false,
  })
  const [splitDetails, setSplitDetails] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/groups/${groupId}/members`)
      .then((r) => r.json())
      .then((data) => {
        const active = data.filter((m: Member) => !m.leftAt)
        setMembers(data)
        setForm((f) => ({
          ...f,
          splitWith: active.map((m: Member) => m.userId),
        }))
      })
  }, [groupId])

  function toggleSplitWith(uid: string) {
    setForm((f) => ({
      ...f,
      splitWith: f.splitWith.includes(uid)
        ? f.splitWith.filter((id) => id !== uid)
        : [...f.splitWith, uid],
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const details: Record<string, number> = {}
    for (const [uid, val] of Object.entries(splitDetails)) {
      details[uid] = parseFloat(val) || 0
    }

    const res = await fetch(`/api/groups/${groupId}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: form.description,
        amount: parseFloat(form.amount),
        currency: form.currency,
        paidById: form.paidById || undefined,
        date: form.date,
        splitType: form.splitType,
        splitWith: form.splitWith,
        splitDetails: Object.keys(details).length > 0 ? details : undefined,
        notes: form.notes,
        exchangeRate: parseFloat(form.exchangeRate),
        isRefund: form.isRefund,
      }),
    })

    if (!res.ok) {
      const d = await res.json()
      setError(typeof d.error === 'string' ? d.error : 'Failed to create expense')
      setLoading(false)
      return
    }

    router.push(`/groups/${groupId}/expenses`)
  }

  const totalAmount = parseFloat(form.amount) || 0
  const splitCount = form.splitWith.length
  const perPerson = splitCount > 0 ? totalAmount / splitCount : 0

  return (
    <>
      <div className="page-header">
        <div>
          <h1 style={{ fontSize: '1rem', fontWeight: 600 }}>Add expense</h1>
          <p className="text-caption" style={{ marginTop: 2 }}>Record a new shared expense</p>
        </div>
      </div>

      <div className="page-body" style={{ maxWidth: 640 }}>
        <form onSubmit={handleSubmit}>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Expense details</span>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label" htmlFor="desc">Description *</label>
                <input
                  id="desc"
                  className="input"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="e.g. February rent"
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="amount">Amount *</label>
                  <input
                    id="amount"
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
                  <label className="form-label" htmlFor="currency">Currency</label>
                  <select
                    id="currency"
                    className="input"
                    value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  >
                    <option value="INR">INR</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>

              {form.currency === 'USD' && (
                <div className="alert alert-info">
                  <span>ℹ</span>
                  <div>
                    USD expense — specify the INR exchange rate used.
                    <div style={{ marginTop: 6 }}>
                      <label className="form-label" style={{ display: 'inline', marginRight: 8 }}>Rate: 1 USD =</label>
                      <input
                        className="input"
                        type="number"
                        step="0.01"
                        value={form.exchangeRate}
                        onChange={(e) => setForm({ ...form, exchangeRate: e.target.value })}
                        style={{ width: 100, display: 'inline-block' }}
                      />
                      <span style={{ marginLeft: 6 }}>INR</span>
                    </div>
                    <div style={{ marginTop: 4, fontSize: '0.75rem' }}>
                      Converted: {formatCurrency(totalAmount * parseFloat(form.exchangeRate || '84'), 'INR')}
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="date">Date *</label>
                  <input
                    id="date"
                    className="input"
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="paid-by">Paid by</label>
                  <select
                    id="paid-by"
                    className="input"
                    value={form.paidById}
                    onChange={(e) => setForm({ ...form, paidById: e.target.value })}
                  >
                    <option value="">— select —</option>
                    {members.map((m) => (
                      <option key={m.userId} value={m.userId}>{m.user.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="notes">Notes</label>
                <input
                  id="notes"
                  className="input"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Optional"
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  id="is-refund"
                  type="checkbox"
                  checked={form.isRefund}
                  onChange={(e) => setForm({ ...form, isRefund: e.target.checked })}
                />
                <label htmlFor="is-refund" className="form-label" style={{ marginBottom: 0 }}>
                  This is a refund/credit
                </label>
              </div>
            </div>
          </div>

          {/* Split section */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Split</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['EQUAL', 'UNEQUAL', 'PERCENTAGE', 'SHARE'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setForm({ ...form, splitType: type })}
                    className={`btn btn-sm ${form.splitType === type ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ textTransform: 'lowercase', fontSize: '0.75rem' }}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
            <div className="card-body">
              <p className="text-caption" style={{ marginBottom: 10 }}>
                {form.splitType === 'EQUAL' && `Split equally — ${formatCurrency(perPerson, form.currency)} per person`}
                {form.splitType === 'UNEQUAL' && 'Enter exact amount each person owes'}
                {form.splitType === 'PERCENTAGE' && 'Enter percentage each person owes (must sum to 100%)'}
                {form.splitType === 'SHARE' && 'Enter share units (e.g. 1, 2, 1 = 25%, 50%, 25%)'}
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {members.filter((m) => !m.leftAt).map((m) => (
                  <div
                    key={m.userId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: `1px solid ${form.splitWith.includes(m.userId) ? 'var(--color-accent)' : 'var(--color-slate-200)'}`,
                      background: form.splitWith.includes(m.userId) ? 'var(--color-accent-muted)' : 'white',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={form.splitWith.includes(m.userId)}
                      onChange={() => toggleSplitWith(m.userId)}
                      id={`split-${m.userId}`}
                    />
                    <label htmlFor={`split-${m.userId}`} style={{ flex: 1, fontWeight: 500, fontSize: '0.875rem', cursor: 'pointer' }}>
                      {m.user.name}
                    </label>
                    {form.splitType !== 'EQUAL' && form.splitWith.includes(m.userId) && (
                      <input
                        className="input"
                        type="number"
                        step="0.01"
                        placeholder={
                          form.splitType === 'PERCENTAGE' ? '%' :
                          form.splitType === 'SHARE' ? 'shares' : 'amount'
                        }
                        value={splitDetails[m.userId] ?? ''}
                        onChange={(e) => setSplitDetails({ ...splitDetails, [m.userId]: e.target.value })}
                        style={{ width: 90 }}
                      />
                    )}
                    {form.splitType === 'EQUAL' && form.splitWith.includes(m.userId) && (
                      <span className="text-mono" style={{ color: 'var(--color-slate-500)', fontSize: '0.8125rem' }}>
                        {formatCurrency(perPerson, form.currency)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {error && <div className="alert alert-danger" style={{ marginBottom: 12 }}>⚠ {error}</div>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={() => router.back()}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading} id="save-expense-btn">
              {loading ? 'Saving…' : 'Save expense'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
