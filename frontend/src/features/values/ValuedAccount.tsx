import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import type { Account } from '../../api/accounts'
import type { Member } from '../../api/household'
import type { ValueEvent, ValueRow } from '../../api/values'
import { Badge, Button, Card, CardTitle, Table, Td, Th } from '../../design-system'
import { useToday } from '../../hooks/useAccounts'
import { useValueHistory } from '../../hooks/useValues'
import { formatMoney } from '../../lib/money'
import { typeTraits } from '../accounts/accountTypes'
import { useReturnFocus } from '../activity/useReturnFocus'
import { Stamped } from './Dated'
import { ExtendStart } from './ExtendStart'
import { ValueChange } from './ValueChange'
import { ValueForm } from './ValueForm'
import { withDates } from './withDates'

type Draft = { amount: string; valueOn: string; reason: string }

type Panel =
  | { kind: 'new'; draft?: Draft }
  | { kind: 'plan' }
  | { kind: 'extend'; draft: Draft }
  | { kind: 'correct' | 'remove' | 'undo'; row: ValueRow }

const STATUS: Record<ValueRow['status'], string> = {
  current: 'Current',
  earlier: 'Earlier value',
  replaced: 'Replaced',
  removed: 'Removed',
  planned: 'Plan',
}

/**
 * What a property or other asset shows in place of money activity (T3): its dated values, with Record new value,
 * a future plan, correct, remove and Undo. A valued account holds no activity, so there are no money buttons.
 */
