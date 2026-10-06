import { useEffect, useState } from 'react'
import type { Schedule } from '../../api/recurring'
import { Badge, Button, Card, CardTitle, PageHeader } from '../../design-system'
import { useCreateSchedule, useRecurring } from '../../hooks/useRecurring'
import { formatMoney } from '../../lib/money'
import { useAccountContext } from '../accounts/useAccountContext'
import { useStateChangeFocus } from '../accounts/useStateChangeFocus'
import { ScheduleForm } from './ScheduleForm'
import { FREQUENCY_LABEL, overdueText, stateLabel } from './recurringText'

type Mode = { kind: 'create' }

/**
 * Recurring bills (slice 14): schedules and expected amounts. A schedule is an estimate, not a recorded expense: it
 * never changes a Balance, spending or a Budget, and every change is reviewed first. Each exit says what changed and
 * takes focus (RECURRING_001 to 010).
 */
export function RecurringPage() {
  const recurring = useRecurring()
  const { members } = useAccountContext()
  const [mode, setMode] = useState<Mode | null>(null)
  const { message, statusRef, begin, changed } = useStateChangeFocus(mode !== null)
  const [confirmed, setConfirmed] = useState(0)
  // Each Confirm says what changed and takes focus once the new state has rendered, whatever the refetch did.
  useEffect(() => {
    if (confirmed === 0) return
    statusRef.current?.scrollIntoView?.({ block: 'nearest' })
    statusRef.current?.focus({ preventScroll: true })
  }, [confirmed, statusRef])
  const create = useCreateSchedule()

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
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Recurring bills"
        description="Bills that repeat, as schedules and expected amounts. An estimate is not a recorded expense: nothing here changes a Balance or spending until you record the actual bill."
      />
      {message && (
        <p
          ref={statusRef}
          role="status"
          tabIndex={-1}
          className="max-w-md rounded-control border border-line p-3 text-sm outline-none"
        >
          {message}
        </p>
      )}
      <Card aria-labelledby="schedules-heading">
        <CardTitle id="schedules-heading" className="text-lg">
          Schedules
        </CardTitle>
        {recurring.isPending && <p className="mt-3 text-sm text-ink-muted">Loading</p>}
        {recurring.isError && (
          <p role="alert" className="mt-3">
            {recurring.error.message}
          </p>
        )}
        {recurring.data &&
          (recurring.data.schedules.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">No recurring bills have been saved.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-4">
              {recurring.data.schedules.map((schedule) => (
                <ScheduleItem key={schedule.id} schedule={schedule} />
              ))}
            </ul>
          ))}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => open({ kind: 'create' })}>Add recurring bill</Button>
        </div>
        {mode?.kind === 'create' && (
          <ScheduleForm
            heading="New recurring bill"
            members={members ?? []}
            save={create}
            confirmLabel="Confirm saving the schedule"
            savedMessage={(saved) =>
              `Saved ${saved.description}: expected ${formatMoney(Number(saved.amount))} ${FREQUENCY_LABEL[saved.frequency].toLowerCase()}, next due ${saved.nextDueOn}, then ${saved.followingDueOn}. Balance and spending are unchanged.`
            }
            onSaved={done}
            onCancel={() => setMode(null)}
          />
        )}
      </Card>
    </div>
  )
}

function ScheduleItem({ schedule }: { schedule: Schedule }) {
  return (
    <li className="rounded-control border border-line p-3">
      <p>
        <strong>{schedule.description}</strong>{' '}
        <span className="text-ink-muted">({schedule.categoryName})</span>{' '}
        <Badge tone={schedule.status === 'paused' ? 'brass' : 'positive'}>
          {stateLabel(schedule)}
        </Badge>
      </p>
      <p className="mt-1 text-sm">
        Expected {formatMoney(Number(schedule.amount))}, {FREQUENCY_LABEL[schedule.frequency]}, paid
        from {schedule.accountName}
      </p>
      <p className="mt-1 text-sm">
        Next due {schedule.nextDueOn}. Following {schedule.followingDueOn}.
      </p>
      {schedule.overdueDays !== null && (
        <p className="mt-1 text-sm font-medium text-negative">
          {overdueText(schedule.overdueDays)}
        </p>
      )}
    </li>
  )
}
