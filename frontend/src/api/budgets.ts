import { request } from './client'

/** How a category's spending compares with its target (none: no target; unplanned: zero target with spending). */
export type LineState = 'over' | 'left' | 'on' | 'none' | 'unplanned' | 'noSpending'

/** One category of a month: its target (null when none), its spending and how they compare. Money strings. */
export type BudgetLine = {
  categoryId: string | null
  name: string
  archived: boolean
  target: string | null
  spending: string
  count: number
  state: LineState
  /** The absolute gap between spending and target. */
  difference: string
  /** Null when the target is zero or absent: the screen says "Not applicable". */
  percentUsed: number | null
}

/** `detail` says what the change was (what a save changed, which month a copy came from). */
export type BudgetEvent = {
  action: string
  memberId: string | null
  at: string
  detail: string | null
}

/** The removed Budget an Undo would bring back. */
export type RemovedBudget = { total: string; targetTotal: string; targets: number }

/** A month's Budget beside its spending. `exists` is false when the month has no saved Budget. */
export type Budget = {
  month: string
  exists: boolean
  id: string | null
  total: string | null
  targetTotal: string | null
  /** Total Budget minus category targets, signed. */
  unallocated: string | null
  spending: string
  state: 'over' | 'under' | 'on' | null
  difference: string | null
  lines: BudgetLine[]
  history: BudgetEvent[]
  /** A removed Budget of this month could be brought back. */
  canUndo: boolean
  removed: RemovedBudget | null
}

export type BudgetMonth = { month: string; total: string }

/** The total and the category targets to review or save, and who entered them. */
export type BudgetBody = {
  total: string
  targets: { categoryId: string; amount: string }[]
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

const STATES = ['over', 'left', 'on', 'none', 'unplanned', 'noSpending']

function parseLine(value: unknown): BudgetLine {
  const data = record(value)
  const state = str(data.state)
  if (
    !STATES.includes(state) ||
    typeof data.archived !== 'boolean' ||
    typeof data.count !== 'number'
  )
    throw bad()
  if (data.percentUsed != null && typeof data.percentUsed !== 'number') throw bad()
  return {
    categoryId: strOrNull(data.categoryId),
    name: str(data.name),
    archived: data.archived,
    target: strOrNull(data.target),
    spending: str(data.spending),
    count: data.count,
    state: state as LineState,
    difference: str(data.difference),
    percentUsed: typeof data.percentUsed === 'number' ? data.percentUsed : null,
  }
}

function list<T>(value: unknown, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) throw bad()
  return value.map(parse)
}

function parseEvent(value: unknown): BudgetEvent {
  const data = record(value)
  return {
    action: str(data.action),
    memberId: strOrNull(data.memberId),
    at: str(data.at),
    detail: strOrNull(data.detail),
  }
}

function parseRemoved(value: unknown): RemovedBudget {
  const data = record(value)
  if (typeof data.targets !== 'number') throw bad()
  return { total: str(data.total), targetTotal: str(data.targetTotal), targets: data.targets }
}

function parseBudget(value: unknown): Budget {
  const data = record(value)
  const state = strOrNull(data.state)
  if (typeof data.exists !== 'boolean' || typeof data.canUndo !== 'boolean') throw bad()
  if (state !== null && state !== 'over' && state !== 'under' && state !== 'on') throw bad()
  return {
    month: str(data.month),
    exists: data.exists,
    id: strOrNull(data.id),
    total: strOrNull(data.total),
    targetTotal: strOrNull(data.targetTotal),
    unallocated: strOrNull(data.unallocated),
    spending: str(data.spending),
    state,
    difference: strOrNull(data.difference),
    lines: list(data.lines, parseLine),
    history: list(data.history, parseEvent),
    canUndo: data.canUndo,
    removed: data.removed == null ? null : parseRemoved(data.removed),
  }
}

export const getBudget = (month: string) => request(`/budgets/${month}`, { parse: parseBudget })

export const listBudgetMonths = () =>
  request('/budgets', {
    parse: (value) =>
      list(value, (item): BudgetMonth => {
        const data = record(item)
        return { month: str(data.month), total: str(data.total) }
      }),
  })

/** What the month would look like if saved: nothing is written. */
export const reviewBudget = (month: string, body: BudgetBody) =>
  request(`/budgets/${month}/review`, { method: 'POST', body, parse: parseBudget })

/** `key` identifies one form instance: a repeated save returns the stored result (D-024). */
export const saveBudget = (month: string, key: string, body: BudgetBody) =>
  request(`/budgets/${month}`, {
    method: 'PUT',
    headers: { 'Idempotency-Key': key },
    body,
    parse: parseBudget,
  })

export const copyBudget = (month: string, key: string, fromMonth: string, memberId: string) =>
  request(`/budgets/${month}/copy`, {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: { fromMonth, enteredByMemberId: memberId },
    parse: parseBudget,
  })

export const removeBudget = (month: string, memberId: string) =>
  request(`/budgets/${month}/remove`, {
    method: 'POST',
    body: { enteredByMemberId: memberId },
    parse: parseBudget,
  })

export const undoBudget = (month: string, memberId: string) =>
  request(`/budgets/${month}/undo`, {
    method: 'POST',
    body: { enteredByMemberId: memberId },
    parse: parseBudget,
  })
