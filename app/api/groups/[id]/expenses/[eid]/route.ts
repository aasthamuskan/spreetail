import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { calculateSplits } from '@/lib/balance-calculator'
import { Prisma } from '@prisma/client'
import Decimal = Prisma.Decimal

const UpdateExpenseSchema = z.object({
  description: z.string().min(1).optional(),
  amount: z.number().positive().optional(),
  currency: z.enum(['INR', 'USD']).optional(),
  paidById: z.string().optional(),
  date: z.string().optional(),
  splitType: z.enum(['EQUAL', 'UNEQUAL', 'PERCENTAGE', 'SHARE']).optional(),
  splitWith: z.array(z.string()).optional(),
  splitDetails: z.record(z.string(), z.number()).optional(),
  notes: z.string().optional(),
  isRefund: z.boolean().optional(),
  exchangeRate: z.number().optional(),
})

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; eid: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, eid } = await params

  const expense = await prisma.expense.findUnique({
    where: { id: eid },
    include: {
      paidBy: { select: { id: true, name: true } },
      splits: { include: { user: { select: { id: true, name: true } } } },
    },
  })

  if (!expense || expense.groupId !== id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(expense)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; eid: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, eid } = await params

  const body = await req.json()
  const data = UpdateExpenseSchema.parse(body)

  const existing = await prisma.expense.findUnique({ where: { id: eid } })
  if (!existing || existing.groupId !== id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const expense = await prisma.$transaction(async (tx) => {
    // If split is changing, recompute
    if (data.splitWith && data.splitType) {
      const amount = data.amount ?? Number(existing.amount)
      const rate = data.exchangeRate ?? (data.currency === 'USD' ? 84 : 1)
      const splitAmounts = calculateSplits(
        amount,
        data.splitType,
        data.splitWith,
        data.splitDetails
      )

      // Delete old splits
      await tx.expenseSplit.deleteMany({ where: { expenseId: eid } })

      // Create new splits
      await tx.expenseSplit.createMany({
        data: data.splitWith.map((uid) => ({
          expenseId: eid,
          userId: uid,
          amount: new Decimal(
            (data.currency ?? existing.currency) === 'INR'
              ? splitAmounts[uid] ?? 0
              : (splitAmounts[uid] ?? 0) * rate
          ),
        })),
      })
    }

    return tx.expense.update({
      where: { id: eid },
      data: {
        ...(data.description !== undefined && { description: data.description }),
        ...(data.amount !== undefined && { amount: new Decimal(data.amount) }),
        ...(data.currency !== undefined && { currency: data.currency }),
        ...(data.paidById !== undefined && { paidById: data.paidById }),
        ...(data.date !== undefined && { date: new Date(data.date) }),
        ...(data.splitType !== undefined && { splitType: data.splitType }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.isRefund !== undefined && { isRefund: data.isRefund }),
      },
      include: {
        paidBy: { select: { id: true, name: true } },
        splits: { include: { user: { select: { id: true, name: true } } } },
      },
    })
  })

  return NextResponse.json(expense)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; eid: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, eid } = await params

  const existing = await prisma.expense.findUnique({ where: { id: eid } })
  if (!existing || existing.groupId !== id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.expense.delete({ where: { id: eid } })
  return NextResponse.json({ success: true })
}
