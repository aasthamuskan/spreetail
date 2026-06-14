'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewGroupPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    name: '',
    description: '',
    baseCurrency: 'INR',
    memberEmails: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const emails = form.memberEmails
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    const res = await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        description: form.description,
        baseCurrency: form.baseCurrency,
        memberEmails: emails,
      }),
    })

    if (!res.ok) {
      const d = await res.json()
      setError(d.error ?? 'Failed to create group')
      setLoading(false)
      return
    }

    const group = await res.json()
    router.push(`/groups/${group.id}`)
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 style={{ fontSize: '1rem', fontWeight: 600 }}>New group</h1>
          <p className="text-caption" style={{ marginTop: 2 }}>Create a shared expense group</p>
        </div>
      </div>

      <div className="page-body" style={{ maxWidth: 560 }}>
        <div className="card">
          <div className="card-body">
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-group">
                <label className="form-label" htmlFor="group-name">Group name *</label>
                <input
                  id="group-name"
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Flat 4B"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="group-desc">Description</label>
                <input
                  id="group-desc"
                  className="input"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Optional"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="base-currency">Base currency</label>
                <select
                  id="base-currency"
                  className="input"
                  value={form.baseCurrency}
                  onChange={(e) => setForm({ ...form, baseCurrency: e.target.value })}
                >
                  <option value="INR">INR — Indian Rupee</option>
                  <option value="USD">USD — US Dollar</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="member-emails">
                  Invite members by email
                </label>
                <input
                  id="member-emails"
                  className="input"
                  value={form.memberEmails}
                  onChange={(e) => setForm({ ...form, memberEmails: e.target.value })}
                  placeholder="rohan@email.com, priya@email.com"
                />
                <p className="form-hint">Comma-separated. Members must already have accounts.</p>
              </div>

              {error && <div className="alert alert-danger">⚠ {error}</div>}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => router.back()}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading} id="create-group-submit">
                  {loading ? 'Creating…' : 'Create group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  )
}
