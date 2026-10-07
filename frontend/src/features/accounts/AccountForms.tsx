import { useState } from 'react'
import { useForm, useWatch, type Control } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import type { Account } from '../../api/accounts'
import type { Member } from '../../api/household'
import {
  Button,
  buttonStyles,
  CheckboxGroupField,
  FormAlert,
  SelectField,
  TextField,
} from '../../design-system'
import { useCreateAccount, useUpdateAccount } from '../../hooks/useAccounts'
import { formatMoney, parseAmount } from '../../lib/money'
import { Panel } from '../activity/Panel'
import { ACCOUNT_TYPES, accountTypeLabel, isDebt, valuedNoun } from './accountTypes'
import { isCard } from './cardBalance'
import { memberLabel } from './ownerNames'

type DetailsValues = { name: string; institution: string; ownerMemberIds: string[] }
type SetupValues = DetailsValues & {
  type: string
  openedOn: string
  balance: string
  balanceSide: 'owed' | 'credit'
}

const nameRules = {
  validate: (value: string) => value.trim() !== '' || 'Enter an account name',
  maxLength: { value: 120, message: 'Use 120 characters or fewer.' },
}
const bankRules = { maxLength: { value: 120, message: 'Use 120 characters or fewer.' } }
const ownerRules = {
  validate: (value: string[]) => value.length > 0 || 'Choose an owner',
}

/**
 * Owner choices: active members, plus any member who already owns the account (so an inactive owner stays
 * visible and checked). One or more owners makes the account joint.
 */
function OwnerChoices<T extends DetailsValues>({
  members,
  control,
  current = [],
  valued = false,
  debt = false,
}: {
  members: Member[]
  control: Control<T>
  current?: string[]
  /** A property or other asset: owners are named, and there is no "joint account" wording. */
  valued?: boolean
  /** A loan: the people who owe it, and no "joint account" wording. */
  debt?: boolean
}) {
  const options = members
    .filter((member) => member.active || current.includes(member.id))
    .map((member) => ({ value: member.id, label: memberLabel(member) }))
  return (
    <CheckboxGroupField
      control={control as unknown as Control<DetailsValues>}
      name="ownerMemberIds"
      label="Owners"
      hint={
        debt
          ? 'Choose everyone who owes this debt.'
          : valued
            ? 'Choose everyone who owns this property or asset.'
            : 'Choose everyone who owns this account. Two or more makes it a joint account.'
      }
      options={options}
      rules={ownerRules}
    />
  )
}

