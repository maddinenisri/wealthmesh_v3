import { useState } from 'react'
import type { Member } from '../../api/household'
import type { Schedule } from '../../api/recurring'
import { Field } from '../../design-system'
import { useEnteringAs } from '../../hooks/useEnteringAs'
import {
  useChangeSchedule,
  useDeleteSchedule,
  usePauseSchedule,
  useResumeSchedule,
} from '../../hooks/useRecurring'
import { formatMoney } from '../../lib/money'
import { ActionPanel } from './ActionPanel'
import { ScheduleForm } from './ScheduleForm'
import { FREQUENCY_LABEL } from './recurringText'

type Props = {
  schedule: Schedule
  members: Member[]
  onDone: (message: string) => void
  onCancel: () => void
}

/** Change the amount, frequency and next due date: the future only, paid bills never change (RECURRING_007). */
export function ChangePanel({ schedule, members, onDone, onCancel }: Props) {
  const change = useChangeSchedule(schedule.id!)
  return (
    <ScheduleForm
      heading={`Change the ${schedule.description} estimate`}
      changing={schedule}
      start={{
        description: schedule.description,
        amount: schedule.amount,
        frequency: schedule.frequency,
        nextDueOn: schedule.nextDueOn,
        accountId: schedule.accountId,
        categoryId: schedule.categoryId,
      }}
      members={members}
      save={change}
      confirmLabel="Confirm the change"
      savedMessage={(saved) =>
        `${saved.description} is now expected ${formatMoney(Number(saved.amount))} ${FREQUENCY_LABEL[saved.frequency].toLowerCase()}, next due ${saved.nextDueOn}, then ${saved.followingDueOn}. Bills already paid are unchanged.`
      }
      onSaved={onDone}
      onCancel={onCancel}
    />
  )
}

/** Pause: the schedule stays, no occurrence is expected or overdue, nothing is recorded (RECURRING_008). */
export function PausePanel({ schedule, members, onDone, onCancel }: Props) {
  const pause = usePauseSchedule(schedule.id!)
  const who = useEnteringAs(members)
  return (
    <ActionPanel
      heading={`Review pausing ${schedule.description}`}
      members={members}
      member={who.member}
      setMemberId={who.setMemberId}
      error={pause.error?.message}
      pending={pause.isPending}
      confirmLabel="Confirm pausing"
      onConfirm={() =>
        pause.mutate(who.member!.id, {
          onSuccess: () =>
            onDone(
              `${schedule.description} is paused. No expense or reminder is created, and bills already paid are unchanged.`,
            ),
        })
      }
      onCancel={onCancel}
    >
      <p className="text-sm">
        While paused, {schedule.description} is labeled Paused, is not expected on{' '}
        {schedule.nextDueOn}, and is never overdue. No payment is recorded for the time it is
        paused.
      </p>
    </ActionPanel>
  )
}

/** Resume at an explicit next due date, reviewed first: missed payments are not invented (RECURRING_008). */
export function ResumePanel({ schedule, members, onDone, onCancel }: Props) {
  const resume = useResumeSchedule(schedule.id!)
  const who = useEnteringAs(members)
  const [dueOn, setDueOn] = useState('')
  const [reviewed, setReviewed] = useState(false)
  return (
    <ActionPanel
      heading={`Review resuming ${schedule.description}`}
      members={members}
      member={reviewed ? who.member : undefined}
      setMemberId={who.setMemberId}
      error={resume.error?.message}
      pending={resume.isPending}
      confirmLabel="Confirm resuming"
      onConfirm={() =>
        resume.mutate(
          { dueOn, memberId: who.member!.id },
          {
            onSuccess: () =>
              onDone(
                `${schedule.description} is Active again: expected ${formatMoney(Number(schedule.amount))}, next due ${dueOn}. No missed payment is recorded.`,
              ),
          },
        )
      }
      onCancel={onCancel}
    >
      <Field
        label="Next due date"
        type="date"
        value={dueOn}
        onChange={(event) => {
          setDueOn(event.target.value)
          setReviewed(event.target.value !== '')
        }}
        hint="Choose the date the next bill is expected."
      />
      {reviewed && (
        <p className="text-sm">
          {schedule.description} becomes Active, expected {formatMoney(Number(schedule.amount))},
          next due {dueOn}. Nothing is recorded for the months it was paused.
        </p>
      )}
    </ActionPanel>
  )
}

/** Delete: the estimate goes away and every paid bill stays (RECURRING_009). */
export function DeletePanel({ schedule, members, onDone, onCancel }: Props) {
  const remove = useDeleteSchedule(schedule.id!)
  const who = useEnteringAs(members)
  return (
    <ActionPanel
      heading={`Review deleting the ${schedule.description} estimate`}
      members={members}
      member={who.member}
      setMemberId={who.setMemberId}
      error={remove.error?.message}
      pending={remove.isPending}
      confirmLabel="Confirm deleting the estimate"
      danger
      onConfirm={() =>
        remove.mutate(who.member!.id, {
          onSuccess: () =>
            onDone(
              `The ${schedule.description} estimate is deleted. No future reminder or expense comes from it, and ${schedule.bills.length} recorded ${schedule.bills.length === 1 ? 'bill stays' : 'bills stay'}.`,
            ),
        })
      }
      onCancel={onCancel}
    >
      <p className="text-sm">
        The estimate leaves the list and no reminder is created from it. The {schedule.bills.length}{' '}
        recorded {schedule.bills.length === 1 ? 'bill' : 'bills'} keep their dates and amounts. This
        cannot be undone: create the estimate again if you need it.
      </p>
    </ActionPanel>
  )
}
