import { Prisma } from '@prisma/client'
import Decimal = Prisma.Decimal
import { convertCurrency } from './currency'

export interface MemberBalance {
  userId: string
  userName: string
  // positive = others owe this user; negative = this user owes others
  netBalance: number
  // detailed breakdown for explainability
  expenseLines: BalanceLine[]
}

export interface BalanceLine {
  expenseId: string
  description: string
  date: Date
  currency: string
  originalAmount: number
  convertedAmount: number // in group base currency (INR)
  exchangeRate: number
  paidByUserId: string
  paidByUserName: string
  userShare: number // what this user owes for this expense (in INR)
  userPaid: number // what this user paid (in INR, 0 if not payer)
  netEffect: number // userPaid - userShare (positive = good, negative = owes)
}

export interface DebtSimplification {
  fromUserId: string
  fromUserName: string
  toUserId: string
  toUserName: string
  amount: number // always positive
}

export interface GroupBalances {
  memberBalances: MemberBalance[]
  simplifiedDebts: DebtSimplification[]
  computedAt: Date
}

interface ExpenseWithRelations {
  id: string
  description: string
  amount: Decimal
  currency: string
  date: Date
  isRefund: boolean
  isSettlement: boolean
  paidById: string | null
  paidBy: { id: string; name: string } | null
  splits: {
    userId: string
    amount: Decimal
    user: { id: string; name: string }
  }[]
  exchangeRate?: number // if non-base currency, rate used
}

interface SettlementRecord {
  id: string
  fromUserId: string
  toUserId: string
  amount: Decimal
  currency: string
  date: Date
  fromUser: { id: string; name: string }
  toUser: { id: string; name: string }
}

interface MemberRecord {
  userId: string
  joinedAt: Date
  leftAt: Date | null
  user: { id: string; name: string }
}

/**
 * Compute balances for all members of a group.
 *
 * Key rules:
 * 1. A member only participates in expenses during their active membership period
 * 2. Expenses are converted to INR for balance computation (with rate stored)
 * 3. Full audit trail is stored per-line for explainability
 * 4. Settlements reduce the net balance
 */
export function computeGroupBalances(
  members: MemberRecord[],
  expenses: ExpenseWithRelations[],
  settlements: SettlementRecord[],
  baseCurrency: string = 'INR'
): GroupBalances {
  const memberBalances: Map<string, MemberBalance> = new Map()

  // Initialize balance for each member
  for (const m of members) {
    memberBalances.set(m.userId, {
      userId: m.userId,
      userName: m.user.name,
      netBalance: 0,
      expenseLines: [],
    })
  }

  // Process each expense
  for (const expense of expenses) {
    if (expense.isSettlement) continue // settlements handled separately

    const rate = expense.exchangeRate ?? 1
    const expenseInBase =
      expense.currency === baseCurrency
        ? Number(expense.amount)
        : convertCurrency(Number(expense.amount), expense.currency, baseCurrency, rate).convertedAmount

    // Process each split
    for (const split of expense.splits) {
      const member = memberBalances.get(split.userId)
      if (!member) continue // member not in this group (guest?)

      // Check membership window
      const memberRecord = members.find((m) => m.userId === split.userId)
      if (memberRecord) {
        const expDate = expense.date
        if (expDate < memberRecord.joinedAt) continue
        if (memberRecord.leftAt && expDate > memberRecord.leftAt) continue
      }

      const shareInBase = Number(split.amount)
      const paidInBase =
        expense.paidById === split.userId ? expenseInBase : 0
      const netEffect = paidInBase - shareInBase

      member.netBalance += netEffect
      member.expenseLines.push({
        expenseId: expense.id,
        description: expense.description,
        date: expense.date,
        currency: expense.currency,
        originalAmount: Number(expense.amount),
        convertedAmount: expenseInBase,
        exchangeRate: rate,
        paidByUserId: expense.paidById ?? '',
        paidByUserName: expense.paidBy?.name ?? 'Unknown',
        userShare: shareInBase,
        userPaid: paidInBase,
        netEffect,
      })
    }
  }

  // Apply settlements
  for (const settlement of settlements) {
    const rate = settlement.currency === baseCurrency ? 1 : 84
    const amountInBase = Number(settlement.amount) * rate

    const fromMember = memberBalances.get(settlement.fromUserId)
    const toMember = memberBalances.get(settlement.toUserId)

    if (fromMember) fromMember.netBalance += amountInBase // payer's debt reduced
    if (toMember) toMember.netBalance -= amountInBase     // receiver's credit reduced
  }

  const memberBalancesArray = Array.from(memberBalances.values())

  return {
    memberBalances: memberBalancesArray,
    simplifiedDebts: simplifyDebts(memberBalancesArray),
    computedAt: new Date(),
  }
}

