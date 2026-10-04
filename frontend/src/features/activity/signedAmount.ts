/** Effect on the Balance: money in and corrections carry their own sign, money out is negative. */
export function signedAmount(entry: { kind: string; amount: string }): number {
  return entry.kind === 'expense' ? -Number(entry.amount) : Number(entry.amount)
}
