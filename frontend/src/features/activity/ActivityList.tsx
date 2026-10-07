import { useState } from 'react'
import type { Activity, HistoryEntry } from '../../api/activity'
import type { Member } from '../../api/household'
import { Link } from 'react-router'
import { Amount, Button, Table, Td, Th } from '../../design-system'
import { formatMoney } from '../../lib/money'
import { useAccountActivity } from '../../hooks/useActivity'
import { ownerNames } from '../accounts/ownerNames'
import { EntryHistory } from './EntryHistory'
import { PortionList } from './PortionList'
import { useRecurringPayments } from '../../hooks/useRecurring'
import { classText } from './classes'
import { isDebt } from '../accounts/accountTypes'
import { loanChangeText } from '../loans/loanWords'
import { shownAmount } from './signedAmount'
import { givesMoney, isMovement, movementWord, rowName } from './transferRows'

/** Saved activity of one account, newest first. Income shows as money in, expenses as money out. */
export function ActivityList({
  accountId,
  accountType,
  opening,
  members,
  onEdit,
  onEditCorrection,
  onRemove,
  onUndo,
  lockedBy,
}: {
  accountId: string
  accountType?: string
  opening?: { amount: string; on: string; type?: string }
  members: Member[] | undefined
  /** Starts correcting one entry; left out while another form is open. */
  onEdit?: (entry: Activity) => void
  /** Starts correcting a Balance correction (it is edited as a Balance, not as money in or out). */
  onEditCorrection?: (entry: Activity) => void
  onRemove?: (entry: Activity) => void
  /** Starts bringing a removed entry back from the history table. */
  onUndo?: (entry: HistoryEntry) => void
  /** Why an entry cannot change because the other account it touches is closed; the buttons stay off with that reason. */
  lockedBy?: (counterAccountId: string | null) => string | undefined
}) {
  const activity = useAccountActivity(accountId)
  const payments = useRecurringPayments(accountId)
  const [showHistory, setShowHistory] = useState(false)

  if (activity.isPending) return <p className="text-sm text-ink-muted">Loading activity</p>
  if (activity.isError) return <p role="alert">{activity.error.message}</p>
  return (
    <>
      {activity.data.length === 0 ? (
        <p className="mb-4 mt-1 text-sm text-ink-muted">
          {isDebt(accountType ?? '')
            ? 'No payments have been recorded yet.'
            : 'No money activity has been recorded yet.'}
        </p>
      ) : (
        <div className="mb-4 mt-3 overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Description</Th>
                <Th>Category</Th>
                <Th className="hidden lg:table-cell">Entered by</Th>
                <Th className="text-right">Amount</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {activity.data.map((entry) => (
                <tr key={entry.id}>
                  <Td className="whitespace-nowrap">{entry.occurredOn}</Td>
                  <Td>
                    {entry.kind === 'correction' ? (
                      `Balance correction${entry.reason ? `: ${entry.reason}` : ''}`
                    ) : isMovement(entry) ? (
                      <TransferLabel entry={entry} />
                    ) : (
                      (entry.description ?? <span className="text-ink-muted">No description</span>)
                    )}
                    <span className="block text-caption text-ink-muted lg:hidden">
                      {entry.enteredByMemberId
                        ? `by ${ownerNames([entry.enteredByMemberId], members)}`
                        : ''}
                    </span>
                  </Td>
                  <Td>
                    {entry.kind === 'loan_payment_in' ? (
                      'Principal'
                    ) : entry.kind === 'loan_payment' ? (
                      <>
                        {entry.portions.length > 0 ? 'Includes interest' : 'No interest'}
                        <PortionList portions={entry.portions} />
                      </>
                    ) : entry.portions.length > 0 ? (
                      <>
                        Split
                        <PortionList portions={entry.portions} />
                      </>
                    ) : (
                      <>
                        {entry.categoryName ??
                          (entry.kind === 'expense' || entry.kind === 'refund'
                            ? 'Uncategorized'
                            : '')}
                        {entry.categoryArchived && (
                          <span className="block text-caption text-ink-muted">
                            Archived category
                          </span>
                        )}
                        {entry.kind === 'expense' && !entry.categoryId && (
                          <span className="block text-caption text-ink-muted">
                            Needs a category
                          </span>
                        )}
                        {(entry.kind === 'expense' || entry.kind === 'refund') && (
                          <span className="block text-caption text-ink-muted">
                            {classText(entry.classification)}
                          </span>
                        )}
                        {payments.data
                          ?.filter((payment) => payment.activityId === entry.id)
                          .map((payment) => (
                            <span
                              key={payment.scheduleId}
                              className="block text-caption text-ink-muted"
                            >
                              Recurring bill: {payment.description}, occurrence {payment.dueOn}
                            </span>
                          ))}
                      </>
                    )}
                  </Td>
                  <Td className="hidden lg:table-cell">
                    {entry.enteredByMemberId ? ownerNames([entry.enteredByMemberId], members) : ''}
                  </Td>
                  <Td className="text-right whitespace-nowrap">
                    {isDebt(accountType ?? '') ? (
                      loanChangeText(entry)
                    ) : (
                      <Amount value={shownAmount(entry, accountType)} />
                    )}
                    {entry.kind === 'refund' && (
                      <span className="block text-caption text-ink-muted">Refund</span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {entry.kind === 'correction' ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Edit correction of ${entry.occurredOn}`}
                          disabled={!onEditCorrection}
                          onClick={() => onEditCorrection?.(entry)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Remove correction of ${entry.occurredOn}`}
                          disabled={!onRemove}
                          onClick={() => onRemove?.(entry)}
                        >
                          Remove
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Edit ${rowName(entry)}`}
                          disabled={!onEdit || !!lockedBy?.(entry.counterAccountId)}
                          title={lockedBy?.(entry.counterAccountId)}
                          onClick={() => onEdit?.(entry)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Remove ${rowName(entry)}`}
                          disabled={!onRemove || !!lockedBy?.(entry.counterAccountId)}
                          title={lockedBy?.(entry.counterAccountId)}
                          onClick={() => onRemove?.(entry)}
                        >
                          Remove
                        </Button>
                      </>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
      <div className="mb-4">
        <Button variant="ghost" size="sm" onClick={() => setShowHistory((open) => !open)}>
          {showHistory ? 'Hide history' : 'Show history'}
        </Button>
        {showHistory && (
          <EntryHistory
            accountId={accountId}
            opening={opening}
            onUndo={onUndo}
            lockedBy={lockedBy}
          />
        )}
      </div>
    </>
  )
}

/** "Transfer to Emergency Savings": the other account opens from here, so both sides are one click apart. */
function TransferLabel({ entry }: { entry: Activity }) {
  return (
    <span className="[overflow-wrap:anywhere]">
      {movementWord(entry) === 'payment' ? 'Payment' : 'Transfer'}{' '}
      {givesMoney(entry) ? 'to' : 'from'}{' '}
      {entry.counterAccountId ? (
        <Link
          to={`/accounts/${entry.counterAccountId}`}
          className="font-medium underline-offset-2 hover:underline"
        >
          {entry.counterAccountName}
        </Link>
      ) : (
        entry.counterAccountName
      )}
      {entry.paymentTotal && (
        <span className="block text-caption text-ink-muted">
          Part of a {formatMoney(Number(entry.paymentTotal))} payment,{' '}
          {formatMoney(Number(entry.paymentInterest ?? 0))} of it interest
        </span>
      )}
      {entry.description ? (
        <span className="block text-caption text-ink-muted">{entry.description}</span>
      ) : null}
    </span>
  )
}
