import { useState } from 'react'
import { useForm } from 'react-hook-form'
import type { Frequency, Schedule, ScheduleBody } from '../../api/recurring'
import type { Member } from '../../api/household'
import { Button, FormAlert, SelectField, TextField } from '../../design-system'
import { useAccounts, useToday } from '../../hooks/useAccounts'
import { useCategories } from '../../hooks/useActivity'
import { useEnteringAs } from '../../hooks/useEnteringAs'
import { useReviewSchedule } from '../../hooks/useRecurring'
import { formatMoney, parseAmount } from '../../lib/money'
import { EnteredBy } from '../activity/EnteredBy'
import { Panel } from '../activity/Panel'
import { FREQUENCY_LABEL } from './recurringText'

type Values = {
  description: string
  amount: string
  frequency: Frequency
  nextDueOn: string
  accountId: string
  categoryId: string
}

/** What a form starts from: a suggestion's bill, a saved schedule being changed, or nothing. */
export type ScheduleStart = Partial<Values> & { accountId?: string }

/** One id per form instance: a repeat of the same save carries the same id (D-024). */
const newKey = () => globalThis.crypto.randomUUID()

/** The save a form confirms: a new schedule or a change. The parent owns the mutation and what it refreshes. */
export type ScheduleSave = {
  mutate: (
    vars: { key: string; body: ScheduleBody },
    options: { onSuccess: (saved: Schedule) => void },
  ) => void
  isPending: boolean
  error: Error | null
}

const amountRule = (value: string) => {
  if (value.trim() === '') return 'Enter the expected amount'
  const amount = parseAmount(value)
  if (amount === null) return 'Enter a valid amount'
  return Number(amount) > 0 || 'Enter an amount greater than zero'
}

/**
 * Create a recurring bill, confirm a suggestion, or change a saved schedule: the fields, then a review that shows
 * the schedule and its following occurrence and writes nothing, then Confirm. Back and Cancel keep what was saved.
 * A schedule is an estimate, so saving it never changes a Balance or a month's spending (RECURRING_002, 005, 006, 007).
 */
