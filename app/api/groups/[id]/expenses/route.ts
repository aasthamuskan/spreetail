import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { calculateSplits } from '@/lib/balance-calculator'
import { Prisma } from '@prisma/client'
import Decimal = Prisma.Decimal
import { z } from 'zod'

const CreateExpenseSchema = z.object({
  description: z.string().min(1),
  amount: z.number().positive(),
  currency: z.enum(['INR', 'USD']).default('INR'),
  paidById: z.string().optional(),
  date: z.string(),
  splitType: z.enum(['EQUAL', 'UNEQUAL', 'PERCENTAGE', 'SHARE']),
  splitWith: z.array(z.string()),
  splitDetails: z.record(z.string(), z.number()).optional(),
  notes: z.string().optional(),
  isRefund: z.boolean().optional().default(false),
  exchangeRate: z.number().optional(),
})

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const { searchParams } = new URL(req.url)
  const page = parseInt(searchParams.get('page') ?? '1')
  const limit = parseInt(searchParams.get('limit') ?? '50')
  const skip = (page - 1) * limit

  const member = await prisma.groupMember.findFirst({
    where: { groupId: id, userId: session.user.id },
  })
  if (!member) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const [expenses, total] = await Promise.all([
    prisma.expense.findMany({
      where: { groupId: id },
      include: {
        paidBy: { select: { id: true, name: true } },
        splits: { include: { user: { select: { id: true, name: true } } } },
      },
      orderBy: { date: 'desc' },
      skip,
      take: limit,
    }),
    prisma.expense.count({ where: { groupId: id } }),
  ])

  return NextResponse.json({ expenses, total, page, limit })
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
    const data = CreateExpenseSchema.parse(body)

    const member = await prisma.groupMember.findFirst({
      where: { groupId: id, userId: session.user.id },
    })
    if (!member) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

    const splitAmountsInExpenseCurrency = calculateSplits(
      data.amount,
      data.splitType,
      data.splitWith,
      data.splitDetails
    )

    const rate = data.exchangeRate ?? (data.currency === 'USD' ? 84.0 : 1)
    const splitAmountsInINR: Record<string, number> = {}
    for (const [uid, amt] of Object.entries(splitAmountsInExpenseCurrency)) {
      splitAmountsInINR[uid] = data.currency === 'INR' ? amt : amt * rate
    }

    const expense = await prisma.expense.create({
      data: {
        groupId: id,
        description: data.description,
        amount: new Decimal(data.amount),
        currency: data.currency,
        paidById: data.paidById,
        date: new Date(data.date),
        splitType: data.splitType,
        notes: data.notes,
        isRefund: data.isRefund ?? false,
        splits: {
          create: data.splitWith.map((uid) => ({
            userId: uid,
            amount: new Decimal(splitAmountsInINR[uid] ?? 0),
            percentage:
              data.splitType === 'PERCENTAGE'
                ? new Decimal(data.splitDetails?.[uid] ?? 0)
                : null,
            shares:
              data.splitType === 'SHARE'
                ? Math.round(data.splitDetails?.[uid] ?? 0)
                : null,
          })),
        },
      },
      include: {
        paidBy: { select: { id: true, name: true } },
        splits: { include: { user: { select: { id: true, name: true } } } },
      },
    })

    return NextResponse.json(expense, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 })
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
