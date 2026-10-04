import type { ComponentProps } from 'react'
import { cn } from '../cn'

export type AmountProps = Omit<ComponentProps<'span'>, 'children'> & {
  value: number
  currency?: string
  /** Colors the figure by sign. Leave off for balances that are not gains or losses. */
  signed?: boolean
  size?: 'md' | 'lg'
}

/** Money figure: serif, tabular, with the cents set smaller. */
export function Amount({
  value,
  currency = 'USD',
  signed,
  size = 'md',
  className,
  ...props
}: AmountProps) {
  const parts = new Intl.NumberFormat('en-US', { style: 'currency', currency }).formatToParts(value)
  const cents = parts.filter((p) => p.type === 'decimal' || p.type === 'fraction')
  const main = parts.filter((p) => p.type !== 'decimal' && p.type !== 'fraction')
  const text = (list: typeof parts) => list.map((p) => p.value).join('')

  return (
    <span
      className={cn(
        'font-display tabular-nums',
        size === 'lg' ? 'text-4xl' : 'text-lg',
        signed && (value < 0 ? 'text-negative' : value > 0 ? 'text-positive' : undefined),
        className,
      )}
      {...props}
    >
      {text(main)}
      <span className="text-[0.6em] align-baseline opacity-70">{text(cents)}</span>
    </span>
  )
}
