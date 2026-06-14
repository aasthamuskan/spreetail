import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { computeGroupBalances } from '@/lib/balance-calculator'
import { formatCurrency } from '@/lib/currency'
import Link from 'next/link'

export default async function BalancesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  const [group, members, expenses, settlements] = await Promise.all([
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
  ])

  if (!group) redirect('/dashboard')

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

  return (
    <>
      <div className="page-header">
        <div>
          <h1 style={{ fontSize: '1rem', fontWeight: 600 }}>Balances</h1>
          <p className="text-caption" style={{ marginTop: 2 }}>Who owes whom — as of now</p>
        </div>
        <Link href={`/groups/${id}/settlements`} className="btn btn-secondary btn-sm">
          Record payment
        </Link>
      </div>

      <div className="page-body">
        {/* Simplified debt summary — Aisha's request: "one number per person" */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Settle up</span>
            <span className="text-caption">Minimum transactions needed</span>
          </div>
          {balances.simplifiedDebts.length === 0 ? (
            <div className="card-body" style={{ textAlign: 'center', color: 'var(--color-slate-400)', padding: '24px' }}>
              ✓ All settled up!
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Who pays</th>
                    <th></th>
                    <th>Who receives</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {balances.simplifiedDebts.map((debt, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 500 }}>{debt.fromUserName}</td>
                      <td style={{ color: 'var(--color-slate-400)' }}>→</td>
                      <td style={{ fontWeight: 500 }}>{debt.toUserName}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'monospace' }}>
                        {formatCurrency(debt.amount, 'INR')}
                      </td>
                      <td>
                        <Link
                          href={`/groups/${id}/settlements?from=${debt.fromUserId}&to=${debt.toUserId}&amount=${debt.amount.toFixed(2)}`}
                          className="btn btn-primary btn-sm"
                        >
                          Settle
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Per-person balance — Rohan's request: "show me what makes up my balance" */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginBottom: 20 }}>
          {balances.memberBalances.map((mb) => (
            <div key={mb.userId} className="card">
              <div className="card-body" style={{ padding: '12px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: 'var(--color-accent)', color: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: '0.875rem',
                  }}>
                    {mb.userName.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{mb.userName}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-slate-400)' }}>
                      {mb.expenseLines.length} expense{mb.expenseLines.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      fontWeight: 700,
                      fontSize: '1rem',
                      fontFamily: 'monospace',
                    }} className={mb.netBalance > 0.01 ? 'balance-positive' : mb.netBalance < -0.01 ? 'balance-negative' : 'balance-zero'}>
                      {mb.netBalance > 0.01 ? '+' : ''}{formatCurrency(mb.netBalance, 'INR')}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-slate-400)' }}>
                      {mb.netBalance > 0.01 ? 'owed by group' : mb.netBalance < -0.01 ? 'owes group' : 'settled'}
                    </div>
                  </div>
                </div>
                <Link
                  href={`/groups/${id}/balances/${mb.userId}`}
                  style={{ fontSize: '0.8125rem', color: 'var(--color-accent)', textDecoration: 'none' }}
                >
                  Why? See full breakdown →
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* Balance matrix */}
        <div className="card">
          <div className="card-header">
            <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Net balance summary</span>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Joined</th>
                  <th>Left</th>
                  <th style={{ textAlign: 'right' }}>Total paid</th>
                  <th style={{ textAlign: 'right' }}>Total owed</th>
                  <th style={{ textAlign: 'right' }}>Net</th>
                </tr>
              </thead>
              <tbody>
                {balances.memberBalances.map((mb) => {
                  const totalPaid = mb.expenseLines.reduce((sum, l) => sum + l.userPaid, 0)
                  const totalOwed = mb.expenseLines.reduce((sum, l) => sum + l.userShare, 0)
                  const memberRecord = members.find((m) => m.userId === mb.userId)
                  return (
                    <tr key={mb.userId}>
                      <td style={{ fontWeight: 500 }}>{mb.userName}</td>
                      <td className="text-caption">{formatDate(memberRecord?.joinedAt)}</td>
                      <td className="text-caption">
                        {memberRecord?.leftAt ? formatDate(memberRecord.leftAt) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '0.8125rem' }}>
                        {formatCurrency(totalPaid, 'INR')}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '0.8125rem' }}>
                        {formatCurrency(totalOwed, 'INR')}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '0.875rem', fontWeight: 700 }}>
                        <span className={mb.netBalance > 0.01 ? 'balance-positive' : mb.netBalance < -0.01 ? 'balance-negative' : 'balance-zero'}>
                          {mb.netBalance > 0.01 ? '+' : ''}{formatCurrency(mb.netBalance, 'INR')}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}

function formatDate(d?: Date | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
