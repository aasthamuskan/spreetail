import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { computeGroupBalances } from '@/lib/balance-calculator'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const member = await prisma.groupMember.findFirst({
    where: { groupId: id, userId: session.user.id },
  })
  if (!member) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

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

  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const expensesWithRates = expenses.map((e) => ({
    ...e,
    exchangeRate: e.currency === 'USD' ? 84.0 : 1,
  }))

  const balances = computeGroupBalances(
    members.map((m) => ({
      userId: m.userId,
      joinedAt: m.joinedAt,
      leftAt: m.leftAt,
      user: m.user,
    })),
    expensesWithRates,
    settlements,
    group.baseCurrency
  )

  return NextResponse.json(balances)
}
