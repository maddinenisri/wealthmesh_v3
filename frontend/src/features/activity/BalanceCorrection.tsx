import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import type { Account } from '../../api/accounts'
import type { Activity } from '../../api/activity'
import type { Member } from '../../api/household'
import { Button, Card, CardTitle, FormAlert, SelectField, TextField } from '../../design-system'
import { useBalanceAsOf, useCorrectionPreview, useSaveCorrection } from '../../hooks/useActivity'
import { useEnteringAs } from '../../hooks/useEnteringAs'
import { formatMoney, parseAmount } from '../../lib/money'
import { isDebt } from '../accounts/accountTypes'
import { balanceText, isCard } from '../accounts/cardBalance'
import { OVERDRAFT_NOTICE } from '../accounts/Overdrawn'
import { Dated } from '../values/Dated'
import { EnteredBy } from './EnteredBy'

type Values = { requested: string; asOn: string; reason: string; balanceSide: 'owed' | 'credit' }

/** One id per form instance: a repeat of the same save carries the same id (D-024). */
const newKey = () => globalThis.crypto.randomUUID()

/** A card's amount is typed positive; Owed or Card credit says what it means. */
const cardRules = {
  validate: (value: string) => {
    const amount = parseAmount(value)
    return (amount !== null && !amount.startsWith('-')) || 'Enter a valid amount'
  },
}

/** The words for a change: money in a bank account rises or falls; a card's debt grows or shrinks. */
const changeWord = (card: boolean, difference: number) =>
  card
    ? difference < 0
      ? 'increase in debt'
      : 'decrease in debt'
    : difference > 0
      ? 'increase'
      : 'decrease'

const requestedRules = {
  validate: (value: string) => parseAmount(value) !== null || 'Enter a valid amount',
}

/** A loan's amount owed is typed as zero or more; there is no side (it is always owed). */
const debtRules = {
  validate: (value: string) => {
    const amount = parseAmount(value)
    if (amount === null) return 'Enter a valid amount'
    return !amount.startsWith('-') || 'Enter zero or a positive amount owed'
  },
}

/**
 * Update balance: say what the Balance was on a date, review what that changes, give a reason, confirm.
 * A correction changes the Balance only; it is never income or spending. With `editing`, the form corrects an
 * earlier correction and both versions stay in history.
 */
