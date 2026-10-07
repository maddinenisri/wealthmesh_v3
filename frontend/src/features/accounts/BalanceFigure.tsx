import { Amount } from '../../design-system'
import { balanceSide, readsAsOwed } from './cardBalance'
import { OverdrawnLabel } from './Overdrawn'

/**
 * A Balance as the person reads it. A card or loan shows its size with what it means: "$1,000.00 owed" or "$50.00
 * Card credit". Any other account shows the signed figure, with the overdraft label under a negative one.
 */
export function BalanceFigure({
  type,
  amount,
  className,
  overdraft = true,
  bare = false,
}: {
  type: string
  amount: string
  className?: string
  overdraft?: boolean
  /** Leave out "owed": the label beside the figure already says it ("Balance owed"). */
  bare?: boolean
}) {
  const value = Number(amount)
  if (!readsAsOwed(type)) {
    return (
      <>
        <Amount value={value} className={className} />
        {overdraft && <OverdrawnLabel balance={amount} />}
      </>
    )
  }
  return (
    <span className="whitespace-nowrap">
      <Amount value={Math.abs(value)} className={className} />{' '}
      {!bare && <span className="text-sm text-ink-muted">{balanceSide(type, value)}</span>}
    </span>
  )
}
