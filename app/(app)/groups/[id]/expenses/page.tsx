import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatCurrency } from '@/lib/currency'

export default async function ExpensesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  const expenses = await prisma.expense.findMany({
    where: { groupId: id },
    include: {
      paidBy: { select: { id: true, name: true } },
      splits: { include: { user: { select: { id: true, name: true } } } },
    },
    orderBy: { date: 'desc' },
  })

  const SPLIT_BADGE: Record<string, { label: string; cls: string }> = {
    EQUAL:      { label: 'equal',      cls: 'badge-gray' },
    UNEQUAL:    { label: 'unequal',    cls: 'badge-blue' },
    PERCENTAGE: { label: '%',          cls: 'badge-yellow' },
    SHARE:      { label: 'share',      cls: 'badge-orange' },
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 style={{ fontSize: '1rem', fontWeight: 600 }}>Expenses</h1>
          <p className="text-caption" style={{ marginTop: 2 }}>{expenses.length} total</p>
        </div>
        <Link href={`/groups/${id}/expenses/new`} className="btn btn-primary btn-sm" id="new-expense-btn">
          + Add expense
        </Link>
      </div>

      <div className="page-body" style={{ padding: 0 }}>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Paid by</th>
                <th>Split</th>
                <th>Members</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((exp) => {
                const badge = SPLIT_BADGE[exp.splitType] ?? { label: exp.splitType, cls: 'badge-gray' }
                return (
                  <tr key={exp.id}>
                    <td className="text-mono" style={{ whiteSpace: 'nowrap', color: 'var(--color-slate-500)' }}>
                      {formatDate(exp.date)}
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{exp.description}</div>
                      {exp.notes && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-slate-400)', marginTop: 1 }}>
                          {exp.notes}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                        {exp.isRefund && <span className="badge badge-green">refund</span>}
                        {exp.isSettlement && <span className="badge badge-blue">settlement</span>}
                      </div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{exp.paidBy?.name ?? <span style={{ color: 'var(--color-slate-400)' }}>Unknown</span>}</td>
                    <td>
                      <span className={`badge ${badge.cls}`}>{badge.label}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                        {exp.splits.map((s) => (
                          <span key={s.userId} style={{
                            fontSize: '0.6875rem',
                            background: 'var(--color-slate-100)',
                            padding: '1px 5px',
                            borderRadius: 3,
                            color: 'var(--color-slate-600)',
                          }}>
                            {s.user.name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {exp.currency !== 'INR' && (
                        <span className="badge badge-blue" style={{ marginRight: 4 }}>{exp.currency}</span>
                      )}
                      <span className="text-mono" style={{ fontWeight: 600 }}>
                        {formatCurrency(Number(exp.amount), exp.currency)}
                      </span>
                    </td>
                    <td>
                      <Link
                        href={`/groups/${id}/expenses/${exp.id}`}
                        style={{ color: 'var(--color-accent)', fontSize: '0.8125rem', textDecoration: 'none' }}
                      >
                        Detail →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

function formatDate(d: Date) {
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric'
  })
}
