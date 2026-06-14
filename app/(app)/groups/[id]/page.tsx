import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { formatCurrency } from '@/lib/currency'

export default async function GroupOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  const group = await prisma.group.findUnique({
    where: { id },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { joinedAt: 'asc' },
      },
      expenses: {
        where: { isSettlement: false },
        include: { paidBy: { select: { id: true, name: true } } },
        orderBy: { date: 'desc' },
        take: 5,
      },
      _count: {
        select: {
          expenses: { where: { isSettlement: false } },
          settlements: true,
        },
      },
    },
  })

  if (!group) notFound()

  const isMember = group.members.some((m) => m.userId === session.user.id)
  if (!isMember) redirect('/dashboard')

  const totalSpend = await prisma.expense.aggregate({
    where: { groupId: id, isSettlement: false, currency: 'INR' },
    _sum: { amount: true },
  })

  const activeMembers = group.members.filter((m) => !m.leftAt)

  return (
    <>
      <div className="page-header">
        <div>
          <h1 style={{ fontSize: '1rem', fontWeight: 600 }}>{group.name}</h1>
          {group.description && (
            <p className="text-caption" style={{ marginTop: 2 }}>{group.description}</p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href={`/groups/${id}/import`} className="btn btn-secondary btn-sm">
            ↑ Import CSV
          </Link>
          <Link href={`/groups/${id}/expenses/new`} className="btn btn-primary btn-sm" id="add-expense-btn">
            + Add expense
          </Link>
        </div>
      </div>

      <div className="page-body">
        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          <div className="stat-card">
            <div className="stat-label">Total spend (INR)</div>
            <div className="stat-value">
              {formatCurrency(Number(totalSpend._sum.amount ?? 0), 'INR')}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Expenses</div>
            <div className="stat-value">{group._count.expenses}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Active members</div>
            <div className="stat-value">{activeMembers.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Settlements</div>
            <div className="stat-value">{group._count.settlements}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
          {/* Recent expenses */}
          <div className="card">
            <div className="card-header">
              <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Recent expenses</span>
              <Link href={`/groups/${id}/expenses`} style={{ fontSize: '0.8125rem', color: 'var(--color-accent)', textDecoration: 'none' }}>
                View all →
              </Link>
            </div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Date</th>
                    <th>Paid by</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {group.expenses.map((exp) => (
                    <tr key={exp.id}>
                      <td>
                        <Link
                          href={`/groups/${id}/expenses/${exp.id}`}
                          style={{ color: 'var(--color-slate-900)', textDecoration: 'none', fontWeight: 500 }}
                        >
                          {exp.description}
                        </Link>
                        {exp.isRefund && <span className="badge badge-green" style={{ marginLeft: 6 }}>refund</span>}
                      </td>
                      <td className="text-caption">{formatDate(exp.date)}</td>
                      <td className="text-caption">{exp.paidBy?.name ?? '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 500, fontFamily: 'monospace', fontSize: '0.8125rem' }}>
                        {exp.currency !== 'INR' && (
                          <span className="badge badge-blue" style={{ marginRight: 4 }}>{exp.currency}</span>
                        )}
                        {formatCurrency(Number(exp.amount), exp.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Members */}
          <div className="card">
            <div className="card-header">
              <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Members</span>
              <Link href={`/groups/${id}/members`} style={{ fontSize: '0.8125rem', color: 'var(--color-accent)', textDecoration: 'none' }}>
                Timeline →
              </Link>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              {group.members.map((m) => (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 16px',
                    borderBottom: '1px solid var(--color-slate-100)',
                  }}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: 'var(--color-accent)',
                    color: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.75rem', fontWeight: 700, flexShrink: 0,
                  }}>
                    {m.user.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{m.user.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-slate-400)' }}>
                      Joined {formatDate(m.joinedAt)}
                      {m.leftAt && ` · Left ${formatDate(m.leftAt)}`}
                    </div>
                  </div>
                  {m.leftAt ? (
                    <span className="badge badge-gray">left</span>
                  ) : (
                    <span className="badge badge-green">active</span>
                  )}
                </div>
              ))}
            </div>
            <div className="card-footer">
              <Link href={`/groups/${id}/balances`} className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
                View balances →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function formatDate(d: Date) {
  return new Date(d).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric'
  })
}
