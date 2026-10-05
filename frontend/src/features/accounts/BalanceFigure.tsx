import { Amount } from '../../design-system'
import { cardSide, isCard } from './cardBalance'
import { OverdrawnLabel } from './Overdrawn'

/**
 * A Balance as the person reads it. A card shows its size with what it means: "$1,000.00 owed" or "$50.00 Card
 * credit". Any other account shows the signed figure, with the overdraft label under a negative one.
 */
export function BalanceFigure({
  type,
  amount,
  className,
  overdraft = true,
}: {
  type: string
  amount: string
  className?: string
  overdraft?: boolean
}) {
  const value = Number(amount)
  if (!isCard(type)) {
    return (
      <>
        <Amount value={value} className={className} />
        {overdraft && <OverdrawnLabel balance={amount} />}
      </>
    )
  }
  return (
    <span>
      <Amount value={Math.abs(value)} className={className} />{' '}
      <span className="text-sm text-ink-muted">{cardSide(value)}</span>
    </span>
  )
}
