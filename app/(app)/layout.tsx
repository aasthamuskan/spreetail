import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { Sidebar } from '@/components/layout/Sidebar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  return (
    <div className="app-layout">
      <Sidebar user={{ name: session.user?.name ?? '', email: session.user?.email ?? '' }} />
      <main className="main-content">{children}</main>
    </div>
  )
}
