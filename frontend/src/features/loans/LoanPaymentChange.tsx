import { capitalNoun, debtNoun } from '../accounts/accountTypes'
import type { Account } from '../../api/accounts'
import type { Member } from '../../api/household'
import { Button, Card, CardTitle, FormAlert } from '../../design-system'
import { useAccounts } from '../../hooks/useAccounts'
import { useEnteringAs } from '../../hooks/useEnteringAs'
import { useChangeTransfer, useLoanPayment } from '../../hooks/useTransfers'
import { formatMoney } from '../../lib/money'
import { balanceText } from '../accounts/cardBalance'
import { EnteredBy } from '../activity/EnteredBy'
import type { TransferTarget } from '../transfers/TransferChange'

/**
 * Review before removing a loan payment, or before bringing a removed one back (Undo). The payment, its principal and
 * its interest change together: the paying account gets the whole payment back, the loan its principal. Nothing
 * changes until the confirm button; Cancel leaves everything as it was.
 */
export function LoanPaymentChange({
  mode,
  entry,
  members,
  onDone,
}: {
  mode: 'remove' | 'undo'
  /** The account whose page this opened from (its Balance is shown first). */
  account: Account
  entry: TransferTarget
  members: Member[]
  onDone: (message?: string) => void
}) {
  const accounts = useAccounts()
  const payment = useLoanPayment(entry.movementId ?? undefined)
  const change = useChangeTransfer(
    entry.movementId ?? '',
    mode === 'remove' ? 'removal' : 'undo',
    'loan-payments',
  )
  const { member, setMemberId } = useEnteringAs(members)
  if (payment.isPending) return <p className="text-sm text-ink-muted">Loading payment</p>
  if (payment.isError) return <p role="alert">{payment.error.message}</p>
  const paid = payment.data
  const payer = accounts.data?.find((candidate) => candidate.id === paid.from.accountId)
  const loan = accounts.data?.find((candidate) => candidate.id === paid.to.accountId)
  // Removing gives the money back: the payer rises by the payment, the loan's debt returns by the principal.
  const direction = mode === 'remove' ? 1 : -1
  const payerAfter = payer ? Number(payer.balance.amount) + direction * Number(paid.amount) : null
  const loanAfter =
    loan && paid.principal ? Number(loan.balance.amount) - direction * Number(paid.principal) : null
  const word = mode === 'remove' ? 'removal' : 'Undo'

  return (
    <Card aria-labelledby="change-heading">
      <CardTitle id="change-heading" className="text-lg">
        {mode === 'remove' ? 'Review removal' : 'Review Undo'}
      </CardTitle>
      <FormAlert message={change.error?.message} />
      <dl className="mt-3 grid max-w-md gap-x-8 gap-y-3 sm:grid-cols-2">
        <Item label="Paid from">{paid.from.accountName}</Item>
        <Item label={capitalNoun(debtNoun(loan?.type ?? ''))}>{paid.to.accountName}</Item>
        <Item label="Date">{paid.occurredOn}</Item>
        <Item label="Payment">{formatMoney(Number(paid.amount))}</Item>
        <Item label="Principal">{formatMoney(Number(paid.principal ?? 0))}</Item>
        <Item label="Interest">{formatMoney(Number(paid.interest ?? 0))}</Item>
        {payer && payerAfter !== null && (
          <Item label={`${payer.name} Balance after ${word}`}>
            {balanceText(payer.type, String(payerAfter))}
          </Item>
        )}
        {loan && loanAfter !== null && (
          <Item label={`${loan.name} Balance owed after ${word}`}>
            {balanceText(loan.type, String(loanAfter))}
          </Item>
        )}
      </dl>
      <p className="mt-3 max-w-md text-sm text-ink-muted">
        {mode === 'undo'
          ? 'Both sides of the payment, and its interest, return on their original date.'
          : 'Both sides of the payment are removed together, and its interest leaves spending. The payment stays in history, where Undo restores it.'}
      </p>
      <EnteredBy members={members} member={member} setMemberId={setMemberId} />
      <div className="mt-4 flex gap-2">
        <Button
          onClick={() =>
            member &&
            change.mutate(member.id, {
              onSuccess: () =>
                onDone(
                  `${mode === 'remove' ? 'Removed' : 'Restored'} the ${formatMoney(Number(paid.amount))} payment from ${paid.from.accountName} to ${paid.to.accountName}.`,
                ),
            })
          }
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
