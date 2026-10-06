import { useState } from 'react'
import { useForm } from 'react-hook-form'
import type { Member } from '../../api/household'
import type { Schedule } from '../../api/recurring'
import { Button, FormAlert, SelectField, TextField } from '../../design-system'
import { useToday } from '../../hooks/useAccounts'
import { useCategories } from '../../hooks/useActivity'
import { useEnteringAs } from '../../hooks/useEnteringAs'
import { useRecordActual, useReviewRecord } from '../../hooks/useRecurring'
import { formatMoney, parseAmount } from '../../lib/money'
import { EnteredBy } from '../activity/EnteredBy'
import { monthLabel } from '../budgets/budgetText'
import { Panel } from '../activity/Panel'

type Values = { amount: string; paidOn: string; categoryId: string }

const newKey = () => globalThis.crypto.randomUUID()

/**
 * Record the actual expense of a schedule's next occurrence: the amount, the date it was paid (earlier or later than
 * due) and the category, then a review that writes nothing, then Confirm. Confirm saves a real expense on its own date
 * and marks the occurrence paid; the next occurrence follows the due date. Cancel and Back save nothing, and the
 * occurrence stays unpaid (RECURRING_003, 004).
 */
export function RecordPanel(props: {
  schedule: Schedule
  members: Member[]
  onDone: (message: string) => void
  onCancel: () => void
}) {
  // The payment date starts as today, so the form waits for the server's date rather than opening empty.
  const today = useToday()
  if (!today.data) return <p className="mt-3 text-sm text-ink-muted">Loading</p>
  return <RecordForm {...props} today={today.data} />
}

function RecordForm({
  schedule,
  members,
  onDone,
  onCancel,
  today,
}: {
  today: string
  schedule: Schedule
  members: Member[]
  onDone: (message: string) => void
  onCancel: () => void
}) {
  const categories = useCategories('expense')
  const { member, setMemberId } = useEnteringAs(members)
  const review = useReviewRecord(schedule.id!)
  const record = useRecordActual(schedule.id!, schedule.accountId)
  const [key] = useState(newKey)
  const [reviewing, setReviewing] = useState(false)
  const { control, handleSubmit, getValues } = useForm<Values>({
    defaultValues: {
      amount: schedule.amount,
      paidOn: today,
      categoryId: schedule.categoryId,
    },
  })

  const body = (values: Values) => ({
    dueOn: schedule.nextDueOn,
    amount: parseAmount(values.amount)!,
    paidOn: values.paidOn,
    categoryId: values.categoryId,
    enteredByMemberId: member!.id,
  })

  const confirm = () => {
    if (!member) return
    const values = getValues()
    record.mutate(
      { key, body: body(values) },
      {
        onSuccess: (saved) => {
          const early = values.paidOn < schedule.nextDueOn
          onDone(
            `Recorded ${formatMoney(Number(parseAmount(values.amount)))} paid ${values.paidOn} for the ${schedule.nextDueOn} occurrence${early ? `, paid early on ${values.paidOn}` : ''}. The next occurrence is ${saved.nextDueOn}. The account Balance and ${monthLabel(values.paidOn.slice(0, 7), true)} spending include it on its own date.`,
          )
        },
      },
    )
  }

  const result = review.data
  if (reviewing && result) {
    return (
      <Panel key="review">
        <section
          aria-labelledby="record-review-heading"
          className="mt-3 flex max-w-2xl flex-col gap-3 rounded-control border border-line bg-sunken p-4"
        >
          <h3 id="record-review-heading" className="font-medium">
            Review recording {result.description}
          </h3>
          <dl className="grid max-w-md gap-x-8 gap-y-3 sm:grid-cols-2">
            <Item label="Paid from">{result.accountName}</Item>
            <Item label="Category">{result.categoryName}</Item>
            <Item label="Actual amount">{formatMoney(Number(result.amount))}</Item>
            <Item label={result.early ? 'Early payment date' : 'Payment date'}>
              {result.paidOn}
            </Item>
            <Item label="Occurrence">{result.dueOn}</Item>
            <Item label="Next scheduled occurrence">{result.nextDueOn}</Item>
          </dl>
          <p className="text-sm">
            Saving records a real expense of {formatMoney(Number(result.amount))} on {result.paidOn}
            . The {result.accountName} Balance goes from {formatMoney(Number(result.balanceBefore))}{' '}
            to {formatMoney(Number(result.balanceAfter))}, and the expense counts in{' '}
            {monthLabel(result.paidOn.slice(0, 7), true)} spending on that date. The {result.dueOn}{' '}
            occurrence is marked paid{result.early ? ` early on ${result.paidOn}` : ''}, and the
            next one stays {result.nextDueOn}.
          </p>
          <p className="text-sm text-ink-muted">Nothing changes until you confirm.</p>
          <EnteredBy members={members} member={member} setMemberId={setMemberId} />
          <FormAlert message={record.error?.message} />
          <div className="flex flex-wrap gap-2">
            <Button onClick={confirm} disabled={record.isPending || !member}>
              {record.isPending ? 'Saving' : 'Confirm saving the expense'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setReviewing(false)}
              disabled={record.isPending}
            >
              Back
            </Button>
            <Button variant="ghost" onClick={onCancel} disabled={record.isPending}>
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
        aria-labelledby="record-form-heading"
        className="mt-3 flex max-w-2xl flex-col gap-3 rounded-control border border-line bg-sunken p-4"
      >
        <h3 id="record-form-heading" className="font-medium">
          Record actual expense for {schedule.description}
        </h3>
        <p className="text-sm">
          The {schedule.nextDueOn} occurrence, paid from <strong>{schedule.accountName}</strong>.
          Choose what was actually paid and when.
        </p>
        <FormAlert message={review.error?.message} />
        <form
          noValidate
          className="flex max-w-2xl flex-col gap-4"
          onSubmit={handleSubmit((values) => {
            if (!member) return
            review.mutate(body(values), { onSuccess: () => setReviewing(true) })
          })}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              control={control}
              name="amount"
              label="Actual amount"
              inputMode="decimal"
              rules={{
                validate: (value) => {
                  const amount = parseAmount(value)
                  if (amount === null) return 'Enter a valid amount'
                  return Number(amount) > 0 || 'Enter an amount greater than zero'
                },
              }}
            />
            <TextField
              control={control}
              name="paidOn"
              type="date"
              label="Payment date"
              rules={{
                required: 'Enter the date it was paid',
                validate: (value) => value <= today || 'A payment date cannot be after today',
              }}
            />
            <SelectField control={control} name="categoryId" label="Category">
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