export function BalanceCorrection({
  account,
  members,
  today,
  editing,
  onBeforeStart,
  onReviewing,
  onDone,
}: {
  account: Account
  members: Member[]
  today: string
  /** An effective correction being corrected: saving replaces it. */
  editing?: Activity
  /** A date before tracking began is a tracking-start review, not a dated correction. */
  onBeforeStart?: (draft: { amount: string; on: string }) => void
  /** Tells the parent whether a review is showing, so the mode choice can be locked. */
  onReviewing?: (reviewing: boolean) => void
  onDone: (message?: string) => void
}) {
  const { member, setMemberId } = useEnteringAs(members)
  const card = isCard(account.type)
  const debt = isDebt(account.type)
  // A card or a loan is changed as a debt: it grows or shrinks, and its figures read "owed".
  const owes = card || debt
  const [reviewing, setReviewing] = useState<{
    requested: string
    asOn: string
    side?: 'owed' | 'credit'
  } | null>(null)
  const money = (value: string | number) => balanceText(account.type, String(value))
  const [key] = useState(newKey)
  useEffect(() => onReviewing?.(reviewing !== null), [reviewing, onReviewing])
  // Back from the review brings the form back in place: its heading takes focus, not the page body.
  const wasReviewing = useRef(false)
  useEffect(() => {
    if (reviewing) wasReviewing.current = true
    else if (wasReviewing.current) document.getElementById('balance-heading')?.focus()
  }, [reviewing])
  // The review replaces the form in place, so its heading takes focus.
  useEffect(() => {
    if (reviewing) document.getElementById('correction-heading')?.focus({ preventScroll: true })
  }, [reviewing])
  const save = useSaveCorrection(account.id)
  const { control, handleSubmit, setValue, getFieldState, formState } = useForm<Values>({
    defaultValues: {
      requested: '',
      asOn: editing?.occurredOn ?? today,
      reason: '',
      balanceSide: 'owed',
    },
  })
  const preview = useCorrectionPreview(
    account.id,
    reviewing?.requested ?? '',
    reviewing?.asOn ?? '',
    editing?.id,
    reviewing?.side,
  )
  // Editing starts from the Balance the correction made, so it is not retyped from memory.
  const current = useBalanceAsOf(account.id, editing?.occurredOn ?? '')
  useEffect(() => {
    if (editing && current.data?.amount && !getFieldState('requested', formState).isDirty) {
      // A card is typed positive with a side, so its stored (asset-signed) Balance is split back into both.
      setValue(
        'requested',
        owes ? Math.abs(Number(current.data.amount)).toFixed(2) : current.data.amount,
      )
      if (card) setValue('balanceSide', Number(current.data.amount) > 0 ? 'credit' : 'owed')
    }
  }, [editing, card, owes, current.data, setValue, getFieldState, formState])
  const title = editing
    ? 'Edit balance correction'
    : debt
      ? 'Update balance owed'
      : 'Update balance'
  const word = debt ? 'balance owed' : 'Balance'

  // A missing reason is reported at the field; bring the review back into view so the message is seen.
  const showReview = () =>
    document
      .getElementById('correction-review')
      ?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
  const confirm = handleSubmit((values) => {
    if (!reviewing || !member) return
    save.mutate(
      {
        key,
        correction: {
          requestedBalance: reviewing.requested,
          asOn: reviewing.asOn,
          reason: values.reason.trim(),
          enteredByMemberId: member.id,
          replacesId: editing?.id,
          ...(reviewing.side ? { balanceSide: reviewing.side } : {}),
        },
      },
      { onSuccess: () => onDone('Saved the balance correction.') },
    )
  }, showReview)

  if (reviewing) {
    const figures = preview.data
    const difference = figures ? Number(figures.difference) : 0
    // The edited correction counted in the Balance when it was saved, so the original is that plus its amount.
    const original = figures && editing ? Number(figures.balanceOnDate) + Number(editing.amount) : 0
    return (
      <div id="correction-review" className="scroll-mt-4">
        <Card aria-labelledby="correction-heading">
          <CardTitle id="correction-heading" tabIndex={-1} className="text-lg outline-none">
            {editing ? 'Review correction change' : 'Review balance update'}
          </CardTitle>
          <FormAlert
            message={save.error?.message ?? (preview.isError ? preview.error.message : undefined)}
          />
          {preview.isPending && (
            <p className="mt-3 text-sm text-ink-muted">Working out the change</p>
          )}
          {figures && (
            <>
              <dl className="mt-3 grid max-w-md gap-x-8 gap-y-3 sm:grid-cols-2">
                <Item label="Date">{figures.asOn}</Item>
                {editing && <Item label={`Original ${word}`}>{money(original)}</Item>}
                {editing?.reason && <Item label="Original reason">{editing.reason}</Item>}
                <Item
                  label={
                    editing ? (
                      `${debt ? 'Balance owed' : 'Balance'} without this correction`
                    ) : (
                      <>
                        Current {word} on <Dated on={figures.asOn} />
                      </>
                    )
                  }
                >
                  {money(figures.balanceOnDate)}
                </Item>
                <Item
                  label={`${editing ? 'Corrected' : 'Requested'} ${word}`.replace(
                    /^(\w)/,
                    (letter) => letter.toUpperCase(),
                  )}
                >
                  {money(figures.requested)}
                </Item>
                <Item label="Difference">
                  {difference === 0
                    ? formatMoney(0)
                    : `${formatMoney(Math.abs(difference))} ${changeWord(owes, difference)}`}
                </Item>
                <Item label={`${account.name} ${word} after`}>
                  {money(figures.currentBalanceAfter)}
                </Item>
              </dl>
              <p className="mt-3 max-w-md text-sm text-ink-muted">
                {debt
                  ? 'This correction is excluded from income and spending. It changes only the balance owed.'
                  : 'This correction is excluded from Income and spending. It changes the Balance only.'}
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
            <p className="text-sm text-ink-muted">A reason is required to save this correction.</p>
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
                onClick={() => {
                  save.reset()
                  setReviewing(null)
                }}
                disabled={save.isPending}
              >
                Back
              </Button>
              <Button variant="ghost" onClick={() => onDone()} disabled={save.isPending}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      </div>
    )
  }

  return (
    <Card aria-labelledby="balance-heading">
      <CardTitle id="balance-heading" tabIndex={-1} className="text-lg outline-none">
        {title}
      </CardTitle>
      <form
        noValidate
        className="mt-3 flex max-w-md flex-col gap-4"
        onSubmit={handleSubmit((values) =>
          onBeforeStart && values.asOn < account.openedOn
            ? onBeforeStart({ amount: parseAmount(values.requested)!, on: values.asOn })
            : setReviewing({
                requested: parseAmount(values.requested)!,
                asOn: values.asOn,
                ...(card ? { side: values.balanceSide } : {}),
              }),
        )}
      >
        <TextField
          control={control}
          name="requested"
          label={debt ? 'Balance owed' : 'Balance'}
          inputMode="decimal"
          placeholder="0.00"
          rules={debt ? debtRules : card ? cardRules : requestedRules}
        />
        {card && (
          <SelectField control={control} name="balanceSide" label="Balance means">
            <option value="owed">Owed</option>
            <option value="credit">Card credit</option>
          </SelectField>
        )}
        <TextField
          control={control}
          name="asOn"
          label="Date"
          type="date"
          rules={{
            required: 'Enter a date',
            validate: (value) =>
              value > today
                ? 'A correction cannot be dated in the future'
                : value >= account.openedOn ||
                  !!onBeforeStart ||
                  "This date is before the account's opening date",
          }}
        />
        <p className="text-sm text-ink-muted">
          {debt
            ? 'Enter what was owed at the end of that day.'
            : 'Enter what the Balance was at the end of that day.'}{' '}
          You will review the change before it is saved.
        </p>
        <div className="flex gap-2">
          <Button type="submit">Review</Button>
          <Button variant="ghost" onClick={() => onDone()}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  )
}

function Item({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-caption text-ink-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}
