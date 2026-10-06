import { parseActivity, type Activity } from './activity'
import { request } from './client'

export type Frequency = 'weekly' | 'monthly' | 'yearly'

/** An occurrence that was paid (with its entry, on its own date) or dismissed. */
export type Occurrence = {
  dueOn: string
  outcome: 'paid' | 'dismissed'
  paidOn: string | null
  activityId: string | null
}

export type RecurringEvent = {
  action: string
  memberId: string | null
  at: string
  detail: string | null
}

/**
 * A saved schedule, or the review of one before Confirm (`id` null). `bills` are the actual expenses that support
 * it; they are never part of the estimate. `overdueDays` is set when an active schedule's next occurrence is past.
 */
export type Schedule = {
  id: string | null
  accountId: string
  accountName: string
  accountStatus: string
  description: string
  categoryId: string
  categoryName: string
  categoryArchived: boolean
  amount: string
  frequency: Frequency
  status: 'active' | 'paused'
  nextDueOn: string
  followingDueOn: string
  overdueDays: number | null
  occurrences: Occurrence[]
  history: RecurringEvent[]
  bills: Activity[]
}

/** A monthly pattern found in recorded expenses: an estimate, not a recorded expense. */
export type Suggestion = {
  accountId: string
  accountName: string
  categoryId: string
  categoryName: string
  description: string
  amount: string
  frequency: Frequency
  lastRecordedOn: string
  nextExpectedOn: string
  bills: Activity[]
}

export type Overview = { today: string; suggestions: Suggestion[]; schedules: Schedule[] }

/** A schedule to review or save; `accountId` is ignored on a change (the account stays). */
export type ScheduleBody = {
  description: string
  amount: string
  frequency: Frequency
  nextDueOn: string
  accountId: string
  categoryId: string
  enteredByMemberId: string
}

const bad = () => new Error('Unexpected response from the server.')

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw bad()
  return value as Record<string, unknown>
}

function str(value: unknown): string {
  if (typeof value !== 'string') throw bad()
  return value
}

const strOrNull = (value: unknown) => (value == null ? null : str(value))

function list<T>(value: unknown, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) throw bad()
  return value.map(parse)
}

function frequency(value: unknown): Frequency {
  if (value !== 'weekly' && value !== 'monthly' && value !== 'yearly') throw bad()
  return value
}

function parseOccurrence(value: unknown): Occurrence {
  const data = record(value)
  if (data.outcome !== 'paid' && data.outcome !== 'dismissed') throw bad()
  return {
    dueOn: str(data.dueOn),
    outcome: data.outcome,
    paidOn: strOrNull(data.paidOn),
    activityId: strOrNull(data.activityId),
  }
}

function parseEvent(value: unknown): RecurringEvent {
  const data = record(value)
  return {
    action: str(data.action),
    memberId: strOrNull(data.memberId),
    at: str(data.at),
    detail: strOrNull(data.detail),
  }
}

export function parseSchedule(value: unknown): Schedule {
  const data = record(value)
  if (data.status !== 'active' && data.status !== 'paused') throw bad()
  if (typeof data.categoryArchived !== 'boolean') throw bad()
  if (data.overdueDays != null && typeof data.overdueDays !== 'number') throw bad()
  return {
    id: strOrNull(data.id),
    accountId: str(data.accountId),
    accountName: str(data.accountName),
    accountStatus: str(data.accountStatus),
    description: str(data.description),
    categoryId: str(data.categoryId),
    categoryName: str(data.categoryName),
    categoryArchived: data.categoryArchived,
    amount: str(data.amount),
    frequency: frequency(data.frequency),
    status: data.status,
    nextDueOn: str(data.nextDueOn),
    followingDueOn: str(data.followingDueOn),
    overdueDays: typeof data.overdueDays === 'number' ? data.overdueDays : null,
    occurrences: list(data.occurrences, parseOccurrence),
    history: list(data.history, parseEvent),
    bills: list(data.bills, parseActivity),
  }
}

function parseSuggestion(value: unknown): Suggestion {
  const data = record(value)
  return {
    accountId: str(data.accountId),
    accountName: str(data.accountName),
    categoryId: str(data.categoryId),
    categoryName: str(data.categoryName),
    description: str(data.description),
    amount: str(data.amount),
    frequency: frequency(data.frequency),
    lastRecordedOn: str(data.lastRecordedOn),
    nextExpectedOn: str(data.nextExpectedOn),
    bills: list(data.bills, parseActivity),
  }
}

function parseOverview(value: unknown): Overview {
  const data = record(value)
  return {
    today: str(data.today),
    suggestions: list(data.suggestions, parseSuggestion),
    schedules: list(data.schedules, parseSchedule),
  }
}

/** Dismiss a suggestion: no bill changes. Answers with the list as it is now. */
export const dismissSuggestion = (suggestion: Suggestion, enteredByMemberId: string) =>
  request('/recurring/suggestions/dismiss', {
    method: 'POST',
    body: {
      accountId: suggestion.accountId,
      categoryId: suggestion.categoryId,
      description: suggestion.description,
      enteredByMemberId,
    },
    parse: parseOverview,
  })

export const getRecurring = () => request('/recurring', { parse: parseOverview })

/** What the schedule would look like if saved: the same checks, nothing is written. */
export const reviewSchedule = (body: ScheduleBody) =>
  request('/recurring/review', { method: 'POST', body, parse: parseSchedule })

/** `key` identifies one form instance: a repeated save returns the stored result (D-024). */
export const createSchedule = (key: string, body: ScheduleBody) =>
  request('/recurring', {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body,
    parse: parseSchedule,
  })
