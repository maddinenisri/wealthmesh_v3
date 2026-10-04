import { useForm } from 'react-hook-form'
import type { Household, Member } from '../../api/household'
import { Button, FormAlert, TextField } from '../../design-system'
import { useCreateHousehold, useRenameHousehold } from '../../hooks/useHousehold'
import { useAddMember, useUpdateMember, type MemberValues } from '../../hooks/useMembers'

type HouseholdValues = { name: string }

const nameRules = {
  required: 'Enter a household name.',
  maxLength: { value: 120, message: 'Use 120 characters or fewer.' },
}

export function CreateHouseholdForm() {
  const { control, handleSubmit } = useForm<HouseholdValues>({ defaultValues: { name: '' } })
  const create = useCreateHousehold()

  return (
    <form
      onSubmit={handleSubmit(({ name }) => create.mutateAsync(name).catch(() => undefined))}
      className="flex max-w-md flex-col gap-4"
    >
      <FormAlert message={create.error?.message} />
      <TextField control={control} name="name" label="Household name" rules={nameRules} />
      <div>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Creating household' : 'Create household'}
        </Button>
      </div>
    </form>
  )
}

export function RenameHouseholdForm({
  household,
  onDone,
}: {
  household: Household
  onDone: () => void
}) {
  const { control, handleSubmit } = useForm<HouseholdValues>({
    defaultValues: { name: household.name },
  })
  const rename = useRenameHousehold()

  return (
    <form
      onSubmit={handleSubmit(({ name }) => rename.mutateAsync(name).then(onDone, () => undefined))}
      className="flex max-w-md flex-col gap-4"
    >
      <FormAlert message={rename.error?.message} />
      <TextField control={control} name="name" label="Household name" rules={nameRules} autoFocus />
      <div className="flex gap-2">
        <Button type="submit" disabled={rename.isPending}>
          {rename.isPending ? 'Saving' : 'Save household name'}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

const memberNameRules = {
  required: 'Enter a member name.',
  maxLength: { value: 120, message: 'Use 120 characters or fewer.' },
}
const labelRules = { maxLength: { value: 80, message: 'Use 80 characters or fewer.' } }

type MemberFormProps = { householdId: string; member?: Member; onDone?: () => void }

/** Adds a member, or edits one when `member` is given. */
export function MemberForm({ householdId, member, onDone }: MemberFormProps) {
  const { control, handleSubmit, reset } = useForm<MemberValues>({
    defaultValues: { name: member?.name ?? '', label: member?.label ?? '' },
  })
  const add = useAddMember(householdId)
  const update = useUpdateMember(householdId, member?.id ?? '')
  const save = member ? update : add

  const onSubmit = handleSubmit((values) =>
    save.mutateAsync(values).then(
      () => {
        if (!member) reset()
        onDone?.()
      },
      () => undefined,
    ),
  )

  return (
    <form onSubmit={onSubmit} className="flex max-w-md flex-col gap-4">
      <FormAlert message={save.error?.message} />
      <TextField
        control={control}
        name="name"
        label="Member name"
        rules={memberNameRules}
        autoFocus={!!member}
      />
      <TextField
        control={control}
        name="label"
        label="Label (optional)"
        hint="Tells people with the same name apart, such as Parent or Child."
        rules={labelRules}
      />
      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving' : member ? 'Save member' : 'Add member'}
        </Button>
        {member && (
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}
