import type { Account } from '../../api/accounts'
import type { Member } from '../../api/household'
import { Button, Card, CardTitle, FormAlert } from '../../design-system'
import { useAccounts } from '../../hooks/useAccounts'
import { useEnteringAs } from '../../hooks/useEnteringAs'
import { useChangeTransfer } from '../../hooks/useTransfers'
import { formatMoney } from '../../lib/money'
import { EnteredBy } from '../activity/EnteredBy'

/** The part of a transfer row the review shows; both the activity list and history rows fit it. */
export type TransferTarget = {
  movementId: string | null
  kind: string
  amount: string
  occurredOn: string
  counterAccountId: string | null
  counterAccountName: string | null
}

/**
 * Review before removing a transfer, or before bringing a removed one back (Undo). Both sides change together.
 * Nothing changes until the confirm button; Cancel leaves everything as it was.
 */
export function TransferChange({
  mode,
  account,
  entry,
  members,
  onDone,
}: {
  mode: 'remove' | 'undo'
  account: Account
  entry: TransferTarget
  members: Member[]
  onDone: (saved?: boolean) => void
}) {
  const accounts = useAccounts()
  const change = useChangeTransfer(entry.movementId ?? '', mode === 'remove' ? 'removal' : 'undo')
  const { member, setMemberId } = useEnteringAs(members)
  const outgoing = entry.kind === 'transfer_out'
  const other = accounts.data?.find((candidate) => candidate.id === entry.counterAccountId)
  // Removing gives the money back to the account it left; Undo takes it out again.
  const direction = mode === 'remove' ? -1 : 1
  const amount = Number(entry.amount)
  const here = Number(account.balance.amount) + direction * (outgoing ? -amount : amount)
  const there = other
    ? Number(other.balance.amount) + direction * (outgoing ? amount : -amount)
    : null
  const word = mode === 'remove' ? 'removal' : 'Undo'

  return (
    <Card aria-labelledby="change-heading">
      <CardTitle id="change-heading" className="text-lg">
        {mode === 'remove' ? 'Review removal' : 'Review Undo'}
      </CardTitle>
      <FormAlert message={change.error?.message} />
      <dl className="mt-3 grid max-w-md gap-x-8 gap-y-3 sm:grid-cols-2">
        <Item label="From">{outgoing ? account.name : entry.counterAccountName}</Item>
        <Item label="To">{outgoing ? entry.counterAccountName : account.name}</Item>
        <Item label="Date">{entry.occurredOn}</Item>
        <Item label="Amount">{formatMoney(amount)}</Item>
        <Item label={`${account.name} Balance after ${word}`}>{formatMoney(here)}</Item>
        {other && there !== null && (
          <Item label={`${other.name} Balance after ${word}`}>{formatMoney(there)}</Item>
        )}
      </dl>
      <p className="mt-3 max-w-md text-sm text-ink-muted">
        {mode === 'undo'
          ? 'Both sides of the transfer return on their original date.'
          : 'Both sides of the transfer are removed together. The transfer stays in history, where Undo restores it.'}
      </p>
      <EnteredBy members={members} member={member} setMemberId={setMemberId} />
      <div className="mt-4 flex gap-2">
        <Button
          onClick={() => member && change.mutate(member.id, { onSuccess: () => onDone(true) })}
          disabled={change.isPending || !member}
        >
          {change.isPending ? 'Saving' : mode === 'remove' ? 'Confirm removal' : 'Confirm Undo'}
        </Button>
        <Button variant="ghost" onClick={() => onDone()} disabled={change.isPending}>
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
