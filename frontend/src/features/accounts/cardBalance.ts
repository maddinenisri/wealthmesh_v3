import { formatMoney } from '../../lib/money'
import { isDebt } from './accountTypes'

/** The server stores a card Balance with the asset sign: owed is negative, Card credit positive. */
export const isCard = (type: string): boolean => type === 'credit_card'

/** "owed" for a Balance at or below zero (zero reads "$0.00 owed"), "Card credit" above it. */
export const cardSide = (amount: number | string): 'owed' | 'Card credit' =>
  Number(amount) > 0 ? 'Card credit' : 'owed'

/** A card or a loan reads as a size and a side, never a minus sign. A loan is always owed (it is never credit). */
export const readsAsOwed = (type: string): boolean => isCard(type) || isDebt(type)

/** What a Balance means: a loan is owed; a card is owed or Card credit by its sign. */
export const balanceSide = (type: string, amount: number | string): 'owed' | 'Card credit' =>
  isDebt(type) ? 'owed' : cardSide(amount)

/** The same reading as plain text, for a sentence: "$1,000.00 owed", "$50.00 Card credit", "-$30.00". */
export function balanceText(type: string, amount: string): string {
  const value = Number(amount)
  return readsAsOwed(type)
    ? `${formatMoney(Math.abs(value))} ${balanceSide(type, value)}`
    : formatMoney(value)
}
