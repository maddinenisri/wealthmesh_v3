import type { ComponentProps } from 'react'
import { cn } from '../cn'

export function Card({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section
      className={cn('rounded-surface border border-line bg-surface p-5', className)}
      {...props}
    />
  )
}

export function CardTitle({ className, ...props }: ComponentProps<'h2'>) {
  return <h2 className={cn('font-display text-xl font-medium', className)} {...props} />
}
