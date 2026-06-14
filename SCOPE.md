# SCOPE.md — Data Anomaly Log & Database Schema

## Overview

This document describes every data quality problem found in the `Expenses Export.csv` file, how each was classified, and how the system handles it. It also contains the full database schema.

---

## The CSV Dataset

The CSV represents 5 months (Feb–April 2026) of shared flat expenses for 5 people: **Aisha, Rohan, Priya, Meera** (left March 31), and **Sam** (joined April 8). Guest **Dev** appears during a Goa trip; **Kabir** (Dev's friend) appears once.

**Total rows:** 42  
**Anomalies detected:** 19 issues across 14 anomaly types

---

## Anomaly Log — Every Problem Found

### Row 5 & 6 — DUPLICATE_EXPENSE (HIGH)
| Field | Row 5 | Row 6 |
|---|---|---|
| date | 08-02-2026 | 08-02-2026 |
| description | "Dinner at Marina Bites" | "dinner - marina bites" |
| amount | 3200 | 3200 |
| paid_by | Dev | Dev |

**Problem:** Same dinner logged twice — different capitalisation and punctuation but identical in substance.  
**Detection:** Fuzzy duplicate check (same date + same payer + description prefix match within 6 chars).  
**Action:** User reviews both; keep Row 5 (more descriptive), skip Row 6.

---

### Row 10 — NON_INTEGER_AMOUNT (LOW)
**Description:** Cylinder refill — amount is `899.995` (3 decimal places)  
**Problem:** Likely a data entry error; currency doesn't support sub-paisa values.  
**Action:** Round to `₹900.00` on import.

---

### Row 11 — UNKNOWN_PAYER (MEDIUM)
**Description:** Groceries DMart — paid_by is `"Priya S"`, not `"Priya"`  
**Problem:** Name variant not matching any known member.  
**Action:** User maps to "Priya" during review step.

---

### Row 13 — MISSING_PAYER (MEDIUM)
**Description:** House cleaning supplies — `paid_by` column is empty  
**Note:** `notes` says "can't remember who paid"  
**Problem:** Cannot compute balances without a payer.  
**Action:** User must assign a payer or skip the row.

---

### Row 14 — SETTLEMENT_AS_EXPENSE (HIGH)
**Description:** "Rohan paid Aisha back" — `₹5000`, notes: "this is a settlement not an expense??"  
**Problem:** This is a debt payment between members, not a shared expense. Importing as expense would double-count in balances.  
**Action:** Convert to a Settlement record (fromUser: Rohan, toUser: Aisha, amount: ₹5000).

---

### Row 15 — PERCENTAGE_SUM_ERROR (MEDIUM)
**Description:** Pizza Friday — split_details: `Aisha 30%; Rohan 30%; Priya 30%; Meera 20%`  
**Problem:** 30 + 30 + 30 + 20 = **110%**, not 100%.  
**Action:** Normalise proportionally: Aisha 27.27%, Rohan 27.27%, Priya 27.27%, Meera 18.18%.

---

### Row 20 — UNKNOWN_MEMBER_IN_SPLIT (LOW) + foreign currency
**Description:** Goa villa booking — paid by Dev (guest), split with Aisha;Rohan;Priya;Dev, `$540 USD`  
**Problem (1):** Dev is a guest, not a registered member — listed as known guest in parser.  
**Problem (2):** USD amount needs exchange rate conversion at ₹84/$.  
**Action:** Dev treated as external payer; USD converted at ₹84 = ₹45,360 distributed equally.

---

### Row 23 — UNKNOWN_MEMBER_IN_SPLIT (LOW)
**Description:** Parasailing — split includes "Dev's friend Kabir"  
**Problem:** Kabir is not a group member.  
**Action:** Kabir listed as known guest; his share is tracked but doesn't affect member balances.

---

### Row 24 & 25 — DUPLICATE_EXPENSE (HIGH)
**Description:** "Dinner at Thalassa" (Aisha, ₹2400) and "Thalassa dinner" (Rohan, ₹2450)  
**Problem:** Notes on Row 25 say "Aisha also logged this I think hers is wrong" — same dinner, two entries, different payers and slightly different amounts.  
**Action:** User keeps one; Row 25's notes confirm Row 24 is likely the canonical entry.

---

### Row 26 — NEGATIVE_AMOUNT (MEDIUM)
**Description:** Parasailing refund — `-$30 USD`  
**Problem:** Negative amount signals a refund/credit.  
**Action:** Import as `isRefund: true` expense; reduces the expense total for split members.

---

### Row 27 — MALFORMED_DATE (MEDIUM)
**Description:** Airport cab — date is `"Mar-14"` instead of `DD-MM-YYYY`  
**Problem:** Non-standard date format.  
**Action:** Parser infers `2026-03-14` from `Mon-DD` pattern; user must confirm.

---

### Row 28 — MISSING_CURRENCY (MEDIUM)
**Description:** Groceries DMart — currency field is empty  
**Problem:** Cannot determine exchange rate or display correctly.  
**Action:** Default to INR (group base currency); flagged for user confirmation.

---

### Row 31 — ZERO_AMOUNT (LOW)
**Description:** Dinner order Swiggy — amount is `0`  
**Note:** "counted twice earlier - fixing later"  
**Problem:** Zero-amount expense has no financial effect but pollutes the record.  
**Action:** Skip this row; it's a placeholder for a correction that was never made.

---

### Row 34 — AMBIGUOUS_DATE (HIGH)
**Description:** Deep cleaning service — date is `04-05-2026`, notes: "is this April 5 or May 4? format is a mess"  
**Problem:** Date is genuinely ambiguous — could be April 5 (DD-MM) or May 4 (MM-DD).  
**Action:** Block on import; user must explicitly confirm which interpretation is correct before proceeding.

---

### Row 36 — MEMBERSHIP_CONFLICT (HIGH)
**Description:** Groceries BigBasket (02-04-2026) — `split_with` includes Meera  
**Problem:** Meera left the flat on 31-03-2026. She cannot be part of an April expense split.  
**Note:** "oops Meera still in the group list"  
**Action:** Remove Meera from split; redistribute her share equally among Aisha, Rohan, Priya.

---

### Row 38 — SETTLEMENT_AS_EXPENSE (HIGH)
**Description:** "Sam deposit share" — Sam pays Aisha ₹15,000; notes say "Sam moving in! paid Aisha his deposit"  
**Problem:** This is a deposit payment to Aisha, not a shared expense to split.  
**Action:** Convert to Settlement (fromUser: Sam, toUser: Aisha).

---

### Row 42 — SPLIT_TYPE_CONTRADICTION (LOW)
**Description:** Furniture for common room — `split_type` is `"equal"` but `split_details` contains share ratios `Aisha 1; Rohan 1; Priya 1; Sam 1`  
**Problem:** Since all shares are equal (1:1:1:1), this is genuinely an equal split, but the presence of split_details with split_type=equal is contradictory.  
**Action:** Ignore split_details; apply equal split. Log contradiction for review.

---

## Summary Table

| Row | Anomaly Type | Severity | Action Taken |
|-----|-------------|----------|--------------|
| 5,6 | DUPLICATE_EXPENSE | HIGH | Skip Row 6 |
| 10 | NON_INTEGER_AMOUNT | LOW | Round to ₹900 |
| 11 | UNKNOWN_PAYER | MEDIUM | Map to Priya |
| 13 | MISSING_PAYER | MEDIUM | User assigns payer |
| 14 | SETTLEMENT_AS_EXPENSE | HIGH | Convert to Settlement |
| 15 | PERCENTAGE_SUM_ERROR | MEDIUM | Normalise to 100% |
| 20 | UNKNOWN_MEMBER_IN_SPLIT | LOW | Dev = known guest |
| 23 | UNKNOWN_MEMBER_IN_SPLIT | LOW | Kabir = known guest |
| 24,25 | DUPLICATE_EXPENSE | HIGH | Skip Row 25 |
| 26 | NEGATIVE_AMOUNT | MEDIUM | Import as isRefund=true |
| 27 | MALFORMED_DATE | MEDIUM | Infer Mar 14; confirm |
| 28 | MISSING_CURRENCY | MEDIUM | Default INR |
| 31 | ZERO_AMOUNT | LOW | Skip |
| 34 | AMBIGUOUS_DATE | HIGH | Block; user must confirm |
| 36 | MEMBERSHIP_CONFLICT | HIGH | Remove Meera from split |
| 38 | SETTLEMENT_AS_EXPENSE | HIGH | Convert to Settlement |
| 42 | SPLIT_TYPE_CONTRADICTION | LOW | Ignore details; equal split |

**19 anomalies across 42 rows — 45% of rows had at least one issue.**

---

## Database Schema

```prisma
model User {
  id           String        @id @default(cuid())
  name         String
  email        String        @unique
  passwordHash String
  createdAt    DateTime      @default(now())

  groups       GroupMember[]
  expenses     Expense[]     @relation("ExpensePayer")
  splits       ExpenseSplit[]
  settlements  Settlement[]  @relation("SettlementFrom")
  receivedSettlements Settlement[] @relation("SettlementTo")
  importJobs   ImportJob[]
  resolvedIssues ImportIssue[]
}

model Group {
  id           String        @id @default(cuid())
  name         String
  description  String?
  baseCurrency String        @default("INR")
  createdById  String
  createdAt    DateTime      @default(now())

  members      GroupMember[]
  expenses     Expense[]
  settlements  Settlement[]
  importJobs   ImportJob[]
}

model GroupMember {
  id       String    @id @default(cuid())
  groupId  String
  userId   String
  joinedAt DateTime
  leftAt   DateTime? // null = still active member
  role     String    @default("member")

  group    Group     @relation(fields: [groupId], references: [id], onDelete: Cascade)
  user     User      @relation(fields: [userId], references: [id])

  @@unique([groupId, userId])
}

model Expense {
  id           String         @id @default(cuid())
  groupId      String
  description  String
  amount       Decimal        @db.Decimal(12, 2)
  currency     String         @default("INR")
  paidById     String?
  date         DateTime
  splitType    SplitType      @default(EQUAL)
  notes        String?
  isRefund     Boolean        @default(false)
  isSettlement Boolean        @default(false)
  exchangeRate Float?
  importJobId  String?
  createdAt    DateTime       @default(now())

  group        Group          @relation(fields: [groupId], references: [id], onDelete: Cascade)
  paidBy       User?          @relation("ExpensePayer", fields: [paidById], references: [id])
  splits       ExpenseSplit[]
}

model ExpenseSplit {
  id         String   @id @default(cuid())
  expenseId  String
  userId     String
  amount     Decimal  @db.Decimal(12, 2)  // always in group base currency (INR)
  percentage Decimal? @db.Decimal(5, 2)
  shares     Int?

  expense    Expense  @relation(fields: [expenseId], references: [id], onDelete: Cascade)
  user       User     @relation(fields: [userId], references: [id])

  @@unique([expenseId, userId])
}

model Settlement {
  id         String   @id @default(cuid())
  groupId    String
  fromUserId String
  toUserId   String
  amount     Decimal  @db.Decimal(12, 2)
  currency   String   @default("INR")
  date       DateTime
  notes      String?
  createdAt  DateTime @default(now())

  group      Group    @relation(fields: [groupId], references: [id], onDelete: Cascade)
  fromUser   User     @relation("SettlementFrom", fields: [fromUserId], references: [id])
  toUser     User     @relation("SettlementTo", fields: [toUserId], references: [id])
}

model ImportJob {
  id           String        @id @default(cuid())
  groupId      String
  filename     String
  status       ImportStatus  @default(NEEDS_REVIEW)
  totalRows    Int
  flaggedRows  Int
  importedRows Int?
  skippedRows  Int?
  createdById  String
  completedAt  DateTime?
  createdAt    DateTime      @default(now())

  group        Group         @relation(fields: [groupId], references: [id], onDelete: Cascade)
  createdBy    User          @relation(fields: [createdById], references: [id])
  issues       ImportIssue[]
}

model ImportIssue {
  id             String     @id @default(cuid())
  importJobId    String
  rowNumber      Int
  rawData        Json
  issueType      IssueType
  severity       Severity
  description    String
  suggestedAction String
  resolution     Resolution? // null = not yet reviewed
  resolvedData   Json?
  resolvedById   String?
  resolvedAt     DateTime?

  importJob      ImportJob  @relation(fields: [importJobId], references: [id], onDelete: Cascade)
  resolvedBy     User?      @relation(fields: [resolvedById], references: [id])
}

enum SplitType   { EQUAL UNEQUAL PERCENTAGE SHARE }
enum ImportStatus { NEEDS_REVIEW COMPLETED ABANDONED }
enum IssueType   { DUPLICATE_EXPENSE SETTLEMENT_AS_EXPENSE UNKNOWN_PAYER MISSING_PAYER
                   PERCENTAGE_SUM_ERROR NEGATIVE_AMOUNT MALFORMED_DATE MISSING_CURRENCY
                   ZERO_AMOUNT AMBIGUOUS_DATE MEMBERSHIP_CONFLICT SPLIT_TYPE_CONTRADICTION
                   NON_INTEGER_AMOUNT UNKNOWN_MEMBER_IN_SPLIT }
enum Severity    { HIGH MEDIUM LOW }
enum Resolution  { KEEP SKIP MODIFIED }
```

### Key Schema Design Choices

- `ExpenseSplit.amount` is always stored **in INR** (base currency) regardless of expense currency — this makes balance computation O(n) without needing real-time FX lookups
- `GroupMember.leftAt` enables **membership window enforcement** — expenses can only affect a member during their active period
- `ImportIssue` stores the raw CSV row as `Json` — enables full audit trail and manual correction in the UI
- `Expense.isSettlement` flag allows settlements-recorded-as-expenses to be excluded from balance calculations
