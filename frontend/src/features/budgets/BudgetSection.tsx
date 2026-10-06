import { useEffect, useState } from 'react'
import type { Budget } from '../../api/budgets'
import type { Member } from '../../api/household'
import { Button, Card, CardTitle, FormAlert, Select } from '../../design-system'
import {
  useBudget,
  useBudgetMonths,
  useCopyBudget,
  useRemoveBudget,
  useUndoBudget,
} from '../../hooks/useBudgets'
import { useEnteringAs } from '../../hooks/useEnteringAs'
import { formatMoney } from '../../lib/money'
import { stamp } from '../../lib/stamp'
import { ownerNames } from '../accounts/ownerNames'
import { useAccountContext } from '../accounts/useAccountContext'
import { useStateChangeFocus } from '../accounts/useStateChangeFocus'
import { EnteredBy } from '../activity/EnteredBy'
import { Panel } from '../activity/Panel'
import { BudgetForm } from './BudgetForm'
import { BudgetLines } from './BudgetLines'
import { gapText, monthLabel, monthStatus } from './budgetText'

type Mode = 'form' | 'remove' | 'copy' | 'undo'

const ACTION_LABEL: Record<string, string> = {
  saved: 'Saved',
  copied: 'Copied',
  removed: 'Removed',
  restored: 'Brought back',
}

const newKey = () => globalThis.crypto.randomUUID()

/**
 * A month's Budget on the Spending page: the total and category targets beside the month's spending. Building,
 * changing, copying, removing and bringing one back are each reviewed first, none of them touches an expense or an
 * account Balance, and every exit says what changed and takes focus (BUDGET_001 to 007).
 */
export function BudgetSection({ month }: { month: string }) {
  const budget = useBudget(month)
  const [mode, setMode] = useState<Mode | null>(null)
  const { message, statusRef, begin, changed } = useStateChangeFocus(mode !== null)
  const { members } = useAccountContext()
  // Each Confirm says what changed and takes focus; an effect (not only a frame callback) so the status line is
  // focused once the new state has rendered, whatever the refetch did in between.
  const [confirmed, setConfirmed] = useState(0)
  useEffect(() => {
    if (confirmed === 0) return
    statusRef.current?.scrollIntoView?.({ block: 'nearest' })
    statusRef.current?.focus({ preventScroll: true })
  }, [confirmed, statusRef])
  const open = (next: Mode) => {
    begin()
    setMode(next)
  }
  const done = (text: string) => {
    setMode(null)
    changed(text)
    setConfirmed((count) => count + 1)
  }

  return (
    <Card aria-labelledby="budget-heading">
      <CardTitle id="budget-heading" className="text-lg">
        Budget
      </CardTitle>
      {message && (
        <p
          ref={statusRef}
          role="status"
          tabIndex={-1}
          className="mt-2 max-w-md rounded-control border border-line p-3 text-sm outline-none"
        >
          {message}
        </p>
      )}
      {budget.isPending && <p className="mt-3 text-sm text-ink-muted">Loading the Budget</p>}
      {budget.isError && (
        <p role="alert" className="mt-3">
          {budget.error.message}
        </p>
      )}
      {budget.data && (
        <Body
          budget={budget.data}
          month={month}
          members={members ?? []}
          mode={mode}
          open={open}
          close={() => setMode(null)}
          done={done}
        />
      )}
    </Card>
  )
}

