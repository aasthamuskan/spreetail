import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const CreateGroupSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().optional(),
  baseCurrency: z.enum(['INR', 'USD']).default('INR'),
  memberEmails: z.array(z.string().email()).optional(),
})

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const groups = await prisma.group.findMany({
    where: {
      members: { some: { userId: session.user.id, leftAt: null } },
    },
    include: {
      members: {
        where: { leftAt: null },
        include: { user: { select: { id: true, name: true, email: true } } },
      },
      _count: { select: { expenses: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(groups)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const data = CreateGroupSchema.parse(body)

    const group = await prisma.$transaction(async (tx) => {
      const g = await tx.group.create({
        data: {
          name: data.name,
          description: data.description,
          baseCurrency: data.baseCurrency,
          createdById: session.user.id,
          members: {
            create: {
              userId: session.user.id,
              joinedAt: new Date(),
              role: 'admin',
            },
          },
        },
      })

      if (data.memberEmails?.length) {
        for (const email of data.memberEmails) {
          const user = await tx.user.findUnique({ where: { email } })
          if (user && user.id !== session.user.id) {
            await tx.groupMember.create({
              data: { groupId: g.id, userId: user.id, joinedAt: new Date() },
            })
          }
        }
      }

      return g
    })

    return NextResponse.json(group, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 })
    console.error('[POST /api/groups] Error:', err)
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
