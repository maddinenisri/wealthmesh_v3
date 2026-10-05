import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import type { Account } from '../../api/accounts'
import type { Member } from '../../api/household'
import { Button, Card, CardTitle, FormAlert, TextField } from '../../design-system'
import { useEnteringAs } from '../../hooks/useEnteringAs'
import { useOpeningPreview, useSaveOpening } from '../../hooks/useStartingBalance'
import { formatMoney, parseAmount } from '../../lib/money'
import { OVERDRAFT_NOTICE } from '../accounts/Overdrawn'
import { EnteredBy } from './EnteredBy'

type Values = { amount: string; on: string; reason: string }

/** One id per form instance: a repeat of the same save carries the same id (D-024). */
const newKey = () => globalThis.crypto.randomUUID()

/**
 * Correct the starting balance: say what the account held at its start, review the original and corrected figures
 * and what the Balance becomes, give a reason, confirm. It never creates income, spending or an entry; the original
 * stays in history (V2_JOURNEY_004).
 */
export function StartingBalanceCorrection({
  account,
  members,
  today,
  initial,
  onReviewing,
  onDone,
}: {
  account: Account
  members: Member[]
  today: string
  /** Figures carried over from an Update balance dated before tracking began. */
  initial?: { amount: string; on: string }
  /** Tells the parent whether a review is showing, so the mode choice can be locked. */
  onReviewing?: (reviewing: boolean) => void
  onDone: () => void
}) {
  const { member, setMemberId } = useEnteringAs(members)
  const [reviewing, setReviewing] = useState<{ amount: string; on: string } | null>(null)
  const [key] = useState(newKey)
  const save = useSaveOpening(account.id)
  const { control, handleSubmit } = useForm<Values>({
    defaultValues: {
      amount: initial?.amount ?? '',
      on: initial?.on ?? account.openedOn,
      reason: '',
    },
  })
  const preview = useOpeningPreview(account.id, reviewing?.amount ?? '', reviewing?.on ?? '')
  useEffect(() => onReviewing?.(reviewing !== null), [reviewing, onReviewing])

  const confirm = handleSubmit((values) => {
    if (!reviewing || !member) return
    save.mutate(
      {
        key,
        correction: {
          openingAmount: reviewing.amount,
          openedOn: reviewing.on,
          reason: values.reason.trim(),
          enteredByMemberId: member.id,
        },
      },
      { onSuccess: onDone },
    )
  })

  if (reviewing) {
    const figures = preview.data
    return (
      <Card aria-labelledby="starting-review-heading">
        <CardTitle id="starting-review-heading" className="text-lg">
          Review starting balance correction
        </CardTitle>
        <FormAlert
          message={save.error?.message ?? (preview.isError ? preview.error.message : undefined)}
        />
        {preview.isPending && <p className="mt-3 text-sm text-ink-muted">Working out the change</p>}
        {figures && (
          <>
            <dl className="mt-3 grid max-w-md gap-x-8 gap-y-3 sm:grid-cols-2">
              <Item label="Original starting balance">
                {formatMoney(Number(figures.originalAmount))} on {figures.originalOn}
              </Item>
              <Item label="Corrected starting balance">
                {formatMoney(Number(figures.openingAmount))} on {figures.openedOn}
              </Item>
            </dl>
            <p className="mt-3 max-w-md text-sm">
              Balance will change from {formatMoney(Number(figures.currentBalance))} to{' '}
              {formatMoney(Number(figures.currentBalanceAfter))}.
            </p>
            <p className="mt-2 max-w-md text-sm text-ink-muted">
              This correction is not income or spending, and your entries stay on their own dates.
              The original starting balance stays in history.
            </p>
            {figures.overdraft && (
              <p
                role="alert"
                className="mt-3 max-w-md rounded-control border border-line p-3 text-sm"
              >
                This will leave {account.name} overdrawn by{' '}
                {formatMoney(Math.abs(Number(figures.currentBalanceAfter)))}. {OVERDRAFT_NOTICE}
              </p>
            )}
          </>
        )}
        <form noValidate className="mt-3 flex max-w-md flex-col gap-4" onSubmit={confirm}>
          <TextField
            control={control}
            name="reason"
            label="Reason"
            rules={{ validate: (value) => value.trim() !== '' || 'Enter a reason' }}
          />
          <EnteredBy members={members} member={member} setMemberId={setMemberId} />
          <div className="flex gap-2">
            <Button type="submit" disabled={save.isPending || !member || !figures}>
              {save.isPending ? 'Saving' : 'Confirm correction'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setReviewing(null)}
              disabled={save.isPending}
            >
              Back
            </Button>
            <Button variant="ghost" onClick={onDone} disabled={save.isPending}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    )
  }

  return (
    <Card aria-labelledby="starting-heading">
      <CardTitle id="starting-heading" className="text-lg">
        Correct the starting balance
      </CardTitle>
      {initial && (
        <p role="status" className="mt-3 max-w-md rounded-control border border-line p-3 text-sm">
          {initial.on} is before tracking began on {account.openedOn}, so this is a starting balance
          correction. Check the amount and date, then review.
        </p>
      )}
      <form
        noValidate
        className="mt-3 flex max-w-md flex-col gap-4"
        onSubmit={handleSubmit((values) =>
          setReviewing({ amount: parseAmount(values.amount)!, on: values.on }),
        )}
      >
        <TextField
          control={control}
          name="amount"
          label="Starting balance"
          inputMode="decimal"
          placeholder="0.00"
          rules={{ validate: (value) => parseAmount(value) !== null || 'Enter a valid amount' }}
        />
        <TextField
          control={control}
          name="on"
          label="Date"
          type="date"
          rules={{
            required: 'Enter a date',
            validate: (value) => value <= today || 'The date cannot be in the future',
          }}
        />
        <p className="text-sm text-ink-muted">
          Enter what the account held at the start of that day. You will review the change before it
          is saved.
        </p>
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
