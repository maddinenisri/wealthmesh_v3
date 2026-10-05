import { useState } from 'react'
import { useForm } from 'react-hook-form'
import type { Account } from '../../api/accounts'
import type { EntryKind } from '../../api/activity'
import type { Member } from '../../api/household'
import { Button, Card, CardTitle, FormAlert, TextField } from '../../design-system'
import { useSaveHistoricalEntry } from '../../hooks/useActivity'
import { useEnteringAs } from '../../hooks/useEnteringAs'
import { useOpeningPreview } from '../../hooks/useStartingBalance'
import { formatMoney, parseAmount } from '../../lib/money'
import { MONTH_NAMES } from '../../lib/months'
import { OVERDRAFT_NOTICE } from '../accounts/Overdrawn'
import { EnteredBy } from './EnteredBy'

type Values = { start: string; amount: string; reason: string }

/** One id per form instance: a repeat of the same save carries the same id (D-024). */
const newKey = () => globalThis.crypto.randomUUID()

/** The entry that is dated before the account's tracking start, as the entry form had it. */
export type HistoricalDraft = {
  description: string
  amount: string
  occurredOn: string
  categoryId: string
  classification?: string
  categoryName: string
}

/**
 * An entry dated before tracking began is already represented in the starting amount, so it is not saved on its own:
 * review moving the tracking start earlier (with the initial Balance at that date), see the entry and the resulting
 * Balance, then confirm both together. Cancel at any step saves nothing (V2_CHECKING_016).
 */
export function HistoricalSetup({
  kind,
  account,
  members,
  entry,
  onBack,
  onDone,
}: {
  kind: Exclude<EntryKind, 'refund'>
  account: Account
  members: Member[]
  entry: HistoricalDraft
  onBack: () => void
  onDone: () => void
}) {
  const { member, setMemberId } = useEnteringAs(members)
  const [reviewing, setReviewing] = useState<{
    start: string
    amount: string
    reason: string
  } | null>(null)
  const [key] = useState(newKey)
  const save = useSaveHistoricalEntry(account.id)
  const { control, handleSubmit } = useForm<Values>({
    defaultValues: { start: entry.occurredOn, amount: '', reason: '' },
  })
  const preview = useOpeningPreview(
    account.id,
    reviewing?.amount ?? '',
    reviewing?.start ?? '',
    reviewing ? { kind, amount: entry.amount, on: entry.occurredOn } : undefined,
  )

  const confirm = () => {
    if (!reviewing || !member) return
    save.mutate(
      {
        key,
        body: {
          kind,
          entry: {
            description: entry.description,
            amount: entry.amount,
            occurredOn: entry.occurredOn,
            categoryId: entry.categoryId,
            classification: entry.classification,
            enteredByMemberId: member.id,
          },
          startRevision: {
            openingAmount: reviewing.amount,
            openedOn: reviewing.start,
            reason: reviewing.reason,
            enteredByMemberId: member.id,
          },
        },
      },
      { onSuccess: onDone },
    )
  }

  if (reviewing) {
    const figures = preview.data
    const month = MONTH_NAMES[Number(entry.occurredOn.slice(5, 7)) - 1]
    return (
      <Card aria-labelledby="historical-review-heading">
        <CardTitle id="historical-review-heading" className="text-lg">
          Review setup and expense
        </CardTitle>
        <FormAlert
          message={save.error?.message ?? (preview.isError ? preview.error.message : undefined)}
        />
        {preview.isPending && <p className="mt-3 text-sm text-ink-muted">Working out the change</p>}
        {figures && (
          <>
            <dl className="mt-3 grid max-w-md gap-x-8 gap-y-3 sm:grid-cols-2">
              <Item label={kind === 'income' ? 'Money in' : 'Money out'}>
                {entry.description || entry.categoryName || 'No category'} (
                {entry.categoryName || 'No category'}) {formatMoney(Number(entry.amount))} on{' '}
                {entry.occurredOn}
              </Item>
              <Item label="New tracking start">
                {formatMoney(Number(figures.openingAmount))} on {figures.openedOn}
                <span className="block text-caption text-ink-muted">
                  Previous start: {formatMoney(Number(figures.originalAmount))} on{' '}
                  {figures.originalOn}
                </span>
              </Item>
              <Item label="Reason">{reviewing.reason}</Item>
              <Item label="Resulting Balance">{formatMoney(Number(figures.balanceWithEntry))}</Item>
            </dl>
            <p className="mt-3 max-w-md text-sm">
              {kind === 'income'
                ? `${month} income will become ${formatMoney(Number(figures.monthIncomeAfter))}.`
                : `${month} spending will become ${formatMoney(Number(figures.monthSpendingAfter))}.`}
            </p>
            <p className="mt-2 max-w-md text-sm text-ink-muted">
              The setup and the entry are saved together, and the entry is counted once. The
              previous start and this correction stay in history. Moving the start is not income or
              spending.
            </p>
            {Number(figures.balanceWithEntry) < 0 && (
              <p
                role="alert"
                className="mt-3 max-w-md rounded-control border border-line p-3 text-sm"
              >
                This will leave {account.name} overdrawn by{' '}
                {formatMoney(Math.abs(Number(figures.balanceWithEntry)))}. {OVERDRAFT_NOTICE}
              </p>
            )}
          </>
        )}
        <EnteredBy members={members} member={member} setMemberId={setMemberId} />
        <div className="mt-4 flex gap-2">
          <Button onClick={confirm} disabled={save.isPending || !member || !figures}>
            {save.isPending ? 'Saving' : 'Confirm setup and expense'}
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
    <Card aria-labelledby="historical-heading">
      <CardTitle id="historical-heading" className="text-lg">
        Review historical setup
      </CardTitle>
      <p className="mt-2 max-w-md text-sm">
        This {kind === 'income' ? 'money in' : 'money out'} is dated {entry.occurredOn}, before
        tracking began on {account.openedOn}. It is already represented in the {account.openedOn}{' '}
        amount of {formatMoney(Number(account.openingAmount))}, so it is not saved on its own.
        Review moving the tracking start earlier: say what the account held at the new start.
      </p>
      <form
        noValidate
        className="mt-3 flex max-w-md flex-col gap-4"
        onSubmit={handleSubmit((values) =>
          setReviewing({
            start: values.start,
            amount: parseAmount(values.amount)!,
            reason: values.reason.trim(),
          }),
        )}
      >
        <TextField
          control={control}
          name="start"
          label="New tracking start"
          type="date"
          rules={{
            required: 'Enter a date',
            validate: (value) =>
              value <= entry.occurredOn || 'The new start must be on or before the entry date',
          }}
        />
        <TextField
          control={control}
          name="amount"
          label="Initial Balance at that date"
          inputMode="decimal"
          placeholder="0.00"
          rules={{ validate: (value) => parseAmount(value) !== null || 'Enter a valid amount' }}
        />
        <TextField
          control={control}
          name="reason"
          label="Reason"
          rules={{ validate: (value) => value.trim() !== '' || 'Enter a reason' }}
        />
        <div className="flex gap-2">
          <Button type="submit">Review</Button>
          <Button variant="secondary" onClick={onBack}>
            Back
          </Button>
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