/**
 * Greedy debt simplification using min/max heap approach.
 * Minimizes number of transactions needed to settle all debts.
 */
export function simplifyDebts(
  memberBalances: MemberBalance[]
): DebtSimplification[] {
  const results: DebtSimplification[] = []

  // Work on copies, rounded to 2 decimal places
  const balances = memberBalances.map((m) => ({
    ...m,
    netBalance: Math.round(m.netBalance * 100) / 100,
  }))

  // Separate creditors (positive) and debtors (negative)
  const creditors = balances.filter((m) => m.netBalance > 0.01)
  const debtors = balances.filter((m) => m.netBalance < -0.01)

  // Sort for deterministic results
  creditors.sort((a, b) => b.netBalance - a.netBalance)
  debtors.sort((a, b) => a.netBalance - b.netBalance)

  let ci = 0
  let di = 0

  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci]
    const debtor = debtors[di]

    let amount = Math.min(creditor.netBalance, -debtor.netBalance)
    amount = Math.round(amount * 100) / 100

    if (amount > 0.01) {
      results.push({
        fromUserId: debtor.userId,
        fromUserName: debtor.userName,
        toUserId: creditor.userId,
        toUserName: creditor.userName,
        amount,
      })
    }

    creditor.netBalance -= amount
    debtor.netBalance += amount

    if (Math.abs(creditor.netBalance) < 0.01) ci++
    if (Math.abs(debtor.netBalance) < 0.01) di++
  }

  return results
}

/**
 * Calculate split amounts for a given expense.
 * Returns a map of userId → amount owed (in expense currency).
 */
export function calculateSplits(
  totalAmount: number,
  splitType: 'EQUAL' | 'UNEQUAL' | 'PERCENTAGE' | 'SHARE',
  members: string[], // user IDs
  splitDetails?: Record<string, number> // userId → amount/percentage/shares
): Record<string, number> {
  const result: Record<string, number> = {}

  switch (splitType) {
    case 'EQUAL': {
      const perPerson = totalAmount / members.length
      for (const uid of members) {
        result[uid] = Math.round(perPerson * 100) / 100
      }
      // Fix rounding: assign remainder to first person
      const sum = Object.values(result).reduce((a, b) => a + b, 0)
      const diff = Math.round((totalAmount - sum) * 100) / 100
      if (diff !== 0 && members.length > 0) {
        result[members[0]] = Math.round((result[members[0]] + diff) * 100) / 100
      }
      break
    }

    case 'UNEQUAL': {
      if (!splitDetails) throw new Error('splitDetails required for UNEQUAL split')
      for (const uid of members) {
        result[uid] = splitDetails[uid] ?? 0
      }
      break
    }

    case 'PERCENTAGE': {
      if (!splitDetails) throw new Error('splitDetails required for PERCENTAGE split')
      for (const uid of members) {
        const pct = splitDetails[uid] ?? 0
        result[uid] = Math.round((totalAmount * pct) / 100 * 100) / 100
      }
      break
    }

    case 'SHARE': {
      if (!splitDetails) throw new Error('splitDetails required for SHARE split')
      const totalShares = Object.values(splitDetails).reduce((a, b) => a + b, 0)
      for (const uid of members) {
        const shares = splitDetails[uid] ?? 0
        result[uid] = Math.round((totalAmount * shares / totalShares) * 100) / 100
      }
      // Fix rounding
      const sum = Object.values(result).reduce((a, b) => a + b, 0)
      const diff = Math.round((totalAmount - sum) * 100) / 100
      if (diff !== 0 && members.length > 0) {
        result[members[0]] = Math.round((result[members[0]] + diff) * 100) / 100
      }
      break
    }
  }

  return result
}
