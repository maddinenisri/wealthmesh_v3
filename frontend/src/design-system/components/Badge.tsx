import type { ComponentProps } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../cn'

const badge = cva('inline-flex items-center rounded-full px-2.5 py-0.5 text-caption font-medium', {
  variants: {
    tone: {
      neutral: 'bg-sunken text-ink-muted',
      primary: 'bg-primary-soft text-primary',
      positive: 'bg-positive-soft text-positive',
      negative: 'bg-negative-soft text-negative',
      brass: 'bg-brass-soft text-brass',
    },
  },
  defaultVariants: { tone: 'neutral' },
})

export type BadgeProps = ComponentProps<'span'> & VariantProps<typeof badge>

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badge({ tone }), className)} {...props} />
}
