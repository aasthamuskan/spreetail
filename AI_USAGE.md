# AI_USAGE.md — AI Tool Usage Log

## Tools Used

| Tool | Purpose |
|------|---------|
| **Google Gemini (Antigravity IDE)** | Primary development assistant — architecture, code generation, debugging |
| **GitHub Copilot** | Inline suggestions during manual editing sessions |

---

## Key Prompts Used

### Architecture Design
> *"Design a PostgreSQL schema for a shared expense tracker. Groups have members who can join and leave. Expenses can be split equally, unequally, by percentage, or by share ratios. We need to track settlement payments separately. The schema should support multi-currency. Design it in Prisma schema syntax."*

**Result:** Got the base schema with Group, GroupMember, Expense, ExpenseSplit, Settlement models. Had to manually add `leftAt` to GroupMember for membership windows, and `importJobId` to Expense for CSV import tracking.

### Balance Calculator
> *"Write a TypeScript function that computes net balances for each member of an expense group. A member only participates in expenses during their active membership window (joinedAt to leftAt). Expenses may be in USD; splits are stored in INR. Return per-member net balance and simplified debts using the greedy creditor-debtor matching algorithm."*

**Result:** Got a working implementation. The AI correctly implemented the greedy algorithm but had a bug — it didn't handle the settlement application correctly (settlements were reducing balances in the wrong direction).

### CSV Anomaly Detection
> *"Write a TypeScript CSV parser that detects 14 types of data quality issues in an expense CSV. Include: exact duplicates, fuzzy duplicates (same date+payer+similar description), settlements masquerading as expenses, unknown payers, missing payers, percentage sum errors, negative amounts (refunds), malformed dates, missing currency, zero amounts, ambiguous dates, membership conflicts, split type contradictions, and unknown members in splits."*

**Result:** Got a comprehensive implementation covering all 14 types. Required refinement on the fuzzy duplicate detection (initial implementation had too many false positives for short description names).

---

## Three Concrete Cases Where AI Produced Something Wrong

### Case 1 — Settlement Direction Bug in Balance Calculator

**What AI generated:**
```typescript
// Applying settlements
if (fromMember) fromMember.netBalance -= amountInBase  // AI wrote: reduces from-person's balance
if (toMember) toMember.netBalance += amountInBase      // AI wrote: increases to-person's balance
```

**The bug:** This is backwards. When Person A pays Person B (settlement), Person A's debt *decreases* (their net balance goes *up*, toward zero or positive), and Person B is owed less (their net balance goes *down*). The AI had the signs inverted.

**How I caught it:** Manually tested with a simple case: Rohan owes Aisha ₹500. After Rohan pays Aisha ₹500, both should be at 0. With the AI's code, Rohan would show -₹1000 and Aisha +₹1000 — doubling the debt instead of cancelling it.

**What I changed:**
```typescript
// Correct: paying reduces the payer's debt (increases their balance toward 0)
if (fromMember) fromMember.netBalance += amountInBase  // +: payer's balance improves
if (toMember) toMember.netBalance -= amountInBase      // -: receiver's credit reduces
```

---

### Case 2 — Prisma Schema Routing Bug (Critical Production Issue)

**What AI generated for `lib/prisma.ts`:**
```typescript
const pool = new pg.Pool({
  connectionString,  // URL contains ?schema=spreetail
  options: `-c search_path=${schema}`,
})
const adapter = new PrismaPg(pool)  // no schema option passed
```

**The bug:** When using `@prisma/adapter-pg`, the `schema` parameter in the DATABASE_URL (`?schema=spreetail`) is a Prisma-specific convention. The `pg.Pool` library doesn't understand it — it just passes the URL as-is to PostgreSQL. PostgreSQL doesn't have a `schema` connection parameter; it only understands `search_path` via `PGOPTIONS`. Additionally, the `pg.Pool` `options` field may not propagate correctly in all cases, and `PrismaPg` also needs the schema passed explicitly.

**How I caught it:** App deployed locally, login and registration both returned 500 errors. Server log showed: `The table 'public.users' does not exist in the current database.` The tables existed in the `spreetail` schema but PostgreSQL was defaulting to `public`.

**What I changed:**
```typescript
// 1. Strip ?schema= from URL before passing to pg (it's not a valid pg param)
const url = new URL(rawUrl)
const schema = url.searchParams.get('schema') || 'public'
url.searchParams.delete('schema')
const connectionString = url.toString()

// 2. Set search_path via PostgreSQL options
const pool = new pg.Pool({
  connectionString,
  options: `-c search_path="${schema}"`,  // valid PostgreSQL startup param
})

// 3. Pass schema to PrismaPg adapter explicitly
const adapter = new PrismaPg(pool, { schema })
```

---

### Case 3 — Fuzzy Duplicate Detection False Positives

**What AI generated:**
```typescript
// Fuzzy match: if one description is contained in the other
if (aDesc.includes(bDesc) || bDesc.includes(aDesc)) {
  // flag as possible duplicate
}
```

**The bug:** This flagged nearly everything as a duplicate. "Groceries BigBasket" (February) matched "Groceries DMart" (March) because both contain "Groceries". It also flagged "Wifi bill Feb" and "Wifi bill Mar" as duplicates — these are correctly two separate monthly bills, not duplicates.

**How I caught it:** Ran the parser against the test CSV and saw 30+ duplicate flags for 42 rows, including pairs like "February rent" / "March rent" being flagged as duplicates.

**What I changed:** Added multiple conditions that ALL must be true to flag as fuzzy duplicate:
1. Same date (exact match)
2. Same payer
3. Description prefix similarity (only first 6 chars), AND
4. Amount must be different (exact duplicates handled by the exact-match detector)

```typescript
if (
  a.rawData.date === b.rawData.date &&   // same day
  a.paidBy === b.paidBy &&              // same person paid
  a.amount !== b.amount &&              // different amounts (not exact dup)
  aDesc.length > 4 && bDesc.length > 4 &&
  (aDesc.includes(bDesc.substring(0, 6)) || bDesc.includes(aDesc.substring(0, 6)))
) {
  // flag as fuzzy duplicate
}
```

The `a.amount !== b.amount` check was the key addition — it ensures the fuzzy detector only catches cases like the Thalassa dinner (same day, same payer, similar description, *different amounts*) while ignoring monthly recurring bills.

---

## Overall Assessment of AI Assistance

**Where AI excelled:**
- Boilerplate and scaffolding (API routes, Prisma client setup, NextAuth config)
- Generating the Zod validation schemas from requirements
- Writing the debt simplification algorithm (greedy matching is well-known)
- Suggesting the 5-step import wizard UX pattern

**Where AI needed correction:**
- Financial sign conventions (which direction balances move on settlement)
- Environment-specific configuration (pg adapter + Neon schema routing)
- Fine-tuning ML-style pattern matching (too many false positives in fuzzy matching)
- TypeScript strict mode compliance (missed `noImplicitAny` issues caught by Vercel's build)

**Workflow:** AI generated first drafts; all financial logic was manually verified with test cases before committing. Database schema was reviewed against the actual CSV dataset to ensure it could represent every row.
