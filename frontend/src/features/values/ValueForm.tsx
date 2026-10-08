import { useEffect, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import type { Account } from '../../api/accounts'
import type { Member } from '../../api/household'
import type { ValueRow } from '../../api/values'
import { Button, Card, CardTitle, FormAlert, TextField } from '../../design-system'
import { useEnteringAs } from '../../hooks/useEnteringAs'
import { useReviewValue, useSaveValue } from '../../hooks/useValues'
import { formatMoney, parseAmount } from '../../lib/money'
import { typeTraits } from '../accounts/accountTypes'
import { EnteredBy } from '../activity/EnteredBy'
import { Panel } from '../activity/Panel'
import { Dated } from './Dated'

type Values = {
  amount: string
  payCredit: string
  interestCredit: string
  valueOn: string
  reason: string
}

/** One id per form instance: a repeat of the same save carries the same id (D-024). */
const newKey = () => globalThis.crypto.randomUUID()

const FUTURE =
  'Future values are not completed account history. Save it as a future plan, or choose a date on or before today.'
const PLAN_FUTURE = 'Future values are not completed account history.'

/** A credit field: blank counts as $0.00, anything else must be an amount of zero or more. */
const creditRule = (name: string) => ({
  validate: (value: string) => {
    if (value.trim() === '') return true
    const amount = parseAmount(value)
    if (amount === null) return 'Enter a valid amount'
    return !amount.startsWith('-') || `${name} must be zero or greater`
  },
})

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
  const traits = typeTraits(account.type)
  const plan = traits.plan
  const { member, setMemberId } = useEnteringAs(members)
  const [mode, setMode] = useState(initialMode)
  const [draft, setDraft] = useState<Values | null>(null)
  // An alert belongs to the date and amount that raised it: it is kept as that key, so typing drops it by itself.
  const [futureKey, setFutureKey] = useState<string | null>(null)
  // A defined benefit statement reports credits (new) or a plan value (a correction, or when the plan states one).
  const [entry, setEntry] = useState<'credits' | 'value'>(plan && !editing ? 'credits' : 'value')
  const [earlyKey, setEarlyKey] = useState<string | null>(null)
  const credits = plan && entry === 'credits'
  // Back from the review returns to the form: focus goes to its heading, in an effect so the heading exists.
  const reviewed = useRef(false)
  const reviewing = draft !== null
  useEffect(() => {
    if (reviewing) reviewed.current = true
    else if (reviewed.current) document.getElementById('value-form-heading')?.focus()
  }, [reviewing])
  const [key] = useState(newKey)
  const replacesId = editing?.id ?? undefined
  const review = useReviewValue(account.id, replacesId)
  const save = useSaveValue(account.id, replacesId)
  const { control, handleSubmit, setFocus, setError, getValues } = useForm<Values>({
    defaultValues: {
      amount: initial?.amount ?? (editing ? editing.amount : ''),
      payCredit: '',
      interestCredit: '',
      valueOn: initial?.valueOn ?? editing?.valueOn ?? (initialMode === 'plan' ? '' : today),
      reason: initial?.reason ?? '',
    },
  })
  const planning = mode === 'plan'
  // An alert about the date or the amount is dropped when either changes; when one appears it takes focus.
  const [typedDate, typedAmount] = useWatch({ control, name: ['valueOn', 'amount'] })
  const typedKey = `${typedDate}|${typedAmount}`
  const early = earlyKey === typedKey
  const future = futureKey === typedKey
  const setEarly = (on: boolean) => setEarlyKey(on ? typedKey : null)
  const setFuture = (on: boolean) => setFutureKey(on ? typedKey : null)
  const alertRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (early || future) alertRef.current?.focus()
  }, [early, future])
  // Switching between credits and a plan value removes the button that was clicked: focus the first field.
  const switched = useRef(false)
  useEffect(() => {
    if (!switched.current) {
      switched.current = true
      return
    }
    setFocus(entry === 'credits' ? 'payCredit' : 'amount')
  }, [entry, setFocus])

  // What the server is asked: a plan value, or (a statement) the credits it reports.
  const bodyOf = (values: Values, asPlan: boolean) => ({
    ...(credits
      ? {
          payCredit: parseAmount(values.payCredit) ?? '0.00',
          interestCredit: parseAmount(values.interestCredit) ?? '0.00',
        }
      : { amount: parseAmount(values.amount)! }),
    valueOn: values.valueOn,
    reason: values.reason.trim() || undefined,
    enteredByMemberId: member?.id ?? '',
    plan: asPlan || undefined,
  })

  const ask = (values: Values, asPlan: boolean) => {
    review.mutate(bodyOf(values, asPlan), { onSuccess: () => setDraft(values) })
  }

  const submit = handleSubmit((values) => {
    setFuture(false)
    setEarly(false)
    if (credits && values.payCredit.trim() === '' && values.interestCredit.trim() === '') {
      review.reset()
      setError('payCredit', { message: 'Enter a pay credit or a benefit interest credit' })
      return
    }
    if (plan && values.valueOn < account.openedOn) {
      setEarly(true)
      return
    }
    if (onBeforeStart && mode === 'new' && !plan && values.valueOn < account.openedOn) {
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
      { key, body: { ...bodyOf(draft, planning), enteredByMemberId: member.id } },
      {
        onSuccess: (result) =>
          onDone(
            planning
              ? `Saved a plan of ${formatMoney(Number(result.value.amount))} for ${result.value.valueOn}. It is not counted in the value or wealth.`
              : plan
                ? `${replacesId ? 'Corrected the statement to a' : 'Saved the statement as a'} plan value of ${formatMoney(Number(result.value.amount))} dated ${result.value.valueOn}${result.value.payCredit !== null ? ` (pay credit ${formatMoney(Number(result.value.payCredit))}, benefit interest ${formatMoney(Number(result.value.interestCredit))})` : ''}. ${account.name} is now ${formatMoney(Number(result.balanceAfter))}, dated ${result.balanceAfterOn}.`
                : `${replacesId ? 'Corrected to' : 'Saved'} ${formatMoney(Number(result.value.amount))} dated ${result.value.valueOn}. ${account.name} value is ${formatMoney(Number(result.balanceAfter))}, dated ${result.balanceAfterOn}.`,
          ),
      },
    )
  }

  if (draft && review.data) {
    const figures = review.data
    // A correction is judged against the value it replaces; a new value against the value in force on its date.
    const change = figures.replacesAmount
      ? Number(figures.amount) - Number(figures.replacesAmount)
      : figures.change === null
        ? null
        : Number(figures.change)
    return (
      <Panel key="review">
        <Card aria-labelledby="value-review-heading">
          <CardTitle id="value-review-heading" className="text-lg">
            {replacesId
              ? plan
                ? 'Review plan value correction'
                : 'Review value correction'
              : planning
                ? 'Review plan'
                : plan
                  ? 'Review plan statement'
                  : 'Review value'}
          </CardTitle>
          <FormAlert message={save.error?.message} />
          <dl className="mt-3 grid max-w-md gap-x-8 gap-y-3 sm:grid-cols-2">
            <Item label={planning ? 'Planned for' : 'Date'}>
              <Dated on={figures.valueOn} />
            </Item>
            {figures.payCredit !== null && (
              <Item label="Pay credit">{formatMoney(Number(figures.payCredit))}</Item>
            )}
            {figures.interestCredit !== null && (
              <Item label="Benefit interest credit">
                {formatMoney(Number(figures.interestCredit))}
              </Item>
            )}
            <Item label={planning ? 'Planned value' : plan ? 'Plan-reported value' : 'Value'}>
              {formatMoney(Number(figures.amount))}
            </Item>
            {figures.replacesAmount && (
              <Item label="Replaces">
                {formatMoney(Number(figures.replacesAmount))} dated{' '}
                <Dated on={figures.replacesOn ?? ''} />
              </Item>
            )}
            {figures.replacesAmount &&
              editing?.payCredit != null &&
              editing.interestCredit != null && (
                <Item label="Credits on that statement">
                  Its pay credit {formatMoney(Number(editing.payCredit))} and benefit interest{' '}
                  {formatMoney(Number(editing.interestCredit))} stop counting; the plan value above
                  replaces them.
                </Item>
              )}
            {figures.reason && <Item label="Reason">{figures.reason}</Item>}
            {!planning && !figures.replacesAmount && figures.earlierAmount !== null && (
              <Item label="Value on that date before this">
                {formatMoney(Number(figures.earlierAmount))}
              </Item>
            )}
            {!planning && change !== null && (
              <Item label={figures.replacesAmount ? 'Change from the value it replaces' : 'Change'}>
                {change === 0
                  ? formatMoney(0)
                  : `${formatMoney(Math.abs(change))} ${plan ? 'plan value' : 'asset value'} ${change < 0 ? 'decrease' : 'increase'}`}
              </Item>
            )}
            <Item label={plan ? 'Plan value now' : `${account.name} Value now`}>
              {formatMoney(Number(figures.balanceBefore))}, dated{' '}
              <Dated on={figures.balanceBeforeOn} />
            </Item>
            <Item label={plan ? 'Plan value after' : `${account.name} Value after`}>
              {formatMoney(Number(figures.balanceAfter))}, dated{' '}
              <Dated on={figures.balanceAfterOn} />
            </Item>
            {figures.netWorthBefore !== null && figures.netWorthAfter !== null && (
              <Item label="Household net worth">
                {formatMoney(Number(figures.netWorthBefore))} now,{' '}
                {formatMoney(Number(figures.netWorthAfter))} after
              </Item>
            )}
            {figures.retirementBefore !== null && figures.retirementAfter !== null && (
              <Item label="Retirement total">
                {formatMoney(Number(figures.retirementBefore))} now,{' '}
                {formatMoney(Number(figures.retirementAfter))} after
              </Item>
            )}
          </dl>
          <p className="mt-3 max-w-md text-sm text-ink-muted">
            {planning
              ? 'A plan is never counted in the value, wealth or any past date. It stays here until you remove it.'
              : plan
                ? replacesId
                  ? 'A plan value is the plan’s own report, not a transaction: it is not income or spending, and no cash or securities purchase is created.'
                  : 'A plan statement is the plan’s own report, not a transaction: its credits are not income or spending, and no salary, cash or securities purchase is created.'
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
                    : plan
                      ? 'Confirm statement'
                      : 'Confirm value'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                save.reset()
                setDraft(null)
              }}
              disabled={save.isPending}
            >
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
        <CardTitle id="value-form-heading" tabIndex={-1} className="text-lg outline-none">
          {replacesId
            ? plan
              ? 'Correct plan value'
              : 'Correct value'
            : planning
              ? 'Plan a future value'
              : plan
                ? 'Record plan statement'
                : 'Record new value'}
        </CardTitle>
        <form noValidate className="mt-3 flex max-w-md flex-col gap-4" onSubmit={submit}>
          <FormAlert message={review.error?.message} />
          {credits ? (
            <>
              <TextField
                control={control}
                name="payCredit"
                label="Pay credit"
                inputMode="decimal"
                placeholder="0.00"
                hint="What the plan credited for pay in this period. Blank counts as $0.00."
                rules={creditRule('Pay credit')}
              />
              <TextField
                control={control}
                name="interestCredit"
                label="Benefit interest credit"
                inputMode="decimal"
                placeholder="0.00"
                hint="What the plan credited as benefit interest. Blank counts as $0.00."
                rules={creditRule('Benefit interest')}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="self-start"
                onClick={() => {
                  setEntry('value')
                  review.reset()
                }}
              >
                Enter the plan-reported value instead
              </Button>
            </>
          ) : (
            <>
              <TextField
                control={control}
                name="amount"
                label={traits.valueLabel === 'Balance' ? 'Value' : traits.valueLabel}
                inputMode="decimal"
                placeholder="0.00"
                rules={{
                  validate: (value) => {
                    const amount = parseAmount(value)
                    if (amount === null) return 'Enter a valid amount'
                    return (
                      !amount.startsWith('-') ||
                      (traits.negativeValueMessage ?? 'Enter a valid amount')
                    )
                  },
                }}
              />
              {plan && !replacesId && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="self-start"
                  onClick={() => {
                    setEntry('credits')
                    review.reset()
                  }}
                >
                  Enter pay and interest credits instead
                </Button>
              )}
            </>
          )}
          <TextField
            control={control}
            name="valueOn"
            label={planning ? 'Planned for' : plan ? 'Statement date' : 'Date'}
            type="date"
            rules={{
              required: 'Enter a date',
              validate: (value) =>
                planning
                  ? value > today || 'A plan is dated after today'
                  : value >= account.openedOn ||
                    !!onBeforeStart ||
                    plan ||
                    `This date is before the account's start (${account.openedOn})`,
            }}
          />
          {early && (
            <div
              ref={alertRef}
              role="alert"
              tabIndex={-1}
              className="rounded-control border border-line p-3 text-sm outline-none"
            >
              <p>
                {credits
                  ? `Credits cannot be dated before the plan's start, ${account.openedOn}. Choose another date, or report a plan value to review an earlier start.`
                  : `Review the earlier tracking start before saving. The start is ${account.openedOn}.`}
              </p>
              <div className="mt-2 flex gap-2">
                {onBeforeStart && mode === 'new' && !credits && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setEarly(false)
                      const values = getValues()
                      if (parseAmount(values.amount) !== null)
                        onBeforeStart({ ...values, amount: parseAmount(values.amount)! })
                    }}
                  >
                    Review the earlier start
                  </Button>
                )}
                {credits && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setEarly(false)
                      setEntry('value')
                      review.reset()
                    }}
                  >
                    Report a plan value instead
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEarly(false)
                    setFocus('valueOn')
                  }}
                >
                  Choose another date
                </Button>
              </div>
            </div>
          )}
          {future && (
            <div
              ref={alertRef}
              role="alert"
              tabIndex={-1}
              className="rounded-control border border-line p-3 text-sm outline-none"
            >
              <p>{plan ? PLAN_FUTURE : FUTURE}</p>
              <div className="mt-2 flex gap-2">
                {!replacesId && !plan && (
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
            name="reason"
            label={replacesId ? 'Reason' : 'Reason (optional)'}
            rules={
              replacesId
                ? { validate: (value) => value.trim() !== '' || 'Enter a reason' }
                : undefined
            }
          />
          <p className="text-sm text-ink-muted">
            {planning
              ? 'Enter what you expect it to be worth on that date. You will review the plan before it is saved.'
              : plan
                ? 'Enter what the plan reported on that date. You will review the resulting plan value before it is saved.'
                : 'Enter what it was worth on that date. You will review the change before it is saved.'}
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