function Body({
  budget,
  month,
  members,
  mode,
  open,
  close,
  done,
}: {
  budget: Budget
  month: string
  members: Member[]
  mode: Mode | null
  open: (mode: Mode) => void
  close: () => void
  done: (message: string) => void
}) {
  const name = monthLabel(month)
  const months = useBudgetMonths()
  const earlier = (months.data ?? []).filter((m) => m.month < month)

  return (
    <>
      {!budget.exists ? (
        <>
          <p className="mt-3">No Budget for {name}</p>
          <p className="mt-1 text-sm text-ink-muted">
            {name} spending recorded: {formatMoney(Number(budget.spending))}
          </p>
          {
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={() => open('form')}>Create Budget</Button>
              {earlier.length > 0 && (
                <Button variant="secondary" onClick={() => open('copy')}>
                  Copy{' '}
                  {monthLabel(
                    earlier
                      .map((m) => m.month)
                      .sort()
                      .at(-1)!,
                  )}{' '}
                  Budget
                </Button>
              )}
              {budget.canUndo && (
                <Button variant="secondary" onClick={() => open('undo')}>
                  Undo removing the Budget
                </Button>
              )}
            </div>
          }
        </>
      ) : (
        <>
          <p className="mt-3">
            Spending {formatMoney(Number(budget.spending))} of a {formatMoney(Number(budget.total))}{' '}
            Budget: <strong>{monthStatus(budget)}</strong>
          </p>
          <p className="mt-1 text-sm">
            Category targets total {formatMoney(Number(budget.targetTotal))}.{' '}
            {gapText(budget.unallocated ?? '0')}
          </p>
          <BudgetLines lines={budget.lines} month={month} />
          {
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={() => open('form')}>Edit Budget</Button>
              <Button variant="secondary" onClick={() => open('remove')}>
                Remove Budget
              </Button>
            </div>
          }
        </>
      )}
      {mode === 'form' && (
        <BudgetForm
          month={month}
          budget={budget}
          members={members}
          onSaved={done}
          onCancel={close}
        />
      )}
      {mode === 'remove' && (
        <RemovePanel
          month={month}
          budget={budget}
          members={members}
          onDone={done}
          onCancel={close}
        />
      )}
      {mode === 'undo' && (
        <UndoPanel month={month} budget={budget} members={members} onDone={done} onCancel={close} />
      )}
      {mode === 'copy' && (
        <CopyPanel
          month={month}
          sources={earlier.map((m) => m.month)}
          members={members}
          onDone={done}
          onCancel={close}
        />
      )}
      {budget.history.length > 0 && (
        <section aria-labelledby="budget-history-heading" className="mt-4">
          <h3 id="budget-history-heading" className="text-sm font-medium">
            Budget history
          </h3>
          <ul className="mt-1 text-sm text-ink-muted">
            {budget.history.map((event, index) => (
              <li key={`${event.at}-${index}`}>
                {ACTION_LABEL[event.action] ?? event.action}
                {event.memberId ? ` by ${ownerNames([event.memberId], members)}` : ''},{' '}
                {stamp(event.at)}
                {event.detail && <span className="block">{event.detail}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

function Review({
  heading,
  members,
  error,
  pending,
  confirm,
  confirmLabel,
  onConfirm,
  onCancel,
  danger,
  children,
}: {
  heading: string
  members: Member[]
  error: string | undefined
  pending: boolean
  confirm: { member: Member | undefined; setMemberId: (id: string) => void }
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <Panel>
      <section
        aria-labelledby="budget-action-heading"
        className="mt-3 flex max-w-md flex-col gap-3 rounded-control border border-line bg-sunken p-4"
      >
        <h3 id="budget-action-heading" className="font-medium">
          {heading}
        </h3>
        {children}
        <EnteredBy members={members} member={confirm.member} setMemberId={confirm.setMemberId} />
        <FormAlert message={error} />
        <div className="flex flex-wrap gap-2">
          <Button
            variant={danger ? 'danger' : 'primary'}
            disabled={pending || !confirm.member}
            onClick={onConfirm}
          >
            {pending ? 'Saving' : confirmLabel}
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        </div>
      </section>
    </Panel>
  )
}

function RemovePanel({
  month,
  budget,
  members,
  onDone,
  onCancel,
}: {
  month: string
  budget: Budget
  members: Member[]
  onDone: (message: string) => void
  onCancel: () => void
}) {
  const remove = useRemoveBudget(month)
  const confirm = useEnteringAs(members)
  const name = monthLabel(month)
  return (
    <Review
      heading={`Review removing the ${name} Budget`}
      members={members}
      error={remove.error?.message}
      pending={remove.isPending}
      confirm={confirm}
      confirmLabel="Confirm removing the Budget"
      danger
      onConfirm={() =>
        remove.mutate(confirm.member!.id, {
          onSuccess: () =>
            onDone(
              `The ${name} Budget is removed. Spending stays ${formatMoney(Number(budget.spending))}. You can undo this.`,
            ),
        })
      }
      onCancel={onCancel}
    >
      <p className="text-sm">
        The {formatMoney(Number(budget.total))} Budget and its category targets are removed. {name}{' '}
        spending stays {formatMoney(Number(budget.spending))}: no expense and no account Balance
        changes. The removed Budget stays in history, and you can Undo.
      </p>
    </Review>
  )
}

function UndoPanel({
  month,
  budget,
  members,
  onDone,
  onCancel,
}: {
  month: string
  budget: Budget
  members: Member[]
  onDone: (message: string) => void
  onCancel: () => void
}) {
  const undo = useUndoBudget(month)
  const confirm = useEnteringAs(members)
  const name = monthLabel(month)
  return (
    <Review
      heading={`Review bringing back the ${name} Budget`}
      members={members}
      error={undo.error?.message}
      pending={undo.isPending}
      confirm={confirm}
      confirmLabel="Confirm Undo"
      onConfirm={() =>
        undo.mutate(confirm.member!.id, {
          onSuccess: (restored) =>
            onDone(
              `The ${name} Budget is back with its category targets: ${monthStatus(restored)}.`,
            ),
        })
      }
      onCancel={onCancel}
    >
      <p className="text-sm">
        The removed {name} Budget of {formatMoney(Number(budget.removed?.total ?? 0))} returns with
        its {budget.removed?.targets ?? 0} original category targets, totaling{' '}
        {formatMoney(Number(budget.removed?.targetTotal ?? 0))}. {name} spending (
        {formatMoney(Number(budget.spending))}) does not change.
      </p>
    </Review>
  )
}

function CopyPanel({
  month,
  sources,
  members,
  onDone,
  onCancel,
}: {
  month: string
  sources: string[]
  members: Member[]
  onDone: (message: string) => void
  onCancel: () => void
}) {
  const copy = useCopyBudget(month)
  const confirm = useEnteringAs(members)
  const [key] = useState(newKey)
  const latest = [...sources].sort().at(-1) ?? ''
  const [from, setFrom] = useState(latest)
  const source = useBudget(from)
  const name = monthLabel(month)
  return (
    <Review
      heading={`Review copying a Budget into ${name}`}
      members={members}
      error={copy.error?.message ?? (source.isError ? source.error.message : undefined)}
      pending={copy.isPending}
      confirm={{ ...confirm, member: source.data?.exists ? confirm.member : undefined }}
      confirmLabel={`Confirm copying the ${monthLabel(from)} Budget`}
      onConfirm={() =>
        copy.mutate(
          { key, fromMonth: from, memberId: confirm.member!.id },
          {
            onSuccess: (copied) =>
              onDone(
                `${name} has the ${formatMoney(Number(copied.total))} Budget and the same category targets. ${name} spending is ${formatMoney(Number(copied.spending))}.`,
              ),
          },
        )
      }
      onCancel={onCancel}
    >
      {sources.length > 1 && (
        <Select label="Copy from" value={from} onChange={(event) => setFrom(event.target.value)}>
          {[...sources]
            .sort()
            .reverse()
            .map((m) => (
              <option key={m} value={m}>
                {monthLabel(m, true)}
              </option>
            ))}
        </Select>
      )}
      {source.data?.exists && (
        <p className="text-sm">
          {name} gets the {monthLabel(from)} total of {formatMoney(Number(source.data.total))} and
          these category targets:{' '}
          {source.data.lines
            .filter((line) => line.target !== null)
            .map((line) => `${line.name} ${formatMoney(Number(line.target))}`)
            .join(', ')}
          . No expenses are copied, and {monthLabel(from)} is not changed.
        </p>
      )}
    </Review>
  )
}
