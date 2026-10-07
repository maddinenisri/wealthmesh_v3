import type { Account } from '../../api/accounts'
import type { Portion } from '../../api/activity'
import type { Member } from '../../api/household'
import { Button, Card, CardTitle, FormAlert } from '../../design-system'
import { useChangeEntry, useIncome, useSpending } from '../../hooks/useActivity'
import { useEnteringAs } from '../../hooks/useEnteringAs'
import { formatMoney } from '../../lib/money'
import { isDebt } from '../accounts/accountTypes'
import { balanceText } from '../accounts/cardBalance'
import { useRecurringPayments } from '../../hooks/useRecurring'
import { EnteredBy } from './EnteredBy'
import { PortionList } from './PortionList'

/** The part of an entry the review shows; both the activity list and history rows fit it. */
export type ChangeTarget = {
  id: string
  kind: string
  amount: string
  occurredOn: string
  description: string | null
  categoryName: string | null
  /** The portions of a split expense; both are removed and restored with the payment. */
  portions?: Portion[]
}

const MONTHS = [
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

/**
 * Review before removing an entry, or before bringing a removed one back (Undo). Nothing changes until
 * the confirm button; Cancel leaves everything as it was.
 */
export function ChangeEntry({
  mode,
  account,
  entry,
  members,
  onDone,
  onChanged,
}: {
  mode: 'remove' | 'undo'
  account: Account
  entry: ChangeTarget
  members: Member[]
  onDone: () => void
  /** Called after the change is saved, with a sentence saying what changed. */
  onChanged?: (message: string) => void
}) {
  const split = !!entry.portions && entry.portions.length > 0
  const income = entry.kind === 'income'
  // A Balance correction (a loan's, D-053) changes the Balance only: no month figure, never income or spending.
  const correction = entry.kind === 'correction'
  // A refund raises the Balance like money in, and lowers the month's spending instead of raising it.
  const refund = entry.kind === 'refund'
  const month = entry.occurredOn.slice(0, 7)
  const spending = useSpending(income || correction ? '' : month)
  const incomeTotal = useIncome(income ? month : '')
  const monthTotal = income ? incomeTotal : spending
  const change = useChangeEntry(account.id, entry.id, mode === 'remove' ? 'removal' : 'undo')
  const { member, setMemberId } = useEnteringAs(members)
  const paid = useRecurringPayments(account.id).data?.find((p) => p.activityId === entry.id)

  // Money in raises the Balance and the month's income; money out lowers the Balance and counts as spending.
  // A correction is a signed row: it carries its own direction.
  const effect = correction
    ? Number(entry.amount) * (mode === 'remove' ? -1 : 1)
    : (income || refund ? 1 : -1) * Number(entry.amount) * (mode === 'remove' ? -1 : 1)
  const balanceAfter = Number(account.balance.amount) + effect
  const monthAfter = monthTotal.data
    ? Number(monthTotal.data.total) +
      Number(entry.amount) * (mode === 'remove' ? -1 : 1) * (refund ? -1 : 1)
    : null
  const label = `${MONTHS[Number(month.slice(5)) - 1]} ${income ? 'Income' : 'spending'} after ${mode === 'remove' ? 'removal' : 'Undo'}`
  const title = mode === 'remove' ? 'Review removal' : 'Review Undo'

  return (
    <Card aria-labelledby="change-heading">
      <CardTitle id="change-heading" className="text-lg">
        {title}
      </CardTitle>
      <FormAlert message={change.error?.message} />
      <dl className="mt-3 grid max-w-md gap-x-8 gap-y-3 sm:grid-cols-2">
        <Item label="Entry">
          {correction
            ? 'Balance correction'
            : split
              ? entry.description
                ? `${entry.description} (split)`
                : 'Split expense'
              : `${entry.description || entry.categoryName} (${entry.categoryName})`}
        </Item>
        {entry.portions && entry.portions.length > 0 && (
          <Item label="Portions">
            <PortionList portions={entry.portions} />
          </Item>
        )}
        <Item label="Date">{entry.occurredOn}</Item>
        <Item label="Amount">{formatMoney(Number(entry.amount))}</Item>
        <Item
          label={`${account.name} ${isDebt(account.type) ? 'Balance owed' : 'Balance'} after ${mode === 'remove' ? 'removal' : 'Undo'}`}
        >
          {balanceText(account.type, String(balanceAfter))}
        </Item>
        {!correction && (
          <Item label={label}>{monthAfter === null ? '' : formatMoney(monthAfter)}</Item>
        )}
      </dl>
      <p className="mt-3 max-w-md text-sm text-ink-muted">
        {correction
          ? mode === 'undo'
            ? 'The correction returns on its original date. It changes only the Balance owed.'
            : 'A correction changes only the Balance owed: it is never a payment, income or spending. It stays in history, where Undo restores it.'
          : mode === 'undo'
            ? 'The entry returns on its original date.'
            : income
              ? 'This does not reverse a bank deposit. The entry stays in history, where Undo restores it.'
              : 'Removing a tracked expense does not obtain a merchant refund. The entry stays in history, where Undo restores it.'}
      </p>
      {paid && (
        <p className="mt-2 max-w-md text-sm">
          This expense paid the {paid.dueOn} occurrence of the recurring bill {paid.description}.{' '}
          {mode === 'remove'
            ? 'Removing it leaves that occurrence marked paid, and the next due date does not move back.'
            : 'Undo brings the payment back under that occurrence.'}
        </p>
      )}
      <EnteredBy members={members} member={member} setMemberId={setMemberId} />
      <div className="mt-4 flex gap-2">
        <Button
          onClick={() =>
            member &&
            change.mutate(member.id, {
              onSuccess: () => {
                const name = entry.description || (split ? 'split expense' : entry.categoryName)
                onChanged?.(`${mode === 'remove' ? 'Removed' : 'Restored'} ${name}.`)
                onDone()
              },
            })
          }
          disabled={change.isPending || !member}
        >
          {change.isPending ? 'Saving' : mode === 'remove' ? 'Confirm removal' : 'Confirm Undo'}
        </Button>
        <Button variant="ghost" onClick={onDone} disabled={change.isPending}>
          Cancel
        </Button>
      </div>
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
