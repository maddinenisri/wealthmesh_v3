import { useState } from 'react'
import type { Account } from '../../api/accounts'
import type { Member } from '../../api/household'
import type { ValueRow } from '../../api/values'
import { Badge, Button, Card, CardTitle, Table, Td, Th } from '../../design-system'
import { useToday } from '../../hooks/useAccounts'
import { useValueHistory } from '../../hooks/useValues'
import { formatMoney } from '../../lib/money'
import { useReturnFocus } from '../activity/useReturnFocus'
import { ExtendStart } from './ExtendStart'
import { ValueChange } from './ValueChange'
import { ValueForm } from './ValueForm'

type Draft = { amount: string; valueOn: string; reason: string }

type Panel =
  | { kind: 'new'; draft?: Draft }
  | { kind: 'plan' }
  | { kind: 'extend'; draft: Draft }
  | { kind: 'correct' | 'remove' | 'undo'; row: ValueRow }

const STATUS: Record<ValueRow['status'], string> = {
  current: 'Current',
  earlier: 'Earlier value',
  replaced: 'Replaced by a correction',
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
}: {
  account: Account
  members: Member[] | undefined
}) {
  const history = useValueHistory(account.id)
  const today = useToday()
  const [panel, setPanel] = useState<Panel | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const returnFocus = useReturnFocus(panel !== null)
  const ready = !panel && !!today.data && !!members
  // Archived: no new value, history still editable. Closed: nothing changes until it is reopened (slice 12).
  const canAdd = ready && account.status === 'active'
  const canChange = ready && account.status !== 'closed'

  const finish = (message?: string) => {
    setPanel(null)
    if (message) {
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
            Value history
          </CardTitle>
          {account.status === 'active' && (
            <div className="flex flex-wrap gap-2">
              <Button disabled={!canAdd} onClick={() => open({ kind: 'new' })}>
                Record new value
              </Button>
              <Button variant="secondary" disabled={!canAdd} onClick={() => open({ kind: 'plan' })}>
                Plan a future value
              </Button>
            </div>
          )}
        </div>
        {notice && (
          <p role="status" className="mt-3 max-w-prose text-sm">
            {notice}
          </p>
        )}
        {account.status !== 'active' && (
          <p className="mt-3 max-w-prose text-sm text-ink-muted">
            {account.status === 'archived'
              ? 'This account is archived. Restore it to record a new value; earlier values can still be corrected or removed.'
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
                  <Td>{row.valueOn}</Td>
                  <Td>
                    <span className="normal-nums">{formatMoney(Number(row.amount))}</span>{' '}
                    <Badge>{STATUS[row.status]}</Badge>
                  </Td>
                  <Td className="text-sm text-ink-muted">
                    {row.initial
                      ? 'Initial value'
                      : [
                          row.reason,
                          row.enteredBy && `Entered by ${row.enteredBy}`,
                          row.removedBy && `Removed by ${row.removedBy}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                  </Td>
                  <Td>
                    <RowActions row={row} disabled={!canChange} onOpen={open} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
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