/** Sets up a checking or savings account. Balance is optional; blank starts at $0.00 on the opening date. */
export function AccountSetupForm({ members, today }: { members: Member[]; today: string }) {
  const navigate = useNavigate()
  const create = useCreateAccount()
  const { control, handleSubmit, setFocus } = useForm<SetupValues>({
    defaultValues: {
      type: 'checking',
      name: '',
      institution: '',
      ownerMemberIds: [],
      openedOn: today,
      balance: '',
      balanceSide: 'owed',
    },
  })
  const typeValue = useWatch({ control, name: 'type' })
  const card = isCard(typeValue)
  const noun = valuedNoun(typeValue)
  const debt = isDebt(typeValue)
  // A property, other asset or loan is reviewed before it is saved (PROPERTY_002, LOAN_001): the review says what it
  // will start at.
  const [review, setReview] = useState<SetupValues | null>(null)
  const owners = (ids: string[]) =>
    members
      .filter((member) => ids.includes(member.id))
      .map(memberLabel)
      .join(', ')

  const save = (values: SetupValues) =>
    create
      .mutateAsync({
        type: values.type,
        name: values.name.trim(),
        institution: valuedNoun(values.type) ? '' : values.institution.trim(),
        ownerMemberIds: values.ownerMemberIds,
        openedOn: values.openedOn,
        openingBalance: values.balance.trim() === '' ? null : parseAmount(values.balance),
        balanceSide:
          isCard(values.type) && values.balance.trim() !== '' ? values.balanceSide : null,
      })
      .then(
        () => navigate('/accounts'),
        () => undefined,
      )
  const onSubmit = handleSubmit((values) => {
    if (valuedNoun(values.type) || isDebt(values.type)) {
      create.reset()
      setReview(values)
      return undefined
    }
    return save(values)
  })

  if (review) {
    const amount = review.balance.trim() === '' ? 0 : Number(parseAmount(review.balance))
    const owing = isDebt(review.type)
    return (
      <Panel>
        <section aria-labelledby="setup-review-heading" className="flex max-w-md flex-col gap-3">
          <h2 id="setup-review-heading" className="text-lg font-semibold">
            Review new {accountTypeLabel(review.type).toLowerCase()}
          </h2>
          <FormAlert message={create.error?.message} />
          <p>
            {review.name.trim()} will start at{' '}
            <span className="whitespace-nowrap">
              {formatMoney(amount)}
              {owing ? ' owed' : ''}
            </span>{' '}
            on <span className="whitespace-nowrap">{review.openedOn}</span>.
          </p>
          {review.balance.trim() === '' && (
            <p className="text-sm text-ink-muted">
              {owing
                ? 'The amount owed was left blank, so it starts at $0.00 owed. Saving completes the setup.'
                : 'The value was left blank, so it starts at $0.00. Saving completes the setup.'}
            </p>
          )}
          <p className="text-sm text-ink-muted">
            {owing && review.institution.trim() !== '' && `Lender: ${review.institution.trim()}. `}
            Owners: {owners(review.ownerMemberIds)}.
          </p>
          <div className="flex gap-2">
            <Button type="button" disabled={create.isPending} onClick={() => void save(review)}>
              {create.isPending ? 'Saving' : 'Confirm'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setReview(null)
                // The form is back on the page; its first field takes focus, not the body.
                requestAnimationFrame(() => setFocus('name'))
              }}
            >
              Back
            </Button>
            <Link to="/accounts" className={buttonStyles({ variant: 'ghost' })}>
              Cancel
            </Link>
          </div>
        </section>
      </Panel>
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-md flex-col gap-4">
      <FormAlert message={create.error?.message} />
      <SelectField control={control} name="type" label="Account type">
        {ACCOUNT_TYPES.map((type) => (
          <option key={type.value} value={type.value} disabled={!type.ready}>
            {type.ready ? type.label : `${type.label} (coming soon)`}
          </option>
        ))}
      </SelectField>
      <TextField control={control} name="name" label="Account name" rules={nameRules} />
      {!noun && (
        <TextField
          control={control}
          name="institution"
          label={card ? 'Issuer' : debt ? 'Lender' : 'Bank'}
          rules={bankRules}
        />
      )}
      <OwnerChoices members={members} control={control} valued={!!noun} debt={debt} />
      <TextField
        control={control}
        name="openedOn"
        label={noun ? 'Value date' : debt ? 'As of' : 'Opened on'}
        type="date"
        rules={{
          required: 'Enter an opening date',
          validate: (value) => value <= today || 'The opening date cannot be in the future',
        }}
      />
      <TextField
        control={control}
        name="balance"
        label={noun ? 'Value' : debt ? 'Amount owed' : 'Balance'}
        inputMode="decimal"
        placeholder="0.00"
        hint={
          noun
            ? 'Optional. Leave blank to start at $0.00 on the value date.'
            : debt
              ? 'Optional. Leave blank to start at $0.00 owed on the date.'
              : 'Optional. Leave blank to start at $0.00 on the opening date.'
        }
        rules={{
          validate: (value) => {
            if (value.trim() === '') return true
            const amount = parseAmount(value)
            if (amount === null) return 'Enter a valid amount'
            if (noun && amount.startsWith('-')) return `Enter zero or a positive ${noun} value`
            if (debt && amount.startsWith('-')) return 'Enter zero or a positive amount owed'
            return !(card && amount.startsWith('-')) || 'Enter a valid amount'
          },
        }}
      />
      {card && (
        <SelectField
          control={control}
          name="balanceSide"
          label="Balance means"
          hint="Enter the amount as a positive figure. Owed is a debt; Card credit is money the card owes you."
        >
          <option value="owed">Owed</option>
          <option value="credit">Card credit</option>
        </SelectField>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Saving' : noun || debt ? 'Review' : 'Save account'}
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
      ownerMemberIds: account.ownerMemberIds,
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
      {!valuedNoun(account.type) && (
        <TextField
          control={control}
          name="institution"
          label={isCard(account.type) ? 'Issuer' : isDebt(account.type) ? 'Lender' : 'Bank'}
          rules={bankRules}
        />
      )}
      <OwnerChoices
        members={members}
        control={control}
        current={account.ownerMemberIds}
        valued={!!valuedNoun(account.type)}
        debt={isDebt(account.type)}
      />
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
