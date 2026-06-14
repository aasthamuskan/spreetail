import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const members = await prisma.groupMember.findMany({
    where: { groupId: id },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { joinedAt: 'asc' },
  })

  return NextResponse.json(members)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const { email, joinedAt, leftAt } = await req.json()

  const caller = await prisma.groupMember.findFirst({
    where: { groupId: id, userId: session.user.id },
  })
  if (!caller) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const existing = await prisma.groupMember.findFirst({
    where: { groupId: id, userId: user.id },
  })
  if (existing) return NextResponse.json({ error: 'Already a member' }, { status: 409 })

  const member = await prisma.groupMember.create({
    data: {
      groupId: id,
      userId: user.id,
      joinedAt: joinedAt ? new Date(joinedAt) : new Date(),
      leftAt: leftAt ? new Date(leftAt) : null,
    },
    include: { user: { select: { id: true, name: true, email: true } } },
  })

  return NextResponse.json(member, { status: 201 })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const { userId, leftAt } = await req.json()

  const updated = await prisma.groupMember.updateMany({
    where: { groupId: id, userId },
    data: { leftAt: leftAt ? new Date(leftAt) : new Date() },
  })

  return NextResponse.json({ updated: updated.count })
}
