import { Fragment } from 'react'
import type { HistoryEntry } from '../../api/activity'
import { Amount, Button, Table, Td, Th } from '../../design-system'
import { useAccountHistory } from '../../hooks/useActivity'
import { useOpeningRevisions } from '../../hooks/useStartingBalance'
import { formatMoney } from '../../lib/money'
import { BalanceFigure } from '../accounts/BalanceFigure'
import { PortionList } from './PortionList'
import { shownAmount } from './signedAmount'
import { isMovement, movementName } from './transferRows'

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
  opening?: { amount: string; on: string; type?: string }
  /** Starts bringing a removed entry back; left out while another form is open. */
  onUndo?: (entry: HistoryEntry) => void
}) {
  const history = useAccountHistory(accountId, true)
  const revisions = useOpeningRevisions(accountId)

  if (history.isPending) return <p className="text-sm text-ink-muted">Loading history</p>
  if (history.isError) return <p role="alert">{history.error.message}</p>
  // Until the corrections are known the account's current opening could be a corrected figure, not the original.
  if (revisions.isError) return <p role="alert">{revisions.error.message}</p>
  if (revisions.isPending) return <p className="text-sm text-ink-muted">Loading history</p>
  const corrections = revisions.data ?? []
  // The Initial Balance row shows the original start; each correction of it follows, and only the last counts.
  // Newest first, as the other rows are; the row above an older one is what replaced it.
  const reversed = [...corrections].reverse()
  const laterBy = (replacement: { enteredByName: string; createdAt: string }) =>
    `${replacement.enteredByName} ${stamp(replacement.createdAt)}`
  const original =
    corrections.length > 0
      ? { amount: corrections[0].previousAmount, on: corrections[0].previousOn }
      : opening
  if (history.data.length === 0 && !original) {
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
            <Th className="hidden lg:table-cell">Category</Th>
            <Th className="text-right">Amount</Th>
            <Th>Status</Th>
            <Th>Saved by</Th>
            <Th className="hidden lg:table-cell">Reason</Th>
            <Th>
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {history.data.map((entry) => (
            <Fragment key={entry.id}>
              <tr>
                <Td className="whitespace-nowrap">{entry.occurredOn}</Td>
                <Td>
                  {entry.kind === 'correction'
                    ? 'Balance correction'
                    : isMovement(entry)
                      ? movementName(entry).replace(/^./, (letter) => letter.toUpperCase())
                      : (entry.description ?? (entry.portions.length > 0 ? 'Split expense' : ''))}
                  {entry.portions.length > 0 ? (
                    <span className="block lg:hidden">
                      <span className="block text-caption text-ink-muted">Split</span>
                      <PortionList portions={entry.portions} />
                    </span>
                  ) : (
                    entry.categoryName && (
                      <span className="block text-caption text-ink-muted lg:hidden">
                        {entry.categoryName}
                      </span>
                    )
                  )}
                </Td>
                <Td className="hidden lg:table-cell">
                  {entry.portions.length > 0 ? (
                    <>
                      Split
                      <PortionList portions={entry.portions} />
                    </>
                  ) : (
                    (entry.categoryName ?? '')
                  )}
                </Td>
                <Td className="text-right whitespace-nowrap">
                  <Amount value={shownAmount(entry, opening?.type)} />
                </Td>
                <Td>
                  {STATUS[entry.status]}
                  {entry.replacedBy && entry.replacedBy.accountId !== accountId && (
                    <span className="block text-caption text-ink-muted [overflow-wrap:anywhere]">
                      Moved to {entry.replacedBy.accountName}
                    </span>
                  )}
                  {entry.kind === 'expense' && entry.replacedBy?.kind === 'transfer_out' && (
                    <span className="block text-caption text-ink-muted">Changed to a transfer</span>
                  )}
                  {entry.kind === 'transfer_out' && entry.replaces?.kind === 'expense' && (
                    <span className="block text-caption text-ink-muted [overflow-wrap:anywhere]">
                      Was recorded as{' '}
                      {entry.replaces.split
                        ? 'a split expense'
                        : (entry.replaces.categoryName ?? 'an expense')}
                    </span>
                  )}
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
                  {entry.reason && (
                    <div className="text-caption text-ink-muted [overflow-wrap:anywhere] lg:hidden">
                      Reason: {entry.reason}
                    </div>
                  )}
                </Td>
                <Td className="hidden lg:table-cell">{entry.reason ?? ''}</Td>
                <Td>
                  {entry.status === 'removed' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Undo ${
                        entry.movementId
                          ? movementName(entry)
                          : (entry.description ??
                            (entry.portions.length > 0 ? 'split expense' : entry.categoryName) ??
                            'entry')
                      }`}
                      disabled={!onUndo}
                      onClick={() => onUndo?.(entry)}
                    >
                      Undo
                    </Button>
                  )}
                </Td>
              </tr>
              {entry.replaces && entry.replaces.accountId !== accountId && (
                // A note about the other account is long, so it takes the full width under its row.
                <tr>
                  <Td colSpan={8} className="text-caption text-ink-muted [overflow-wrap:anywhere]">
                    Replaced {formatMoney(Number(entry.replaces.amount))}{' '}
                    {entry.replaces.split
                      ? 'split expense'
                      : (entry.replaces.categoryName ?? 'entry')}{' '}
                    on {entry.replaces.accountName}, dated {entry.replaces.occurredOn}, saved by{' '}
                    {entry.replaces.enteredByName ?? 'nobody'} {stamp(entry.replaces.at)}
                  </Td>
                </tr>
              )}
            </Fragment>
          ))}
          {reversed.map((correction, index) => (
            <tr key={correction.id}>
              <Td className="whitespace-nowrap">{correction.openedOn}</Td>
              <Td>
                {correction.openedOn === correction.previousOn
                  ? 'Starting balance correction'
                  : 'Tracking start moved'}
                {correction.openedOn !== correction.previousOn && (
                  <span className="block text-caption text-ink-muted">
                    from {correction.previousOn}
                  </span>
                )}
              </Td>
              <Td className="hidden lg:table-cell" />
              <Td className="text-right whitespace-nowrap">
                <Amount value={Number(correction.openingAmount)} />
              </Td>
              <Td>
                {index === 0 ? 'Effective' : 'Replaced'}
                {index > 0 && (
                  <span className="block text-caption text-ink-muted">
                    Replaced by {laterBy(reversed[index - 1])}
                  </span>
                )}
              </Td>
              <Td>
                {correction.enteredByName}
                <div className="text-caption text-ink-muted">{stamp(correction.createdAt)}</div>
                <div className="text-caption text-ink-muted [overflow-wrap:anywhere] lg:hidden">
                  Reason: {correction.reason}
                </div>
              </Td>
              <Td className="hidden lg:table-cell">{correction.reason}</Td>
              <Td />
            </tr>
          ))}
          {original && (
            <tr>
              <Td className="whitespace-nowrap">{original.on}</Td>
              <Td>Initial Balance</Td>
              <Td className="hidden lg:table-cell" />
              <Td className="text-right whitespace-nowrap">
                <BalanceFigure
                  type={opening?.type ?? 'checking'}
                  amount={original.amount}
                  overdraft={false}
                />
              </Td>
              <Td>
                {corrections.length > 0 ? 'Replaced' : 'Effective'}
                {corrections.length > 0 && (
                  <span className="block text-caption text-ink-muted">
                    Replaced by {laterBy(corrections[0])}
                  </span>
                )}
              </Td>
              <Td />
              <Td className="hidden lg:table-cell" />
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
