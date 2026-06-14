import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect, notFound } from 'next/navigation'
import { computeGroupBalances } from '@/lib/balance-calculator'
import { formatCurrency } from '@/lib/currency'
import Link from 'next/link'

// This is the "Why do I owe X?" explainability screen — Rohan's core request
export default async function PersonBalancePage({
  params,
}: {
  params: Promise<{ id: string; uid: string }>
}) {
  const { id, uid } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  const [group, members, expenses, settlements, targetUser] = await Promise.all([
    prisma.group.findUnique({ where: { id } }),
    prisma.groupMember.findMany({
      where: { groupId: id },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { joinedAt: 'asc' },
    }),
    prisma.expense.findMany({
      where: { groupId: id, isSettlement: false },
      include: {
        paidBy: { select: { id: true, name: true } },
        splits: { include: { user: { select: { id: true, name: true } } } },
      },
      orderBy: { date: 'asc' },
    }),
    prisma.settlement.findMany({
      where: { groupId: id },
      include: {
        fromUser: { select: { id: true, name: true } },
        toUser: { select: { id: true, name: true } },
      },
    }),
    prisma.user.findUnique({ where: { id: uid } }),
  ])

  if (!group || !targetUser) notFound()

  const expensesWithRates = expenses.map((e) => ({
    ...e,
    exchangeRate: e.currency === 'USD' ? 84.0 : 1,
  }))

  const balances = computeGroupBalances(
    members.map((m) => ({ userId: m.userId, joinedAt: m.joinedAt, leftAt: m.leftAt, user: m.user })),
    expensesWithRates,
    settlements.map((s) => ({ ...s, fromUser: s.fromUser, toUser: s.toUser })),
    group.baseCurrency
  )

  const personBalance = balances.memberBalances.find((mb) => mb.userId === uid)
  if (!personBalance) notFound()

  // Sort expense lines by date descending
  const lines = [...personBalance.expenseLines].sort((a, b) => b.date.getTime() - a.date.getTime())

  return (
    <>
      <div className="page-header">
        <div>
          <div style={{ marginBottom: 4 }}>
            <Link
              href={`/groups/${id}/balances`}
              style={{ color: 'var(--color-slate-400)', textDecoration: 'none', fontSize: '0.8125rem' }}
            >
              ← Balances
            </Link>
          </div>
          <h1 style={{ fontSize: '1rem', fontWeight: 600 }}>
            {targetUser.name}'s balance breakdown
          </h1>
          <p className="text-caption" style={{ marginTop: 2 }}>
            Every expense that contributes to this balance — nothing hidden
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontSize: '1.5rem', fontWeight: 700,
            fontFamily: 'monospace',
          }} className={personBalance.netBalance > 0.01 ? 'balance-positive' : personBalance.netBalance < -0.01 ? 'balance-negative' : 'balance-zero'}>
            {personBalance.netBalance > 0.01 ? '+' : ''}
            {formatCurrency(personBalance.netBalance, 'INR')}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-slate-400)' }}>
            {personBalance.netBalance > 0.01
              ? 'others owe this person'
              : personBalance.netBalance < -0.01
              ? 'this person owes others'
              : 'all settled'}
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* How to read this */}
        <div className="alert alert-info" style={{ marginBottom: 16 }}>
          <span>ℹ</span>
          <div>
            <strong>How to read this table:</strong>{' '}
            "Paid" = what {targetUser.name} actually paid for this expense.{' '}
            "Share" = what {targetUser.name} owes for this expense.{' '}
            "Net" = Paid − Share. Positive net = group owes them; negative = they owe group.
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>
              Expense-by-expense breakdown ({lines.length} entries)
            </span>
            <div style={{ display: 'flex', gap: 12, fontSize: '0.75rem', color: 'var(--color-slate-500)' }}>
              <span>
                Total paid: <strong style={{ color: 'var(--color-slate-800)' }}>
                  {formatCurrency(lines.reduce((s, l) => s + l.userPaid, 0), 'INR')}
                </strong>
              </span>
              <span>
                Total owed: <strong style={{ color: 'var(--color-slate-800)' }}>
                  {formatCurrency(lines.reduce((s, l) => s + l.userShare, 0), 'INR')}
                </strong>
              </span>
            </div>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Expense</th>
                  <th>Paid by</th>
                  <th style={{ textAlign: 'right' }}>Original</th>
                  {/* Show rate column only if any expense has non-INR */}
                  <th style={{ textAlign: 'right' }}>Rate</th>
                  <th style={{ textAlign: 'right' }}>Paid (INR)</th>
                  <th style={{ textAlign: 'right' }}>Share (INR)</th>
                  <th style={{ textAlign: 'right' }}>Net</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => {
                  return (
                    <tr key={`${line.expenseId}-${i}`}>
                      <td className="text-mono" style={{ color: 'var(--color-slate-500)', whiteSpace: 'nowrap', fontSize: '0.8125rem' }}>
                        {formatDate(line.date)}
                      </td>
                      <td>
                        <Link
                          href={`/groups/${id}/expenses/${line.expenseId}`}
                          style={{ color: 'var(--color-slate-900)', textDecoration: 'none', fontWeight: 500 }}
                        >
                          {line.description}
                        </Link>
                      </td>
                      <td style={{ fontSize: '0.8125rem', color: 'var(--color-slate-600)' }}>
                        {line.paidByUserName}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                        {formatCurrency(line.originalAmount, line.currency)}
                        {line.currency !== 'INR' && (
                          <span className="badge badge-blue" style={{ marginLeft: 4 }}>{line.currency}</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--color-slate-400)' }}>
                        {line.currency !== 'INR' ? `₹${line.exchangeRate}` : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '0.8125rem' }}>
                        {line.userPaid > 0 ? formatCurrency(line.userPaid, 'INR') : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '0.8125rem' }}>
                        {formatCurrency(line.userShare, 'INR')}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'monospace', fontSize: '0.875rem', whiteSpace: 'nowrap' }}>
                        <span className={line.netEffect > 0.01 ? 'balance-positive' : line.netEffect < -0.01 ? 'balance-negative' : 'balance-zero'}>
                          {line.netEffect > 0.01 ? '+' : ''}{formatCurrency(line.netEffect, 'INR')}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--color-slate-50)', fontWeight: 700 }}>
                  <td colSpan={5} style={{ padding: '10px 12px', fontSize: '0.8125rem' }}>Total (after all expenses)</td>
                  <td style={{ textAlign: 'right', padding: '10px 12px', fontFamily: 'monospace' }}>
                    {formatCurrency(lines.reduce((s, l) => s + l.userPaid, 0), 'INR')}
                  </td>
                  <td style={{ textAlign: 'right', padding: '10px 12px', fontFamily: 'monospace' }}>
                    {formatCurrency(lines.reduce((s, l) => s + l.userShare, 0), 'INR')}
                  </td>
                  <td style={{ textAlign: 'right', padding: '10px 12px', fontFamily: 'monospace' }}>
                    <span className={personBalance.netBalance > 0.01 ? 'balance-positive' : personBalance.netBalance < -0.01 ? 'balance-negative' : 'balance-zero'}>
                      {personBalance.netBalance > 0.01 ? '+' : ''}
                      {formatCurrency(personBalance.netBalance, 'INR')}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
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
