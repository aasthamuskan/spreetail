import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const rawUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/spreetail'

// Extract the schema from the Prisma-specific `schema` URL param,
// then strip it from the URL — pg.Pool doesn't understand it.
let schema = 'public'
let connectionString = rawUrl

try {
  const url = new URL(rawUrl)
  schema = url.searchParams.get('schema') || 'public'
  url.searchParams.delete('schema')
  connectionString = url.toString()
} catch {
  // keep defaults
}

const pool = new pg.Pool({
  connectionString,
  // Tell PostgreSQL to use the spreetail schema for all queries
  options: `-c search_path="${schema}"`,
})

// PrismaPg adapter also needs the schema so it generates correct queries
const adapter = new PrismaPg(pool, { schema })

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
