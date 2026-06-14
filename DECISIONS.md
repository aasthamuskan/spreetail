# DECISIONS.md — Engineering Decision Log

Every significant design decision made during the project, with options considered and rationale.

---

## 1. Database: PostgreSQL (Neon) vs SQLite vs MongoDB

**Decision:** PostgreSQL via Neon (serverless)

| Option | Pros | Cons |
|--------|------|------|
| **PostgreSQL/Neon** | ACID transactions, Decimal type for money, relational integrity, free cloud tier | Requires schema management |
| SQLite | Zero setup, file-based | No good cloud deployment story; no concurrent writes in serverless |
| MongoDB | Flexible schema | No Decimal type; money stored as float = rounding errors; joins are awkward |

**Why chosen:** Financial data needs exact decimal arithmetic. PostgreSQL's `DECIMAL(12,2)` stores money without floating-point errors. Neon provides a free serverless PostgreSQL database that works perfectly with Vercel. The relational model naturally represents the group/member/expense/split hierarchy.

---

## 2. ORM: Prisma vs Drizzle vs raw SQL

**Decision:** Prisma 7 with `@prisma/adapter-pg`

| Option | Pros | Cons |
|--------|------|------|
| **Prisma** | Type-safe queries, auto-generated types, excellent DX, schema-as-code | Slightly heavier runtime |
| Drizzle | Lightweight, SQL-like API, fast | Less mature tooling, more boilerplate |
| Raw SQL (pg) | Maximum control | No type safety, manual mapping, prone to injection if not careful |

**Why chosen:** The auto-generated TypeScript types from Prisma schemas mean every query result is fully typed — no casting, no guessing. For an app with complex nested relations (groups → members → expenses → splits), this eliminates entire classes of bugs. The driver adapter (`PrismaPg`) was chosen over Prisma's default engine because it works correctly in serverless/edge environments like Vercel.

**Key bug found:** When using `PrismaPg`, the Prisma-specific `?schema=spreetail` URL parameter must be *stripped* from the connection string before passing to `pg.Pool`, and the schema must be set via `options: '-c search_path="spreetail"'`. Prisma's default engine handles this automatically, but the adapter does not. See `lib/prisma.ts`.

---

## 3. Auth: NextAuth Credentials vs OAuth vs JWT-only

**Decision:** NextAuth v4 with Credentials provider

| Option | Pros | Cons |
|--------|------|------|
| **NextAuth Credentials** | Works without external OAuth provider, full control | Passwords must be hashed manually |
| Google/GitHub OAuth | No password management | Requires every user to have that account; adds OAuth setup complexity |
| Custom JWT | Minimal dependencies | Must implement session storage, refresh, CSRF manually |

**Why chosen:** The app is used by a small group of known flatmates — they don't need Google/GitHub accounts. Credentials provider keeps the setup self-contained. NextAuth handles session cookies, CSRF, and JWT signing. Passwords are hashed with `bcryptjs` (cost factor 12).

---

## 4. Split Types: How Many to Support

**Decision:** Four split types: EQUAL, UNEQUAL, PERCENTAGE, SHARE

| Type | Use case | Example |
|------|----------|---------|
| EQUAL | Default — split evenly | Rent divided 4 ways |
| UNEQUAL | Different fixed amounts | Birthday cake: Rohan ₹700, Priya ₹400, Meera ₹400 |
| PERCENTAGE | Proportional by % | Pizza: Aisha 27%, Rohan 27%, Priya 27%, Meera 18% |
| SHARE | Ratio-based | Scooter rental: Rohan 2 shares, others 1 share (took bigger scooter) |

**Why not just EQUAL + UNEQUAL:** The CSV dataset contained all four patterns. PERCENTAGE is human-readable for cases like "Aisha pays 30% because she has a bigger room." SHARE is more natural when thinking in ratios rather than exact percentages.

---

## 5. Balance Calculation: Where to Compute

**Decision:** Server-side in `lib/balance-calculator.ts`, computed on-demand per request

| Option | Pros | Cons |
|--------|------|------|
| **Server-side on demand** | Always fresh, no sync issues, simple | Slightly slower per request |
| Pre-computed and cached in DB | Fast reads | Cache invalidation complexity; stale data on concurrent edits |
| Client-side | Saves server resources | Must send all raw data to client; privacy concern |

**Why chosen:** The group sizes are small (2-10 people) and expense counts are manageable (hundreds, not millions). Computing balances on each page load is fast enough. Pre-computation would require a cache invalidation strategy on every expense/settlement mutation — unnecessary complexity for this scale.

---

## 6. Currency Storage: Store Original vs Convert to Base

**Decision:** Store split amounts **always in INR** (base currency), store original amount and exchange rate separately

**The problem:** An expense paid in USD (e.g., $540 for a Goa villa) needs to appear in member balances in INR.

| Option | Pros | Cons |
|--------|------|------|
| **Store in base currency** | Balance computation is simple: just sum split amounts | Lossy — original amount must be reconstructed |
| Store in original currency, convert at query time | More accurate | Requires FX rate at query time; rates change; complex queries |
| Store both | Best of both | More complex schema |

**Why chosen:** `ExpenseSplit.amount` stores the INR equivalent at the time of entry. The `Expense` table stores the original amount, currency, and exchange rate used. This means balance calculation is O(n) with no FX lookups, while the original data is preserved for display.

---

## 7. CSV Import: 5-Step Flow vs Direct Import

**Decision:** 5-step wizard with anomaly review before commit

The 5 steps:
1. Upload file
2. Parse and detect anomalies (instant)
3. Show anomaly report — user sees every issue
4. User resolves each issue (KEEP / SKIP / MODIFY)
5. Commit — only then write to database

| Option | Pros | Cons |
|--------|------|------|
| **5-step wizard** | User has full control; no bad data enters DB | More UI complexity |
| Direct import with warnings | Fast | Bad data silently enters; hard to undo |
| Reject file if any error | Safe | Useless for real-world messy data (45% of rows had issues) |

**Why chosen:** The CSV dataset had 19 anomalies. A direct import would have entered wrong data — duplicate expenses would inflate balances, settlements-as-expenses would double-count debt, membership conflicts would assign charges to people who had already moved out. The wizard makes every decision explicit and auditable.

---

## 8. Debt Simplification Algorithm

**Decision:** Greedy creditor/debtor matching (minimises transaction count)

**The problem:** With 5 people, naïve debt tracking produces up to 20 pairwise debts (A→B, A→C, B→C, etc.). This is hard to settle.

**Algorithm:**
1. Compute each person's net balance (positive = owed money, negative = owes money)
2. Sort creditors descending, debtors ascending
3. Greedily match each debtor to largest creditor; create one settlement for min(debt, credit)
4. Repeat until all balanced

**Result:** 5 people with complex cross-debts can always be settled in at most 4 transactions (n-1), often fewer.

**Alternative considered:** Flow-based algorithms (like min-cost max-flow) — theoretically optimal but overkill for groups of <20 people. The greedy approach gives optimal results for small groups.
