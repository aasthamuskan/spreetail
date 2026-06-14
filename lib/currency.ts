import { Prisma } from '@prisma/client'
import Decimal = Prisma.Decimal

// Fixed exchange rates for the Feb-April 2026 period
// Stored here as fallback; authoritative rates are in the ExchangeRates table
export const FALLBACK_RATES: Record<string, Record<string, number>> = {
  USD: { INR: 84.0 },
  INR: { USD: 1 / 84.0 },
}

/**
 * Convert amount from one currency to another using the rates table.
 * Returns the amount in the target currency, plus the rate used.
 */
export function convertCurrency(
  amount: number | Decimal,
  fromCurrency: string,
  toCurrency: string,
  rate?: number
): { convertedAmount: number; rate: number } {
  const numAmount = typeof amount === 'number' ? amount : Number(amount)

  if (fromCurrency === toCurrency) {
    return { convertedAmount: numAmount, rate: 1 }
  }

  const effectiveRate =
    rate ?? FALLBACK_RATES[fromCurrency]?.[toCurrency]

  if (!effectiveRate) {
    throw new Error(
      `No exchange rate found for ${fromCurrency} → ${toCurrency}`
    )
  }

  return {
    convertedAmount: numAmount * effectiveRate,
    rate: effectiveRate,
  }
}

/**
 * Format a number as currency string
 */
export function formatCurrency(
  amount: number | Decimal,
  currency: string = 'INR'
): string {
  const num = typeof amount === 'number' ? amount : Number(amount)
  if (currency === 'INR') {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num)
  }
  if (currency === 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num)
  }
  return `${currency} ${num.toFixed(2)}`
}

export const SUPPORTED_CURRENCIES = ['INR', 'USD'] as const
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number]
