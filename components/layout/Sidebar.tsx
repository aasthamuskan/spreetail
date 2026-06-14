'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'

interface Props {
  user: { name: string; email: string }
}

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: '⊞' },
]

const GROUP_NAV = [
  { suffix: '', label: 'Overview', icon: '◉' },
  { suffix: '/expenses', label: 'Expenses', icon: '₹' },
  { suffix: '/balances', label: 'Balances', icon: '⇄' },
  { suffix: '/settlements', label: 'Settlements', icon: '✓' },
  { suffix: '/members', label: 'Members', icon: '⊕' },
  { suffix: '/import', label: 'Import CSV', icon: '↑' },
]

export function Sidebar({ user }: Props) {
  const pathname = usePathname()
  const groupMatch = pathname.match(/\/groups\/([^/]+)/)
  const groupId = groupMatch?.[1]

  return (
    <nav className="sidebar" aria-label="Main navigation">
      {/* Logo */}
      <div className="sidebar-header">
        <Link href="/dashboard" style={{ textDecoration: 'none' }}>
          <div className="sidebar-logo">
            <div className="sidebar-logo-mark">S</div>
            Spreetail
          </div>
        </Link>
      </div>

      <div className="sidebar-nav">
        {/* Top-level nav */}
        <div className="sidebar-section-label">Navigation</div>
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`sidebar-item ${pathname === item.href ? 'active' : ''}`}
          >
            <span style={{ fontSize: '0.875rem' }}>{item.icon}</span>
            {item.label}
          </Link>
        ))}

        {/* Group nav — only when inside a group */}
        {groupId && (
          <>
            <div className="sidebar-section-label" style={{ marginTop: 8 }}>Group</div>
            {GROUP_NAV.map((item) => {
              const href = `/groups/${groupId}${item.suffix}`
              const isActive = pathname === href || (item.suffix !== '' && pathname.startsWith(href))
              return (
                <Link
                  key={href}
                  href={href}
                  className={`sidebar-item ${isActive ? 'active' : ''}`}
                >
                  <span style={{ fontSize: '0.875rem' }}>{item.icon}</span>
                  {item.label}
                </Link>
              )
            })}
          </>
        )}
      </div>

      {/* User footer */}
      <div style={{
        padding: '10px 8px',
        borderTop: '1px solid var(--color-slate-100)',
        marginTop: 'auto',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 8px',
          borderRadius: 6,
        }}>
          <div style={{
            width: 24, height: 24,
            borderRadius: '50%',
            background: 'var(--color-accent)',
            color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.6875rem',
            fontWeight: 700,
            flexShrink: 0,
          }}>
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '0.8125rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.name}
            </div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--color-slate-400)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.email}
            </div>
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="sidebar-item"
          style={{ width: '100%', marginTop: 2 }}
          id="signout-btn"
        >
          <span style={{ fontSize: '0.875rem' }}>→</span>
          Sign out
        </button>
      </div>
    </nav>
  )
}
