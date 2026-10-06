import { formatMoney, parseAmount } from '../../lib/money'

/** What a split has assigned so far, in cents so the sums are exact. `total` is null until the amount is valid. */
export type Assignment = { total: number | null; assigned: number; remaining: number }

const cents = (text: string): number => {
  const amount = parseAmount(text)
  return amount === null ? 0 : Math.round(Number(amount) * 100)
}

/** The payment amount against what its portions add up to (SPLITS_003). */
export function assignment(amount: string, portions: { amount: string }[]): Assignment {
  const total = parseAmount(amount) === null ? null : cents(amount)
  const assigned = portions.reduce((sum, portion) => sum + cents(portion.amount), 0)
  return { total, assigned, remaining: total === null ? 0 : total - assigned }
}

/** "$115.00 is assigned and $5.00 is still to assign", or that it all is. */
export function splitSummary({ total, assigned, remaining }: Assignment): string {
  if (total === null) return 'Enter the amount of the payment to see what is left to assign.'
  if (remaining === 0) return `All ${formatMoney(total / 100)} is assigned.`
  if (remaining > 0)
    return `${formatMoney(assigned / 100)} is assigned and ${formatMoney(remaining / 100)} is still to assign.`
  return `${formatMoney(assigned / 100)} is assigned, ${formatMoney(-remaining / 100)} more than the payment.`
}
