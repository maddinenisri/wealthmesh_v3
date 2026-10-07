import { parseAmount } from '../../lib/money'

const cents = (text: string): number | null => {
  const amount = parseAmount(text)
  return amount === null ? null : Math.round(Number(amount) * 100)
}

/** What is left of the payment after the principal and the interest, in cents; null while a figure is not typed. */
export function unassigned(amount: string, principal: string, interest: string): number | null {
  const total = cents(amount)
  const part = cents(principal)
  const rest = interest.trim() === '' ? 0 : cents(interest)
  return total === null || part === null || rest === null ? null : total - part - rest
}
