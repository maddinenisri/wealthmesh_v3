import { useId } from 'react'
import {
  useController,
  type Control,
  type FieldValues,
  type Path,
  type UseControllerProps,
} from 'react-hook-form'
import { cn } from '../cn'

export type CheckboxOption = { value: string; label: string }

export type CheckboxGroupFieldProps<T extends FieldValues, N extends Path<T> = Path<T>> = {
  control: Control<T>
  name: N
  label: string
  options: CheckboxOption[]
  hint?: string
  /** Choose exactly one: radio buttons, the value stays a one-item array. */
  single?: boolean
  rules?: UseControllerProps<T, N>['rules']
}

/** A group of checkboxes bound to a string-array form value. Errors replace the hint; focus goes to the first box. */
export function CheckboxGroupField<T extends FieldValues, N extends Path<T> = Path<T>>({
  control,
  name,
  label,
  options,
  hint,
  single = false,
  rules,
}: CheckboxGroupFieldProps<T, N>) {
  const { field, fieldState } = useController({ control, name, rules })
  const messageId = `${useId()}-message`
  const selected: string[] = field.value ?? []
  const error = fieldState.error?.message
  const message = error ?? hint

  return (
    <fieldset
      aria-describedby={message ? messageId : undefined}
      aria-invalid={error ? true : undefined}
      className="flex flex-col gap-1.5"
    >
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      <div
        className={cn(
          'flex flex-col gap-2 rounded-control border p-3',
          error ? 'border-negative' : 'border-line',
        )}
      >
        {options.map((option, index) => (
          <label key={option.value} className="flex items-center gap-2 text-sm">
            <input
              type={single ? 'radio' : 'checkbox'}
              name={field.name}
              value={option.value}
              // oxlint-disable-next-line react/refs
              ref={index === 0 ? field.ref : undefined}
              checked={selected.includes(option.value)}
              onBlur={field.onBlur}
              onChange={(event) =>
                field.onChange(
                  single
                    ? [option.value]
                    : event.target.checked
                      ? [...selected, option.value]
                      : selected.filter((value) => value !== option.value),
                )
              }
            />
            {option.label}
          </label>
        ))}
      </div>
      {message && (
        <p
          id={messageId}
          role={error ? 'alert' : undefined}
          className={cn('text-caption', error ? 'text-negative' : 'text-ink-muted')}
        >
          {message}
        </p>
      )}
    </fieldset>
  )
}
