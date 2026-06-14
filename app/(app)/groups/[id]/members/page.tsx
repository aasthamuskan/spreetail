import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { format } from 'date-fns'

export default async function MembersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  const members = await prisma.groupMember.findMany({
    where: { groupId: id },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { joinedAt: 'asc' },
  })

  // Build timeline: find min and max dates
  const allDates = members.flatMap((m) => [m.joinedAt, m.leftAt ?? new Date()])
  const minDate = new Date(Math.min(...allDates.map((d) => d.getTime())))
  const maxDate = new Date(Math.max(...allDates.map((d) => d.getTime())))
  const totalMs = maxDate.getTime() - minDate.getTime() || 1

  function pct(d: Date) {
    return ((d.getTime() - minDate.getTime()) / totalMs) * 100
  }

  const COLORS = ['#2563eb', '#7c3aed', '#db2777', '#059669', '#d97706']

  return (
    <>
      <div className="page-header">
        <div>
          <h1 style={{ fontSize: '1rem', fontWeight: 600 }}>Members</h1>
          <p className="text-caption" style={{ marginTop: 2 }}>
            {members.length} total · {members.filter((m) => !m.leftAt).length} active
          </p>
        </div>
      </div>

      <div className="page-body">
        {/* Timeline view — Sam's request: "why would March electricity affect my balance?" */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Membership timeline</span>
            <span className="text-caption">
              Expenses outside a member's active period don't affect their balance
            </span>
          </div>
          <div className="card-body">
            {/* Month labels */}
            <div style={{
              display: 'flex',
              marginLeft: 120,
              marginBottom: 6,
              position: 'relative',
              height: 18,
            }}>
              {getMonthMarkers(minDate, maxDate).map((m) => (
                <div
                  key={m.label}
                  style={{
                    position: 'absolute',
                    left: `${m.pct}%`,
                    fontSize: '0.6875rem',
                    color: 'var(--color-slate-400)',
                    transform: 'translateX(-50%)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {m.label}
                </div>
              ))}
            </div>

            {/* Member bars */}
            {members.map((m, i) => {
              const leftPct = pct(m.joinedAt)
              const rightPct = pct(m.leftAt ?? new Date())
              const widthPct = rightPct - leftPct
              const color = COLORS[i % COLORS.length]

              return (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0,
                    marginBottom: 8,
                  }}
                >
                  {/* Name column */}
                  <div style={{
                    width: 120,
                    flexShrink: 0,
                    fontWeight: 500,
                    fontSize: '0.8125rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}>
                    <div style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: m.leftAt ? 'var(--color-slate-300)' : color,
                    }} />
                    {m.user.name}
                    {m.role === 'admin' && (
                      <span style={{ fontSize: '0.625rem', color: 'var(--color-slate-400)' }}>admin</span>
                    )}
                  </div>

                  {/* Bar track */}
                  <div style={{ flex: 1, position: 'relative', height: 24 }}>
                    <div
                      className="timeline-track"
                      style={{ position: 'absolute', top: 8, left: 0, right: 0 }}
                    />
                    <div style={{
                      position: 'absolute',
                      top: 8,
                      left: `${leftPct}%`,
                      width: `${Math.max(widthPct, 1)}%`,
                      height: 8,
                      borderRadius: 999,
                      background: color,
                      opacity: m.leftAt ? 0.5 : 1,
                    }} />
                  </div>

                  {/* Dates */}
                  <div style={{
                    width: 180,
                    flexShrink: 0,
                    fontSize: '0.75rem',
                    color: 'var(--color-slate-500)',
                    paddingLeft: 12,
                  }}>
                    {format(m.joinedAt, 'd MMM yyyy')}
                    {m.leftAt ? ` → ${format(m.leftAt, 'd MMM yyyy')}` : ' → present'}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Member table */}
        <div className="card">
          <div className="card-header">
            <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Member details</span>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Joined</th>
                  <th>Left</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td style={{ fontWeight: 500 }}>{m.user.name}</td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--color-slate-500)' }}>{m.user.email}</td>
                    <td>
                      <span className={`badge ${m.role === 'admin' ? 'badge-blue' : 'badge-gray'}`}>
                        {m.role}
                      </span>
                    </td>
                    <td className="text-caption">{format(m.joinedAt, 'd MMM yyyy')}</td>
                    <td className="text-caption">
                      {m.leftAt ? format(m.leftAt, 'd MMM yyyy') : '—'}
                    </td>
                    <td>
                      {m.leftAt ? (
                        <span className="badge badge-gray">inactive</span>
                      ) : (
                        <span className="badge badge-green">active</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}

function getMonthMarkers(
  start: Date,
  end: Date
): { label: string; pct: number }[] {
  const markers: { label: string; pct: number }[] = []
  const totalMs = end.getTime() - start.getTime() || 1

  const cur = new Date(start.getFullYear(), start.getMonth(), 1)
  while (cur <= end) {
    const pct = ((cur.getTime() - start.getTime()) / totalMs) * 100
    markers.push({
      label: format(cur, 'MMM yy'),
      pct: Math.max(0, Math.min(100, pct)),
    })
    cur.setMonth(cur.getMonth() + 1)
  }
  return markers
}
