import type { ComponentProps } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../cn'

const container = cva('mx-auto w-full px-4 sm:px-6', {
  variants: {
    size: {
      sm: 'max-w-2xl',
      md: 'max-w-4xl',
      lg: 'max-w-6xl',
    },
  },
  defaultVariants: { size: 'md' },
})

export type ContainerProps = ComponentProps<'div'> &
  VariantProps<typeof container> & {
    /** Element to render, so a container can be the page's header or main without an extra wrapper. */
    as?: 'div' | 'main' | 'header' | 'section'
  }

/** Centers content to a readable width with responsive side gutters. */
export function Container({ as: Tag = 'div', size, className, ...props }: ContainerProps) {
  return <Tag className={cn(container({ size }), className)} {...props} />
}
