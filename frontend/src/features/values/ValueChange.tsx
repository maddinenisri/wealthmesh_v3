import type { Account } from '../../api/accounts'
import type { Member } from '../../api/household'
import type { ValueRow } from '../../api/values'
import { Dated } from './Dated'
import { Button, Card, CardTitle, FormAlert } from '../../design-system'
import { useEnteringAs } from '../../hooks/useEnteringAs'
import { useChangeValue, useRemovalReview } from '../../hooks/useValues'
import { formatMoney } from '../../lib/money'
import { isDebt } from '../accounts/accountTypes'
import { balanceText } from '../accounts/cardBalance'
import { EnteredBy } from '../activity/EnteredBy'
import { Panel } from '../activity/Panel'

/**
 * Review before removing a value, or before bringing a removed one back (Undo). Nothing changes until the confirm
 * button; Cancel leaves everything as it was. The removed value stays in history.
 */
export function ValueChange({
  mode,
  account,
  row,
  members,
  onDone,
}: {
  mode: 'remove' | 'undo'
  account: Account
  row: ValueRow
  members: Member[]
  /** Called with a sentence saying what changed, or nothing when cancelled. */
  onDone: (message?: string) => void
}) {
  const { member, setMemberId } = useEnteringAs(members)
  const removal = useRemovalReview(account.id, row.id ?? '', mode === 'remove')
  const change = useChangeValue(account.id, row.id ?? '')
  const what = `${balanceText(account.type, row.amount)} dated ${row.valueOn}`
  const plan = row.planned

  return (
    <Panel>
      <Card aria-labelledby="value-change-heading">
        <CardTitle id="value-change-heading" className="text-lg">
          {mode === 'remove' ? 'Review removal' : 'Review Undo'}
        </CardTitle>
        <FormAlert message={change.error?.message ?? removal.error?.message} />
        <p className="mt-3 max-w-md">
          {mode === 'remove'
            ? `Remove the ${plan ? 'plan' : 'value'} ${what}.`
            : `Bring back the ${plan ? 'plan' : 'value'} ${what}.`}
        </p>
        {mode === 'remove' && removal.data && !plan && (
          <p className="mt-2 max-w-md text-sm">
            The latest effective value will return to{' '}
            {formatMoney(Number(removal.data.balanceAfter))}, dated{' '}
            <Dated on={removal.data.balanceAfterOn} />.
          </p>
        )}
        <p className="mt-2 max-w-md text-sm text-ink-muted">
          {mode === 'remove'
            ? `The ${plan ? 'plan' : 'value'} stays in history, where Undo restores it. No cash or spending changes.`
            : plan
              ? `It returns as a plan. A plan is never counted in the ${isDebt(account.type) ? 'Balance owed' : 'value'}, wealth or any past date.`
              : 'It returns under its original date. The value with the latest date is the one that counts.'}
        </p>
        <EnteredBy members={members} member={member} setMemberId={setMemberId} />
        <div className="mt-4 flex gap-2">
          <Button
            disabled={change.isPending || !member || (mode === 'remove' && !removal.data)}
            onClick={() =>
              member &&
              change.mutate(
                { action: mode === 'remove' ? 'removal' : 'undo', memberId: member.id },
                {
                  onSuccess: (result) =>
                    onDone(
                      mode === 'remove'
                        ? plan
                          ? `Removed the plan ${what}.`
                          : `Removed ${what}. ${account.name} value is ${formatMoney(Number(result.balanceAfter))}, dated ${result.balanceAfterOn}.`
                        : plan
                          ? `Restored the plan ${what}.`
                          : `Restored ${what}. ${account.name} value is ${formatMoney(Number(result.balanceAfter))}, dated ${result.balanceAfterOn}.`,
                    ),
                },
              )
            }
          >
            {change.isPending ? 'Saving' : mode === 'remove' ? 'Confirm removal' : 'Confirm Undo'}
          </Button>
          <Button variant="ghost" onClick={() => onDone()} disabled={change.isPending}>
            Cancel
          </Button>
        </div>
      </Card>
    </Panel>
  )
}
