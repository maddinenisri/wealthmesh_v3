import { useState } from 'react'
import type { Activity, HistoryEntry } from '../../api/activity'
import type { Member } from '../../api/household'
import { Amount, Button, Table, Td, Th } from '../../design-system'
import { useAccountActivity } from '../../hooks/useActivity'
import { ownerNames } from '../accounts/ownerNames'
import { EntryHistory } from './EntryHistory'

/** Saved activity of one account, newest first. Income shows as money in, expenses as money out. */
export function ActivityList({
  accountId,
  members,
  onEdit,
  onRemove,
  onUndo,
}: {
  accountId: string
  members: Member[] | undefined
  /** Starts correcting one entry; left out while another form is open. */
  onEdit?: (entry: Activity) => void
  onRemove?: (entry: Activity) => void
  /** Starts bringing a removed entry back from the history table. */
  onUndo?: (entry: HistoryEntry) => void
}) {
  const activity = useAccountActivity(accountId)
  const [showHistory, setShowHistory] = useState(false)

  if (activity.isPending) return <p className="text-sm text-ink-muted">Loading activity</p>
  if (activity.isError) return <p role="alert">{activity.error.message}</p>
  return (
    <>
      {activity.data.length === 0 ? (
        <p className="mb-4 mt-1 text-sm text-ink-muted">No money activity has been recorded yet.</p>
      ) : (
        <div className="mb-4 mt-3 overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Description</Th>
                <Th>Category</Th>
                <Th>Entered by</Th>
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
                  <Td>{entry.description ?? ''}</Td>
                  <Td>{entry.categoryName ?? ''}</Td>
                  <Td>
                    {entry.enteredByMemberId ? ownerNames([entry.enteredByMemberId], members) : ''}
                  </Td>
                  <Td className="text-right">
                    <Amount
                      value={entry.kind === 'income' ? Number(entry.amount) : -Number(entry.amount)}
                    />
                  </Td>
                  <Td className="whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Edit ${entry.description ?? entry.categoryName ?? 'entry'}`}
                      disabled={!onEdit}
                      onClick={() => onEdit?.(entry)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove ${entry.description ?? entry.categoryName ?? 'entry'}`}
                      disabled={!onRemove}
                      onClick={() => onRemove?.(entry)}
                    >
                      Remove
                    </Button>
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
        {showHistory && <EntryHistory accountId={accountId} onUndo={onUndo} />}
      </div>
    </>
  )
}
