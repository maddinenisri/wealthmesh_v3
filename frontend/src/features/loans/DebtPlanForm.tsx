import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import type { Account } from '../../api/accounts'
import type { Member } from '../../api/household'
import { Button, Card, CardTitle, FormAlert, TextField } from '../../design-system'
import { useEnteringAs } from '../../hooks/useEnteringAs'
import { useReviewValue, useSaveValue } from '../../hooks/useValues'
import { parseAmount } from '../../lib/money'
import { balanceText } from '../accounts/cardBalance'
import { EnteredBy } from '../activity/EnteredBy'
import { Panel } from '../activity/Panel'
import { Dated } from '../values/Dated'

type Values = { amount: string; valueOn: string; reason: string }

/** One id per form instance: a repeat of the same save carries the same id (D-024). */
const newKey = () => globalThis.crypto.randomUUID()

/**
 * A future plan for a loan or mortgage (DATED_VALUE_001): what the amount owed is expected to be on a date after
 * today. It is reviewed and saved like any change, but no reader counts it: the Balance owed, wealth and every past
 * date stay as they are, and it stays listed until it is removed. `initial` carries what was typed on the way here.
 */
export function DebtPlanForm({
  account,
  members,
  today,
  initial,
  onDone,
}: {
  account: Account
  members: Member[]
  today: string
  initial?: { amount: string; on: string }
  /** Called with a sentence saying what was saved, or nothing when cancelled. */
  onDone: (message?: string) => void
}) {
  const { member, setMemberId } = useEnteringAs(members)
  const [draft, setDraft] = useState<{ amount: string; valueOn: string; reason: string } | null>(
    null,
  )
  const [key] = useState(newKey)
  const review = useReviewValue(account.id)
  const save = useSaveValue(account.id)
  const { control, handleSubmit } = useForm<Values>({
    defaultValues: { amount: initial?.amount ?? '', valueOn: initial?.on ?? '', reason: '' },
  })
  // Back from the review brings the form back in place: its heading takes focus, not the page body.
  const wasReviewing = useRef(false)
  useEffect(() => {
    if (draft) {
      wasReviewing.current = true
      document.getElementById('plan-review-heading')?.focus({ preventScroll: true })
    } else if (wasReviewing.current) {
      document.getElementById('plan-form-heading')?.focus()
    }
  }, [draft])

  const ask = handleSubmit((values) => {
    const amount = parseAmount(values.amount)!
    review.mutate(
      {
        amount,
        valueOn: values.valueOn,
        reason: values.reason.trim() || undefined,
        enteredByMemberId: member?.id ?? '',
        plan: true,
      },
      { onSuccess: () => setDraft({ ...values, amount }) },
    )
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
          plan: true,
        },
      },
      {
        onSuccess: (result) =>
          onDone(
            `Saved a plan of ${balanceText(account.type, result.value.amount)} for ${result.value.valueOn}. It is not counted in the Balance owed or wealth.`,
          ),
      },
    )
  }

  if (draft && review.data) {
    const figures = review.data
    return (
      <Panel key="review">
        <Card aria-labelledby="plan-review-heading">
          <CardTitle id="plan-review-heading" tabIndex={-1} className="text-lg outline-none">
            Review plan
          </CardTitle>
          <FormAlert message={save.error?.message} />
          <dl className="mt-3 grid max-w-md gap-x-8 gap-y-3 sm:grid-cols-2">
            <Item label="Planned for">
              <Dated on={figures.valueOn} />
            </Item>
            <Item label="Planned amount owed">{balanceText(account.type, figures.amount)}</Item>
            {figures.reason && <Item label="Reason">{figures.reason}</Item>}
            <Item label={`${account.name} Balance owed now`}>
              {balanceText(account.type, figures.balanceBefore)}
            </Item>
            <Item label={`${account.name} Balance owed after`}>
              {balanceText(account.type, figures.balanceAfter)}
            </Item>
          </dl>
          <p className="mt-3 max-w-md text-sm text-ink-muted">
            A plan is never counted in the Balance owed, wealth or any past date. It stays listed
            until you remove it.
          </p>
          <EnteredBy members={members} member={member} setMemberId={setMemberId} />
          <div className="mt-4 flex gap-2">
            <Button onClick={confirm} disabled={save.isPending || !member}>
              {save.isPending ? 'Saving' : 'Confirm plan'}
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
      <Card aria-labelledby="plan-form-heading">
        <CardTitle id="plan-form-heading" tabIndex={-1} className="text-lg outline-none">
          Plan a future amount owed
        </CardTitle>
        <form noValidate className="mt-3 flex max-w-md flex-col gap-4" onSubmit={ask}>
          <FormAlert message={review.error?.message} />
          <TextField
            control={control}
            name="amount"
            label="Amount owed"
            inputMode="decimal"
            placeholder="0.00"
            rules={{
              validate: (value) => {
                const amount = parseAmount(value)
                if (amount === null) return 'Enter a valid amount'
                return !amount.startsWith('-') || 'Enter zero or a positive amount owed'
              },
            }}
          />
          <TextField
            control={control}
            name="valueOn"
            label="Planned for"
            type="date"
            rules={{
              required: 'Enter a date',
              validate: (value) => value > today || 'A plan is dated after today',
            }}
          />
          <TextField control={control} name="reason" label="Reason (optional)" />
          <p className="text-sm text-ink-muted">
            Enter what you expect to owe on that date. You will review the plan before it is saved.
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
