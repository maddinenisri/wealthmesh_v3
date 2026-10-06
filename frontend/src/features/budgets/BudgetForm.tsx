import { useState } from 'react'
import { useForm } from 'react-hook-form'
import type { Budget } from '../../api/budgets'
import type { Member } from '../../api/household'
import { Button, FormAlert, TextField } from '../../design-system'
import { useCategories } from '../../hooks/useActivity'
import { useReviewBudget, useSaveBudget } from '../../hooks/useBudgets'
import { useEnteringAs } from '../../hooks/useEnteringAs'
import { formatMoney, parseAmount } from '../../lib/money'
import { EnteredBy } from '../activity/EnteredBy'
import { Panel } from '../activity/Panel'
import { BudgetLines } from './BudgetLines'
import { gapText, monthLabel, monthStatus } from './budgetText'

type Row = { categoryId: string; name: string; amount: string }
type Values = { total: string; targets: Row[] }

/** One id per form instance: a repeat of the same save carries the same id (D-024). */
const newKey = () => globalThis.crypto.randomUUID()

const amountRule = (value: string, required: boolean) => {
  if (value.trim() === '') return required ? 'Enter the total Budget' : true
  const amount = parseAmount(value)
  if (amount === null) return 'Enter a valid amount'
  return Number(amount) >= 0 || 'Enter zero or a positive amount'
}

/**
 * Build or change a month's Budget: the total and a target per category (blank: no target). Save goes to a review that
 * shows the targets total against the total Budget and writes nothing; Confirm saves, Back and Cancel keep the saved
 * Budget as it was (BUDGET_001 to 003, 007).
 */
export function BudgetForm({
  month,
  budget,
  members,
  onSaved,
  onCancel,
}: {
  month: string
  budget: Budget
  members: Member[]
  onSaved: (message: string) => void
  onCancel: () => void
}) {
  const categories = useCategories('expense')
  const { member, setMemberId } = useEnteringAs(members)
  const review = useReviewBudget(month)
  const save = useSaveBudget(month)
  const [key] = useState(newKey)
  const [reviewing, setReviewing] = useState(false)

  // Every active spending category, plus a category that already has a target (an archived one keeps it).
  const saved = new Map(budget.lines.filter((l) => l.categoryId).map((l) => [l.categoryId!, l]))
  const rows: Row[] = [
    ...(categories.data ?? []).map((c) => ({ id: c.id, name: c.name })),
    ...budget.lines
      .filter((l) => l.categoryId && l.target !== null)
      .filter((l) => !categories.data?.some((c) => c.id === l.categoryId))
      .map((l) => ({ id: l.categoryId!, name: `${l.name} (archived)` })),
  ].map(({ id, name }) => ({
    categoryId: id,
    name,
    amount: saved.get(id)?.target ?? '',
  }))

  return categories.data ? (
    <FormBody
      rows={rows}
      initialTotal={budget.total ?? ''}
      month={month}
      reviewing={reviewing}
      setReviewing={setReviewing}
      member={member}
      members={members}
      setMemberId={setMemberId}
      onCancel={onCancel}
      review={review}
      save={save}
      saveKey={key}
      onSaved={onSaved}
    />
  ) : (
    <p className="mt-3 text-sm text-ink-muted">Loading categories</p>
  )
}

function FormBody({
  rows,
  initialTotal,
  month,
  reviewing,
  setReviewing,
  member,
  members,
  setMemberId,
  onCancel,
  review,
  save,
  saveKey,
  onSaved,
}: {
  rows: Row[]
  initialTotal: string
  month: string
  reviewing: boolean
  setReviewing: (value: boolean) => void
  member: Member | undefined
  members: Member[]
  setMemberId: (id: string) => void
  onCancel: () => void
  review: ReturnType<typeof useReviewBudget>
  save: ReturnType<typeof useSaveBudget>
  saveKey: string
  onSaved: (message: string) => void
}) {
  const { control, handleSubmit, getValues } = useForm<Values>({
    defaultValues: { total: initialTotal, targets: rows },
  })

  const body = (values: Values) => ({
    total: parseAmount(values.total)!,
    targets: values.targets
      .filter((row) => row.amount.trim() !== '')
      .map((row) => ({ categoryId: row.categoryId, amount: parseAmount(row.amount)! })),
    enteredByMemberId: member!.id,
  })

  const toReview = (values: Values) => {
    if (!member) return
    review.mutate(body(values), { onSuccess: () => setReviewing(true) })
  }

  const confirm = () => {
    if (!member) return
    save.mutate(
      { key: saveKey, body: body(getValues()) },
      {
        onSuccess: (saved) =>
          onSaved(`${monthLabel(month, true)} Budget saved: ${monthStatus(saved)}.`),
      },
    )
  }

  const result = review.data
  if (reviewing && result) {
    return (
      <Panel key="review">
        <section
          aria-labelledby="budget-review-heading"
          className="mt-3 flex max-w-2xl flex-col gap-3 rounded-control border border-line bg-sunken p-4"
        >
          <h3 id="budget-review-heading" className="font-medium">
            Review {monthLabel(month, true)} Budget
          </h3>
          <dl className="grid max-w-md gap-x-8 gap-y-3 sm:grid-cols-2">
            <Item label="Month">{monthLabel(month, true)}</Item>
            <Item label="Total Budget">{formatMoney(Number(result.total))}</Item>
            <Item label="Category targets total">{formatMoney(Number(result.targetTotal))}</Item>
            <Item label="Difference">{formatMoney(Math.abs(Number(result.unallocated)))}</Item>
          </dl>
          <p className="text-sm">{gapText(result.unallocated ?? '0')}</p>
          <p className="text-sm">
            {monthLabel(month)} spending is {formatMoney(Number(result.spending))}:{' '}
            {monthStatus(result)}.
          </p>
          <BudgetLines lines={result.lines} />
          <p className="max-w-prose text-sm text-ink-muted">
            Saving a Budget changes neither paid expenses nor money in accounts.
          </p>
          <EnteredBy members={members} member={member} setMemberId={setMemberId} />
          <FormAlert message={save.error?.message} />
          <div className="flex flex-wrap gap-2">
            <Button onClick={confirm} disabled={save.isPending || !member}>
              {save.isPending ? 'Saving' : 'Confirm saving the Budget'}
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
        aria-labelledby="budget-form-heading"
        className="mt-3 flex max-w-2xl flex-col gap-3 rounded-control border border-line bg-sunken p-4"
      >
        <h3 id="budget-form-heading" className="font-medium">
          {monthLabel(month, true)} Budget
        </h3>
        <FormAlert message={review.error?.message} />
        <form
          noValidate
          className="flex max-w-2xl flex-col gap-4"
          onSubmit={handleSubmit(toReview)}
        >
          <TextField
            control={control}
            name="total"
            label="Total Budget"
            inputMode="decimal"
            placeholder="0.00"
            rules={{ validate: (value) => amountRule(value, true) }}
          />
          <div className="grid gap-4 md:grid-cols-2">
            {rows.map((row, index) => (
              <TextField
                key={row.categoryId}
                control={control}
                name={`targets.${index}.amount`}
                label={`${row.name} target`}
                inputMode="decimal"
                placeholder="No target"
                rules={{ validate: (value) => amountRule(value, false) }}
              />
            ))}
          </div>
          <EnteredBy members={members} member={member} setMemberId={setMemberId} />
          <div className="flex gap-2">
            <Button type="submit" disabled={review.isPending || !member}>
              {review.isPending ? 'Checking' : 'Review Budget'}
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
