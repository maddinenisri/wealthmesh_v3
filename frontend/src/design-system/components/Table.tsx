import type { ComponentProps } from 'react'
import { cn } from '../cn'

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return <table className={cn('w-full border-collapse text-sm', className)} {...props} />
}

export function Th({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      className={cn(
        'border-b border-line px-3 py-2 text-left text-caption font-medium text-ink-muted',
        className,
      )}
      {...props}
    />
  )
}

export function Td({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('border-b border-line px-3 py-3', className)} {...props} />
}