export function ScheduleForm({
  heading,
  start,
  changing,
  members,
  save,
  confirmLabel,
  savedMessage,
  onSaved,
  onCancel,
}: {
  heading: string
  start?: ScheduleStart
  /** A change keeps the account: the chooser is replaced by its name. */
  changing?: Schedule
  members: Member[]
  save: ScheduleSave
  confirmLabel: string
  savedMessage: (saved: Schedule) => string
  onSaved: (message: string) => void
  onCancel: () => void
}) {
  const accounts = useAccounts()
  const categories = useCategories('expense')
  const today = useToday()
  const { member, setMemberId } = useEnteringAs(members)
  const review = useReviewSchedule()
  const [key] = useState(newKey)
  const [reviewing, setReviewing] = useState(false)
  const { control, handleSubmit, getValues } = useForm<Values>({
    defaultValues: {
      description: start?.description ?? '',
      amount: start?.amount ?? '',
      frequency: start?.frequency ?? 'monthly',
      nextDueOn: start?.nextDueOn ?? '',
      accountId: start?.accountId ?? '',
      categoryId: start?.categoryId ?? '',
    },
  })

  // A bill is paid from an active checking or savings account; a change keeps the account it has.
  const choices = (accounts.data ?? []).filter(
    (account) =>
      (account.type === 'checking' || account.type === 'savings') && account.status === 'active',
  )

  const body = (values: Values): ScheduleBody => ({
    description: values.description.trim(),
    amount: parseAmount(values.amount)!,
    frequency: values.frequency,
    nextDueOn: values.nextDueOn,
    accountId: changing?.accountId ?? values.accountId,
    categoryId: values.categoryId,
    enteredByMemberId: member!.id,
  })

  const toReview = (values: Values) => {
    if (!member) return
    review.mutate(body(values), { onSuccess: () => setReviewing(true) })
  }

  const confirm = () => {
    if (!member) return
    save.mutate(
      { key, body: body(getValues()) },
      { onSuccess: (saved) => onSaved(savedMessage(saved)) },
    )
  }

  const result = review.data
  if (reviewing && result) {
    return (
      <Panel key="review">
        <section
          aria-labelledby="schedule-review-heading"
          className="mt-3 flex max-w-2xl flex-col gap-3 rounded-control border border-line bg-sunken p-4"
        >
          <h3 id="schedule-review-heading" className="font-medium">
            Review: {result.description}
          </h3>
          <dl className="grid max-w-md gap-x-8 gap-y-3 sm:grid-cols-2">
            <Item label="Expected amount">{formatMoney(Number(result.amount))}</Item>
            <Item label="Frequency">{FREQUENCY_LABEL[result.frequency]}</Item>
            <Item label="Next due date">{result.nextDueOn}</Item>
            <Item label="Following occurrence">{result.followingDueOn}</Item>
            <Item label="Paid from">{result.accountName}</Item>
            <Item label="Category">{result.categoryName}</Item>
          </dl>
          {changing && (
            <p className="text-sm">
              Was {formatMoney(Number(changing.amount))} {FREQUENCY_LABEL[changing.frequency]}, next
              due {changing.nextDueOn}. Bills already paid keep their amounts, dates, accounts and
              categories.
            </p>
          )}
          <p className="max-w-prose text-sm text-ink-muted">
            Estimate, not a recorded expense. Saving it changes neither the account Balance nor
            spending.
          </p>
          <EnteredBy members={members} member={member} setMemberId={setMemberId} />
          <FormAlert message={save.error?.message} />
          <div className="flex flex-wrap gap-2">
            <Button onClick={confirm} disabled={save.isPending || !member}>
              {save.isPending ? 'Saving' : confirmLabel}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setReviewing(false)}
              disabled={save.isPending}
            >
              Back
            </Button>
            <Button variant="ghost" onClick={onCancel} disabled={save.isPending}>
              Cancel
            </Button>
          </div>
        </section>
      </Panel>
    )
  }

  return (
    <Panel key="form">
      <section
        aria-labelledby="schedule-form-heading"
        className="mt-3 flex max-w-2xl flex-col gap-3 rounded-control border border-line bg-sunken p-4"
      >
        <h3 id="schedule-form-heading" className="font-medium">
          {heading}
        </h3>
        <FormAlert message={review.error?.message} />
        <form
          noValidate
          className="flex max-w-2xl flex-col gap-4"
          onSubmit={handleSubmit(toReview)}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              control={control}
              name="description"
              label="Name"
              rules={{ validate: (value) => value.trim() !== '' || 'Enter what this bill is' }}
            />
            <TextField
              control={control}
              name="amount"
              label="Expected amount"
              inputMode="decimal"
              placeholder="0.00"
              rules={{ validate: amountRule }}
            />
            <SelectField control={control} name="frequency" label="Frequency">
              {(Object.keys(FREQUENCY_LABEL) as Frequency[]).map((value) => (
                <option key={value} value={value}>
                  {FREQUENCY_LABEL[value]}
                </option>
              ))}
            </SelectField>
            <TextField
              control={control}
              name="nextDueOn"
              type="date"
              label={changing ? 'Next due date' : 'First due date'}
              hint={today.data ? `Today is ${today.data}` : undefined}
              rules={{ required: 'Enter the due date' }}
            />
            {changing ? (
              <p className="text-sm">
                Paid from <strong>{changing.accountName}</strong>
              </p>
            ) : (
              <SelectField
                control={control}
                name="accountId"
                label="Paid from"
                rules={{ required: 'Choose the account it is paid from' }}
              >
                <option value="">Choose an account</option>
                {choices.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </SelectField>
            )}
            <SelectField
              control={control}
              name="categoryId"
              label="Category"
              rules={{ required: 'Choose a category' }}
            >
              <option value="">Choose a category</option>
              {(categories.data ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </SelectField>
          </div>
          <EnteredBy members={members} member={member} setMemberId={setMemberId} />
          <div className="flex gap-2">
            <Button type="submit" disabled={review.isPending || !member}>
              {review.isPending ? 'Checking' : 'Review'}
            </Button>
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </section>
    </Panel>
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
