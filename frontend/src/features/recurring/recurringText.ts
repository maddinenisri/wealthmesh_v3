import type { Frequency, Schedule } from '../../api/recurring'

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
}

/** "Overdue by 2 days", "Overdue by 1 day": an unpaid occurrence is overdue, never recorded as an expense. */
export function overdueText(days: number): string {
  return `Overdue by ${days} ${days === 1 ? 'day' : 'days'}`
}

/** The state a schedule is in, in the words of the scenarios. */
export function stateLabel(schedule: Schedule): string {
  return schedule.status === 'paused' ? 'Paused' : 'Active'
}
