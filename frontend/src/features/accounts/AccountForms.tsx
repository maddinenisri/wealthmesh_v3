import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import type { Account } from '../../api/accounts'
import type { Member } from '../../api/household'
import { Button, buttonStyles, FormAlert, SelectField, TextField } from '../../design-system'
import { useCreateAccount, useUpdateAccount } from '../../hooks/useAccounts'
import { parseAmount } from '../../lib/money'
import { memberLabel } from './ownerNames'

type DetailsValues = { name: string; institution: string; ownerMemberId: string }
type SetupValues = DetailsValues & { type: string; openedOn: string; balance: string }

const nameRules = {
  validate: (value: string) => value.trim() !== '' || 'Enter an account name',
  maxLength: { value: 120, message: 'Use 120 characters or fewer.' },
}
const bankRules = { maxLength: { value: 120, message: 'Use 120 characters or fewer.' } }
const ownerRules = { required: 'Choose an owner' }

function OwnerOptions({ members }: { members: Member[] }) {
  return (
    <>
      <option value="">Choose an owner</option>
      {members.map((member) => (
        <option key={member.id} value={member.id}>
          {memberLabel(member)}
        </option>
      ))}
    </>
  )
}

/** Account types in their final order. Only checking can be chosen until its feature is built. */
const TYPES = [
  { value: 'checking', label: 'Checking', ready: true },
  { value: 'savings', label: 'Savings', ready: false },
  { value: 'credit_card', label: 'Credit card', ready: false },
  { value: 'brokerage', label: 'Brokerage', ready: false },
  { value: 'loan', label: 'Loan', ready: false },
  { value: 'mortgage', label: 'Mortgage', ready: false },
] as const

/** Sets up a checking account. Balance is optional; blank starts at $0.00 on the opening date. */
export function AccountSetupForm({ members, today }: { members: Member[]; today: string }) {
  const navigate = useNavigate()
  const create = useCreateAccount()
  const { control, handleSubmit } = useForm<SetupValues>({
    defaultValues: {
      type: 'checking',
      name: '',
      institution: '',
      ownerMemberId: '',
      openedOn: today,
      balance: '',
    },
  })

  const onSubmit = handleSubmit((values) =>
    create
      .mutateAsync({
        type: values.type as 'checking',
        name: values.name.trim(),
        institution: values.institution.trim(),
        ownerMemberId: values.ownerMemberId,
        openedOn: values.openedOn,
        openingBalance: values.balance.trim() === '' ? null : parseAmount(values.balance),
      })
      .then(
        () => navigate('/accounts'),
        () => undefined,
      ),
  )

  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-md flex-col gap-4">
      <FormAlert message={create.error?.message} />
      <SelectField control={control} name="type" label="Account type">
        {TYPES.map((type) => (
          <option key={type.value} value={type.value} disabled={!type.ready}>
            {type.ready ? type.label : `${type.label} (coming soon)`}
          </option>
        ))}
      </SelectField>
      <TextField control={control} name="name" label="Account name" rules={nameRules} />
      <TextField control={control} name="institution" label="Bank" rules={bankRules} />
      <SelectField control={control} name="ownerMemberId" label="Owner" rules={ownerRules}>
        <OwnerOptions members={members} />
      </SelectField>
      <TextField
        control={control}
        name="openedOn"
        label="Opened on"
        type="date"
        rules={{
          required: 'Enter an opening date',
          validate: (value) => value <= today || 'The opening date cannot be in the future',
        }}
      />
      <TextField
        control={control}
        name="balance"
        label="Balance"
        inputMode="decimal"
        placeholder="0.00"
        hint="Optional. Leave blank to start at $0.00 on the opening date."
        rules={{
          validate: (value) =>
            value.trim() === '' || parseAmount(value) !== null || 'Enter a valid amount',
        }}
      />
      <div className="flex gap-2">
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Saving' : 'Save account'}
        </Button>
        <Link to="/accounts" className={buttonStyles({ variant: 'ghost' })}>
          Cancel
        </Link>
      </div>
    </form>
  )
}

/** Edits name, bank and owner only. Money has its own Update balance action. */
export function AccountEditForm({ account, members }: { account: Account; members: Member[] }) {
  const navigate = useNavigate()
  const update = useUpdateAccount(account.id)
  const { control, handleSubmit } = useForm<DetailsValues>({
    defaultValues: {
      name: account.name,
      institution: account.institution ?? '',
      ownerMemberId: account.ownerMemberIds[0] ?? '',
    },
  })

  const onSubmit = handleSubmit((values) =>
    update
      .mutateAsync({ ...values, name: values.name.trim(), institution: values.institution.trim() })
      .then(
        () => navigate(`/accounts/${account.id}`),
        () => undefined,
      ),
  )

  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-md flex-col gap-4">
      <FormAlert message={update.error?.message} />
      <TextField control={control} name="name" label="Account name" rules={nameRules} />
      <TextField control={control} name="institution" label="Bank" rules={bankRules} />
      <SelectField control={control} name="ownerMemberId" label="Owner" rules={ownerRules}>
        <OwnerOptions members={members} />
      </SelectField>
      <div className="flex gap-2">
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? 'Saving' : 'Save details'}
        </Button>
        <Link to={`/accounts/${account.id}`} className={buttonStyles({ variant: 'ghost' })}>
          Cancel
        </Link>
      </div>
    </form>
  )
}
