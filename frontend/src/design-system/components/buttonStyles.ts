import { cva } from 'class-variance-authority'

/** Button classes, for links that should look like buttons. */
export const buttonStyles = cva(
  'inline-flex items-center justify-center gap-2 rounded-control font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-on-primary hover:bg-primary-hover',
        secondary: 'border border-line bg-surface text-ink hover:bg-sunken',
        ghost: 'text-ink hover:bg-sunken',
        danger: 'bg-negative text-white hover:opacity-90',
      },
      size: {
        sm: 'h-8 px-3 text-caption',
        md: 'h-10 px-4 text-sm',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)
