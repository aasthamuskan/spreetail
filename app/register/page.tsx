'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signIn } from 'next-auth/react'

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Registration failed')
      setLoading(false)
      return
    }

    // Auto sign-in after registration
    await signIn('credentials', { email: form.email, password: form.password, redirect: false })
    router.push('/dashboard')
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-slate-50)',
    }}>
      <div style={{ width: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{
              width: 32, height: 32,
              background: 'var(--color-accent)',
              borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontWeight: 700, fontSize: 14,
            }}>S</div>
            <span style={{ fontSize: '1.125rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
              Spreetail
            </span>
          </div>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-slate-500)' }}>
            Create your account
          </p>
        </div>

        <div className="card">
          <div className="card-header">
            <h1 style={{ fontSize: '0.9375rem', fontWeight: 600 }}>New account</h1>
          </div>
          <div className="card-body">
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label" htmlFor="name">Full name</label>
                <input
                  id="name"
                  type="text"
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Aisha"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="reg-email">Email address</label>
                <input
                  id="reg-email"
                  type="email"
                  className="input"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="reg-password">Password</label>
                <input
                  id="reg-password"
                  type="password"
                  className="input"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="min. 6 characters"
                  required
                  minLength={6}
                />
              </div>

              {error && (
                <div className="alert alert-danger">
                  <span>⚠</span> {error}
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
                style={{ width: '100%', justifyContent: 'center', padding: '8px 12px' }}
                id="register-submit"
              >
                {loading ? 'Creating account…' : 'Create account'}
              </button>
            </form>
          </div>
          <div className="card-footer" style={{ textAlign: 'center' }}>
            <span className="text-caption">
              Already have an account?{' '}
              <Link href="/login" style={{ color: 'var(--color-accent)', textDecoration: 'none', fontWeight: 500 }}>
                Sign in
              </Link>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
