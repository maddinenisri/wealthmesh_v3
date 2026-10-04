import type { ComponentProps } from 'react'
import { type VariantProps } from 'class-variance-authority'
import { cn } from '../cn'
import { buttonStyles } from './buttonStyles'

export type ButtonProps = ComponentProps<'button'> & VariantProps<typeof buttonStyles>

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonStyles({ variant, size }), className)} {...props} />
  )
}
