import { formatMoney } from '../../lib/money'

/**
 * What a row of a loan's list or history says about the debt: a payment is "paid", a correction is "more owed" or
 * "less owed". A bare minus sign would mean "debt went down" in one list and "debt went up" in another.
 */
export function loanChangeText(entry: { kind: string; amount: string }): string {
  const money = formatMoney(Math.abs(Number(entry.amount)))
  if (entry.kind === 'loan_payment_in') return `${money} paid`
  if (entry.kind === 'correction')
    return `${money} ${Number(entry.amount) > 0 ? 'less' : 'more'} owed`
  return money
}
