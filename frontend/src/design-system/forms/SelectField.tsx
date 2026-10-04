import {
  useController,
  type Control,
  type FieldValues,
  type Path,
  type UseControllerProps,
} from 'react-hook-form'
import { Select, type SelectProps } from '../components/Select'

export type SelectFieldProps<T extends FieldValues> = Omit<
  SelectProps,
  'name' | 'value' | 'defaultValue' | 'onChange' | 'onBlur' | 'error' | 'ref'
> & {
  control: Control<T>
  name: Path<T>
  rules?: UseControllerProps<T>['rules']
}

/** Select bound to react-hook-form, the counterpart of TextField. */
export function SelectField<T extends FieldValues>({
  control,
  name,
  rules,
  ...props
}: SelectFieldProps<T>) {
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
