import { formatMoney } from '../../lib/money'

/** The server stores a card Balance with the asset sign: owed is negative, Card credit positive. */
export const isCard = (type: string): boolean => type === 'credit_card'

/** "owed" for a Balance at or below zero (zero reads "$0.00 owed"), "Card credit" above it. */
export const cardSide = (amount: number | string): 'owed' | 'Card credit' =>
  Number(amount) > 0 ? 'Card credit' : 'owed'

/** The same reading as plain text, for a sentence: "$1,000.00 owed", "$50.00 Card credit", "-$30.00". */
export function balanceText(type: string, amount: string): string {
  const value = Number(amount)
  return isCard(type) ? `${formatMoney(Math.abs(value))} ${cardSide(value)}` : formatMoney(value)
}
