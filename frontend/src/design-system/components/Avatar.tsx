import type { ComponentProps } from 'react'
import { cn } from '../cn'

export type AvatarProps = ComponentProps<'span'> & { name: string }

/** Initials for a household member; the full name is the accessible label. */
export function Avatar({ name, className, ...props }: AvatarProps) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')

  return (
    <span
      role="img"
      aria-label={name}
      className={cn(
        'inline-flex size-9 items-center justify-center rounded-full bg-primary-soft text-sm font-medium text-primary',
        className,
      )}
      {...props}
    >
      {initials}
    </span>
  )
}
