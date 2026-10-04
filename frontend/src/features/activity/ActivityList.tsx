import type { Member } from '../../api/household'
import { Amount, Table, Td, Th } from '../../design-system'
import { useAccountActivity } from '../../hooks/useActivity'
import { ownerNames } from '../accounts/ownerNames'

/** Saved activity of one account, newest first. Expenses show as money out. */
export function ActivityList({
  accountId,
  members,
}: {
  accountId: string
  members: Member[] | undefined
}) {
  const activity = useAccountActivity(accountId)

  if (activity.isPending) return <p className="text-sm text-ink-muted">Loading activity</p>
  if (activity.isError) return <p role="alert">{activity.error.message}</p>
  if (activity.data.length === 0) {
    return (
      <p className="mb-4 mt-1 text-sm text-ink-muted">No money activity has been recorded yet.</p>
    )
  }
  return (
    <Table className="mb-4 mt-3">
      <thead>
        <tr>
          <Th>Date</Th>
          <Th>Description</Th>
          <Th>Category</Th>
          <Th>Entered by</Th>
          <Th className="text-right">Amount</Th>
        </tr>
      </thead>
      <tbody>
        {activity.data.map((entry) => (
          <tr key={entry.id}>
            <Td>{entry.occurredOn}</Td>
            <Td>{entry.description ?? ''}</Td>
            <Td>{entry.categoryName ?? ''}</Td>
            <Td>{entry.enteredByMemberId ? ownerNames([entry.enteredByMemberId], members) : ''}</Td>
            <Td className="text-right">
              <Amount value={-Number(entry.amount)} />
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  )
}
