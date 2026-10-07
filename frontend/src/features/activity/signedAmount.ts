import { isDebt } from '../accounts/accountTypes'

/** Effect on the Balance: money in and corrections carry their own sign, money out and transfers out are negative. */
export function signedAmount(entry: { kind: string; amount: string }): number {
  return entry.kind === 'expense' ||
    entry.kind === 'transfer_out' ||
    entry.kind === 'card_payment' ||
    entry.kind === 'loan_payment'
    ? -Number(entry.amount)
    : Number(entry.amount)
}

/**
 * What an amount reads as in a list. A card shows debt added as a positive figure (a purchase) and debt taken away as
 * a negative one (a refund or a payment), the way a card statement does, and a loan or mortgage reads the same way (a
 * payment is negative); every other account shows the effect on the Balance.
 */
export function shownAmount(entry: { kind: string; amount: string }, accountType?: string): number {
  const effect = signedAmount(entry)
  return accountType === 'credit_card' || isDebt(accountType ?? '') ? -effect : effect
}
