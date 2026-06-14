import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { calculateSplits } from '@/lib/balance-calculator'
import { Prisma } from '@prisma/client'
import Decimal = Prisma.Decimal
import { z } from 'zod'

// Resolution decision per issue
const ResolutionSchema = z.object({
  issueId: z.string(),
  resolution: z.enum(['KEEP', 'SKIP', 'MODIFIED']),
  resolvedData: z.any().optional(),
})

// Full commit payload
const CommitSchema = z.object({
  resolutions: z.array(ResolutionSchema),
  // Rows that were clean (no issues) — always imported
  cleanRows: z.array(z.any()),
})

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, jobId } = await params

  const job = await prisma.importJob.findUnique({
    where: { id: jobId, groupId: id },
    include: { issues: true },
  })
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(job)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, jobId } = await params

  const body = await req.json()
  const { resolutions, cleanRows } = CommitSchema.parse(body)

  // Get group members for user ID mapping
  const members = await prisma.groupMember.findMany({
    where: { groupId: id },
    include: { user: true },
  })
  const memberByName = new Map(members.map((m) => [m.user.name.toLowerCase(), m.user]))

  const importedExpenses: string[] = []
  let skippedCount = 0

  await prisma.$transaction(async (tx) => {
    // 1. Update issue resolutions
    for (const res of resolutions) {
      await tx.importIssue.update({
        where: { id: res.issueId },
        data: {
          resolution: res.resolution,
          resolvedData: res.resolvedData ?? undefined,
          resolvedById: session.user.id,
          resolvedAt: new Date(),
        },
      })
    }

    // 2. Import clean rows
    for (const row of cleanRows) {
      try {
        const paidByUser = memberByName.get((row.paidBy ?? '').toLowerCase())
        const splitWithUsers = (row.splitWith as string[])
          .map((name) => memberByName.get(name.toLowerCase()))
          .filter(Boolean) as { id: string; name: string }[]

        if (!splitWithUsers.length) continue

        const amount = parseFloat(String(row.amount))
        const rate = row.currency === 'USD' ? 84.0 : 1
        const splitAmounts = calculateSplits(
          amount,
          mapSplitType(row.splitType),
          splitWithUsers.map((u) => u.id),
          row.splitDetails
        )

        const expense = await tx.expense.create({
          data: {
            groupId: id,
            description: row.description,
            amount: new Decimal(Math.abs(amount)),
            currency: row.currency || 'INR',
            paidById: paidByUser?.id,
            date: new Date(row.date),
            splitType: mapSplitType(row.splitType),
            notes: row.notes,
            isRefund: amount < 0,
            importJobId: jobId,
            splits: {
              create: splitWithUsers.map((u) => ({
                userId: u.id,
                amount: new Decimal(
                  row.currency === 'INR'
                    ? splitAmounts[u.id] ?? 0
                    : (splitAmounts[u.id] ?? 0) * rate
                ),
              })),
            },
          },
        })
        importedExpenses.push(expense.id)
      } catch {
        skippedCount++
      }
    }

    // 3. Import resolved rows that were KEEP or MODIFIED
    for (const res of resolutions) {
      if (res.resolution === 'SKIP') { skippedCount++; continue }
      const rowData = res.resolvedData ?? {}
      if (!rowData.date || !rowData.description) continue

      try {
        const paidByUser = memberByName.get((rowData.paidBy ?? '').toLowerCase())
        const splitWithUsers = ((rowData.splitWith as string[]) ?? [])
          .map((name: string) => memberByName.get(name.toLowerCase()))
          .filter(Boolean) as { id: string; name: string }[]

        if (!splitWithUsers.length) continue

        const amount = parseFloat(String(rowData.amount))
        const rate = rowData.currency === 'USD' ? 84.0 : 1
        const splitAmounts = calculateSplits(
          Math.abs(amount),
          mapSplitType(rowData.splitType ?? 'equal'),
          splitWithUsers.map((u: { id: string }) => u.id),
          rowData.splitDetails
        )

        await tx.expense.create({
          data: {
            groupId: id,
            description: rowData.description,
            amount: new Decimal(Math.abs(amount)),
            currency: rowData.currency || 'INR',
            paidById: paidByUser?.id,
            date: new Date(rowData.date),
            splitType: mapSplitType(rowData.splitType ?? 'equal'),
            notes: rowData.notes,
            isRefund: amount < 0,
            isSettlement: rowData.isSettlement ?? false,
            importJobId: jobId,
            splits: {
              create: splitWithUsers.map((u: { id: string }) => ({
                userId: u.id,
                amount: new Decimal(
                  rowData.currency === 'INR'
                    ? splitAmounts[u.id] ?? 0
                    : (splitAmounts[u.id] ?? 0) * rate
                ),
              })),
            },
          },
        })
      } catch {
        skippedCount++
      }
    }

    // 4. Mark job complete
    await tx.importJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        importedRows: importedExpenses.length,
        skippedRows: skippedCount,
        completedAt: new Date(),
      },
    })
  })

  return NextResponse.json({
    success: true,
    importedCount: importedExpenses.length,
    skippedCount,
  })
}

function mapSplitType(raw: string): 'EQUAL' | 'UNEQUAL' | 'PERCENTAGE' | 'SHARE' {
  const map: Record<string, 'EQUAL' | 'UNEQUAL' | 'PERCENTAGE' | 'SHARE'> = {
    equal: 'EQUAL',
    unequal: 'UNEQUAL',
    percentage: 'PERCENTAGE',
    share: 'SHARE',
  }
  return map[raw?.toLowerCase()] ?? 'EQUAL'
}
