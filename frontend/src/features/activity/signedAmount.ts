/** Effect on the Balance: money in and corrections carry their own sign, money out and transfers out are negative. */
export function signedAmount(entry: { kind: string; amount: string }): number {
  return entry.kind === 'expense' || entry.kind === 'transfer_out' || entry.kind === 'card_payment'
    ? -Number(entry.amount)
    : Number(entry.amount)
}
