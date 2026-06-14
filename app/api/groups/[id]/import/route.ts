import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseCsv } from '@/lib/csv-parser'
import { Prisma } from '@prisma/client'
import Decimal = Prisma.Decimal

export async function POST(
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

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const csvText = await file.text()
    const parseResult = parseCsv(csvText)

    // Create an ImportJob record
    const job = await prisma.importJob.create({
      data: {
        groupId: id,
        filename: file.name,
        status: 'NEEDS_REVIEW',
        totalRows: parseResult.summary.total,
        flaggedRows: parseResult.summary.flagged,
        createdById: session.user.id,
        issues: {
          create: parseResult.anomalies.map((anomaly) => ({
            rowNumber: anomaly.rowNumbers[0],
            rawData: anomaly.affectedRows as unknown as object,
            issueType: anomaly.issueType as any,
            severity: anomaly.severity as any,
            description: anomaly.description,
            suggestedAction: anomaly.suggestedAction,
          })),
        },
      },
      include: { issues: true },
    })

    return NextResponse.json({
      jobId: job.id,
      summary: parseResult.summary,
      anomalies: parseResult.anomalies,
      rows: parseResult.rows.map((r) => ({
        rowIndex: r.rawData._rowIndex,
        description: r.description,
        date: r.date,
        amount: r.amount,
        currency: r.currency,
        paidBy: r.paidBy,
        splitType: r.splitType,
        splitWith: r.splitWith,
        notes: r.notes,
      })),
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Parse failed' }, { status: 500 })
  }
}
