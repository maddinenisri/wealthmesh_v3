import { useState } from 'react'
import { useForm } from 'react-hook-form'
import type { Account } from '../../api/accounts'
import type { Member } from '../../api/household'
import {
  Amount,
  Button,
  Card,
  CardTitle,
  FormAlert,
  Select,
  SelectField,
  TextField,
} from '../../design-system'
import type { EntryKind } from '../../api/activity'
import { useCategories, useRecordEntry } from '../../hooks/useActivity'
import { useEnteringAs } from '../../hooks/useEnteringAs'
import { formatMoney, parseAmount } from '../../lib/money'
import { OVERDRAFT_NOTICE } from '../accounts/Overdrawn'
import { memberLabel } from '../accounts/ownerNames'

type Values = { description: string; amount: string; occurredOn: string; categoryId: string }

/** One id per form instance: a repeat of the same save carries the same id (D-024). */
function newKey(): string {
  return globalThis.crypto.randomUUID()
}

const amountRules = {
  validate: (value: string) => {
    const amount = parseAmount(value)
    if (amount === null) return 'Enter a valid amount'
    return Number(amount) > 0 || 'Enter an amount greater than zero'
  },
}

/** Wording that differs between money out (expense) and money in (income). */
const WORDS = {
  expense: { add: 'Add money out', review: 'Review money out', place: 'Paid from' },
  income: { add: 'Add money in', review: 'Review money in', place: 'Received into' },
} as const

/**
 * Money in or out: fill in, review, then confirm. Nothing is saved until Confirm. The amount message
 * appears under the Amount field and every entered value stays where it was.
 */
export function AddEntry({
  kind,
  account,
  members,
  today,
  onDone,
}: {
  kind: EntryKind
  account: Account
  members: Member[]
  today: string
  onDone: () => void
}) {
  const words = WORDS[kind]
  const categories = useCategories(kind)
  const record = useRecordEntry(account.id, kind)
  const { member, setMemberId } = useEnteringAs(members)
  const [reviewing, setReviewing] = useState<Values | null>(null)
  const [changingMember, setChangingMember] = useState(false)
  const [key] = useState(newKey)
  const { control, handleSubmit } = useForm<Values>({
    defaultValues: { description: '', amount: '', occurredOn: today, categoryId: '' },
  })

  const categoryName = (id: string) => categories.data?.find((c) => c.id === id)?.name ?? ''

  const confirm = () => {
    if (!reviewing || !member) return
    record.mutate(
      {
        key,
        entry: {
          description: reviewing.description.trim(),
          amount: parseAmount(reviewing.amount)!,
          occurredOn: reviewing.occurredOn,
          categoryId: reviewing.categoryId,
          enteredByMemberId: member.id,
        },
      },
      { onSuccess: onDone },
    )
  }

  if (reviewing) {
    const choosing = changingMember || !member
    // Advisory only: money that really left the account is still recorded (the bill was paid).
    const shortBy =
      kind === 'expense'
        ? Number(parseAmount(reviewing.amount)) - Number(account.balance.amount)
        : 0
    return (
      <Card aria-labelledby="review-heading">
        <CardTitle id="review-heading" className="text-lg">
          {words.review}
        </CardTitle>
        <FormAlert message={record.error?.message} />
        {shortBy > 0 && (
          <p role="alert" className="mt-3 max-w-md rounded-control border border-line p-3 text-sm">
            This will leave {account.name} overdrawn by {formatMoney(shortBy)}. {OVERDRAFT_NOTICE}
          </p>
        )}
        <dl className="mt-3 grid max-w-md gap-x-8 gap-y-3 sm:grid-cols-2">
          <Item label={words.place}>{account.name}</Item>
          <Item label="Date">{reviewing.occurredOn}</Item>
          <Item label="Amount">
            <Amount value={Number(parseAmount(reviewing.amount))} />
          </Item>
          <Item label="Category">{categoryName(reviewing.categoryId)}</Item>
          {reviewing.description.trim() && <Item label="Description">{reviewing.description}</Item>}
        </dl>
        <div className="mt-3 max-w-md text-sm">
          {choosing ? (
            <Select
              label="Entered by"
              value={member?.id ?? ''}
              onChange={(event) => {
                setMemberId(event.target.value)
                setChangingMember(false)
              }}
            >
              <option value="">Choose who is entering this</option>
              {members.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {memberLabel(candidate)}
                </option>
              ))}
            </Select>
          ) : (
            <p>
              Entered by: <strong>{member ? memberLabel(member) : ''}</strong>{' '}
              <Button variant="ghost" size="sm" onClick={() => setChangingMember(true)}>
                Change
              </Button>
            </p>
          )}
        </div>
        <div className="mt-4 flex gap-2">
          <Button onClick={confirm} disabled={record.isPending || !member}>
            {record.isPending ? 'Saving' : 'Confirm saving'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => setReviewing(null)}
            disabled={record.isPending}
          >
            Back
          </Button>
          <Button variant="ghost" onClick={onDone} disabled={record.isPending}>
            Cancel
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <Card aria-labelledby="entry-heading">
      <CardTitle id="entry-heading" className="text-lg">
        {words.add}
      </CardTitle>
      <form
        noValidate
        className="mt-3 flex max-w-md flex-col gap-4"
        onSubmit={handleSubmit((values) => setReviewing(values))}
      >
        <p className="text-sm text-ink-muted">
          {words.place} <strong>{account.name}</strong>
        </p>
        <TextField control={control} name="description" label="Description" />
        <TextField
          control={control}
          name="amount"
          label="Amount"
          inputMode="decimal"
          placeholder="0.00"
          rules={amountRules}
        />
        <TextField
          control={control}
          name="occurredOn"
          label="Date"
          type="date"
          rules={{
            required: 'Enter a date',
            validate: (value) =>
              value <= today
                ? value >= account.openedOn || "This date is before the account's opening date"
                : 'Future activity cannot be saved as completed yet',
          }}
        />
        <SelectField
          control={control}
          name="categoryId"
          label="Category"
          rules={{ required: 'Choose a category' }}
        >
          <option value="">Choose a category</option>
          {categories.data?.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </SelectField>
        <div className="flex gap-2">
          <Button type="submit">Review</Button>
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  )
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-caption text-ink-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}
