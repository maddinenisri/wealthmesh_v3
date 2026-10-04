import { useId, type ComponentProps } from 'react'
import { cn } from '../cn'

export type FieldProps = Omit<ComponentProps<'input'>, 'id'> & {
  label: string
  hint?: string
  error?: string
}

/** Labelled text input. Errors replace the hint and are announced to screen readers. */
export function Field({ label, hint, error, className, ...props }: FieldProps) {
  const id = useId()
  const messageId = `${id}-message`
  const message = error ?? hint

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? messageId : undefined}
        className={cn(
          'h-10 rounded-control border bg-surface px-3 text-sm placeholder:text-ink-muted',
          error ? 'border-negative' : 'border-line',
          className,
        )}
        {...props}
      />
      {message && (
        <p
          id={messageId}
          role={error ? 'alert' : undefined}
          className={cn('text-caption', error ? 'text-negative' : 'text-ink-muted')}
        >
          {message}
        </p>
      )}
    </div>
  )
}
