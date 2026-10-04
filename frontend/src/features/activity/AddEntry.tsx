import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import type { Account } from '../../api/accounts'
import type { Member } from '../../api/household'
import {
  Amount,
  Button,
  Card,
  CardTitle,
  FormAlert,
  SelectField,
  TextField,
} from '../../design-system'
import type { Activity, EntryKind } from '../../api/activity'
import {
  useAccountActivity,
  useCategories,
  useRecordEntry,
  useReplaceEntry,
  useSaveReminder,
  useSpending,
} from '../../hooks/useActivity'
import { useEnteringAs } from '../../hooks/useEnteringAs'
import { formatMoney, parseAmount } from '../../lib/money'
import { OVERDRAFT_NOTICE } from '../accounts/Overdrawn'
import { EnteredBy } from './EnteredBy'

type Values = {
  description: string
  amount: string
  occurredOn: string
  categoryId: string
  reason: string
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

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
  editing,
  onDone,
}: {
  kind: EntryKind
  account: Account
  members: Member[]
  today: string
  /** An effective entry being corrected: the form starts from it and saving replaces it. */
  editing?: Activity
  onDone: () => void
}) {
  const words = WORDS[kind]
  const categories = useCategories(kind)
  const record = useRecordEntry(account.id, kind)
  const activity = useAccountActivity(account.id)
  const remind = useSaveReminder(account.id)
  const { member, setMemberId } = useEnteringAs(members)
  const [reviewing, setReviewing] = useState<Values | null>(null)
  const [key] = useState(newKey)
  const { control, handleSubmit } = useForm<Values>({
    defaultValues: {
      description: editing?.description ?? '',
      amount: editing?.amount ?? '',
      occurredOn: editing?.occurredOn ?? today,
      categoryId: editing?.categoryId ?? '',
      reason: '',
    },
  })

  // A date after today is a plan, saved as a reminder: it never changes the Balance or a month's totals.
  const isReminder = (date: string) => !editing && date > today
  const futureDate = useWatch({ control, name: 'occurredOn' })
  // An expense that explains a Balance correction (same day, same amount) can replace it, so the money is
  // counted once as spending and the Balance does not move (V2_CHECKING_014).
  const reviewAmount = reviewing ? parseAmount(reviewing.amount) : null
  const match =
    kind === 'expense' && !editing && reviewing && reviewAmount && !isReminder(reviewing.occurredOn)
      ? activity.data?.find(
          (row) =>
            row.kind === 'correction' &&
            row.occurredOn === reviewing.occurredOn &&
            Number(row.amount) === -Number(reviewAmount),
        )
      : undefined
  const [separate, setSeparate] = useState(false)
  const replacing = editing ?? (separate ? undefined : match)
  const replace = useReplaceEntry(account.id, replacing?.id ?? '')
  const monthSpending = useSpending(
    match && !separate && reviewing ? reviewing.occurredOn.slice(0, 7) : '',
  )
  const save = replacing ? replace : reviewing && isReminder(reviewing.occurredOn) ? remind : record

  const categoryName = (id: string) => categories.data?.find((c) => c.id === id)?.name ?? ''

  const confirm = () => {
    if (!reviewing || !member) return
    const entry = {
      description: reviewing.description.trim(),
      amount: parseAmount(reviewing.amount)!,
      occurredOn: reviewing.occurredOn,
      categoryId: reviewing.categoryId,
      enteredByMemberId: member.id,
    }
    if (isReminder(reviewing.occurredOn)) {
      const { occurredOn: dueOn, ...rest } = entry
      remind.mutate({ key, reminder: { ...rest, kind, dueOn } }, { onSuccess: onDone })
    } else if (replacing) {
      const reason = editing ? reviewing.reason.trim() : 'Replaced by the actual expense'
      replace.mutate({ key, entry: { ...entry, reason } }, { onSuccess: onDone })
    } else {
      record.mutate({ key, entry }, { onSuccess: onDone })
    }
  }

  if (reviewing) {
    const reminder = isReminder(reviewing.occurredOn)
    // Advisory only: money that really left the account is still recorded (the bill was paid).
    const shortBy =
      kind === 'expense' && !reminder && !(match && !separate)
        ? Number(parseAmount(reviewing.amount)) - Number(account.balance.amount)
        : 0
    return (
      <Card aria-labelledby="review-heading">
        <CardTitle id="review-heading" className="text-lg">
          {editing ? 'Review change' : reminder ? 'Review reminder' : words.review}
        </CardTitle>
        <FormAlert message={save.error?.message} />
        {shortBy > 0 && (
          <p role="alert" className="mt-3 max-w-md rounded-control border border-line p-3 text-sm">
            This will leave {account.name} overdrawn by {formatMoney(shortBy)}. {OVERDRAFT_NOTICE}
          </p>
        )}
        <dl className="mt-3 grid max-w-md gap-x-8 gap-y-3 sm:grid-cols-2">
          <Item label={words.place}>{account.name}</Item>
          <Item label="Date">{changed(editing?.occurredOn, reviewing.occurredOn)}</Item>
          <Item label="Amount">
            {editing && Number(editing.amount) !== Number(parseAmount(reviewing.amount)) ? (
              `${formatMoney(Number(editing.amount))} changed to ${formatMoney(Number(parseAmount(reviewing.amount)))}`
            ) : (
              <Amount value={Number(parseAmount(reviewing.amount))} />
            )}
          </Item>
          <Item label="Category">
            {changed(editing?.categoryName ?? undefined, categoryName(reviewing.categoryId))}
          </Item>
          {reviewing.description.trim() && <Item label="Description">{reviewing.description}</Item>}
          {reviewing.reason.trim() && <Item label="Reason">{reviewing.reason.trim()}</Item>}
        </dl>
        {match && !separate && (
          <div className="mt-3 max-w-md rounded-control border border-line p-3 text-sm">
            <p>
              This matches the Balance correction of {formatMoney(Number(match.amount))} dated{' '}
              {match.occurredOn}
              {match.reason ? ` (${match.reason})` : ''}. You can replace that correction with this
              expense.
            </p>
            <p className="mt-2">
              {account.name} Balance will remain {formatMoney(Number(account.balance.amount))}.
              {monthSpending.data &&
                ` ${MONTH_NAMES[Number(reviewing.occurredOn.slice(5, 7)) - 1]} spending will become ${formatMoney(Number(monthSpending.data.total) + Number(reviewAmount))}.`}
            </p>
            <Button variant="ghost" size="sm" onClick={() => setSeparate(true)}>
              Save as a separate expense instead
            </Button>
          </div>
        )}
        <EnteredBy members={members} member={member} setMemberId={setMemberId} />
        <div className="mt-4 flex gap-2">
          <Button onClick={confirm} disabled={save.isPending || !member}>
            {save.isPending
              ? 'Saving'
              : reminder
                ? 'Confirm reminder'
                : match && !separate
                  ? 'Confirm replacement'
                  : 'Confirm saving'}
          </Button>
          <Button variant="secondary" onClick={() => setReviewing(null)} disabled={save.isPending}>
            Back
          </Button>
          <Button variant="ghost" onClick={onDone} disabled={save.isPending}>
            Cancel
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <Card aria-labelledby="entry-heading">
      <CardTitle id="entry-heading" className="text-lg">
        {editing ? `Edit ${kind === 'income' ? 'money in' : 'money out'}` : words.add}
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
                : !editing || 'Future activity cannot replace a saved entry',
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
        {editing && <TextField control={control} name="reason" label="Reason" />}
        {!editing && futureDate > today && (
          <p role="status" className="max-w-md rounded-control border border-line p-3 text-sm">
            {kind === 'income'
              ? 'A future date cannot be recorded as completed income. Save it as a reminder: it will not change your Balance or income.'
              : 'Future activity is a plan or reminder, not completed spending. Save it as a reminder: it will not change your Balance or spending.'}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="submit">
            {!editing && futureDate > today ? 'Save reminder' : 'Review'}
          </Button>
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  )
}

/** "Dining changed to Groceries" when an edit changes a value, otherwise the value. */
function changed(before: string | undefined, after: string): string {
  return before !== undefined && before !== after ? `${before} changed to ${after}` : after
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-caption text-ink-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}
