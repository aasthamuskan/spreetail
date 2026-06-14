import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import Decimal = Prisma.Decimal

const SettlementSchema = z.object({
  fromUserId: z.string(),
  toUserId: z.string(),
  amount: z.number().positive(),
  currency: z.enum(['INR', 'USD']).default('INR'),
  date: z.string(),
  notes: z.string().optional(),
})

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const settlements = await prisma.settlement.findMany({
    where: { groupId: id },
    include: {
      fromUser: { select: { id: true, name: true } },
      toUser: { select: { id: true, name: true } },
    },
    orderBy: { date: 'desc' },
  })

  return NextResponse.json(settlements)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  try {
    const body = await req.json()
    const data = SettlementSchema.parse(body)

    const member = await prisma.groupMember.findFirst({
      where: { groupId: id, userId: session.user.id },
    })
    if (!member) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

    const settlement = await prisma.settlement.create({
      data: {
        groupId: id,
        fromUserId: data.fromUserId,
        toUserId: data.toUserId,
        amount: new Decimal(data.amount),
        currency: data.currency,
        date: new Date(data.date),
        notes: data.notes,
      },
      include: {
        fromUser: { select: { id: true, name: true } },
        toUser: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json(settlement, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
