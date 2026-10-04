import type { HistoryEntry } from '../../api/activity'
import { Amount, Button, Table, Td, Th } from '../../design-system'
import { useAccountHistory } from '../../hooks/useActivity'
import { signedAmount } from './signedAmount'

const STATUS = { effective: 'Effective', replaced: 'Replaced', removed: 'Removed' } as const
const ACTION = { replaced: 'Replaced', removed: 'Removed', restored: 'Restored' } as const

/** "2026-10-04 17:50" in the viewer's time zone, the same style as every date in the app. */
function stamp(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Every saved entry of an account, including ones that were replaced or removed, newest first. */
export function EntryHistory({
  accountId,
  opening,
  onUndo,
}: {
  accountId: string
  /** The initial Balance lives on the account, not in the activity, so history shows it as its own row. */
  opening?: { amount: string; on: string }
  /** Starts bringing a removed entry back; left out while another form is open. */
  onUndo?: (entry: HistoryEntry) => void
}) {
  const history = useAccountHistory(accountId, true)

  if (history.isPending) return <p className="text-sm text-ink-muted">Loading history</p>
  if (history.isError) return <p role="alert">{history.error.message}</p>
  if (history.data.length === 0 && !opening) {
    return <p className="mt-2 text-sm text-ink-muted">Nothing has been saved yet.</p>
  }
  const replacement = (entry: HistoryEntry) =>
    history.data.find((row) => row.id === entry.replacedById)
  return (
    <div className="mt-2 overflow-x-auto">
      <Table aria-label="History">
        <thead>
          <tr>
            <Th>Date</Th>
            <Th>Description</Th>
            <Th>Category</Th>
            <Th className="text-right">Amount</Th>
            <Th>Status</Th>
            <Th>Saved by</Th>
            <Th>Reason</Th>
            <Th>
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {history.data.map((entry) => (
            <tr key={entry.id}>
              <Td className="whitespace-nowrap">{entry.occurredOn}</Td>
              <Td>
                {entry.kind === 'correction' ? 'Balance correction' : (entry.description ?? '')}
              </Td>
              <Td>{entry.categoryName ?? ''}</Td>
              <Td className="text-right whitespace-nowrap">
                <Amount value={signedAmount(entry)} />
              </Td>
              <Td>
                {STATUS[entry.status]}
                {entry.status === 'replaced' &&
                  replacement(entry)?.kind === 'expense' &&
                  entry.kind === 'correction' && (
                    <span className="block text-caption text-ink-muted">
                      Replaced by the {replacement(entry)?.categoryName ?? 'actual'} expense
                    </span>
                  )}
                <ul className="text-caption text-ink-muted">
                  {entry.events.map((event) => (
                    <li key={`${event.action}-${event.at}`}>
                      {ACTION[event.action]} by {event.byName} {stamp(event.at)}
                    </li>
                  ))}
                </ul>
              </Td>
              <Td>
                {entry.enteredByName ?? ''}
                <div className="text-caption text-ink-muted">{stamp(entry.createdAt)}</div>
              </Td>
              <Td>{entry.reason ?? ''}</Td>
              <Td>
                {entry.status === 'removed' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Undo ${entry.description ?? entry.categoryName ?? 'entry'}`}
                    disabled={!onUndo}
                    onClick={() => onUndo?.(entry)}
                  >
                    Undo
                  </Button>
                )}
              </Td>
            </tr>
          ))}
          {opening && (
            <tr>
              <Td className="whitespace-nowrap">{opening.on}</Td>
              <Td>Initial Balance</Td>
              <Td />
              <Td className="text-right whitespace-nowrap">
                <Amount value={Number(opening.amount)} />
              </Td>
              <Td>Effective</Td>
              <Td />
              <Td />
              <Td />
            </tr>
          )}
        </tbody>
      </Table>
      <p className="mt-2 max-w-prose text-caption text-ink-muted">
        &ldquo;Saved by&rdquo; is the household member chosen as entering the record. It is a note,
        not proof that this person signed in.
      </p>
    </div>
  )
}
