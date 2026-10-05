import {
  useController,
  type Control,
  type FieldValues,
  type Path,
  type UseControllerProps,
} from 'react-hook-form'
import { Select, type SelectProps } from '../components/Select'

export type SelectFieldProps<T extends FieldValues, N extends Path<T> = Path<T>> = Omit<
  SelectProps,
  'name' | 'value' | 'defaultValue' | 'onChange' | 'onBlur' | 'error' | 'ref'
> & {
  control: Control<T>
  name: N
  rules?: UseControllerProps<T, N>['rules']
}

/** Select bound to react-hook-form, the counterpart of TextField. */
export function SelectField<T extends FieldValues, N extends Path<T> = Path<T>>({
  control,
  name,
  rules,
  ...props
}: SelectFieldProps<T, N>) {
  const { field, fieldState } = useController({ control, name, rules })

  return (
    <Select
      {...props}
      name={field.name}
      ref={field.ref}
      // oxlint-disable-next-line react/refs
      value={field.value ?? ''}
      onChange={field.onChange}
      onBlur={field.onBlur}
      error={fieldState.error?.message}
    />
  )
}
