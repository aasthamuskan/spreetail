# Spreetail — Shared Expense Management

A full-stack web application for tracking, splitting, and settling shared expenses among flatmates. Built for the June 2026 assignment.

---

## What It Does

- **Group Management** — Create expense groups with multiple members, track who joined and who left
- **Expense Tracking** — Log expenses with equal, unequal, percentage, or share-based splits
- **Multi-Currency** — Supports INR and USD with exchange rate tracking (₹84/$1)
- **Balance Computation** — Real-time net balances with debt simplification (minimises transactions needed)
- **Settlement Recording** — Mark debts as paid; balances update instantly
- **Member Timeline** — Expenses respect membership windows (member who left in March shouldn't be in April splits)
- **CSV Import** — 5-step import flow with 14-type anomaly detection, manual review, and commit

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript 5 |
| Database | PostgreSQL via Neon (serverless) |
| ORM | Prisma 7 with `@prisma/adapter-pg` |
| Auth | NextAuth v4 (Credentials provider, bcryptjs) |
| Styling | Vanilla CSS (custom design system, no Tailwind) |
| Validation | Zod v4 |
| Deployment | Vercel |

---

## Local Setup

### Prerequisites
- Node.js 20+
- A PostgreSQL database (or use the Neon connection string in `.env`)

### Steps

```bash
# 1. Clone the repo
git clone https://github.com/aasthamuskan/spreetail.git
cd spreetail

# 2. Install dependencies
npm install

# 3. Create .env file
cp .env.example .env
# Edit .env with your DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL

# 4. Push the schema to your database
npx prisma db push

# 5. Start the dev server
npm run dev
```

App will be running at **http://localhost:3000**

### Environment Variables

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST/DB?sslmode=require&schema=spreetail"
NEXTAUTH_SECRET="your-secret-here"
NEXTAUTH_URL="http://localhost:3000"
```

> **Note on schema:** The `&schema=spreetail` param in `DATABASE_URL` is a Prisma convention. The `lib/prisma.ts` file strips this param before passing the URL to `pg.Pool` and sets `search_path` via the PostgreSQL `options` connection parameter.

---

## Project Structure

```
spreetail/
├── app/
│   ├── (app)/                  # Auth-protected routes
│   │   ├── dashboard/          # Group list
│   │   └── groups/[id]/
│   │       ├── expenses/       # Expense list + detail + new
│   │       ├── balances/       # Net balances + per-member breakdown
│   │       ├── settlements/    # Record payments
│   │       ├── members/        # Member timeline
│   │       └── import/         # CSV import wizard
│   ├── api/                    # REST API routes
│   ├── login/
│   └── register/
├── lib/
│   ├── auth.ts                 # NextAuth config
│   ├── balance-calculator.ts  # Core financial logic
│   ├── csv-parser.ts          # Anomaly detection engine
│   ├── currency.ts            # Conversion utilities
│   └── prisma.ts              # Database client
├── prisma/
│   └── schema.prisma          # Database schema
└── components/
    └── layout/Sidebar.tsx
```

---

## AI Tools Used

See [`AI_USAGE.md`](./AI_USAGE.md) for full details.

**Primary AI:** Google Gemini (Antigravity IDE)  
**Used for:** Architecture design, boilerplate generation, anomaly detection logic, balance calculation algorithm, Prisma schema design, debugging the Neon schema routing bug.
