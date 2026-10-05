import type { Activity } from '../../api/activity'

/** A transfer row, or one side of a payment to a card: both are halves of a linked pair (foundations 7). */
export const isTransfer = (entry: { kind: string }): boolean =>
  entry.kind === 'transfer_out' || entry.kind === 'transfer_in'

export const isPayment = (entry: { kind: string }): boolean =>
  entry.kind === 'card_payment' || entry.kind === 'card_payment_in'

/** Either kind of pair: the rows that are never edited or removed on their own. */
export const isMovement = (entry: { kind: string }): boolean =>
  isTransfer(entry) || isPayment(entry)

/** True for the side that gives money: the transfer's source, or the bank that paid the card. */
export const givesMoney = (entry: { kind: string }): boolean =>
  entry.kind === 'transfer_out' || entry.kind === 'card_payment'

/** "transfer" or "payment", as the person calls the pair. */
export const movementWord = (entry: { kind: string }): 'transfer' | 'payment' =>
  isPayment(entry) ? 'payment' : 'transfer'

/** "transfer to Emergency Savings" or "payment from Everyday Checking": named by the account on the other side. */
export const movementName = (entry: { kind: string; counterAccountName?: string | null }): string =>
  `${movementWord(entry)} ${givesMoney(entry) ? 'to' : 'from'} ${entry.counterAccountName ?? 'account'}`

/** What a row's buttons name: a pair is named by the account on the other side. */
export function rowName(entry: Activity): string {
  return isMovement(entry)
    ? movementName(entry)
    : (entry.description ?? entry.categoryName ?? 'entry')
}
