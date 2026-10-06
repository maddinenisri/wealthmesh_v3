import { useEffect, useState } from 'react'
import type { Member } from '../../api/household'
import type { Schedule, Suggestion } from '../../api/recurring'
import { Button, Card, CardTitle, PageHeader } from '../../design-system'
import { useCreateSchedule, useDismissSuggestion, useRecurring } from '../../hooks/useRecurring'
import { useEnteringAs } from '../../hooks/useEnteringAs'
import { formatMoney } from '../../lib/money'
import { useAccountContext } from '../accounts/useAccountContext'
import { useStateChangeFocus } from '../accounts/useStateChangeFocus'
import { ActionPanel } from './ActionPanel'
import { ScheduleForm } from './ScheduleForm'
import { RecordPanel } from './RecordPanel'
import { ScheduleItem, type ScheduleAction } from './ScheduleItem'
import {
  ChangePanel,
  DeletePanel,
  DismissOccurrencePanel,
  PausePanel,
  ReschedulePanel,
  ResumePanel,
} from './SchedulePanels'
import { SuggestionItem } from './SuggestionItem'
import { FREQUENCY_LABEL } from './recurringText'

type Mode =
  | { kind: 'create' }
  | { kind: 'confirm'; suggestion: Suggestion }
  | { kind: 'dismiss'; suggestion: Suggestion }
  | { kind: ScheduleAction; schedule: Schedule }

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
  const dismiss = useDismissSuggestion()
  const dismissing = useEnteringAs(members)

  const open = (next: Mode) => {
    begin()
    // A new panel starts clean: no error from the last one, and no form state carried to another row.
    create.reset()
    dismiss.reset()
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
      {recurring.data && recurring.data.suggestions.length > 0 && (
        <Card aria-labelledby="suggestions-heading">
          <CardTitle id="suggestions-heading" className="text-lg">
            Suggestions
          </CardTitle>
          <p className="mt-1 text-sm text-ink-muted">
            Found in the bills you recorded. Confirm one to schedule it, or dismiss it: either way
            no recorded bill changes.
          </p>
          <ul className="mt-3 flex flex-col gap-4">
            {recurring.data.suggestions.map((suggestion) => (
              <SuggestionItem
                key={`${suggestion.accountId}-${suggestion.categoryId}-${suggestion.description}`}
                suggestion={suggestion}
                onConfirm={() => open({ kind: 'confirm', suggestion })}
                onDismiss={() => open({ kind: 'dismiss', suggestion })}
              />
            ))}
          </ul>
          {mode?.kind === 'confirm' && (
            <ScheduleForm
              key={`confirm-${mode.suggestion.accountId}-${mode.suggestion.description}`}
              heading={`Confirm the ${mode.suggestion.description} estimate`}
              start={{
                description: mode.suggestion.description,
                amount: mode.suggestion.amount,
                frequency: mode.suggestion.frequency,
                nextDueOn: mode.suggestion.nextExpectedOn,
                accountId: mode.suggestion.accountId,
                categoryId: mode.suggestion.categoryId,
              }}
              members={members ?? []}
              save={create}
              confirmLabel="Confirm saving the schedule"
              savedMessage={saved}
              onSaved={done}
              onCancel={() => setMode(null)}
            />
          )}
          {mode?.kind === 'dismiss' && (
            <ActionPanel
              key={`dismiss-${mode.suggestion.accountId}-${mode.suggestion.description}`}
              heading={`Review dismissing the ${mode.suggestion.description} suggestion`}
              members={members ?? []}
              member={dismissing.member}
              setMemberId={dismissing.setMemberId}
              error={dismiss.error?.message}
              pending={dismiss.isPending}
              confirmLabel="Confirm dismissing the suggestion"
              onConfirm={() =>
                dismiss.mutate(
                  { suggestion: mode.suggestion, memberId: dismissing.member!.id },
                  {
                    onSuccess: () =>
                      done(
                        `The ${mode.suggestion.description} suggestion is dismissed. All ${mode.suggestion.bills.length} recorded bills are unchanged.`,
                      ),
                  },
                )
              }
              onCancel={() => setMode(null)}
            >
              <p className="text-sm">
                The suggestion leaves this list. The {mode.suggestion.bills.length} recorded bills
                stay as they are, and no schedule is created.
              </p>
            </ActionPanel>
          )}
        </Card>
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
                <ScheduleItem
                  key={schedule.id}
                  schedule={schedule}
                  members={members ?? []}
                  onAction={(action) => open({ kind: action, schedule })}
                />
              ))}
            </ul>
          ))}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => open({ kind: 'create' })}>Add recurring bill</Button>
        </div>
        {mode && 'schedule' in mode && (
          <SchedulePanel
            key={`${mode.kind}-${mode.schedule.id}`}
            mode={mode}
            members={members ?? []}
            onDone={done}
            onCancel={() => setMode(null)}
          />
        )}
        {mode?.kind === 'create' && (
          <ScheduleForm
            key="create"
            heading="New recurring bill"
            members={members ?? []}
            save={create}
            confirmLabel="Confirm saving the schedule"
            savedMessage={saved}
            onSaved={done}
            onCancel={() => setMode(null)}
          />
        )}
      </Card>
    </div>
  )
}

/** What a saved schedule says, in one line; a schedule changes no Balance and no spending. */
const saved = (schedule: Schedule) =>
  `Saved ${schedule.description}: expected ${formatMoney(Number(schedule.amount))} ${FREQUENCY_LABEL[schedule.frequency].toLowerCase()}, next due ${schedule.nextDueOn}, then ${schedule.followingDueOn}. Balance and spending are unchanged.`

/** The panel for one action on a saved schedule. */
function SchedulePanel({
  mode,
  members,
  onDone,
  onCancel,
}: {
  mode: { kind: ScheduleAction; schedule: Schedule }
  members: Member[]
  onDone: (message: string) => void
  onCancel: () => void
}) {
  const props = { schedule: mode.schedule, members, onDone, onCancel }
  if (mode.kind === 'record') return <RecordPanel {...props} />
  if (mode.kind === 'reschedule') return <ReschedulePanel {...props} />
  if (mode.kind === 'dismissOccurrence') return <DismissOccurrencePanel {...props} />
  if (mode.kind === 'change') return <ChangePanel {...props} />
  if (mode.kind === 'pause') return <PausePanel {...props} />
  if (mode.kind === 'resume') return <ResumePanel {...props} />
  return <DeletePanel {...props} />
}
