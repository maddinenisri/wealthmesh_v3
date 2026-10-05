import { useEffect, useRef, useState } from 'react'
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

/**
 * Adds a member, or edits one when `member` is given. A rename is reviewed before it is saved: the review
 * shows the earlier and the new name and says that no money or ownership changes.
 */
export function MemberForm({ householdId, member, onDone }: MemberFormProps) {
  const { control, handleSubmit, reset } = useForm<MemberValues>({
    defaultValues: { name: member?.name ?? '', label: member?.label ?? '' },
  })
  const [reviewing, setReviewing] = useState<MemberValues>()
  const add = useAddMember(householdId)
  const update = useUpdateMember(householdId, member?.id ?? '')
  const save = member ? update : add

  const saveValues = (values: MemberValues) =>
    save.mutateAsync(values).then(
      () => {
        if (!member) reset()
        onDone?.()
      },
      () => undefined,
    )

  const onSubmit = handleSubmit((values) => {
    if (!member) return saveValues(values)
    const next = { name: values.name.trim(), label: values.label.trim() }
    if (next.name === member.name && next.label === (member.label ?? '')) return onDone?.()
    setReviewing(next)
  })

  if (member && reviewing) {
    return (
      <RenameReview
        member={member}
        next={reviewing}
        error={save.error?.message}
        pending={save.isPending}
        onConfirm={() => void saveValues(reviewing)}
        onBack={() => setReviewing(undefined)}
        onCancel={() => {
          setReviewing(undefined)
          onDone?.()
        }}
      />
    )
  }

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
          {save.isPending ? 'Saving' : member ? 'Review rename' : 'Add member'}
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

const shown = (name: string, label: string | null) => (label ? `${name} (${label})` : name)

function RenameReview({
  member,
  next,
  error,
  pending,
  onConfirm,
  onBack,
  onCancel,
}: {
  member: Member
  next: MemberValues
  error: string | undefined
  pending: boolean
  onConfirm: () => void
  onBack: () => void
  onCancel: () => void
}) {
  const panel = useRef<HTMLElement>(null)
  // The form that opened this review is gone, so focus would fall to the page: put it on the panel.
  useEffect(() => {
    panel.current?.focus()
  }, [])

  return (
    <section
      ref={panel}
      tabIndex={-1}
      aria-label="Review rename"
      className="flex max-w-md flex-col gap-3 rounded-control border border-line bg-sunken p-4"
    >
      <h4 className="font-medium">Review rename</h4>
      <p className="break-words text-sm">
        {shown(member.name, member.label)} becomes{' '}
        <strong>{shown(next.name, next.label || null)}</strong>. The earlier name stays in this
        member&apos;s history.
      </p>
      <p className="text-sm text-ink-muted">
        Accounts, balances and entries stay the same. No income, spending or ownership change is
        made.
      </p>
      <FormAlert message={error} />
      <div className="flex gap-2">
        <Button disabled={pending} onClick={onConfirm}>
          {pending ? 'Saving' : 'Confirm rename'}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onBack}>
          Change name
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </section>
  )
}
