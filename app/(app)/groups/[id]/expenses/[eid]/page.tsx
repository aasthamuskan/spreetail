import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect, notFound } from 'next/navigation'
import { formatCurrency } from '@/lib/currency'
import Link from 'next/link'

export default async function ExpenseDetailPage({
  params,
}: {
  params: Promise<{ id: string; eid: string }>
}) {
  const { id, eid } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  const expense = await prisma.expense.findUnique({
    where: { id: eid },
    include: {
      paidBy: { select: { id: true, name: true } },
      splits: {
        include: { user: { select: { id: true, name: true } } },
        orderBy: { amount: 'desc' },
      },
    },
  })

  if (!expense || expense.groupId !== id) notFound()

  const rate = expense.currency === 'USD' ? 84.0 : 1
  const amountInINR = Number(expense.amount) * rate

  const SPLIT_LABEL: Record<string, string> = {
    EQUAL: 'Equal split',
    UNEQUAL: 'Unequal (exact amounts)',
    PERCENTAGE: 'Percentage split',
    SHARE: 'Share-based split',
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Link
              href={`/groups/${id}/expenses`}
              style={{ color: 'var(--color-slate-400)', textDecoration: 'none', fontSize: '0.8125rem' }}
            >
              ← Expenses
            </Link>
          </div>
          <h1 style={{ fontSize: '1rem', fontWeight: 600 }}>{expense.description}</h1>
          <p className="text-caption" style={{ marginTop: 2 }}>
            {formatDate(expense.date)} · {SPLIT_LABEL[expense.splitType]}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {expense.isRefund && <span className="badge badge-green">refund</span>}
          {expense.isSettlement && <span className="badge badge-blue">settlement</span>}
        </div>
      </div>

      <div className="page-body" style={{ maxWidth: 640 }}>
        {/* Amount summary */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <div>
              <div className="stat-label">Amount paid</div>
              <div className="stat-value">{formatCurrency(Number(expense.amount), expense.currency)}</div>
              {expense.currency !== 'INR' && (
                <div className="stat-sub">
                  ≈ {formatCurrency(amountInINR, 'INR')} @ ₹{rate}/USD
                </div>
              )}
            </div>
            <div>
              <div className="stat-label">Paid by</div>
              <div className="stat-value" style={{ fontSize: '1rem' }}>
                {expense.paidBy?.name ?? <span style={{ color: 'var(--color-slate-400)' }}>Unknown</span>}
              </div>
            </div>
            <div>
              <div className="stat-label">Split among</div>
              <div className="stat-value" style={{ fontSize: '1rem' }}>{expense.splits.length} people</div>
            </div>
          </div>
          {expense.notes && (
            <div className="card-footer">
              <span className="text-caption">📝 {expense.notes}</span>
            </div>
          )}
        </div>

        {/* Currency detail (if not INR) */}
        {expense.currency !== 'INR' && (
          <div className="alert alert-info" style={{ marginBottom: 16 }}>
            <span>ℹ</span>
            <div>
              <strong>Multi-currency expense</strong>
              <div style={{ marginTop: 4, fontSize: '0.8125rem' }}>
                Original: <strong>{formatCurrency(Number(expense.amount), expense.currency)}</strong>
                {' → '}
                Rate applied: <strong>1 {expense.currency} = ₹{rate}</strong>
                {' → '}
                INR equivalent: <strong>{formatCurrency(amountInINR, 'INR')}</strong>
              </div>
              <div style={{ marginTop: 2, fontSize: '0.75rem' }}>
                All balances are computed in INR using this rate.
                The original amount is preserved for audit.
              </div>
            </div>
          </div>
        )}

        {/* Split breakdown — the explainability table */}
        <div className="card">
          <div className="card-header">
            <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Split breakdown</span>
            <span className="badge badge-gray">{SPLIT_LABEL[expense.splitType]}</span>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Person</th>
                  <th style={{ textAlign: 'right' }}>
                    Share ({expense.currency})
                  </th>
                  {expense.currency !== 'INR' && (
                    <th style={{ textAlign: 'right' }}>Share (INR)</th>
                  )}
                  {expense.splitType === 'PERCENTAGE' && (
                    <th style={{ textAlign: 'right' }}>%</th>
                  )}
                  {expense.splitType === 'SHARE' && (
                    <th style={{ textAlign: 'right' }}>Shares</th>
                  )}
                  <th style={{ textAlign: 'right' }}>Paid</th>
                  <th style={{ textAlign: 'right' }}>Net effect</th>
                </tr>
              </thead>
              <tbody>
                {expense.splits.map((split) => {
                  const shareINR = Number(split.amount)
                  const shareOrig = expense.currency === 'INR' ? shareINR : shareINR / rate
                  const isPayer = expense.paidBy?.id === split.userId
                  const paidAmount = isPayer ? Number(expense.amount) : 0
                  const paidINR = isPayer ? amountInINR : 0
                  const netEffect = paidINR - shareINR

                  return (
                    <tr key={split.userId}>
                      <td style={{ fontWeight: 500 }}>
                        {split.user.name}
                        {isPayer && (
                          <span className="badge badge-blue" style={{ marginLeft: 6 }}>payer</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '0.8125rem' }}>
                        {formatCurrency(shareOrig, expense.currency)}
                      </td>
                      {expense.currency !== 'INR' && (
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '0.8125rem', color: 'var(--color-slate-500)' }}>
                          {formatCurrency(shareINR, 'INR')}
                        </td>
                      )}
                      {expense.splitType === 'PERCENTAGE' && (
                        <td style={{ textAlign: 'right' }}>
                          <span className="text-mono">
                            {split.percentage ? `${Number(split.percentage).toFixed(1)}%` : '—'}
                          </span>
                        </td>
                      )}
                      {expense.splitType === 'SHARE' && (
                        <td style={{ textAlign: 'right' }}>
                          <span className="text-mono">{split.shares ?? '—'}</span>
                        </td>
                      )}
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '0.8125rem' }}>
                        {isPayer ? formatCurrency(paidINR, 'INR') : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'monospace', fontSize: '0.8125rem' }}>
                        <span className={netEffect > 0.01 ? 'balance-positive' : netEffect < -0.01 ? 'balance-negative' : 'balance-zero'}>
                          {netEffect > 0.01 ? '+' : ''}{formatCurrency(netEffect, 'INR')}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="card-footer">
            <p className="text-caption">
              Net effect: positive = others owe this person; negative = this person owes the group.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}

function formatDate(d: Date) {
  return new Date(d).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric'
  })
}
