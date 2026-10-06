import { useState } from 'react'
import { useForm } from 'react-hook-form'
import type { Account } from '../../api/accounts'
import type { Member } from '../../api/household'
import type { ValueRow } from '../../api/values'
import { Button, Card, CardTitle, FormAlert, TextField } from '../../design-system'
import { useEnteringAs } from '../../hooks/useEnteringAs'
import { useReviewValue, useSaveValue } from '../../hooks/useValues'
import { formatMoney, parseAmount } from '../../lib/money'
import { valuedNoun } from '../accounts/accountTypes'
import { EnteredBy } from '../activity/EnteredBy'
import { Panel } from '../activity/Panel'

type Values = { amount: string; valueOn: string; reason: string }

/** One id per form instance: a repeat of the same save carries the same id (D-024). */
const newKey = () => globalThis.crypto.randomUUID()

const FUTURE =
  'Future values are not completed account history. Save it as a future plan, or choose a date on or before today.'

/**
 * Records a dated value of a property or other asset: type it, review what it does to the Balance, confirm. A value
 * dated after today is guided to a future plan, which never counts. With `editing`, the form corrects an earlier
 * value (a reason is required) and the original stays in history.
 */
export function ValueForm({
  account,
  members,
  today,
  mode: initialMode,
  editing,
  initial,
  onBeforeStart,
  onDone,
}: {
  account: Account
  members: Member[]
  today: string
  mode: 'new' | 'plan' | 'correct'
  editing?: ValueRow
  /** Figures to start from (coming Back from the review of an earlier start). */
  initial?: { amount: string; valueOn: string; reason: string }
  /** A date before the account's start is a reviewed move of the start, not a plain value. */
  onBeforeStart?: (draft: { amount: string; valueOn: string; reason: string }) => void
  /** Called with a sentence saying what was saved, or nothing when the form is cancelled. */
  onDone: (message?: string) => void
}) {
  const noun = valuedNoun(account.type) ?? 'asset'
  const { member, setMemberId } = useEnteringAs(members)
  const [mode, setMode] = useState(initialMode)
  const [draft, setDraft] = useState<{ amount: string; valueOn: string; reason: string } | null>(
    null,
  )
  const [future, setFuture] = useState(false)
  const [key] = useState(newKey)
  const replacesId = editing?.id ?? undefined
  const review = useReviewValue(account.id, replacesId)
  const save = useSaveValue(account.id, replacesId)
  const { control, handleSubmit, setFocus, getValues } = useForm<Values>({
    defaultValues: {
      amount: initial?.amount ?? (editing ? editing.amount : ''),
      valueOn: initial?.valueOn ?? editing?.valueOn ?? (initialMode === 'plan' ? '' : today),
      reason: initial?.reason ?? '',
    },
  })
  const planning = mode === 'plan'

  const ask = (values: Values, plan: boolean) => {
    const amount = parseAmount(values.amount)!
    const body = {
      amount,
      valueOn: values.valueOn,
      reason: values.reason.trim() || undefined,
      enteredByMemberId: member?.id ?? '',
      plan: plan || undefined,
    }
    review.mutate(body, { onSuccess: () => setDraft({ ...values, amount }) })
  }

  const submit = handleSubmit((values) => {
    setFuture(false)
    if (onBeforeStart && mode === 'new' && values.valueOn < account.openedOn) {
      onBeforeStart({ ...values, amount: parseAmount(values.amount)! })
      return
    }
    if (mode !== 'plan' && values.valueOn > today) {
      setFuture(true)
      return
    }
    ask(values, planning)
  })

  const confirm = () => {
    if (!draft || !member) return
    save.mutate(
      {
        key,
        body: {
          amount: draft.amount,
          valueOn: draft.valueOn,
          reason: draft.reason.trim() || undefined,
          enteredByMemberId: member.id,
          plan: planning || undefined,
        },
      },
      {
        onSuccess: (result) =>
          onDone(
            planning
              ? `Saved a plan of ${formatMoney(Number(result.value.amount))} for ${result.value.valueOn}. It is not counted in the Balance or wealth.`
              : `${replacesId ? 'Corrected to' : 'Saved'} ${formatMoney(Number(result.value.amount))} dated ${result.value.valueOn}. ${account.name} Balance is ${formatMoney(Number(result.balanceAfter))}, dated ${result.balanceAfterOn}.`,
          ),
      },
    )
  }

  if (draft && review.data) {
    const figures = review.data
    const down = Number(figures.change) < 0
    return (
      <Panel key="review">
        <Card aria-labelledby="value-review-heading">
          <CardTitle id="value-review-heading" className="text-lg">
            {replacesId ? 'Review value correction' : planning ? 'Review plan' : 'Review value'}
          </CardTitle>
          <FormAlert message={save.error?.message} />
          <dl className="mt-3 grid max-w-md gap-x-8 gap-y-3 sm:grid-cols-2">
            <Item label={planning ? 'Planned for' : 'Date'}>{figures.valueOn}</Item>
            <Item label="Value">{formatMoney(Number(figures.amount))}</Item>
            {figures.replacesAmount && (
              <Item label="Replaces">
                {formatMoney(Number(figures.replacesAmount))} dated {figures.replacesOn}
              </Item>
            )}
            {figures.reason && <Item label="Reason">{figures.reason}</Item>}
            {!planning && figures.earlierAmount !== null && (
              <Item label={`Value on ${figures.valueOn} before this`}>
                {formatMoney(Number(figures.earlierAmount))}
              </Item>
            )}
            {!planning && figures.change !== null && (
              <Item label="Change">
                {Number(figures.change) === 0
                  ? formatMoney(0)
                  : `${formatMoney(Math.abs(Number(figures.change)))} asset value ${down ? 'decrease' : 'increase'}`}
              </Item>
            )}
            <Item label={`${account.name} Balance now`}>
              {formatMoney(Number(figures.balanceBefore))}, dated {figures.balanceBeforeOn}
            </Item>
            <Item label={`${account.name} Balance after`}>
              {formatMoney(Number(figures.balanceAfter))}, dated {figures.balanceAfterOn}
            </Item>
          </dl>
          <p className="mt-3 max-w-md text-sm text-ink-muted">
            {planning
              ? 'A plan is never counted in the Balance, wealth or any past date. It stays here until you remove it.'
              : 'A value is an estimate, not a transaction: it is excluded from income and spending and moves no cash.'}
          </p>
          <EnteredBy members={members} member={member} setMemberId={setMemberId} />
          <div className="mt-4 flex gap-2">
            <Button onClick={confirm} disabled={save.isPending || !member}>
              {save.isPending
                ? 'Saving'
                : replacesId
                  ? 'Confirm correction'
                  : planning
                    ? 'Confirm plan'
                    : 'Confirm value'}
            </Button>
            <Button variant="secondary" onClick={() => setDraft(null)} disabled={save.isPending}>
              Back
            </Button>
            <Button variant="ghost" onClick={() => onDone()} disabled={save.isPending}>
              Cancel
            </Button>
          </div>
        </Card>
      </Panel>
    )
  }

  return (
    <Panel key="form">
      <Card aria-labelledby="value-form-heading">
        <CardTitle id="value-form-heading" className="text-lg">
          {replacesId ? 'Correct value' : planning ? 'Plan a future value' : 'Record new value'}
        </CardTitle>
        <form noValidate className="mt-3 flex max-w-md flex-col gap-4" onSubmit={submit}>
          <FormAlert message={review.error?.message} />
          {future && (
            <div role="alert" className="rounded-control border border-line p-3 text-sm">
              <p>{FUTURE}</p>
              <div className="mt-2 flex gap-2">
                {!replacesId && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setMode('plan')
                      setFuture(false)
                      const values = getValues()
                      if (parseAmount(values.amount) !== null) ask(values, true)
                    }}
                  >
                    Save as a future plan
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setFuture(false)
                    setFocus('valueOn')
                  }}
                >
                  Choose another date
                </Button>
              </div>
            </div>
          )}
          <TextField
            control={control}
            name="amount"
            label="Value"
            inputMode="decimal"
            placeholder="0.00"
            rules={{
              validate: (value) => {
                const amount = parseAmount(value)
                if (amount === null) return 'Enter a valid amount'
                return !amount.startsWith('-') || `Enter zero or a positive ${noun} value`
              },
            }}
          />
          <TextField
            control={control}
            name="valueOn"
            label={planning ? 'Planned for' : 'Date'}
            type="date"
            rules={{
              required: 'Enter a date',
              validate: (value) =>
                planning
                  ? value > today || 'A plan is dated after today'
                  : value >= account.openedOn ||
                    !!onBeforeStart ||
                    `This date is before the account's start (${account.openedOn})`,
            }}
          />
          <TextField
            control={control}
            name="reason"
            label={replacesId ? 'Reason' : 'Reason (optional)'}
            rules={
              replacesId
                ? { validate: (value) => value.trim() !== '' || 'Enter a reason' }
                : undefined
            }
          />
          <p className="text-sm text-ink-muted">
            Enter what it was worth on that date. You will review the change before it is saved.
          </p>
          <div className="flex gap-2">
            <Button type="submit" disabled={review.isPending}>
              {review.isPending ? 'Working out the change' : 'Review'}
            </Button>
            <Button variant="ghost" onClick={() => onDone()}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
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