export function ValuedAccount({
  account,
  members,
  onActivity,
}: {
  account: Account
  members: Member[] | undefined
  /** Called when a panel opens or ends with a sentence, so the status card drops its own sentence. */
  onActivity?: () => void
}) {
  const history = useValueHistory(account.id)
  const today = useToday()
  const [panel, setPanel] = useState<Panel | null>(null)
  // The status line belongs to the account's state when it was written; a change of state (Archive, Close, Restore,
  // Reopen) makes it stale, so it is not shown.
  // A page reached from setting the account up carries a sentence for the person to read first.
  const arrived = (useLocation().state as { notice?: string } | null)?.notice
  const [saved, setSaved] = useState<{ message: string; status: string } | null>(
    arrived ? { message: arrived, status: account.status } : null,
  )
  const arrivedRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (arrived) {
      arrivedRef.current?.focus()
      // A long name pushes the sentence below the fold: bring it into view where focus lands.
      arrivedRef.current?.scrollIntoView?.({ block: 'center' })
    }
    // Once, when the page opens with a sentence.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const plan = typeTraits(account.type).plan
  const notice = saved?.status === account.status ? saved.message : null
  const setNotice = (message: string | null) =>
    setSaved(message === null ? null : { message, status: account.status })
  const returnFocus = useReturnFocus(panel !== null)
  const ready = !panel && !!today.data && !!members
  // Archived: no new value, history still editable. Closed: nothing changes until it is reopened (slice 12).
  const canAdd = ready && account.status === 'active'
  const canChange = ready && account.status !== 'closed'

  const finish = (message?: string) => {
    setPanel(null)
    if (message) {
      onActivity?.()
      returnFocus.cancel()
      setNotice(message)
      requestAnimationFrame(() => {
        const heading = document.getElementById('values-heading')
        heading?.scrollIntoView?.({ block: 'start' })
        heading?.focus({ preventScroll: true })
      })
    }
  }
  const open = (next: Panel) => {
    onActivity?.()
    setNotice(null)
    returnFocus()
    setPanel(next)
  }

  return (
    <>
      {panel && today.data && members && (
        <div key={'row' in panel ? `${panel.kind}-${panel.row.id}` : panel.kind}>
          {(panel.kind === 'new' || panel.kind === 'plan') && (
            <ValueForm
              account={account}
              members={members}
              today={today.data}
              mode={panel.kind}
              initial={panel.kind === 'new' ? panel.draft : undefined}
              onBeforeStart={(draft) => setPanel({ kind: 'extend', draft })}
              onDone={finish}
            />
          )}
          {panel.kind === 'extend' && (
            <ExtendStart
              account={account}
              members={members}
              draft={panel.draft}
              onBack={(draft) => setPanel({ kind: 'new', draft })}
              onDone={finish}
            />
          )}
          {panel.kind === 'correct' && (
            <ValueForm
              account={account}
              members={members}
              today={today.data}
              mode="correct"
              editing={panel.row}
              onDone={finish}
            />
          )}
          {(panel.kind === 'remove' || panel.kind === 'undo') && (
            <ValueChange
              mode={panel.kind}
              account={account}
              row={panel.row}
              members={members}
              onDone={finish}
            />
          )}
        </div>
      )}
      <Card aria-labelledby="values-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle id="values-heading" tabIndex={-1} className="text-lg outline-none">
            {plan ? 'Plan statements' : 'Value history'}
          </CardTitle>
          {account.status === 'active' && (
            <div className="flex flex-wrap gap-2">
              <Button disabled={!canAdd} onClick={() => open({ kind: 'new' })}>
                {plan ? 'Record plan statement' : 'Record new value'}
              </Button>
              {!plan && (
                <Button
                  variant="secondary"
                  disabled={!canAdd}
                  onClick={() => open({ kind: 'plan' })}
                >
                  Plan a future value
                </Button>
              )}
            </div>
          )}
        </div>
        {notice && (
          <p
            ref={arrivedRef}
            role="status"
            tabIndex={-1}
            className="mt-3 max-w-prose text-sm outline-none"
          >
            {plan ? withDates(notice) : notice}
          </p>
        )}
        {account.status !== 'active' && (
          <p className="mt-3 max-w-prose text-sm text-ink-muted">
            {account.status === 'archived'
              ? plan
                ? 'This account is archived. Restore it to record a new statement; earlier statements can still be corrected or removed.'
                : 'This account is archived. Restore it to record a new value; earlier values can still be corrected or removed.'
              : 'This account is closed. Reopen it to record or change a value.'}
          </p>
        )}
        {history.isPending && <p className="mt-3 text-ink-muted">Loading values</p>}
        {history.isError && (
          <p role="alert" className="mt-3 text-sm">
            {history.error.message}
          </p>
        )}
        {history.data && (
          <Table className="mt-3">
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Value</Th>
                <Th>Details</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {history.data.values.map((row) => (
                <tr key={row.id ?? 'initial'}>
                  <Td className="whitespace-nowrap">{row.valueOn}</Td>
                  <Td>
                    <span className="normal-nums">{formatMoney(Number(row.amount))}</span>{' '}
                    <Badge>{STATUS[row.status]}</Badge>
                  </Td>
                  <Td className="text-sm text-ink-muted">
                    {row.initial || row.reason === SYSTEM_ROW ? (
                      // The system row is dated as old as the account: its who and when are in the Changes list.
                      (row.reason ?? 'Initial value')
                    ) : (
                      <Details row={row} />
                    )}
                  </Td>
                  <Td>
                    <RowActions row={row} disabled={!canChange} onOpen={open} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {history.data && history.data.events.length > 0 && (
          <section className="mt-4" aria-labelledby="value-changes-heading">
            <h3 id="value-changes-heading" className="text-sm font-medium">
              Changes
            </h3>
            <ul aria-label="Changes" className="mt-1 flex flex-col gap-1 text-sm text-ink-muted">
              {history.data.events.map((event) => (
                <li key={`${event.at}-${event.action}-${event.valueOn}-${event.amount}`}>
                  {changeText(event)} · {event.byName}, <Stamped at={event.at} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </Card>
    </>
  )
}

const ACTION_LABEL: Record<string, string> = {
  saved: 'Saved',
  planned: 'Planned',
  removed: 'Removed',
  restored: 'Restored',
}

/** One change in words: what was done to which value, or the sentence the server kept (a correction, a new start). */
function changeText(event: ValueEvent): ReactNode {
  if (event.action === 'start_moved' || event.action === 'corrected')
    return withDates(event.detail ?? event.action)
  const what =
    event.amount !== null ? ` ${formatMoney(Number(event.amount))} dated ${event.valueOn}` : ''
  return withDates(`${ACTION_LABEL[event.action] ?? event.action}${what}`)
}

/** The reason of the value the system writes when a start moves earlier. */
const SYSTEM_ROW = 'Value when tracking began'

/** Reason, who and when, and who removed it, with the time kept whole. */
function Details({ row }: { row: ValueRow }) {
  const parts = [
    row.payCredit !== null &&
      row.interestCredit !== null &&
      `Pay credit ${formatMoney(Number(row.payCredit))}, benefit interest ${formatMoney(Number(row.interestCredit))}`,
    row.reason,
    row.enteredBy && (
      <>
        Entered by {row.enteredBy} on <Stamped at={row.createdAt} />
      </>
    ),
    row.removedBy && `Removed by ${row.removedBy}`,
  ].filter(Boolean)
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 && ' · '}
          {part}
        </Fragment>
      ))}
    </>
  )
}

function RowActions({
  row,
  disabled,
  onOpen,
}: {
  row: ValueRow
  disabled: boolean
  onOpen: (panel: Panel) => void
}) {
  if (row.initial || row.status === 'replaced') return null
  const name = `${formatMoney(Number(row.amount))} dated ${row.valueOn}`
  return (
    <div className="flex flex-wrap gap-1">
      {(row.status === 'current' || row.status === 'earlier') && (
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled}
          aria-label={`Correct ${name}`}
          onClick={() => onOpen({ kind: 'correct', row })}
        >
          Correct
        </Button>
      )}
      {row.status !== 'removed' && (
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          aria-label={`Remove ${name}`}
          onClick={() => onOpen({ kind: 'remove', row })}
        >
          Remove
        </Button>
      )}
      {row.status === 'removed' && (
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled}
          aria-label={`Undo removal of ${name}`}
          onClick={() => onOpen({ kind: 'undo', row })}
        >
          Undo
        </Button>
      )}
    </div>
  )
}
