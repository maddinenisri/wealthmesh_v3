import type { Schedule } from '../../api/recurring'
import { Badge, Button } from '../../design-system'
import { formatMoney } from '../../lib/money'
import { stamp } from '../../lib/stamp'
import { Bills } from './Bills'
import { FREQUENCY_LABEL, overdueText, stateLabel } from './recurringText'

export type ScheduleAction =
  'record' | 'reschedule' | 'dismissOccurrence' | 'change' | 'pause' | 'resume' | 'delete'

/**
 * A saved schedule: the estimate, its state and its next occurrences, with the actions that are possible. A schedule
 * on an archived or closed account stays visible and labeled; what would set money to be paid (Change, Resume) waits
 * until the account is open again, while Pause and Delete move no money (Q-048).
 */
export function ScheduleItem({
  schedule,
  onAction,
}: {
  schedule: Schedule
  onAction: (action: ScheduleAction) => void
}) {
  const open = schedule.accountStatus === 'active'
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
        {!open && (
          <span className="font-medium">
            {' '}
            ({schedule.accountStatus === 'closed' ? 'closed' : 'archived'} account)
          </span>
        )}
      </p>
      {schedule.status === 'active' ? (
        <p className="mt-1 text-sm">
          Next due {schedule.nextDueOn}. Following {schedule.followingDueOn}.
        </p>
      ) : (
        <p className="mt-1 text-sm">
          Paused. It was next due {schedule.nextDueOn}; no payment is expected until it resumes.
        </p>
      )}
      {schedule.overdueDays !== null && (
        <p className="mt-1 text-sm font-medium text-negative">
          {overdueText(schedule.overdueDays)}
        </p>
      )}
      {schedule.occurrences.length > 0 && (
        <ul className="mt-1 text-sm">
          {schedule.occurrences.map((occurrence, index) => (
            <li key={`${occurrence.dueOn}-${index}`}>
              {occurrence.dueOn} occurrence:{' '}
              {occurrence.outcome === 'dismissed'
                ? 'dismissed, no expense recorded'
                : occurrence.paidOn !== null && occurrence.paidOn < occurrence.dueOn
                  ? `paid early on ${occurrence.paidOn}`
                  : `paid on ${occurrence.paidOn}`}
            </li>
          ))}
        </ul>
      )}
      <Bills bills={schedule.bills} />
      {schedule.history.length > 0 && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer">History ({schedule.history.length})</summary>
          <ul className="mt-1 text-ink-muted">
            {schedule.history.map((event, index) => (
              <li key={`${event.at}-${index}`}>
                {event.action}, {stamp(event.at)}
                {event.detail && <span className="block">{event.detail}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {open && schedule.status === 'active' && (
          <Button size="sm" onClick={() => onAction('record')}>
            Record actual expense
          </Button>
        )}
        {open && schedule.overdueDays !== null && (
          <Button size="sm" variant="secondary" onClick={() => onAction('reschedule')}>
            Reschedule
          </Button>
        )}
        {schedule.overdueDays !== null && (
          <Button size="sm" variant="secondary" onClick={() => onAction('dismissOccurrence')}>
            Dismiss this occurrence
          </Button>
        )}
        {open && (
          <Button size="sm" variant="secondary" onClick={() => onAction('change')}>
            Change
          </Button>
        )}
        {schedule.status === 'active' ? (
          <Button size="sm" variant="secondary" onClick={() => onAction('pause')}>
            Pause
          </Button>
        ) : (
          open && (
            <Button size="sm" variant="secondary" onClick={() => onAction('resume')}>
              Resume
            </Button>
          )
        )}
        <Button size="sm" variant="ghost" onClick={() => onAction('delete')}>
          Delete
        </Button>
      </div>
    </li>
  )
}
