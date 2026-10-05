import {
  useController,
  type Control,
  type FieldValues,
  type Path,
  type UseControllerProps,
} from 'react-hook-form'
import { Field, type FieldProps } from '../components/Field'

export type TextFieldProps<T extends FieldValues, N extends Path<T> = Path<T>> = Omit<
  FieldProps,
  'name' | 'value' | 'defaultValue' | 'onChange' | 'onBlur' | 'error' | 'ref'
> & {
  control: Control<T>
  name: N
  rules?: UseControllerProps<T, N>['rules']
}

/**
 * Text input bound to react-hook-form. Validation messages from `rules` show under the input;
 * the form's server-side errors belong in FormAlert instead.
 */
export function TextField<T extends FieldValues, N extends Path<T> = Path<T>>({
  control,
  name,
  rules,
  ...props
}: TextFieldProps<T, N>) {
  const { field, fieldState } = useController({ control, name, rules })

  return (
    <Field
      {...props}
      name={field.name}
      ref={field.ref}
      // field.ref is react-hook-form's callback ref; the lint rule misreads field.value as a ref read
      // oxlint-disable-next-line react/refs
      value={field.value ?? ''}
      onChange={field.onChange}
      onBlur={field.onBlur}
      error={fieldState.error?.message}
    />
  )
}
