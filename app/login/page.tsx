'use client'
import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    if (result?.error) {
      setError('Invalid email or password')
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
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
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 8,
          }}>
            <div style={{
              width: 32,
              height: 32,
              background: 'var(--color-accent)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: 700,
              fontSize: 14,
            }}>S</div>
            <span style={{ fontSize: '1.125rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
              Spreetail
            </span>
          </div>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-slate-500)' }}>
            Shared expense management
          </p>
        </div>

        <div className="card">
          <div className="card-header">
            <h1 style={{ fontSize: '0.9375rem', fontWeight: 600 }}>Sign in to your account</h1>
          </div>
          <div className="card-body">
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label" htmlFor="email">Email address</label>
                <input
                  id="email"
                  type="email"
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  className="input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <div className="alert alert-danger" role="alert">
                  <span>⚠</span> {error}
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
                style={{ width: '100%', justifyContent: 'center', padding: '8px 12px' }}
                id="login-submit"
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </div>
          <div className="card-footer" style={{ textAlign: 'center' }}>
            <span className="text-caption">
              No account?{' '}
              <Link href="/register" style={{ color: 'var(--color-accent)', textDecoration: 'none', fontWeight: 500 }}>
                Create one
              </Link>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
