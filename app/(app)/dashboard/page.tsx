import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  const groups = await prisma.group.findMany({
    where: { members: { some: { userId: session.user.id, leftAt: null } } },
    include: {
      members: {
        where: { leftAt: null },
        include: { user: { select: { id: true, name: true } } },
      },
      _count: { select: { expenses: { where: { isSettlement: false } } } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <>
      <div className="page-header">
        <div>
          <h1 style={{ fontSize: '1rem', fontWeight: 600 }}>Dashboard</h1>
          <p className="text-caption" style={{ marginTop: 2 }}>
            Welcome back, {session.user.name}
          </p>
        </div>
        <Link href="/groups/new" className="btn btn-primary btn-sm" id="new-group-btn">
          + New group
        </Link>
      </div>

      <div className="page-body">
        {groups.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '48px 24px',
            color: 'var(--color-slate-400)',
          }}>
            <div style={{ fontSize: '2rem', marginBottom: 12 }}>⊞</div>
            <p style={{ fontWeight: 500, color: 'var(--color-slate-600)', marginBottom: 6 }}>
              No groups yet
            </p>
            <p style={{ fontSize: '0.8125rem' }}>
              Create a group or ask your flatmates to add you.
            </p>
            <Link href="/groups/new" className="btn btn-primary btn-sm" style={{ marginTop: 16 }}>
              Create your first group
            </Link>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {groups.map((group: typeof groups[number]) => (
              <Link
                key={group.id}
                href={`/groups/${group.id}`}
                style={{ textDecoration: 'none' }}
                id={`group-card-${group.id}`}
              >
                <div className="card" style={{ cursor: 'pointer', transition: 'border-color 0.1s' }}>
                  <div className="card-body">
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: 'var(--color-slate-900)', marginBottom: 4 }}>
                          {group.name}
                        </div>
                        {group.description && (
                          <div style={{ fontSize: '0.8125rem', color: 'var(--color-slate-500)', marginBottom: 8 }}>
                            {group.description}
                          </div>
                        )}
                      </div>
                      <span className="badge badge-gray">{group.baseCurrency}</span>
                    </div>

                    <div style={{ display: 'flex', gap: 16, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--color-slate-100)' }}>
                      <div>
                        <div style={{ fontSize: '0.6875rem', color: 'var(--color-slate-400)', fontWeight: 500 }}>MEMBERS</div>
                        <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{group.members.length}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.6875rem', color: 'var(--color-slate-400)', fontWeight: 500 }}>EXPENSES</div>
                        <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{group._count.expenses}</div>
                      </div>
                    </div>

                    {/* Member avatars */}
                    <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
                      {group.members.slice(0, 5).map((m) => (
                        <div
                          key={m.userId}
                          title={m.user.name}
                          style={{
                            width: 24, height: 24,
                            borderRadius: '50%',
                            background: stringToColor(m.user.name),
                            color: 'white',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.6875rem', fontWeight: 700,
                            border: '2px solid white',
                            marginLeft: -4,
                          }}
                        >
                          {m.user.name.charAt(0).toUpperCase()}
                        </div>
                      ))}
                      {group.members.length > 5 && (
                        <div style={{
                          width: 24, height: 24, borderRadius: '50%',
                          background: 'var(--color-slate-300)', color: 'white',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.6875rem', fontWeight: 700, marginLeft: -4,
                        }}>
                          +{group.members.length - 5}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function stringToColor(str: string): string {
  const colors = ['#2563eb', '#7c3aed', '#db2777', '#059669', '#d97706', '#dc2626', '#0891b2']
  let hash = 0
  for (const ch of str) hash = ch.charCodeAt(0) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}
