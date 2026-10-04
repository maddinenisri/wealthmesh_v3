import { formatMoney } from '../../lib/money'

export const OVERDRAFT_NOTICE = 'This records what happened and does not authorize a bank payment.'

/** "Overdrawn by $30.00" when a bank Balance is below zero; nothing otherwise. */
export function OverdrawnLabel({ balance }: { balance: string }) {
  const amount = Number(balance)
  if (!(amount < 0)) return null
  return (
    <span className="block text-caption text-negative">Overdrawn by {formatMoney(-amount)}</span>
  )
}
