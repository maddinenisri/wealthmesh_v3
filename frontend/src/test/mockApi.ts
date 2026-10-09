import { http, HttpResponse } from 'msw'
import { valueHandlers, valuedPoint, type MockValue } from './mockValues'
import { server } from './server'
import {
  isDebt as isDebtType,
  isValued as isValuedType,
  typeTraits,
} from '../features/accounts/accountTypes'
import {
  calculated,
  judgeOpening,
  mismatchMessage,
  previewBody,
  stateOf,
  viewBody,
  type MockOpening,
  holdingsBody,
} from './mockInvestments'

type MockHousehold = { id: string; name: string }
type MockMember = {
  id: string
  householdId: string
  name: string
  label: string | null
  /** Defaults to true. */
  active?: boolean
  nameHistory?: { name: string; label: string | null; changedAt: string }[]
}
export type MockAccount = {
  id: string
  type: string
  name: string
  institution: string | null
  ownerMemberIds: string[]
  openedOn: string
  openingAmount: string
  balance: { amount: string; asOf: string }
  status: string
}

export type MockActivity = {
  id: string
  accountId: string
  key?: string
  kind: string
  amount: string
  occurredOn: string
  description: string | null
  /** Empty for an expense saved with no category (CATEGORIES_006). */
  categoryId: string
  /** essential or discretionary, stored when the entry was saved; null when unclassified. */
  classification?: string | null
  enteredByMemberId: string | null
  /** The portions of a split expense (it then has no category of its own). */
  portions?: { categoryId: string; classification: string | null; amount: string }[]
  createdAt?: string
  reason?: string | null
  replacesId?: string | null
  /** The two rows of a transfer share one movement id. */
  movementId?: string
  /** The paying row of a loan payment: the principal it carries, and the interest (spending). */
  principal?: string
  interest?: string
  /** Set when the entry was removed or replaced; such rows never count. */
  removedAt?: string | null
  events?: { action: string; byName: string; at: string }[]
}

export type MockOpeningRevision = {
  id: string
  accountId: string
  key: string
  previousAmount: string
  previousOn: string
  openingAmount: string
  openedOn: string
  reason: string
  enteredByMemberId: string
  createdAt: string
}

export type MockStatement = {
  id: string
  accountId: string
  key?: string
  statementOn: string
  balance: string
  note: string | null
  reason?: string | null
  replacesId?: string | null
  enteredByMemberId: string
  createdAt?: string
  removedAt?: string
  removedByMemberId?: string
}

export type MockBudget = {
  id: string
  /** Like 2026-09. */
  month: string
  total: string
  targets: { categoryId: string; amount: string }[]
  /** Set once removed; Undo clears it. */
  removed?: boolean
  events?: { action: string; memberId: string | null; at: string }[]
}

export type MockSchedule = {
  id: string
  accountId: string
  description: string
  categoryId: string
  amount: string
  frequency: 'weekly' | 'monthly' | 'yearly'
  status: 'active' | 'paused'
  nextDueOn: string
  anchorDay: number
  occurrences: {
    dueOn: string
    outcome: 'paid' | 'dismissed'
    paidOn: string | null
    activityId: string | null
  }[]
  events: { action: string; memberId: string | null; at: string; detail: string | null }[]
  key?: string
  removed?: boolean
}

/** The occurrence after `due`: weekly adds seven days; monthly and yearly return to the anchor day. */
export function followingDue(due: string, frequency: string, anchor: number): string {
  const [y, m, d] = due.split('-').map(Number)
  if (frequency === 'weekly') {
    const next = new Date(Date.UTC(y, m - 1, d + 7))
    return next.toISOString().slice(0, 10)
  }
  const months = frequency === 'yearly' ? 12 : 1
  const target = new Date(Date.UTC(y, m - 1 + months, 1))
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(anchor, last))
  return target.toISOString().slice(0, 10)
}

type MockReminder = {
  id: string
  accountId: string
  key: string
  kind: string
  amount: string
  dueOn: string
  description: string | null
  categoryId: string
  enteredByMemberId: string
}

type RecordBody = {
  dueOn: string
  amount: string
  paidOn: string
  categoryId: string
  enteredByMemberId: string
}

type MockScheduleBody = {
  description: string
  amount: string
  frequency: 'weekly' | 'monthly' | 'yearly'
  nextDueOn: string
  accountId: string
  categoryId: string
  enteredByMemberId: string
}

type ExpenseBody = {
  description: string
  amount: string
  occurredOn: string
  categoryId?: string
  classification?: string
  enteredByMemberId: string
  portions?: { categoryId: string; classification?: string; amount: string }[]
}

type MockCategory = {
  id: string
  name: string
  kind: string
  defaultClass: string | null
  archived?: boolean
  mergedIntoId?: string | null
  mergeId?: string | null
}

/** What the API returns for a category. */
const catView = (c: MockCategory) => ({
  ...c,
  archived: c.archived ?? false,
  mergedIntoId: c.mergedIntoId ?? null,
  mergeId: c.mergeId ?? null,
})

/** A merged category's entries count under the one it was merged into (a pointer, not a rewrite). */
const effectiveId = (categoryId: string) => {
  const c = CATEGORIES.find((x) => x.id === categoryId)
  return c?.mergedIntoId ?? c?.id ?? ''
}

/** The seeded category list the backend ships, with the default class of each spending category. */
const SEEDED: MockCategory[] = [
  {
    id: 'c0000000-0000-4000-8000-000000000001',
    name: 'Rent',
    kind: 'spending',
    defaultClass: 'essential',
  },
  {
    id: 'c0000000-0000-4000-8000-000000000002',
    name: 'Utilities',
    kind: 'spending',
    defaultClass: 'essential',
  },
  {
    id: 'c0000000-0000-4000-8000-000000000003',
    name: 'Groceries',
    kind: 'spending',
    defaultClass: 'essential',
  },
  {
    id: 'c0000000-0000-4000-8000-000000000004',
    name: 'Salary',
    kind: 'income',
    defaultClass: null,
  },
  {
    id: 'c0000000-0000-4000-8000-000000000005',
    name: 'Dining',
    kind: 'spending',
    defaultClass: 'discretionary',
  },
  {
    id: 'c0000000-0000-4000-8000-000000000006',
    name: 'Bank fees',
    kind: 'spending',
    defaultClass: 'essential',
  },
  {
    id: 'c0000000-0000-4000-8000-000000000007',
    name: 'Interest',
    kind: 'income',
    defaultClass: null,
  },
  { id: 'c0000000-0000-4000-8000-000000000008', name: 'Bonus', kind: 'income', defaultClass: null },
  {
    id: 'c0000000-0000-4000-8000-000000000009',
    name: 'Interest charged',
    kind: 'spending',
    defaultClass: 'essential',
  },
  {
    id: 'c0000000-0000-4000-8000-00000000000a',
    name: 'Annual fee',
    kind: 'spending',
    defaultClass: 'essential',
  },
  {
    id: 'a16a0000-0000-4000-8000-000000000001',
    name: 'Loan interest',
    kind: 'spending',
    defaultClass: 'essential',
  },
  {
    id: 'a16a0000-0000-4000-8000-000000000002',
    name: 'Mortgage interest',
    kind: 'spending',
    defaultClass: 'essential',
  },
]

/** The live list: `mockApi()` resets it to the seeded categories, and a created category is added to it. */
export const CATEGORIES: MockCategory[] = SEEDED.map((c) => ({ ...c }))

/** The portions of a split as the API shows them, under the category each counts under now. */
function shownPortions(a: MockActivity) {
  return (a.portions ?? []).map((p) => {
    const category = CATEGORIES.find((c) => c.id === effectiveId(p.categoryId))
    return {
      categoryId: category?.id ?? p.categoryId,
      categoryName: category?.name ?? '',
      categoryArchived: category?.archived ?? false,
      classification: p.classification,
      amount: p.amount,
    }
  })
}

/** What the server says when portions do not add up to the payment (SPLITS_003). */
export function splitProblem(amount: number, portions: { amount: string }[]): string | null {
  const assigned = portions.reduce((sum, p) => sum + Number(p.amount), 0)
  const money = (value: number) => `$${Math.abs(value).toFixed(2)}`
  if (Math.abs(assigned - amount) < 0.005) return null
  return assigned < amount
    ? `${money(assigned)} is assigned and ${money(amount - assigned)} is still to assign`
    : `${money(assigned - amount)} more is assigned than the payment`
}

/** A portion as stored: its class is the category's default when none was chosen. */
function portionOf(p: { categoryId: string; classification?: string; amount: string }) {
  return {
    categoryId: p.categoryId,
    classification:
      p.classification || (CATEGORIES.find((c) => c.id === p.categoryId)?.defaultClass ?? null),
    amount: Number(p.amount).toFixed(2),
  }
}

function decorate(a: MockActivity, accounts: MockAccount[], all: MockActivity[] = []) {
  const counter = a.movementId
    ? all.find((x) => x.movementId === a.movementId && x.id !== a.id)
    : undefined
  return {
    ...a,
    accountName: accounts.find((x) => x.id === a.accountId)?.name ?? '',
    categoryId: effectiveId(a.categoryId) || null,
    categoryName: CATEGORIES.find((c) => c.id === effectiveId(a.categoryId))?.name ?? null,
    categoryArchived: CATEGORIES.find((c) => c.id === effectiveId(a.categoryId))?.archived ?? false,
    classification: a.classification ?? null,
    portions:
      a.kind === 'loan_payment' && Number(a.interest ?? 0) > 0
        ? shownPortions({
            ...a,
            portions: [
              {
                categoryId: 'a16a0000-0000-4000-8000-000000000001',
                classification: 'essential',
                amount: Number(a.interest).toFixed(2),
              },
            ],
          })
        : shownPortions(a),
    movementId: a.movementId ?? null,
    counterAccountId: counter?.accountId ?? null,
    counterAccountName: counter
      ? (accounts.find((x) => x.id === counter.accountId)?.name ?? null)
      : null,
    paymentTotal: a.kind === 'loan_payment_in' && counter ? counter.amount : null,
    paymentInterest: a.kind === 'loan_payment_in' && counter ? (counter.interest ?? '0.00') : null,
  }
}

function monthsThrough(from: string, to: string): string[] {
  const out: string[] = []
  let [y, m] = from.split('-').map(Number)
  while (`${y}-${String(m).padStart(2, '0')}` <= to) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
}

/** The server's refusal for several owners on a one-owner type, naming the type (`AccountType.singleOwnerMessage`). */
function singleOwnerMessage(type: string): string {
  const names: Record<string, string> = {
    defined_benefit: 'A defined benefit has one participant',
    '401k': 'A 401(k) has one owner',
    traditional_ira: 'A Traditional IRA has one owner',
    roth_ira: 'A Roth IRA has one owner',
    hsa: 'An HSA has one owner',
  }
  return `${names[type] ?? 'This account has one owner'}. Choose one member.`
}

function problem(status: number, message: string) {
  return HttpResponse.json({ status, error: 'Error', message }, { status })
}

/**
 * In-memory stand-in for the backend, registered on the MSW server.
 * Mirrors the real API's rules closely enough for UI tests: singleton household,
 * 404 before creation, 400 for blank names and 409 for duplicate members. Accounts follow the same
 * rules as the backend: blank name, invalid amount, missing owner and future opening date are 400.
 */
/**
 * The groups that list a type (the server's `AccountType.groups`, D-067): a test double of one server rule, so the
 * Household page is read against the same overlaps. An investment account is also in Investments.
 */
function mockGroups(type: string): string[] {
  const own: Record<string, string> = {
    checking: 'bankMoney',
    savings: 'bankMoney',
    credit_card: 'cards',
    loan: 'loans',
    mortgage: 'mortgages',
    property: 'propertyAndOther',
    other_asset: 'propertyAndOther',
    defined_benefit: 'retirement',
    brokerage: 'investments',
    '401k': 'retirement',
    traditional_ira: 'retirement',
    roth_ira: 'retirement',
    hsa: 'healthSavings',
  }
  const order = ['investments', 'retirement', 'healthSavings']
  const groups = new Set([own[type]])
  if (typeTraits(type).kind === 'investment') groups.add('investments')
  return [...groups].sort((a, b) => order.indexOf(a) - order.indexOf(b))
}

export function mockApi(
  seed: {
    household?: MockHousehold
    members?: MockMember[]
    accounts?: MockAccount[]
    today?: string
    /** Expenses already recorded, by account. */
    activity?: MockActivity[]
    /** Supporting statements already attached. */
    statements?: MockStatement[]
    /** Monthly Budgets already saved. */
    budgets?: MockBudget[]
    /** Recurring schedules already saved. */
    schedules?: MockSchedule[]
    /** Dated values of properties and other assets already saved (the account's balance is the seed's). */
    values?: MockValue[]
    /** Starting-amount corrections already saved. */
    openingRevisions?: MockOpeningRevision[]
    /** Opening cash and holdings of investment accounts already saved, by account id. */
    openings?: Record<string, MockOpening>
    /** Suggestions the server would find: the bills are the account's matching expenses. */
    suggestions?: { accountId: string; categoryId: string; description: string }[]
  } = {},
) {
  CATEGORIES.splice(0, CATEGORIES.length, ...SEEDED.map((c) => ({ ...c })))
  const today = seed.today ?? '2026-10-03'
  const state = {
    household: seed.household ?? (null as MockHousehold | null),
    members: [...(seed.members ?? [])],
    accounts: [...(seed.accounts ?? [])],
    activity: [...(seed.activity ?? [])],
    reminders: [] as MockReminder[],
    statements: [...(seed.statements ?? [])],
    budgets: (seed.budgets ?? []).map((b) => ({ ...b, events: b.events ?? [] })) as MockBudget[],
    schedules: (seed.schedules ?? []).map((s) => ({ ...s })) as MockSchedule[],
    suggestions: (seed.suggestions ?? []).map((s) => ({ ...s })),
    values: (seed.values ?? []).map((v) => ({ ...v })) as MockValue[],
    openingRevisions: [...(seed.openingRevisions ?? [])] as MockOpeningRevision[],
    /** Opening cash and holdings of investment accounts, by account id. */
    openings: new Map<string, MockOpening>(Object.entries(seed.openings ?? {})),
    /** Save keys seen on POST expenses, in order. */
    keys: [] as string[],
    /** When true the next expense is stored but its response is lost (a slow or dropped answer). */
    loseNextExpenseResponse: false,
    /** When set, the next correction save (balance or starting amount) is refused with this message. */
    failNextSave: null as string | null,
    /** "METHOD /path" for every request the UI made, in order. */
    requests: [] as string[],
  }
  let nextId = 1
  /** Accounts deleted through the API; Undo puts them back. */
  const deletedAccounts: MockAccount[] = []
  /** State changes by account id, newest first, as the server keeps them. */
  const accountEvents = new Map<
    string,
    { action: string; memberId: string | null; at: string; detail: string | null }[]
  >()
  const noteAccountEvent = (id: string, action: string, memberId: unknown, detail?: string) =>
    accountEvents.set(id, [
      {
        action,
        memberId: typeof memberId === 'string' ? memberId : null,
        at: '2026-10-06T09:00:00Z',
        detail: detail ?? null,
      },
      ...(accountEvents.get(id) ?? []),
    ])
  const deleteBlockers = (account: MockAccount): string[] => {
    const reasons: string[] = []
    const entries = state.activity.filter((a) => a.accountId === account.id).length
    if (entries > 0)
      reasons.push(`${entries} saved ${entries === 1 ? 'entry' : 'entries'} (removed ones count)`)
    if (Number(account.openingAmount) !== 0)
      reasons.push(
        `a starting Balance of ${Number(account.openingAmount).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`,
      )
    return reasons
  }
  const categoryEvents = new Map<string, Record<string, unknown>[]>()
  const noteEvent = (
    id: string,
    event: {
      action: string
      oldName?: string
      newName?: string
      detail?: string
      by: string
      at: string
    },
  ) =>
    categoryEvents.set(id, [
      ...(categoryEvents.get(id) ?? []),
      {
        action: event.action,
        oldName: event.oldName ?? null,
        newName: event.newName ?? null,
        detail: event.detail ?? null,
        byName: event.by,
        at: event.at,
      },
    ])
  const newId = () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`
  const log = (request: Request) =>
    state.requests.push(`${request.method} ${new URL(request.url).pathname}`)

  const nameOf = (id: string | null | undefined) =>
    state.members.find((m) => m.id === id)?.name ?? ''
  const live = () => state.activity.filter((a) => !a.removedAt)
  const signed = (a: MockActivity) =>
    a.kind === 'expense' ||
    a.kind === 'transfer_out' ||
    a.kind === 'card_payment' ||
    a.kind === 'loan_payment'
      ? -Number(a.amount)
      : Number(a.amount)
  /** Opening amount plus live activity up to a date, leaving out one row. */
  const balanceOn = (account: MockAccount, date: string, excluding?: string) =>
    Number(account.openingAmount) +
    live()
      .filter((a) => a.accountId === account.id && a.occurredOn <= date && a.id !== excluding)
      .reduce((sum, a) => sum + signed(a), 0)
  /** The entry that waits on the start moving: Balance with it and its month's totals. */
  const previewEntry = (account: MockAccount, opening: number, query: URLSearchParams) => {
    const entry = Number(query.get('entryAmount'))
    const income = query.get('entryKind') === 'income'
    const month = (query.get('entryOn') ?? '').slice(0, 7)
    const total = (kind: string) =>
      live()
        .filter((a) => a.kind === kind && a.occurredOn.startsWith(month))
        .reduce((sum, a) => sum + Number(a.amount), 0)
    const afterStart = currentBalance(account) - Number(account.openingAmount) + opening
    return {
      balanceWithEntry: (income ? afterStart + entry : afterStart - entry).toFixed(2),
      monthIncomeAfter: (total('income') + (income ? entry : 0)).toFixed(2),
      monthSpendingAfter: (total('expense') + (income ? 0 : entry)).toFixed(2),
    }
  }
  const statementView = (s: MockStatement) => {
    const next = state.statements.find((n) => n.replacesId === s.id)
    return {
      id: s.id,
      accountId: s.accountId,
      statementOn: s.statementOn,
      balance: s.balance,
      note: s.note,
      reason: s.reason ?? null,
      replacesId: s.replacesId ?? null,
      replacedById: next?.id ?? null,
      latest: !next,
      enteredByMemberId: s.enteredByMemberId,
      enteredByName: nameOf(s.enteredByMemberId),
      createdAt: s.createdAt ?? '2026-10-03T12:00:00Z',
      removedAt: s.removedAt ?? null,
      removedByMemberId: s.removedByMemberId ?? null,
      removedByName: s.removedByMemberId ? nameOf(s.removedByMemberId) : null,
      usedByOpening: [...state.openings.values()].some((o) => o.statementId === s.id),
    }
  }
  /** The header of an investment setup and its judged components, or the problem the server would answer. */
  const judgeSetup = (body: NewAccountBody & { opening?: unknown }) => {
    const failure =
      validateAccount(body.name, body.ownerMemberIds) ??
      validateOwners(state.members, body.ownerMemberIds, [])
    if (failure) return failure
    if (body.openedOn > today) return problem(400, 'The opening date cannot be in the future')
    const judged = judgeOpening(
      body.opening as Parameters<typeof judgeOpening>[0],
      body.openedOn,
      today,
    )
    return 'error' in judged ? problem(400, judged.error) : judged.opening
  }
  const createInvestment = (body: NewAccountBody & { opening?: unknown }) => {
    if (!body.enteredByMemberId) return problem(400, 'Choose who entered this')
    const judged = judgeSetup(body)
    if (judged instanceof Response) return judged
    if (stateOf(judged) === 'mismatch') return problem(400, mismatchMessage(judged))
    const draft = stateOf(judged) === 'draft'
    const balance = (calculated(judged) ?? 0).toFixed(2)
    const account: MockAccount = {
      id: newId(),
      type: body.type,
      name: body.name.trim(),
      institution: body.institution?.trim() || null,
      ownerMemberIds: body.ownerMemberIds,
      openedOn: body.openedOn,
      openingAmount: balance,
      balance: { amount: balance, asOf: body.openedOn },
      status: draft ? 'draft' : 'active',
    }
    state.accounts.push(account)
    state.openings.set(account.id, judged)
    noteAccountEvent(account.id, draft ? 'drafted' : 'set_up', body.enteredByMemberId)
    return HttpResponse.json(account, { status: 201 })
  }
  const saveStatement = async (request: Request, accountId: string, replaces: string | null) => {
    const key = request.headers.get('Idempotency-Key') ?? ''
    const body = (await request.json()) as {
      statementOn: string
      balance: string
      note: string
      reason?: string
      balanceSide?: string
      enteredByMemberId: string
      supportsOpening?: boolean
    }
    if (!/^-?\d+(\.\d{1,2})?$/.test(body.balance)) return problem(400, 'Enter a valid amount')
    const owner = state.accounts.find((a) => a.id === accountId)
    if (owner?.status === 'draft')
      return problem(409, `${owner.name} is a draft. Finish setting it up first.`)
    if (replaces && state.statements.find((s) => s.id === replaces)?.removedAt)
      return problem(409, 'This statement was removed, so it cannot be revised.')
    const shown = owner ? signedFor(owner, body.balance, body.balanceSide) : Number(body.balance)
    if (typeof shown !== 'number') return shown
    if (replaces && !body.reason?.trim())
      return problem(400, 'Enter a reason for the corrected statement')
    const existing = state.statements.find((s) => s.key === key)
    if (existing) return HttpResponse.json(statementView(existing), { status: 200 })
    if (replaces && state.statements.some((s) => s.replacesId === replaces)) {
      return problem(409, 'This statement was already revised.')
    }
    const statement: MockStatement = {
      id: newId(),
      accountId,
      key,
      statementOn: body.statementOn,
      balance: shown.toFixed(2),
      note: body.note?.trim() || null,
      reason: body.reason?.trim() || null,
      replacesId: replaces,
      enteredByMemberId: body.enteredByMemberId,
    }
    if (!replaces && body.supportsOpening) {
      const opening = state.openings.get(accountId)
      if (!opening)
        return problem(400, 'A statement can back the opening of an investment account only')
      if (opening.statementId)
        return problem(
          409,
          `${owner?.name}'s opening already uses a statement. Revise that one instead.`,
        )
      opening.statementId = statement.id
    }
    if (replaces) {
      for (const opening of state.openings.values()) {
        if (opening.statementId === replaces) opening.statementId = statement.id
      }
    }
    state.statements.push(statement)
    return HttpResponse.json(statementView(statement), { status: 201 })
  }
  /** Saved with the entry: the class chosen, else the category's default now; income has none. */
  const classOf = (kind: string, body: ExpenseBody) =>
    kind === 'income'
      ? null
      : (body.classification ??
        CATEGORIES.find((c) => c.id === body.categoryId)?.defaultClass ??
        null)
  const batchView = (rows: MockActivity[]) => ({
    entries: rows.map((a) => decorate(a, state.accounts, state.activity)),
    total: rows.reduce((sum, a) => sum + Number(a.amount), 0).toFixed(2),
  })
  const currentBalance = (account: MockAccount) => balanceOn(account, '9999-12-31')
  /** What counts toward a month figure: spending is expenses minus refunds (the server defines it once). */
  const counted = (a: MockActivity, kind: string) =>
    kind === 'expense' ? a.kind === 'expense' || a.kind === 'refund' : a.kind === kind
  const effect = (a: MockActivity) => (a.kind === 'refund' ? -Number(a.amount) : Number(a.amount))
  const refundNote = (total: number) => (total < 0 ? 'Refunds exceed purchases' : null)
  const monthTotals = (month: string, kind: string, accountId?: string | null) => {
    const rows = live().filter(
      (a) =>
        counted(a, kind) &&
        a.occurredOn.startsWith(month) &&
        (!accountId || a.accountId === accountId),
    )
    // A split counts once as a payment, and each portion under its own category and class.
    const parts = rows.flatMap((a) =>
      a.portions?.length
        ? a.portions.map((p) => ({
            categoryId: p.categoryId,
            classification: p.classification,
            value: Number(p.amount),
          }))
        : [
            {
              categoryId: a.categoryId,
              classification: a.classification ?? null,
              value: effect(a),
            },
          ],
    )
    const byCategory = new Map<string, { total: number; count: number }>()
    parts.forEach((part) => {
      const key = effectiveId(part.categoryId)
      const row = byCategory.get(key) ?? { total: 0, count: 0 }
      byCategory.set(key, { total: row.total + part.value, count: row.count + 1 })
    })
    const total = rows.reduce((sum, a) => sum + effect(a), 0)
    const byClass = (cls: string | null) =>
      parts
        .filter((part) => (part.classification ?? null) === cls)
        .reduce((sum, part) => sum + part.value, 0)
        .toFixed(2)
    return {
      month,
      total: total.toFixed(2),
      note: refundNote(total),
      categories: [...byCategory].map(([categoryId, row]) => ({
        categoryId: categoryId || null,
        name: CATEGORIES.find((c) => c.id === categoryId)?.name ?? 'Uncategorized',
        total: row.total.toFixed(2),
        count: row.count,
        note: refundNote(row.total),
        archived: CATEGORIES.find((c) => c.id === categoryId)?.archived ?? false,
      })),
      classes:
        kind === 'expense'
          ? {
              essential: byClass('essential'),
              discretionary: byClass('discretionary'),
              unclassified: byClass(null),
            }
          : null,
    }
  }

  const adjust = (account: MockAccount, delta: number) => {
    account.balance = {
      ...account.balance,
      amount: (Number(account.balance.amount) + delta).toFixed(2),
    }
  }
  const rowsOf = (movementId: string) => state.activity.filter((a) => a.movementId === movementId)
  const transferView = (movementId: string) => {
    const rows = rowsOf(movementId)
    const out = rows.find(
      (a) => a.kind === 'transfer_out' || a.kind === 'card_payment' || a.kind === 'loan_payment',
    )!
    const into = rows.find(
      (a) =>
        a.kind === 'transfer_in' || a.kind === 'card_payment_in' || a.kind === 'loan_payment_in',
    )!
    const name = (a: MockActivity) => state.accounts.find((x) => x.id === a.accountId)?.name ?? ''
    const replaced = rows.some((a) => state.activity.some((r) => r.replacesId === a.id))
    return {
      movementId,
      from: { activityId: out.id, accountId: out.accountId, accountName: name(out) },
      to: { activityId: into.id, accountId: into.accountId, accountName: name(into) },
      amount: out.amount,
      occurredOn: out.occurredOn,
      description: out.description,
      enteredByName: nameOf(out.enteredByMemberId),
      reason: out.reason ?? null,
      status: replaced ? 'replaced' : out.removedAt ? 'removed' : 'effective',
      principal: out.principal ?? null,
      interest: out.principal ? (out.interest ?? '0.00') : null,
    }
  }
  const writePair = (
    body: {
      fromAccountId: string
      toAccountId: string
      amount: string
      occurredOn: string
      description?: string
      enteredByMemberId: string
      reason?: string
      principal?: string
      interest?: string
    },
    key: string,
    replaces?: { out: MockActivity; into?: MockActivity },
    kinds: readonly [string, string] = ['transfer_out', 'transfer_in'],
  ) => {
    const movementId = newId()
    // A loan payment: the paying row holds the whole payment, the loan's row the principal.
    const inAmount = body.principal ? Number(body.principal) : Number(body.amount)
    const base = {
      kind: '',
      amount: Number(body.amount).toFixed(2),
      occurredOn: body.occurredOn,
      description: body.description?.trim() || null,
      categoryId: '',
      enteredByMemberId: body.enteredByMemberId,
      createdAt: '2026-10-03T09:05:00Z',
      reason: body.reason?.trim() || null,
      movementId,
    }
    state.activity.push(
      {
        ...base,
        id: newId(),
        accountId: body.fromAccountId,
        kind: kinds[0],
        key,
        replacesId: replaces?.out.id,
        ...(body.principal
          ? { principal: body.principal, interest: Number(body.interest ?? 0).toFixed(2) }
          : {}),
      },
      {
        ...base,
        id: newId(),
        accountId: body.toAccountId,
        kind: kinds[1],
        replacesId: replaces?.into?.id,
        amount: inAmount.toFixed(2),
      },
    )
    adjust(
      state.accounts.find((a) => a.id === body.fromAccountId)!,
      -Number(body.amount),
    )
    adjust(
      state.accounts.find((a) => a.id === body.toAccountId)!,
      inAmount,
    )
    return movementId
  }
  /** A card's typed amount is positive with a side and is held with the asset sign; others take no side. */
  const signedFor = (account: MockAccount, amount: string, side: string | null | undefined) => {
    const value = Number(amount)
    if (isDebtType(account.type)) {
      if (side) return problem(400, 'Owed or Card credit applies to a card only')
      if (Number.isNaN(value)) return problem(400, 'Enter a valid amount')
      return value < 0 ? problem(400, 'Enter zero or a positive amount owed') : -value || 0
    }
    if (account.type !== 'credit_card') {
      return side ? problem(400, 'Owed or Card credit applies to a card only') : value
    }
    if (!(value >= 0)) return problem(400, 'Enter a valid amount')
    if (value === 0) return 0
    if (side !== 'owed' && side !== 'credit') return problem(400, 'Choose Owed or Card credit')
    return side === 'owed' ? -value : value
  }
  /** A transfer takes no card; a payment goes from checking or savings to a card (the server's rule). */
  const pairRefusal = (path: string, fromId: string, toId: string) => {
    const from = state.accounts.find((a) => a.id === fromId)
    const to = state.accounts.find((a) => a.id === toId)
    if (!from || !to) return problem(404, 'Account not found')
    if (path === 'loan-payments') {
      if (from.type !== 'checking' && from.type !== 'savings')
        return problem(400, 'Pay a loan or mortgage from a checking or savings account')
      return isDebtType(to.type) ? null : problem(400, 'Choose a loan or mortgage to pay')
    }
    if (isDebtType(from.type) || isDebtType(to.type))
      return problem(400, 'Money cannot be moved to or from this type of account yet')
    if (path === 'transfers') {
      return from.type === 'credit_card' || to.type === 'credit_card'
        ? problem(400, 'Use Record payment to pay a card')
        : null
    }
    if (from.type === 'credit_card')
      return problem(400, 'Pay a card from a checking or savings account')
    return to.type === 'credit_card' ? null : problem(400, 'Choose a card to pay')
  }
  const dollars = (value: number) =>
    `$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  /** The server's rules for the portions of a loan payment, in its words. */
  const loanProblem = (body: { amount: string; principal?: string; interest?: string }) => {
    if (body.principal == null || body.principal === '') return problem(400, 'Enter the principal')
    const part = Number(body.principal)
    if (!(part > 0)) return problem(400, 'Enter a principal above $0.00')
    const rest = body.interest ? Number(body.interest) : 0
    if (rest < 0) return problem(400, 'Enter zero or a positive interest')
    const left = Math.round((Number(body.amount) - part - rest) * 100) / 100
    if (left > 0) return problem(400, `${dollars(left)} remains unassigned`)
    if (left < 0)
      return problem(400, `Principal and interest are ${dollars(left)} more than the payment`)
    return null
  }
  /** A payment may not take the debt below zero: `owed` is what the loan owes before this payment. */
  const overpaidProblem = (principal: number, owed: number) =>
    principal > owed + 0.005
      ? problem(
          400,
          `Principal ${dollars(principal)} is ${dollars(principal - owed)} more than the ${dollars(owed)} owed. Correct the principal, or record an actual lender refund or other asset separately.`,
        )
      : null
  const retire = (rows: MockActivity[], sign: 1 | -1, action: string, memberId: string) => {
    rows.forEach((row) => {
      row.removedAt = sign === 1 ? '2026-10-03T09:10:00Z' : null
      row.events = [
        ...(row.events ?? []),
        { action, byName: nameOf(memberId), at: '2026-10-03T09:10:00Z' },
      ]
      adjust(
        state.accounts.find((a) => a.id === row.accountId)!,
        (sign === 1 ? -1 : 1) * signed(row),
      )
    })
  }
  /** The movement routes for one kind of pair: transfers, or card payments (bank pays card). */
  const movementHandlers = (
    path: 'transfers' | 'card-payments' | 'loan-payments',
    kinds: readonly [string, string],
    noun: string,
  ) => [
    http.post(`*/api/v1/${path}`, async ({ request }) => {
      log(request)
      const key = request.headers.get('Idempotency-Key') ?? ''
      state.keys.push(key)
      const body = (await request.json()) as Parameters<typeof writePair>[0]
      if (body.fromAccountId === body.toAccountId) return problem(400, 'Choose a different account')
      const refusal = pairRefusal(path, body.fromAccountId, body.toAccountId)
      if (refusal) return refusal
      if (!(Number(body.amount) > 0)) return problem(400, 'Enter an amount greater than zero')
      if (body.occurredOn > today)
        return problem(400, 'Future activity is not saved as completed history yet')
      const existing = state.activity.find((a) => a.key === key && a.movementId)
      if (existing) return HttpResponse.json(transferView(existing.movementId!), { status: 200 })
      if (path === 'loan-payments') {
        const split = loanProblem(body)
        if (split) return split
        const loan = state.accounts.find((a) => a.id === body.toAccountId)!
        const over = overpaidProblem(Number(body.principal), -Number(loan.balance.amount))
        if (over) return over
      } else if (body.principal != null || body.interest != null) {
        return problem(400, 'Principal and interest apply to a loan payment only')
      }
      return HttpResponse.json(transferView(writePair(body, key, undefined, kinds)), {
        status: 201,
      })
    }),
    http.get(`*/api/v1/${path}/preview`, ({ request }) => {
      log(request)
      const query = new URL(request.url).searchParams
      const from = state.accounts.find((a) => a.id === query.get('fromAccountId'))
      const to = state.accounts.find((a) => a.id === query.get('toAccountId'))
      if (!from || !to) return problem(404, 'Account not found')
      if (from.id === to.id) return problem(400, 'Choose a different account')
      const expense = state.activity.find((a) => a.id === query.get('activityId'))
      const amount = expense ? Number(expense.amount) : Number(query.get('amount'))
      const delta = new Map<string, number>()
      const add = (id: string, value: number) => delta.set(id, (delta.get(id) ?? 0) + value)
      const movementId = query.get('movementId')
      if (movementId) {
        const rows = rowsOf(movementId)
        ;[...rows].reverse().forEach((row) => add(row.accountId, -signed(row)))
      }
      if (expense) add(expense.accountId, Number(expense.amount))
      let inAmount = amount
      if (path === 'loan-payments') {
        const split = loanProblem({
          amount: String(amount),
          principal: query.get('principal') ?? undefined,
          interest: query.get('interest') ?? undefined,
        })
        if (split) return split
        inAmount = Number(query.get('principal'))
        const owed = -(Number(to.balance.amount) + (delta.get(to.id) ?? 0))
        const over = overpaidProblem(inAmount, owed)
        if (over) return over
      }
      add(from.id, -amount)
      add(to.id, inAmount)
      const month = expense?.occurredOn.slice(0, 7)
      const before = month
        ? live()
            .filter((a) => a.kind === 'expense' && a.occurredOn.startsWith(month))
            .reduce((sum, a) => sum + Number(a.amount), 0)
        : 0
      return HttpResponse.json({
        accounts: [...delta].map(([id, change]) => {
          const account = state.accounts.find((a) => a.id === id)!
          return {
            id,
            name: account.name,
            balanceAfter: (Number(account.balance.amount) + change).toFixed(2),
          }
        }),
        spending: month
          ? {
              month,
              kind: 'spending',
              before: before.toFixed(2),
              after: (before - amount).toFixed(2),
            }
          : null,
      })
    }),
    http.post(`*/api/v1/${path}/:id/replacement`, async ({ request, params }) => {
      log(request)
      const key = request.headers.get('Idempotency-Key') ?? ''
      const body = (await request.json()) as Parameters<typeof writePair>[0]
      const rows = rowsOf(String(params.id))
      if (rows.length !== 2)
        return problem(404, `${noun[0].toUpperCase()}${noun.slice(1)} not found`)
      if (body.fromAccountId === body.toAccountId) return problem(400, 'Choose a different account')
      if (!(Number(body.amount) > 0)) return problem(400, 'Enter an amount greater than zero')
      const existing = state.activity.find((a) => a.key === key && a.movementId)
      if (existing) return HttpResponse.json(transferView(existing.movementId!), { status: 200 })
      if (rows.some((row) => row.removedAt))
        return problem(409, `This ${noun} was already changed or removed.`)
      if (path === 'loan-payments') {
        const split = loanProblem(body)
        if (split) return split
        const loan = state.accounts.find((a) => a.id === body.toAccountId)!
        const before = Number(rows.find((r) => r.kind === kinds[1])?.amount ?? 0)
        const over = overpaidProblem(Number(body.principal), -Number(loan.balance.amount) + before)
        if (over) return over
      } else if (body.principal != null || body.interest != null) {
        return problem(400, 'Principal and interest apply to a loan payment only')
      }
      retire(rows, 1, 'replaced', body.enteredByMemberId)
      const out = rows.find((a) => a.kind === kinds[0])!
      const into = rows.find((a) => a.kind === kinds[1])!
      return HttpResponse.json(transferView(writePair(body, key, { out, into }, kinds)), {
        status: 201,
      })
    }),
    ...(['removal', 'undo'] as const).map((action) =>
      http.post(`*/api/v1/${path}/:id/${action}`, async ({ request, params }) => {
        log(request)
        const rows = rowsOf(String(params.id))
        if (rows.length !== 2)
          return problem(404, `${noun[0].toUpperCase()}${noun.slice(1)} not found`)
        const { enteredByMemberId } = (await request.json()) as { enteredByMemberId: string }
        const replaced = rows.some((row) => state.activity.some((r) => r.replacesId === row.id))
        if (action === 'removal' ? rows.some((r) => r.removedAt) : !rows[0].removedAt || replaced)
          return problem(409, `This ${noun} was already changed or removed.`)
        retire(
          rows,
          action === 'removal' ? 1 : -1,
          action === 'removal' ? 'removed' : 'restored',
          enteredByMemberId,
        )
        return HttpResponse.json(transferView(String(params.id)))
      }),
    ),
    ...(path === 'loan-payments'
      ? [
          http.get('*/api/v1/loan-payments/:id', ({ request, params }) => {
            log(request)
            return rowsOf(String(params.id)).length === 2
              ? HttpResponse.json(transferView(String(params.id)))
              : problem(404, 'Payment not found')
          }),
        ]
      : []),
  ]
  const transferHandlers = () => [
    ...movementHandlers('transfers', ['transfer_out', 'transfer_in'], 'transfer'),
    ...movementHandlers('card-payments', ['card_payment', 'card_payment_in'], 'payment'),
    ...movementHandlers('loan-payments', ['loan_payment', 'loan_payment_in'], 'payment'),
    http.post(
      '*/api/v1/accounts/:id/activity/:activityId/transfer',
      async ({ request, params }) => {
        log(request)
        const key = request.headers.get('Idempotency-Key') ?? ''
        const body = (await request.json()) as {
          toAccountId: string
          enteredByMemberId: string
          reason: string
        }
        const original = state.activity.find((a) => a.id === params.activityId)
        if (!original) return problem(404, 'Entry not found')
        if (!body.reason?.trim()) return problem(400, 'Give a reason for the change')
        if (body.toAccountId === original.accountId)
          return problem(400, 'Choose a different account')
        const existing = state.activity.find((a) => a.key === key && a.movementId)
        if (existing) return HttpResponse.json(transferView(existing.movementId!), { status: 200 })
        if (original.removedAt) return problem(409, 'This entry was already changed or removed.')
        adjust(
          state.accounts.find((a) => a.id === original.accountId)!,
          Number(original.amount),
        )
        original.removedAt = '2026-10-03T09:10:00Z'
        original.events = [
          ...(original.events ?? []),
          {
            action: 'replaced',
            byName: nameOf(body.enteredByMemberId),
            at: '2026-10-03T09:10:00Z',
          },
        ]
        const movementId = writePair(
          {
            fromAccountId: original.accountId,
            toAccountId: body.toAccountId,
            amount: original.amount,
            occurredOn: original.occurredOn,
            enteredByMemberId: body.enteredByMemberId,
            reason: body.reason,
          },
          key,
          { out: original },
        )
        return HttpResponse.json(transferView(movementId), { status: 201 })
      },
    ),
  ]

  const removedSummary = (b: MockBudget | null) =>
    b
      ? {
          total: Number(b.total).toFixed(2),
          targetTotal: b.targets.reduce((sum, t) => sum + Number(t.amount), 0).toFixed(2),
          targets: b.targets.length,
        }
      : null
  /** A month's Budget view from a total and targets, as the server computes it (spending is the shared one). */
  const budgetView = (
    month: string,
    budget: {
      id: string | null
      total: string
      targets: { categoryId: string; amount: string }[]
    } | null,
    events: { action: string; memberId: string | null; at: string }[] = [],
    removedBudget: MockBudget | null = null,
  ) => {
    const spent = monthTotals(month, 'expense', null)
    if (!budget) {
      return {
        month,
        exists: false,
        id: null,
        total: null,
        targetTotal: null,
        unallocated: null,
        spending: spent.total,
        state: null,
        difference: null,
        lines: [],
        history: events,
        canUndo: removedBudget !== null,
        removed: removedSummary(removedBudget),
      }
    }
    const target = new Map<string, number>()
    budget.targets.forEach((t) =>
      target.set(
        effectiveId(t.categoryId),
        (target.get(effectiveId(t.categoryId)) ?? 0) + Number(t.amount),
      ),
    )
    const money = (n: number) => n.toFixed(2)
    const lineFor = (
      id: string | null,
      name: string,
      archived: boolean,
      spending: number,
      count: number,
    ) => {
      const t = id === null ? undefined : target.get(id)
      let lineState = 'none'
      let percent: number | null = null
      if (t !== undefined && t === 0) lineState = spending > 0 ? 'unplanned' : 'noSpending'
      else if (t !== undefined) {
        lineState = spending > t ? 'over' : spending < t ? 'left' : 'on'
        percent = Math.round((spending * 100) / t)
      }
      return {
        categoryId: id,
        name,
        archived,
        ...(t === undefined ? {} : { target: money(t) }),
        spending: money(spending),
        count,
        state: lineState,
        difference: money(t === undefined || t === 0 ? Math.abs(spending) : Math.abs(spending - t)),
        ...(percent === null ? {} : { percentUsed: percent }),
      }
    }
    const lines = spent.categories.map((c) =>
      lineFor(c.categoryId, c.name, c.archived, Number(c.total), c.count),
    )
    target.forEach((_, id) => {
      if (spent.categories.some((c) => c.categoryId === id)) return
      const category = CATEGORIES.find((c) => c.id === id)
      lines.push(lineFor(id, category?.name ?? '', category?.archived ?? false, 0, 0))
    })
    lines.sort((a, b) => Number(b.spending) - Number(a.spending) || a.name.localeCompare(b.name))
    const total = Number(budget.total)
    const targetTotal = [...target.values()].reduce((a, b) => a + b, 0)
    const spending = Number(spent.total)
    return {
      month,
      exists: true,
      id: budget.id,
      total: money(total),
      targetTotal: money(targetTotal),
      unallocated: money(total - targetTotal),
      spending: spent.total,
      state: spending > total ? 'over' : spending < total ? 'under' : 'on',
      difference: money(Math.abs(spending - total)),
      lines,
      history: events,
      canUndo: false,
      removed: null,
    }
  }
  const monthBudget = (month: string) => {
    const active = state.budgets.find((b) => b.month === month && !b.removed)
    const removed = [...state.budgets].reverse().find((b) => b.month === month && b.removed) ?? null
    const events = state.budgets
      .filter((b) => b.month === month)
      .flatMap((b) => b.events ?? [])
      .reverse()
    return budgetView(month, active ?? null, events, active ? null : removed)
  }
  const budgetHandlers = () => [
    http.get('*/api/v1/budgets', ({ request }) => {
      log(request)
      return HttpResponse.json(
        state.budgets
          .filter((b) => !b.removed)
          .map((b) => ({ month: b.month, total: Number(b.total).toFixed(2) })),
      )
    }),
    http.get('*/api/v1/budgets/:month', ({ request, params }) => {
      log(request)
      return HttpResponse.json(monthBudget(String(params.month)))
    }),
    http.post('*/api/v1/budgets/:month/review', async ({ request, params }) => {
      log(request)
      const body = (await request.json()) as {
        total: string
        targets: { categoryId: string; amount: string }[]
      }
      if (Number(body.total) < 0 || body.targets.some((t) => Number(t.amount) < 0))
        return problem(400, 'Enter zero or a positive amount')
      return HttpResponse.json(budgetView(String(params.month), { id: null, ...body }))
    }),
    http.put('*/api/v1/budgets/:month', async ({ request, params }) => {
      log(request)
      const month = String(params.month)
      const body = (await request.json()) as {
        total: string
        targets: { categoryId: string; amount: string }[]
        enteredByMemberId: string
      }
      if (Number(body.total) < 0 || body.targets.some((t) => Number(t.amount) < 0))
        return problem(400, 'Enter zero or a positive amount')
      const event = {
        action: 'saved',
        memberId: body.enteredByMemberId,
        at: '2026-10-06T09:00:00Z',
      }
      const existing = state.budgets.find((b) => b.month === month && !b.removed)
      if (existing) {
        existing.total = body.total
        existing.targets = body.targets
        existing.events = [...(existing.events ?? []), event]
      } else {
        state.budgets.push({
          id: newId(),
          month,
          total: body.total,
          targets: body.targets,
          events: [event],
        })
      }
      return HttpResponse.json(monthBudget(month), { status: 201 })
    }),
    http.post('*/api/v1/budgets/:month/copy', async ({ request, params }) => {
      log(request)
      const month = String(params.month)
      const body = (await request.json()) as { fromMonth: string; enteredByMemberId: string }
      const source = state.budgets.find((b) => b.month === body.fromMonth && !b.removed)
      if (!source) return problem(404, `No Budget for ${body.fromMonth} to copy`)
      state.budgets.push({
        id: newId(),
        month,
        total: source.total,
        targets: source.targets.map((t) => ({ ...t })),
        events: [
          { action: 'copied', memberId: body.enteredByMemberId, at: '2026-10-06T09:00:00Z' },
        ],
      })
      return HttpResponse.json(monthBudget(month), { status: 201 })
    }),
    http.post('*/api/v1/budgets/:month/remove', async ({ request, params }) => {
      log(request)
      const month = String(params.month)
      const body = (await request.json()) as { enteredByMemberId: string }
      const active = state.budgets.find((b) => b.month === month && !b.removed)
      if (active) {
        active.removed = true
        active.events = [
          ...(active.events ?? []),
          { action: 'removed', memberId: body.enteredByMemberId, at: '2026-10-06T09:00:00Z' },
        ]
      }
      return HttpResponse.json(monthBudget(month))
    }),
    http.post('*/api/v1/budgets/:month/undo', async ({ request, params }) => {
      log(request)
      const month = String(params.month)
      const body = (await request.json()) as { enteredByMemberId: string }
      const removed = [...state.budgets].reverse().find((b) => b.month === month && b.removed)
      if (removed) {
        removed.removed = false
        removed.events = [
          ...(removed.events ?? []),
          { action: 'restored', memberId: body.enteredByMemberId, at: '2026-10-06T09:00:00Z' },
        ]
      }
      return HttpResponse.json(monthBudget(month))
    }),
  ]

  const scheduleView = (s: MockSchedule | (Omit<MockSchedule, 'id'> & { id: null })) => {
    const account = state.accounts.find((a) => a.id === s.accountId)
    const category = CATEGORIES.find((c) => c.id === effectiveId(s.categoryId))
    const key = s.description.trim().toLowerCase()
    const overdue =
      s.status === 'active' && s.nextDueOn < today
        ? Math.round((Date.parse(today) - Date.parse(s.nextDueOn)) / 86_400_000)
        : null
    return {
      id: s.id,
      accountId: s.accountId,
      accountName: account?.name ?? '',
      accountStatus: account?.status ?? 'active',
      description: s.description,
      categoryId: category?.id ?? s.categoryId,
      categoryName: category?.name ?? '',
      categoryArchived: category?.archived ?? false,
      amount: Number(s.amount).toFixed(2),
      frequency: s.frequency,
      status: s.status,
      nextDueOn: s.nextDueOn,
      followingDueOn: followingDue(s.nextDueOn, s.frequency, s.anchorDay),
      overdueDays: overdue,
      occurrences: s.occurrences,
      history: s.events,
      bills: state.activity
        .filter(
          (a) =>
            !a.removedAt &&
            a.kind === 'expense' &&
            a.accountId === s.accountId &&
            effectiveId(a.categoryId) === (category?.id ?? s.categoryId) &&
            (a.description ?? '').trim().toLowerCase() === key,
        )
        .map((a) => decorate(a, state.accounts, state.activity)),
    }
  }
  const checkSchedule = (body: {
    description?: string
    amount: string
    nextDueOn?: string
    accountId: string
    categoryId: string
  }) => {
    if (!(Number(body.amount) > 0)) return problem(400, 'Enter an amount greater than zero')
    if (!(body.description ?? 'x').trim()) return problem(400, 'Enter what this bill is')
    return null
  }
  /** A suggestion is offered until a schedule has its account, category and description or it is dismissed. */
  const suggestionViews = () =>
    state.suggestions
      .filter(
        (g) =>
          !state.schedules.some(
            (s) =>
              !s.removed &&
              s.accountId === g.accountId &&
              effectiveId(s.categoryId) === effectiveId(g.categoryId) &&
              s.description.trim().toLowerCase() === g.description.trim().toLowerCase(),
          ),
      )
      .map((g) => {
        const bills = state.activity
          .filter(
            (a) =>
              !a.removedAt &&
              a.kind === 'expense' &&
              a.accountId === g.accountId &&
              effectiveId(a.categoryId) === effectiveId(g.categoryId) &&
              (a.description ?? '').trim().toLowerCase() === g.description.trim().toLowerCase(),
          )
          .sort((a, b) => a.occurredOn.localeCompare(b.occurredOn))
        const latest = bills[bills.length - 1]
        const category = CATEGORIES.find((c) => c.id === effectiveId(g.categoryId))
        return {
          accountId: g.accountId,
          accountName: state.accounts.find((a) => a.id === g.accountId)?.name ?? '',
          categoryId: category?.id ?? g.categoryId,
          categoryName: category?.name ?? '',
          description: g.description,
          amount: Number(latest.amount).toFixed(2),
          frequency: 'monthly',
          lastRecordedOn: latest.occurredOn,
          nextExpectedOn: followingDue(
            latest.occurredOn,
            'monthly',
            Number(latest.occurredOn.slice(8)),
          ),
          bills: bills.map((a) => decorate(a, state.accounts, state.activity)),
        }
      })
  const overview = () => ({
    today,
    suggestions: suggestionViews(),
    schedules: state.schedules
      .filter((s) => !s.removed)
      .sort((a, b) => a.nextDueOn.localeCompare(b.nextDueOn))
      .map(scheduleView),
  })
  const recurringHandlers = () => [
    http.get('*/api/v1/recurring', ({ request }) => {
      log(request)
      return HttpResponse.json(overview())
    }),
    http.get('*/api/v1/recurring/payments', ({ request }) => {
      log(request)
      const accountId = new URL(request.url).searchParams.get('accountId')
      return HttpResponse.json(
        state.schedules
          .filter((s) => s.accountId === accountId)
          .flatMap((s) =>
            s.occurrences
              .filter((o) => o.activityId)
              .map((o) => ({
                activityId: o.activityId,
                scheduleId: s.id,
                description: s.description,
                dueOn: o.dueOn,
              })),
          ),
      )
    }),
    http.post('*/api/v1/recurring/suggestions/dismiss', async ({ request }) => {
      log(request)
      const body = (await request.json()) as { accountId: string; description: string }
      state.suggestions = state.suggestions.filter(
        (g) =>
          !(
            g.accountId === body.accountId &&
            g.description.trim().toLowerCase() === body.description.trim().toLowerCase()
          ),
      )
      return HttpResponse.json(overview())
    }),
    http.post('*/api/v1/recurring/review', async ({ request }) => {
      log(request)
      const body = (await request.json()) as MockScheduleBody
      const refused = checkSchedule(body)
      if (refused) return refused
      return HttpResponse.json(
        scheduleView({
          id: null,
          accountId: body.accountId,
          description: body.description.trim(),
          categoryId: body.categoryId,
          amount: body.amount,
          frequency: body.frequency,
          status: 'active',
          nextDueOn: body.nextDueOn,
          anchorDay: Number(body.nextDueOn.slice(8)),
          occurrences: [],
          events: [],
        }),
      )
    }),
    http.put('*/api/v1/recurring/:id', async ({ request, params }) => {
      log(request)
      const body = (await request.json()) as MockScheduleBody
      const found = state.schedules.find((s) => s.id === params.id && !s.removed)
      if (!found) return problem(404, 'Recurring bill not found')
      if (!(Number(body.amount) > 0)) return problem(400, 'Enter an amount greater than zero')
      found.events.unshift({
        action: 'changed',
        memberId: body.enteredByMemberId,
        at: '2026-10-06T09:00:00Z',
        detail: `Amount $${Number(found.amount).toFixed(2)} to $${Number(body.amount).toFixed(2)}`,
      })
      found.amount = body.amount
      found.frequency = body.frequency
      found.nextDueOn = body.nextDueOn
      found.anchorDay = Number(body.nextDueOn.slice(8))
      return HttpResponse.json(scheduleView(found), { status: 201 })
    }),
    http.post('*/api/v1/recurring/:id/record/review', async ({ request, params }) => {
      log(request)
      const body = (await request.json()) as RecordBody
      const found = state.schedules.find((s) => s.id === params.id && !s.removed)
      if (!found) return problem(404, 'Recurring bill not found')
      if (found.nextDueOn !== body.dueOn)
        return problem(409, `The next occurrence is ${found.nextDueOn}`)
      if (!(Number(body.amount) > 0)) return problem(400, 'Enter an amount greater than zero')
      if (body.paidOn > today)
        return problem(400, 'Future activity is not saved as completed history yet')
      const next = followingDue(body.dueOn, found.frequency, found.anchorDay)
      return HttpResponse.json({
        description: found.description,
        accountName: state.accounts.find((a) => a.id === found.accountId)?.name ?? '',
        categoryName: CATEGORIES.find((c) => c.id === body.categoryId)?.name ?? '',
        amount: Number(body.amount).toFixed(2),
        balanceBefore: Number(
          state.accounts.find((a) => a.id === found.accountId)?.balance.amount ?? 0,
        ).toFixed(2),
        balanceAfter: (
          Number(state.accounts.find((a) => a.id === found.accountId)?.balance.amount ?? 0) -
          Number(body.amount)
        ).toFixed(2),
        paidOn: body.paidOn,
        dueOn: body.dueOn,
        early: body.paidOn < body.dueOn,
        nextDueOn: next,
        followingDueOn: followingDue(next, found.frequency, found.anchorDay),
      })
    }),
    http.post('*/api/v1/recurring/:id/record', async ({ request, params }) => {
      log(request)
      const key = request.headers.get('Idempotency-Key') ?? ''
      const body = (await request.json()) as RecordBody
      const found = state.schedules.find((s) => s.id === params.id && !s.removed)
      if (!found) return problem(404, 'Recurring bill not found')
      if (found.key === `record:${key}`) return HttpResponse.json(scheduleView(found))
      if (found.nextDueOn !== body.dueOn)
        return problem(409, `The next occurrence is ${found.nextDueOn}`)
      const account = state.accounts.find((a) => a.id === found.accountId)!
      const amount = Number(body.amount)
      const entry: MockActivity = {
        id: newId(),
        accountId: account.id,
        key,
        kind: 'expense',
        amount: amount.toFixed(2),
        occurredOn: body.paidOn,
        description: found.description,
        categoryId: body.categoryId,
        classification: null,
        enteredByMemberId: body.enteredByMemberId,
      }
      state.activity.push(entry)
      account.balance = {
        amount: (Number(account.balance.amount) - amount).toFixed(2),
        asOf: account.balance.asOf,
      }
      found.occurrences.unshift({
        dueOn: body.dueOn,
        outcome: 'paid',
        paidOn: body.paidOn,
        activityId: entry.id,
      })
      found.nextDueOn = followingDue(body.dueOn, found.frequency, found.anchorDay)
      found.events.unshift({
        action: 'paid',
        memberId: body.enteredByMemberId,
        at: '2026-10-06T09:00:00Z',
        detail: `Paid $${amount.toFixed(2)} on ${body.paidOn} for the ${body.dueOn} occurrence`,
      })
      found.key = `record:${key}`
      return HttpResponse.json(scheduleView(found), { status: 201 })
    }),
    http.post('*/api/v1/recurring/:id/reschedule', async ({ request, params }) => {
      log(request)
      const body = (await request.json()) as { enteredByMemberId: string; dueOn?: string }
      const found = state.schedules.find((s) => s.id === params.id && !s.removed)
      if (!found) return problem(404, 'Recurring bill not found')
      if (!body.dueOn) return problem(400, 'Enter the new due date')
      found.events.unshift({
        action: 'rescheduled',
        memberId: body.enteredByMemberId,
        at: '2026-10-06T09:00:00Z',
        detail: `Next due ${found.nextDueOn} to ${body.dueOn}`,
      })
      found.nextDueOn = body.dueOn
      found.anchorDay = Number(body.dueOn.slice(8))
      return HttpResponse.json(scheduleView(found))
    }),
    http.post('*/api/v1/recurring/:id/dismiss', async ({ request, params }) => {
      log(request)
      const body = (await request.json()) as { enteredByMemberId: string; dueOn?: string }
      const found = state.schedules.find((s) => s.id === params.id && !s.removed)
      if (!found) return problem(404, 'Recurring bill not found')
      if (found.nextDueOn !== body.dueOn)
        return problem(409, `The next occurrence is ${found.nextDueOn}, not ${body.dueOn}`)
      found.occurrences.unshift({
        dueOn: body.dueOn,
        outcome: 'dismissed',
        paidOn: null,
        activityId: null,
      })
      found.nextDueOn = followingDue(body.dueOn, found.frequency, found.anchorDay)
      found.events.unshift({
        action: 'dismissed',
        memberId: body.enteredByMemberId,
        at: '2026-10-06T09:00:00Z',
        detail: `The ${body.dueOn} occurrence is dismissed`,
      })
      return HttpResponse.json(scheduleView(found))
    }),
    ...(['pause', 'resume', 'delete'] as const).map((action) =>
      http.post(`*/api/v1/recurring/:id/${action}`, async ({ request, params }) => {
        log(request)
        const body = (await request.json()) as { enteredByMemberId: string; dueOn?: string }
        const found = state.schedules.find((s) => s.id === params.id)
        if (!found || (found.removed && action !== 'delete'))
          return problem(404, 'Recurring bill not found')
        const note = (detail: string) =>
          found.events.unshift({
            action: action === 'pause' ? 'paused' : action === 'resume' ? 'resumed' : 'deleted',
            memberId: body.enteredByMemberId,
            at: '2026-10-06T09:00:00Z',
            detail,
          })
        if (action === 'pause' && found.status === 'active') {
          found.status = 'paused'
          note(`Next due ${found.nextDueOn} is not expected while paused`)
        }
        if (action === 'resume') {
          if (!body.dueOn) return problem(400, 'Enter the next due date')
          found.status = 'active'
          found.nextDueOn = body.dueOn
          found.anchorDay = Number(body.dueOn.slice(8))
          note(`Next due ${body.dueOn}`)
        }
        if (action === 'delete' && !found.removed) {
          found.removed = true
          // A deleted estimate is not suggested again.
          state.suggestions = state.suggestions.filter(
            (g) =>
              !(
                g.accountId === found.accountId &&
                g.description.trim().toLowerCase() === found.description.trim().toLowerCase()
              ),
          )
          note(`Deleted ${found.description}`)
        }
        return HttpResponse.json(scheduleView(found))
      }),
    ),
    http.post('*/api/v1/recurring', async ({ request }) => {
      log(request)
      const key = request.headers.get('Idempotency-Key') ?? ''
      const body = (await request.json()) as MockScheduleBody
      const existing = state.schedules.find((s) => s.key === key)
      if (existing) return HttpResponse.json(scheduleView(existing))
      const refused = checkSchedule(body)
      if (refused) return refused
      const schedule: MockSchedule = {
        id: newId(),
        key,
        accountId: body.accountId,
        description: body.description.trim(),
        categoryId: body.categoryId,
        amount: body.amount,
        frequency: body.frequency,
        status: 'active',
        nextDueOn: body.nextDueOn,
        anchorDay: Number(body.nextDueOn.slice(8)),
        occurrences: [],
        events: [
          {
            action: 'created',
            memberId: body.enteredByMemberId,
            at: '2026-10-06T09:00:00Z',
            detail: `Expected $${Number(body.amount).toFixed(2)} ${body.frequency}, first due ${body.nextDueOn}`,
          },
        ],
      }
      state.schedules.push(schedule)
      return HttpResponse.json(scheduleView(schedule), { status: 201 })
    }),
  ]

  server.use(
    ...budgetHandlers(),
    ...recurringHandlers(),
    http.get('*/api/v1/household', ({ request }) => {
      log(request)
      return state.household
        ? HttpResponse.json(state.household)
        : problem(404, 'No household has been created yet')
    }),
    http.post('*/api/v1/household', async ({ request }) => {
      log(request)
      const { name } = (await request.json()) as { name: string }
      if (state.household) return problem(409, 'A household already exists')
      if (!name.trim()) return problem(400, 'Household name must be 1 to 120 characters')
      state.household = { id: newId(), name: name.trim() }
      return HttpResponse.json(state.household, { status: 201 })
    }),
    http.put('*/api/v1/household', async ({ request }) => {
      log(request)
      const { name } = (await request.json()) as { name: string }
      if (!state.household) return problem(404, 'No household has been created yet')
      state.household = { ...state.household, name: name.trim() }
      return HttpResponse.json(state.household)
    }),
    http.get('*/api/v1/household-members', ({ request }) => {
      log(request)
      const householdId = new URL(request.url).searchParams.get('householdId')
      return HttpResponse.json(
        state.members.filter((m) => m.householdId === householdId).map(memberBody),
      )
    }),
    http.post('*/api/v1/household-members', async ({ request }) => {
      log(request)
      const body = (await request.json()) as { householdId: string; name: string; label: string }
      const failure = validateMember(state.members, body.name, body.label)
      if (failure) return failure
      const member = {
        id: newId(),
        householdId: body.householdId,
        name: body.name.trim(),
        label: body.label.trim() || null,
      }
      state.members.push(member)
      return HttpResponse.json(memberBody(member), { status: 201 })
    }),
    http.put('*/api/v1/household-members/:id', async ({ request, params }) => {
      log(request)
      const body = (await request.json()) as { name: string; label: string }
      const existing = state.members.find((m) => m.id === params.id)
      if (!existing) return problem(404, `Household member not found: ${String(params.id)}`)
      const failure = validateMember(
        state.members.filter((m) => m.id !== existing.id),
        body.name,
        body.label,
      )
      if (failure) return failure
      const name = body.name.trim()
      const label = body.label.trim() || null
      if (name !== existing.name || label !== existing.label) {
        existing.nameHistory = [
          { name: existing.name, label: existing.label, changedAt: '2026-10-03T12:00:00Z' },
          ...(existing.nameHistory ?? []),
        ]
      }
      existing.name = name
      existing.label = label
      return HttpResponse.json(memberBody(existing))
    }),
    http.post('*/api/v1/household-members/:id/deactivate', ({ request, params }) => {
      log(request)
      const existing = state.members.find((m) => m.id === params.id)
      if (!existing) return problem(404, `Household member not found: ${String(params.id)}`)
      existing.active = false
      return HttpResponse.json(memberBody(existing))
    }),
    http.post('*/api/v1/household-members/:id/restore', ({ request, params }) => {
      log(request)
      const existing = state.members.find((m) => m.id === params.id)
      if (!existing) return problem(404, `Household member not found: ${String(params.id)}`)
      existing.active = true
      return HttpResponse.json(memberBody(existing))
    }),
    ...(['archive', 'restore', 'close', 'reopen'] as const).map((action) =>
      http.post(`*/api/v1/accounts/:id/${action}`, async ({ request, params }) => {
        log(request)
        const body = (await request.json().catch(() => ({}))) as { enteredByMemberId?: unknown }
        const existing = state.accounts.find((a) => a.id === params.id)
        if (!existing) return problem(404, `Account not found: ${String(params.id)}`)
        if (action === 'close' && Number(existing.balance.amount) !== 0)
          return problem(
            409,
            `Closing ${existing.name} needs a zero Balance. It has ${existing.balance.amount}; move it or pay it first.`,
          )
        existing.status = { archive: 'archived', close: 'closed' }[action as string] ?? 'active'
        noteAccountEvent(
          existing.id,
          { archive: 'archived', restore: 'restored', close: 'closed', reopen: 'reopened' }[action],
          body.enteredByMemberId,
        )
        return HttpResponse.json(existing)
      }),
    ),
    http.get('*/api/v1/accounts/:id/events', ({ request, params }) => {
      log(request)
      return HttpResponse.json(accountEvents.get(String(params.id)) ?? [])
    }),
    http.get('*/api/v1/accounts/:id/lifecycle', ({ request, params }) => {
      log(request)
      const existing = state.accounts.find((a) => a.id === params.id)
      if (!existing) return problem(404, `Account not found: ${String(params.id)}`)
      const reasons = deleteBlockers(existing)
      const planned = state.values.filter(
        (v) => v.accountId === existing.id && v.planned && !v.removedAt,
      ).length
      return HttpResponse.json({
        canDelete: reasons.length === 0,
        deleteBlockedBy: reasons,
        closeBlockedBy:
          planned > 0
            ? [
                `${existing.name} has ${planned} planned ${isDebtType(existing.type) ? 'amount' : 'value'}${planned === 1 ? '' : 's'}. Remove ${planned === 1 ? 'it' : 'them'} first, then close.`,
              ]
            : [],
      })
    }),
    http.post('*/api/v1/accounts/:id/delete', ({ request, params }) => {
      log(request)
      const index = state.accounts.findIndex((a) => a.id === params.id)
      if (index < 0) return problem(404, `Account not found: ${String(params.id)}`)
      const reasons = deleteBlockers(state.accounts[index])
      if (reasons.length > 0)
        return problem(
          409,
          `${state.accounts[index].name} has saved history that must be retained.`,
        )
      const [removed] = state.accounts.splice(index, 1)
      deletedAccounts.push(removed)
      return HttpResponse.json(removed)
    }),
    http.post('*/api/v1/accounts/:id/undo-delete', ({ request, params }) => {
      log(request)
      const back = deletedAccounts.findIndex((a) => a.id === params.id)
      if (back >= 0) state.accounts.push(...deletedAccounts.splice(back, 1))
      const existing = state.accounts.find((a) => a.id === params.id)
      if (!existing) return problem(404, `Account not found: ${String(params.id)}`)
      return HttpResponse.json(existing)
    }),
    http.get('*/api/v1/today', ({ request }) => {
      log(request)
      return HttpResponse.json({ today })
    }),
    http.get('*/api/v1/accounts', ({ request }) => {
      log(request)
      return HttpResponse.json(state.accounts)
    }),
    http.get('*/api/v1/categories', ({ request }) => {
      log(request)
      const kind = new URL(request.url).searchParams.get('kind')
      const all = new URL(request.url).searchParams.get('includeArchived') === 'true'
      return HttpResponse.json(
        CATEGORIES.filter((c) => (!kind || c.kind === kind) && (all || !c.archived)).map(catView),
      )
    }),
    http.post('*/api/v1/categories', async ({ request }) => {
      log(request)
      const body = (await request.json()) as {
        name: string
        kind: string
        defaultClass?: string
        enteredByMemberId?: string
      }
      const name = (body.name ?? '').trim()
      if (!name) return problem(400, 'Enter a category name')
      if (body.kind === 'income' && body.defaultClass)
        return problem(400, 'An income category has no Essential or Discretionary choice')
      if (!body.enteredByMemberId) return problem(400, 'Choose who entered this')
      const same = CATEGORIES.find(
        (c) => c.kind === body.kind && c.name.toLowerCase() === name.toLowerCase(),
      )
      if (same) return problem(409, `"${same.name}" already exists. Use that category instead.`)
      const created: MockCategory = {
        id: newId(),
        name,
        kind: body.kind,
        defaultClass: body.defaultClass ?? null,
      }
      CATEGORIES.push(created)
      return HttpResponse.json(catView(created), { status: 201 })
    }),
    http.get('*/api/v1/categories/:id/usage', ({ request, params }) => {
      log(request)
      const rows = live().filter(
        (a) =>
          effectiveId(a.categoryId) === params.id && (a.kind === 'expense' || a.kind === 'refund'),
      )
      return HttpResponse.json({
        entries: rows.length,
        total: rows.reduce((sum, a) => sum + effect(a), 0).toFixed(2),
      })
    }),
    http.get('*/api/v1/categories/:id/history', ({ request, params }) => {
      log(request)
      return HttpResponse.json(categoryEvents.get(String(params.id)) ?? [])
    }),
    ...(['rename', 'default-class', 'archive', 'restore'] as const).map((action) =>
      http.post(`*/api/v1/categories/:id/${action}`, async ({ request, params }) => {
        log(request)
        const body = (await request.json()) as {
          name?: string
          defaultClass?: string
          enteredByMemberId?: string
        }
        const category = CATEGORIES.find((c) => c.id === params.id)
        if (!category) return problem(404, 'Category not found')
        if (!body.enteredByMemberId) return problem(400, 'Choose who entered this')
        const by = nameOf(body.enteredByMemberId)
        const at = '2026-10-03T09:00:00Z'
        if (action === 'rename') {
          const name = (body.name ?? '').trim()
          if (!name) return problem(400, 'Enter a category name')
          const same = CATEGORIES.find(
            (c) =>
              c.id !== category.id &&
              c.kind === category.kind &&
              c.name.toLowerCase() === name.toLowerCase(),
          )
          if (same) return problem(409, `"${same.name}" already exists. Use that category instead.`)
          noteEvent(category.id, {
            action: 'renamed',
            oldName: category.name,
            newName: name,
            by,
            at,
          })
          category.name = name
        } else if (action === 'default-class') {
          noteEvent(category.id, {
            action: 'default_changed',
            detail: `${category.defaultClass ?? 'none'} to ${body.defaultClass ?? 'none'}`,
            by,
            at,
          })
          category.defaultClass = body.defaultClass ?? null
        } else if (action === 'archive') {
          if (!category.archived) noteEvent(category.id, { action: 'archived', by, at })
          category.archived = true
        } else {
          if (category.mergedIntoId)
            return problem(409, `"${category.name}" was merged. Undo the merge instead.`)
          if (category.archived) noteEvent(category.id, { action: 'restored', by, at })
          category.archived = false
        }
        return HttpResponse.json(catView(category))
      }),
    ),
    http.post('*/api/v1/categories/merges', async ({ request }) => {
      log(request)
      const body = (await request.json()) as {
        sourceIds: string[]
        targetId?: string
        newName?: string
        enteredByMemberId?: string
      }
      if (!body.enteredByMemberId) return problem(400, 'Choose who entered this')
      const sources = CATEGORIES.filter((c) => body.sourceIds.includes(c.id))
      if (sources.length === 0) return problem(400, 'Choose the categories to merge')
      const gone = sources.find((c) => c.archived)
      if (gone) return problem(409, `"${gone.name}" is archived or already merged.`)
      let target = CATEGORIES.find((c) => c.id === body.targetId)
      if (!target) {
        const name = (body.newName ?? '').trim()
        if (!name) return problem(400, 'Enter a category name')
        if (
          CATEGORIES.some(
            (c) => c.kind === sources[0].kind && c.name.toLowerCase() === name.toLowerCase(),
          )
        )
          return problem(409, `"${name}" already exists. Use that category instead.`)
        target = { id: newId(), name, kind: sources[0].kind, defaultClass: sources[0].defaultClass }
        CATEGORIES.push(target)
      }
      const mergeId = newId()
      const by = nameOf(body.enteredByMemberId)
      sources.forEach((c) => {
        c.archived = true
        c.mergedIntoId = target.id
        c.mergeId = mergeId
        noteEvent(c.id, {
          action: 'merged',
          oldName: c.name,
          newName: target.name,
          detail: `Merged into ${target.name}`,
          by,
          at: '2026-10-03T09:00:00Z',
        })
      })
      return HttpResponse.json({ mergeId, target: catView(target) }, { status: 201 })
    }),
    http.post('*/api/v1/categories/merges/:mergeId/undo', ({ request, params }) => {
      log(request)
      const sources = CATEGORIES.filter((c) => c.mergeId === params.mergeId)
      if (sources.length === 0) return problem(409, 'This merge was already undone.')
      sources.forEach((c) => {
        c.archived = false
        c.mergedIntoId = null
        c.mergeId = null
      })
      return HttpResponse.json(sources.map(catView))
    }),
    http.get('*/api/v1/accounts/:id/activity', ({ request, params }) => {
      log(request)
      return HttpResponse.json(
        live()
          .filter((a) => a.accountId === params.id)
          .map((a) => decorate(a, state.accounts, state.activity))
          .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn)),
      )
    }),
    http.get(
      '*/api/v1/accounts/:id/activity/:activityId/replacement/preview',
      ({ request, params }) => {
        log(request)
        const query = new URL(request.url).searchParams
        const original = state.activity.find((a) => a.id === params.activityId)
        const source = state.accounts.find((a) => a.id === params.id)
        const target = state.accounts.find(
          (a) => a.id === (query.get('targetAccountId') ?? params.id),
        )
        if (!original || !source || !target) return problem(404, 'Entry not found')
        const amount = Number(query.get('amount'))
        const date = query.get('occurredOn') ?? ''
        const same = source.id === target.id
        const oldSigned = signed(original)
        const newSigned = original.kind === 'income' ? amount : -amount
        const fromAfter = Number(source.balance.amount) - oldSigned + (same ? newSigned : 0)
        const toAfter = same ? fromAfter : Number(target.balance.amount) + newSigned
        const kind = original.kind === 'income' ? 'income' : 'expense'
        const month = (m: string) => {
          const before = live()
            .filter((a) => a.kind === kind && a.occurredOn.startsWith(m))
            .reduce((sum, a) => sum + Number(a.amount), 0)
          const after =
            before -
            (original.occurredOn.startsWith(m) ? Number(original.amount) : 0) +
            (date.startsWith(m) ? amount : 0)
          return {
            month: m,
            kind: kind === 'income' ? 'income' : 'spending',
            before: before.toFixed(2),
            after: after.toFixed(2),
          }
        }
        return HttpResponse.json({
          from: { id: source.id, name: source.name, balanceAfter: fromAfter.toFixed(2) },
          to: { id: target.id, name: target.name, balanceAfter: toAfter.toFixed(2) },
          oldMonth: month(original.occurredOn.slice(0, 7)),
          newMonth: month(date.slice(0, 7)),
        })
      },
    ),
    http.get('*/api/v1/accounts/:id/activity/history', ({ request, params }) => {
      log(request)
      const name = (id: string | null | undefined) => nameOf(id) || null
      const origin = (row: MockActivity | undefined) => {
        if (!row) return null
        return {
          id: row.id,
          accountId: row.accountId,
          accountName: state.accounts.find((a) => a.id === row.accountId)?.name ?? '',
          kind: row.kind,
          amount: row.amount,
          occurredOn: row.occurredOn,
          categoryName: CATEGORIES.find((c) => c.id === row.categoryId)?.name ?? null,
          enteredByName: name(row.enteredByMemberId),
          at: row.createdAt ?? '2026-10-03T09:00:00Z',
          split: !!row.portions?.length,
        }
      }
      return HttpResponse.json(
        state.activity
          .filter((a) => a.accountId === params.id)
          .map((a) => {
            const replacement = state.activity.find((r) => r.replacesId === a.id)
            return {
              id: a.id,
              kind: a.kind,
              amount: a.amount,
              occurredOn: a.occurredOn,
              description: a.description,
              categoryName: CATEGORIES.find((c) => c.id === a.categoryId)?.name ?? null,
              portions: shownPortions(a),
              enteredByName: name(a.enteredByMemberId),
              createdAt: a.createdAt ?? '2026-10-03T09:00:00Z',
              reason: a.reason ?? null,
              replacesId: a.replacesId ?? null,
              replacedById: replacement?.id ?? null,
              replaces: origin(state.activity.find((r) => r.id === a.replacesId)),
              replacedBy: origin(replacement),
              events: a.events ?? [],
              status: replacement ? 'replaced' : a.removedAt ? 'removed' : 'effective',
              movementId: a.movementId ?? null,
              counterAccountId: decorate(a, state.accounts, state.activity).counterAccountId,
              counterAccountName: decorate(a, state.accounts, state.activity).counterAccountName,
            }
          })
          .reverse(),
      )
    }),
    http.get('*/api/v1/accounts/:id/balance', ({ request, params }) => {
      log(request)
      const account = state.accounts.find((a) => a.id === params.id)
      const asOf = new URL(request.url).searchParams.get('asOf') ?? ''
      if (!account) return problem(404, 'Account not found')
      return HttpResponse.json({
        amount: asOf < account.openedOn ? null : balanceOn(account, asOf).toFixed(2),
        asOn: asOf,
      })
    }),
    http.get('*/api/v1/accounts/:id/balance-corrections/preview', ({ request, params }) => {
      log(request)
      const account = state.accounts.find((a) => a.id === params.id)
      const query = new URL(request.url).searchParams
      const asOn = query.get('asOn') ?? ''
      if (!account) return problem(404, 'Account not found')
      const typed = signedFor(account, query.get('requested') ?? '', query.get('side'))
      if (typeof typed !== 'number') return typed
      const requested = typed
      const replaces = query.get('replaces') ?? undefined
      const onDate = balanceOn(account, asOn, replaces)
      const replaced = state.activity.find((a) => a.id === replaces)
      const current = currentBalance(account)
      const after = current - (replaced ? Number(replaced.amount) : 0) + (requested - onDate)
      return HttpResponse.json({
        asOn,
        balanceOnDate: onDate.toFixed(2),
        requested: requested.toFixed(2),
        difference: (requested - onDate).toFixed(2),
        currentBalance: current.toFixed(2),
        currentBalanceAfter: after.toFixed(2),
        overdraft: after < 0 && account.type !== 'credit_card' && !isDebtType(account.type),
      })
    }),
    http.post('*/api/v1/accounts/:id/balance-corrections', async ({ request, params }) => {
      log(request)
      if (state.failNextSave) {
        const message = state.failNextSave
        state.failNextSave = null
        return problem(409, message)
      }
      const key = request.headers.get('Idempotency-Key') ?? ''
      const body = (await request.json()) as {
        requestedBalance: string
        asOn: string
        reason: string
        enteredByMemberId: string
        replacesId?: string
        balanceSide?: string
      }
      const account = state.accounts.find((a) => a.id === params.id)
      if (!account) return problem(404, 'Account not found')
      if (!body.reason?.trim()) return problem(400, 'Enter a reason')
      const typed = signedFor(account, body.requestedBalance, body.balanceSide)
      if (typeof typed !== 'number') return typed
      const existing = state.activity.find((a) => a.key === key)
      if (existing) return HttpResponse.json(decorate(existing, state.accounts), { status: 200 })
      const replaced = state.activity.find((a) => a.id === body.replacesId)
      const difference = typed - balanceOn(account, body.asOn, replaced?.id)
      if (replaced) {
        replaced.removedAt = '2026-10-03T09:00:00Z'
        replaced.events = [
          ...(replaced.events ?? []),
          {
            action: 'replaced',
            byName: nameOf(body.enteredByMemberId),
            at: '2026-10-03T09:05:00Z',
          },
        ]
      }
      const entry: MockActivity = {
        id: newId(),
        accountId: account.id,
        key,
        kind: 'correction',
        amount: difference.toFixed(2),
        occurredOn: body.asOn,
        description: null,
        categoryId: '',
        enteredByMemberId: body.enteredByMemberId,
        createdAt: '2026-10-03T09:05:00Z',
        reason: body.reason.trim(),
        replacesId: replaced?.id ?? null,
      }
      state.activity.push(entry)
      account.balance = { amount: currentBalance(account).toFixed(2), asOf: account.balance.asOf }
      return HttpResponse.json(decorate(entry, state.accounts), { status: 201 })
    }),
    http.get(
      '*/api/v1/accounts/:id/starting-balance-corrections/preview',
      ({ request, params }) => {
        log(request)
        const account = state.accounts.find((a) => a.id === params.id)
        if (!account) return problem(404, 'Account not found')
        const query = new URL(request.url).searchParams
        const typed = signedFor(account, query.get('openingAmount') ?? '', null)
        if (typeof typed !== 'number') return typed
        // A loan's amount is typed as an amount owed; the figures below carry the stored (negative) sign.
        const amount = isDebtType(account.type) ? typed : Number(query.get('openingAmount'))
        const current = currentBalance(account)
        return HttpResponse.json({
          originalAmount: Number(account.openingAmount).toFixed(2),
          originalOn: account.openedOn,
          openingAmount: amount.toFixed(2),
          openedOn: query.get('openedOn'),
          currentBalance: current.toFixed(2),
          currentBalanceAfter: (current - Number(account.openingAmount) + amount).toFixed(2),
          overdraft:
            !isDebtType(account.type) && current - Number(account.openingAmount) + amount < 0,
          ...(query.get('entryAmount') ? previewEntry(account, amount, query) : {}),
        })
      },
    ),
    http.post('*/api/v1/accounts/:id/historical-entries', async ({ request, params }) => {
      log(request)
      const account = state.accounts.find((a) => a.id === params.id)
      if (!account) return problem(404, 'Account not found')
      const key = request.headers.get('Idempotency-Key') ?? ''
      const body = (await request.json()) as {
        kind: string
        entry: ExpenseBody
        startRevision: { openingAmount: string; openedOn: string; reason: string }
      }
      const existing = state.activity.find((a) => a.key === key)
      if (existing) return HttpResponse.json(decorate(existing, state.accounts), { status: 200 })
      if (!body.startRevision.reason?.trim()) return problem(400, 'Enter a reason')
      state.openingRevisions.push({
        id: newId(),
        accountId: account.id,
        key,
        previousAmount: Number(account.openingAmount).toFixed(2),
        previousOn: account.openedOn,
        openingAmount: Number(body.startRevision.openingAmount).toFixed(2),
        openedOn: body.startRevision.openedOn,
        reason: body.startRevision.reason.trim(),
        enteredByMemberId: body.entry.enteredByMemberId,
        createdAt: '2026-10-03T12:00:00Z',
      })
      account.openingAmount = Number(body.startRevision.openingAmount).toFixed(2)
      account.openedOn = body.startRevision.openedOn
      const entry: MockActivity = {
        id: newId(),
        accountId: account.id,
        key,
        kind: body.kind,
        amount: Number(body.entry.amount).toFixed(2),
        occurredOn: body.entry.occurredOn,
        description: body.entry.description.trim() || null,
        categoryId: body.entry.categoryId ?? '',
        enteredByMemberId: body.entry.enteredByMemberId,
      }
      state.activity.push(entry)
      account.balance = { amount: currentBalance(account).toFixed(2), asOf: account.balance.asOf }
      return HttpResponse.json(decorate(entry, state.accounts), { status: 201 })
    }),
    http.get('*/api/v1/accounts/:id/starting-balance-corrections', ({ request, params }) => {
      log(request)
      return HttpResponse.json(
        state.openingRevisions
          .filter((r) => r.accountId === params.id)
          .map((r) => ({ ...r, enteredByName: nameOf(r.enteredByMemberId) })),
      )
    }),
    http.post('*/api/v1/accounts/:id/starting-balance-corrections', async ({ request, params }) => {
      log(request)
      if (state.failNextSave) {
        const message = state.failNextSave
        state.failNextSave = null
        return problem(409, message)
      }
      const account = state.accounts.find((a) => a.id === params.id)
      if (!account) return problem(404, 'Account not found')
      const key = request.headers.get('Idempotency-Key') ?? ''
      let body = (await request.json()) as {
        openingAmount: string
        openedOn: string
        reason: string
        enteredByMemberId: string
      }
      const existing = state.openingRevisions.find((r) => r.key === key)
      if (existing) {
        return HttpResponse.json(
          { ...existing, enteredByName: nameOf(existing.enteredByMemberId) },
          { status: 200 },
        )
      }
      if (!/^-?\d+(\.\d{1,2})?$/.test(body.openingAmount))
        return problem(400, 'Enter a valid amount')
      if (!body.reason?.trim()) return problem(400, 'Enter a reason')
      const typed = signedFor(account, body.openingAmount, null)
      if (typeof typed !== 'number') return typed
      if (isDebtType(account.type)) body = { ...body, openingAmount: typed.toFixed(2) }
      const revision: MockOpeningRevision = {
        id: newId(),
        accountId: account.id,
        key,
        previousAmount: Number(account.openingAmount).toFixed(2),
        previousOn: account.openedOn,
        openingAmount: Number(body.openingAmount).toFixed(2),
        openedOn: body.openedOn,
        reason: body.reason.trim(),
        enteredByMemberId: body.enteredByMemberId,
        createdAt: '2026-10-03T12:00:00Z',
      }
      state.openingRevisions.push(revision)
      account.openingAmount = revision.openingAmount
      account.openedOn = revision.openedOn
      account.balance = { amount: currentBalance(account).toFixed(2), asOf: account.balance.asOf }
      return HttpResponse.json(
        { ...revision, enteredByName: nameOf(revision.enteredByMemberId) },
        { status: 201 },
      )
    }),
    http.post('*/api/v1/accounts/opening-preview', async ({ request }) => {
      log(request)
      const judged = judgeSetup((await request.json()) as NewAccountBody & { opening?: unknown })
      return judged instanceof Response ? judged : HttpResponse.json(previewBody(judged))
    }),
    http.get('*/api/v1/accounts/:id/opening', ({ request, params }) => {
      log(request)
      const opening = state.openings.get(String(params.id))
      if (!opening) return problem(404, 'This account has no opening cash and holdings')
      const linked = state.statements.find((s) => s.id === opening.statementId)
      return HttpResponse.json(viewBody(opening, !!linked?.removedAt))
    }),
    http.get('*/api/v1/accounts/:id/holdings', ({ request, params }) => {
      log(request)
      const account = state.accounts.find((a) => a.id === params.id)
      if (!account) return problem(404, `Account not found: ${String(params.id)}`)
      if (account.status === 'draft')
        return problem(409, `${account.name} is a draft with no Balance yet. Finish setup first.`)
      const opening = state.openings.get(account.id)
      if (!opening) return problem(404, `${account.name} has no cash and holdings`)
      return HttpResponse.json(
        holdingsBody(opening, currentBalance(account).toFixed(2), account.openedOn),
      )
    }),
    http.put('*/api/v1/accounts/:id/opening', async ({ request, params }) => {
      log(request)
      const body = (await request.json()) as { opening?: unknown; enteredByMemberId?: string }
      const account = state.accounts.find((a) => a.id === params.id)
      if (!account) return problem(404, `Account not found: ${String(params.id)}`)
      if (account.status !== 'draft') return problem(409, `${account.name} is already set up`)
      if (!body.enteredByMemberId) return problem(400, 'Choose who entered this')
      const judged = judgeOpening(
        body.opening as Parameters<typeof judgeOpening>[0],
        account.openedOn,
        today,
      )
      if ('error' in judged) return problem(400, judged.error)
      if (stateOf(judged.opening) === 'mismatch')
        return problem(400, mismatchMessage(judged.opening))
      state.openings.set(account.id, judged.opening)
      if (stateOf(judged.opening) === 'complete') {
        const balance = (calculated(judged.opening) ?? 0).toFixed(2)
        account.status = 'active'
        account.openingAmount = balance
        account.balance = { amount: balance, asOf: account.openedOn }
        noteAccountEvent(account.id, 'setup_finished', body.enteredByMemberId)
      }
      return HttpResponse.json(account)
    }),
    http.post('*/api/v1/accounts/:id/discard', async ({ request, params }) => {
      log(request)
      const body = (await request.json()) as { enteredByMemberId?: string }
      const index = state.accounts.findIndex((a) => a.id === params.id)
      if (index < 0) return problem(404, `Account not found: ${String(params.id)}`)
      const account = state.accounts[index]
      if (account.status !== 'draft')
        return problem(409, `${account.name} is not a draft; delete it from its page instead`)
      if (!body.enteredByMemberId) return problem(400, 'Choose who entered this')
      state.accounts.splice(index, 1)
      return HttpResponse.json(account)
    }),
    http.get('*/api/v1/accounts/:id/statements/:sid/removal', ({ request, params }) => {
      log(request)
      const statement = state.statements.find(
        (s) => s.id === params.sid && s.accountId === params.id,
      )
      const account = state.accounts.find((a) => a.id === params.id)
      if (!statement || !account) return problem(404, `Statement not found: ${String(params.sid)}`)
      const uses = [...state.openings.values()].filter((o) => o.statementId === statement.id).length
      return HttpResponse.json({
        statementId: statement.id,
        openingBreakdowns: uses,
        balance: account.balance.amount,
        message: `${
          uses === 0
            ? 'No opening breakdown uses this statement.'
            : `${uses} opening breakdown${uses === 1 ? ' uses' : 's use'} this statement.`
        } Removing it keeps the recorded cash, shares and price, and the Balance stays ${Number(account.balance.amount).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}. The removal stays in history.`,
      })
    }),
    http.post('*/api/v1/accounts/:id/statements/:sid/removal', async ({ request, params }) => {
      log(request)
      const body = (await request.json()) as { enteredByMemberId?: string }
      const statement = state.statements.find(
        (s) => s.id === params.sid && s.accountId === params.id,
      )
      if (!statement) return problem(404, `Statement not found: ${String(params.sid)}`)
      if (!body.enteredByMemberId) return problem(400, 'Choose who entered this')
      if (!statement.removedAt) {
        statement.removedAt = '2026-10-03T13:00:00Z'
        statement.removedByMemberId = body.enteredByMemberId
      }
      return HttpResponse.json(statementView(statement))
    }),
    http.get('*/api/v1/accounts/:id/statements', ({ request, params }) => {
      log(request)
      return HttpResponse.json(
        state.statements.filter((s) => s.accountId === params.id).map(statementView),
      )
    }),
    http.post('*/api/v1/accounts/:id/statements', async ({ request, params }) => {
      log(request)
      return saveStatement(request, params.id as string, null)
    }),
    http.post('*/api/v1/accounts/:id/statements/:sid/revision', async ({ request, params }) => {
      log(request)
      return saveStatement(request, params.id as string, params.sid as string)
    }),
    http.get('*/api/v1/reminders', ({ request }) => {
      log(request)
      return HttpResponse.json(
        state.reminders.map((r) => ({
          ...r,
          accountName: state.accounts.find((a) => a.id === r.accountId)?.name ?? '',
          categoryName: CATEGORIES.find((c) => c.id === r.categoryId)?.name ?? '',
          enteredByName: state.members.find((m) => m.id === r.enteredByMemberId)?.name ?? '',
        })),
      )
    }),
    http.post('*/api/v1/accounts/:id/reminders', async ({ request, params }) => {
      log(request)
      const key = request.headers.get('Idempotency-Key') ?? ''
      const body = (await request.json()) as ExpenseBody & { kind: string; dueOn: string }
      const account = state.accounts.find((a) => a.id === params.id)
      if (!account) return problem(404, 'Account not found')
      if (!(Number(body.amount) > 0)) return problem(400, 'Enter an amount greater than zero')
      if (body.dueOn <= today) return problem(400, 'A reminder needs a date after today')
      const existing = state.reminders.find((r) => r.key === key)
      const reminder: MockReminder = existing ?? {
        id: newId(),
        accountId: account.id,
        key,
        kind: body.kind,
        amount: Number(body.amount).toFixed(2),
        dueOn: body.dueOn,
        description: body.description.trim() || null,
        categoryId: body.categoryId ?? '',
        enteredByMemberId: body.enteredByMemberId,
      }
      if (!existing) state.reminders.push(reminder)
      return HttpResponse.json(
        {
          ...reminder,
          accountName: account.name,
          categoryName: CATEGORIES.find((c) => c.id === reminder.categoryId)?.name ?? '',
          enteredByName: state.members.find((m) => m.id === reminder.enteredByMemberId)?.name ?? '',
        },
        { status: existing ? 200 : 201 },
      )
    }),
    ...(['removal', 'undo'] as const).map((action) =>
      http.post(
        `*/api/v1/accounts/:id/activity/:activityId/${action}`,
        async ({ request, params }) => {
          log(request)
          const account = state.accounts.find((a) => a.id === params.id)
          const entry = state.activity.find((a) => a.id === params.activityId)
          if (!account || !entry) return problem(404, 'Entry not found')
          const replaced = state.activity.some((r) => r.replacesId === entry.id)
          if (action === 'removal' ? entry.removedAt : !entry.removedAt || replaced)
            return problem(409, 'This entry was already changed or removed.')
          const sign = entry.kind === 'income' || entry.kind === 'correction' ? 1 : -1
          const direction = action === 'removal' ? -1 : 1
          entry.removedAt = action === 'removal' ? '2026-10-03T09:10:00Z' : null
          const { enteredByMemberId } = (await request.json()) as { enteredByMemberId: string }
          entry.events = [
            ...(entry.events ?? []),
            {
              action: action === 'removal' ? 'removed' : 'restored',
              byName: nameOf(enteredByMemberId),
              at: '2026-10-03T09:10:00Z',
            },
          ]
          account.balance = {
            ...account.balance,
            amount: (
              Number(account.balance.amount) +
              direction * sign * Number(entry.amount)
            ).toFixed(2),
          }
          return HttpResponse.json({
            id: entry.id,
            kind: entry.kind,
            amount: entry.amount,
            occurredOn: entry.occurredOn,
            description: entry.description,
            categoryName: CATEGORIES.find((c) => c.id === entry.categoryId)?.name ?? null,
            enteredByName: null,
            createdAt: entry.createdAt ?? '2026-10-03T09:00:00Z',
            reason: null,
            replacesId: entry.replacesId ?? null,
            replacedById: null,
            events: entry.events,
            status: entry.removedAt ? 'removed' : 'effective',
          })
        },
      ),
    ),
    http.post(
      '*/api/v1/accounts/:id/activity/:activityId/replacement',
      async ({ request, params }) => {
        log(request)
        const key = request.headers.get('Idempotency-Key') ?? ''
        const body = (await request.json()) as ExpenseBody & { reason?: string; accountId?: string }
        const source = state.accounts.find((a) => a.id === params.id)
        const account = state.accounts.find((a) => a.id === (body.accountId ?? params.id))
        const original = state.activity.find((a) => a.id === params.activityId)
        if (!source || !account || !original) return problem(404, 'Entry not found')
        const amount = Number(body.amount)
        if (!(amount > 0)) return problem(400, 'Enter an amount greater than zero')
        if (body.occurredOn > today)
          return problem(400, 'Future activity is not saved as completed history yet')
        const existing = state.activity.find((a) => a.key === key)
        if (existing) return HttpResponse.json(decorate(existing, state.accounts), { status: 200 })
        if (original.removedAt) return problem(409, 'This entry was already changed or removed.')
        const sign = (kind: string) => (kind === 'income' ? 1 : -1)
        if (original.kind === 'correction') {
          if (Number(original.amount) >= 0 || -Number(original.amount) !== amount)
            return problem(
              400,
              "The fee must equal the correction's decrease so the Balance stays the same",
            )
          if (original.occurredOn !== body.occurredOn)
            return problem(400, 'The fee must be dated the same day as the correction')
        }
        // Portions left out keep the split; an empty list removes it; a list replaces it.
        const newPortions =
          body.portions === undefined
            ? original.portions?.map((p) => ({ ...p }))
            : body.portions.map(portionOf)
        if (newPortions?.length) {
          const bad = splitProblem(amount, newPortions)
          if (bad) return problem(400, bad)
        }
        const newKind = original.kind === 'correction' ? 'expense' : original.kind
        original.removedAt = '2026-10-03T09:00:00Z'
        original.events = [
          ...(original.events ?? []),
          {
            action: 'replaced',
            byName: nameOf(body.enteredByMemberId),
            at: '2026-10-03T09:05:00Z',
          },
        ]
        const entry: MockActivity = {
          id: newId(),
          accountId: account.id,
          key,
          kind: newKind,
          amount: amount.toFixed(2),
          occurredOn: body.occurredOn,
          description: body.description.trim() || null,
          portions: newPortions?.length ? newPortions : undefined,
          categoryId: newPortions?.length ? '' : (body.categoryId ?? ''),
          classification: newPortions?.length
            ? null
            : classOf(newKind, {
                ...body,
                classification:
                  body.classification ??
                  ((body.categoryId ?? '') === original.categoryId
                    ? (original.classification ?? undefined)
                    : undefined),
              }),
          enteredByMemberId: body.enteredByMemberId,
          createdAt: '2026-10-03T09:05:00Z',
          reason: body.reason?.trim() || null,
          replacesId: original.id,
        }
        state.activity.push(entry)
        if (account.id !== source.id) {
          // Moved: the original leaves the source Balance, the replacement joins the target's.
          source.balance = {
            ...source.balance,
            amount: (
              Number(source.balance.amount) -
              sign(original.kind) * Number(original.amount)
            ).toFixed(2),
          }
          account.balance = {
            ...account.balance,
            amount: (Number(account.balance.amount) + sign(original.kind) * amount).toFixed(2),
          }
          return HttpResponse.json(decorate(entry, state.accounts), { status: 201 })
        }
        account.balance = {
          ...account.balance,
          amount:
            original.kind === 'correction'
              ? currentBalance(account).toFixed(2)
              : (
                  Number(account.balance.amount) -
                  sign(original.kind) * Number(original.amount) +
                  sign(original.kind) * amount
                ).toFixed(2),
        }
        return HttpResponse.json(decorate(entry, state.accounts), { status: 201 })
      },
    ),
    http.post('*/api/v1/accounts/:id/expense-batches', async ({ request, params }) => {
      log(request)
      const key = request.headers.get('Idempotency-Key') ?? ''
      state.keys.push(key)
      const body = (await request.json()) as {
        enteredByMemberId: string
        entries: ExpenseBody[]
      }
      const account = state.accounts.find((a) => a.id === params.id)
      if (!account) return problem(404, 'Account not found')
      const stored = state.activity.filter((a) => a.key?.startsWith(`${key}:`))
      if (stored.length > 0) return HttpResponse.json(batchView(stored), { status: 200 })
      if (body.entries.length === 0 || body.entries.length > 20)
        return problem(400, 'Enter 1 to 20 expenses to save together')
      for (const [index, row] of body.entries.entries()) {
        if (!(Number(row.amount) > 0))
          return problem(400, `Row ${index + 1}: Enter an amount greater than zero`)
        if (row.occurredOn > today)
          return problem(
            400,
            `Row ${index + 1}: Future activity is not saved as completed history yet`,
          )
      }
      const saved = body.entries.map((row, index): MockActivity => ({
        id: newId(),
        accountId: account.id,
        key: `${key}:${index}`,
        kind: 'expense',
        amount: Number(row.amount).toFixed(2),
        occurredOn: row.occurredOn,
        description: row.description.trim() || null,
        categoryId: row.categoryId ?? '',
        classification: classOf('expense', row),
        enteredByMemberId: body.enteredByMemberId,
      }))
      state.activity.push(...saved)
      adjust(account, -saved.reduce((sum, a) => sum + Number(a.amount), 0))
      if (state.loseNextExpenseResponse) {
        state.loseNextExpenseResponse = false
        return problem(503, 'The server took too long to answer')
      }
      return HttpResponse.json(batchView(saved), { status: 201 })
    }),
    ...(['expenses', 'income', 'refunds'] as const).map((path) =>
      http.post(`*/api/v1/accounts/:id/${path}`, async ({ request, params }) => {
        const kind = path === 'income' ? 'income' : path === 'refunds' ? 'refund' : 'expense'
        log(request)
        const key = request.headers.get('Idempotency-Key') ?? ''
        state.keys.push(key)
        const body = (await request.json()) as ExpenseBody
        const account = state.accounts.find((a) => a.id === params.id)
        if (!account) return problem(404, 'Account not found')
        const amount = Number(body.amount)
        if (!(amount > 0)) return problem(400, 'Enter an amount greater than zero')
        if (body.occurredOn > today)
          return problem(400, 'Future activity is not saved as completed history yet')
        const existing = state.activity.find((a) => a.key === key)
        if (existing) return HttpResponse.json(decorate(existing, state.accounts), { status: 200 })
        if (body.portions?.length) {
          const bad = splitProblem(amount, body.portions)
          if (bad) return problem(400, bad)
        }
        if (!body.categoryId && !body.portions?.length && kind !== 'expense')
          return problem(
            400,
            kind === 'income' ? 'Choose an income category' : 'Choose a spending category',
          )
        const chosen = CATEGORIES.find((c) => c.id === body.categoryId)
        if (chosen?.archived)
          return problem(400, `"${chosen.name}" is archived. Choose another category`)
        const entry: MockActivity = {
          id: newId(),
          accountId: account.id,
          key,
          kind,
          amount: amount.toFixed(2),
          occurredOn: body.occurredOn,
          description: body.description.trim() || null,
          categoryId: body.categoryId ?? '',
          classification: body.portions?.length ? null : classOf(kind, body),
          portions: body.portions?.map(portionOf),
          enteredByMemberId: body.enteredByMemberId,
        }
        state.activity.push(entry)
        account.balance = {
          amount: (
            Number(account.balance.amount) + (kind === 'expense' ? -amount : amount)
          ).toFixed(2),
          asOf: entry.occurredOn > account.balance.asOf ? entry.occurredOn : account.balance.asOf,
        }
        if (state.loseNextExpenseResponse) {
          state.loseNextExpenseResponse = false
          return problem(503, 'The server took too long to answer')
        }
        return HttpResponse.json(decorate(entry, state.accounts), { status: 201 })
      }),
    ),
    ...(
      [
        ['spending', 'expense'],
        ['income', 'income'],
      ] as const
    ).flatMap(([path, kind]) => [
      http.get(`*/api/v1/${path}`, ({ request }) => {
        log(request)
        const query = new URL(request.url).searchParams
        return HttpResponse.json(
          monthTotals(query.get('month') ?? '', kind, query.get('accountId')),
        )
      }),
      http.get(`*/api/v1/${path}/entries`, ({ request }) => {
        log(request)
        const query = new URL(request.url).searchParams
        return HttpResponse.json(
          live()
            .filter(
              (a) =>
                counted(a, kind) &&
                a.occurredOn.startsWith(query.get('month') ?? '') &&
                (query.get('uncategorized') === 'true'
                  ? a.categoryId === '' && !a.portions?.length
                  : effectiveId(a.categoryId) === query.get('categoryId') ||
                    !!a.portions?.some(
                      (p) => effectiveId(p.categoryId) === query.get('categoryId'),
                    )) &&
                (!query.get('accountId') || a.accountId === query.get('accountId')),
            )
            .map((a) => decorate(a, state.accounts, state.activity)),
        )
      }),
    ]),
    http.get('*/api/v1/review', ({ request }) => {
      log(request)
      const query = new URL(request.url).searchParams
      const month = query.get('month') ?? ''
      const income = Number(monthTotals(month, 'income', query.get('accountId')).total)
      const spending = Number(monthTotals(month, 'expense', query.get('accountId')).total)
      const saved = query.get('accountId')
        ? undefined
        : state.budgets.find((b) => b.month === month && !b.removed)
      return HttpResponse.json({
        budget: saved
          ? {
              total: Number(saved.total).toFixed(2),
              state:
                spending > Number(saved.total)
                  ? 'over'
                  : spending < Number(saved.total)
                    ? 'under'
                    : 'on',
              difference: Math.abs(spending - Number(saved.total)).toFixed(2),
            }
          : null,
        month,
        income: income.toFixed(2),
        spending: spending.toFixed(2),
        incomeMinusSpending: (income - spending).toFixed(2),
      })
    }),
    http.get('*/api/v1/wealth/change', ({ request }) => {
      log(request)
      const query = new URL(request.url).searchParams
      const from = query.get('from') ?? today
      const to = query.get('to') ?? today
      if (from > to) return problem(400, 'The start date must be on or before the end date')
      if (to > today) return problem(400, 'The end date cannot be in the future')
      const creditRows = state.values
        .filter(
          (v) =>
            v.payCredit != null &&
            !v.removedAt &&
            !v.replaced &&
            !v.planned &&
            v.valueOn > from &&
            v.valueOn <= to,
        )
        .map((v) => ({
          accountId: v.accountId,
          name: state.accounts.find((a) => a.id === v.accountId)?.name ?? '',
          payCredit: v.payCredit ?? '0.00',
          interestCredit: v.interestCredit ?? '0.00',
          on: v.valueOn,
        }))
      const moves = state.accounts
        .filter((a) => isValuedType(a.type))
        .map((a) => {
          const start =
            a.openedOn > from ? { amount: a.openingAmount } : valuedPoint(state.values, a, from)
          const end = valuedPoint(state.values, a, to)
          // A statement's credits are their own terms, not an asset value change.
          const credits = creditRows
            .filter((c) => c.accountId === a.id)
            .reduce((x, c) => x + Number(c.payCredit) + Number(c.interestCredit), 0)
          return {
            accountId: a.id,
            name: a.name,
            type: a.type,
            start: Number(start.amount).toFixed(2),
            end: Number(end.amount).toFixed(2),
            change: (Number(end.amount) - Number(start.amount) - credits).toFixed(2),
          }
        })
        .filter((m) => Number(m.change) !== 0)
      const moved = moves.reduce((x, m) => x + Number(m.change), 0)
      const pay = creditRows.reduce((x, c) => x + Number(c.payCredit), 0)
      const interest = creditRows.reduce((x, c) => x + Number(c.interestCredit), 0)
      return HttpResponse.json({
        from,
        to,
        startWealth: '0.00',
        endWealth: (moved + pay + interest).toFixed(2),
        change: (moved + pay + interest).toFixed(2),
        income: '0.00',
        spending: '0.00',
        valueChange: moved.toFixed(2),
        corrections: '0.00',
        accountsAdded: '0.00',
        transfers: '0.00',
        other: '0.00',
        payCredits: pay.toFixed(2),
        benefitInterest: interest.toFixed(2),
        creditLines: creditRows,
        valueMoves: moves,
        correctionLines: state.activity
          .filter(
            (a) =>
              a.kind === 'correction' && !a.removedAt && a.occurredOn > from && a.occurredOn <= to,
          )
          .map((a) => {
            const account = state.accounts.find((x) => x.id === a.accountId)!
            return {
              accountId: a.accountId,
              name: account.name,
              type: account.type,
              amount: Number(a.amount).toFixed(2),
              reason: a.reason ?? null,
              on: a.occurredOn,
            }
          }),
        restatements: state.openingRevisions
          .filter(
            (r) =>
              r.previousAmount !== r.openingAmount &&
              r.createdAt.slice(0, 10) > from &&
              r.createdAt.slice(0, 10) <= to,
          )
          .map((r) => {
            const account = state.accounts.find((x) => x.id === r.accountId)!
            return {
              accountId: r.accountId,
              name: account.name,
              type: account.type,
              previousAmount: r.previousAmount,
              amount: r.openingAmount,
              change: (Number(r.openingAmount) - Number(r.previousAmount)).toFixed(2),
              reason: r.reason,
              madeOn: r.createdAt.slice(0, 10),
            }
          }),
      })
    }),
    http.get('*/api/v1/wealth', ({ request }) => {
      log(request)
      const asOf = new URL(request.url).searchParams.get('asOf') ?? today
      if (asOf > today) return problem(400, 'The date cannot be in the future')
      const memberId = new URL(request.url).searchParams.get('memberId')
      if (memberId && !state.members.some((m) => m.id === memberId))
        return problem(400, 'Choose a member from this household')
      const tracked = state.accounts.filter(
        (a) =>
          a.openedOn <= asOf &&
          a.status !== 'draft' &&
          (!memberId || a.ownerMemberIds.includes(memberId)),
      )
      const lines = tracked.map((a) => {
        const valued = isValuedType(a.type)
        const point = valued ? valuedPoint(state.values, a, asOf) : null
        const dated = point?.on ?? null
        const days = dated ? (Date.parse(asOf) - Date.parse(dated)) / 86_400_000 : 0
        return {
          accountId: a.id,
          name: a.name,
          type: a.type,
          status: a.status,
          balance: Number(point ? point.amount : a.balance.amount).toFixed(2),
          valueDate: dated,
          stale: valued && days > 30,
          groups: mockGroups(a.type),
        }
      })
      const sum = (rows: { balance: string }[]) =>
        rows.reduce((x, row) => x + Number(row.balance), 0)
      const bank = lines.filter((l) => typeTraits(l.type).kind === 'ledger')
      const cards = lines.filter((l) => l.type === 'credit_card')
      const loans = lines.filter((l) => l.type === 'loan')
      const mortgages = lines.filter((l) => l.type === 'mortgage')
      const inGroup = (key: string) => lines.filter((l) => l.groups.includes(key))
      const investmentLines = inGroup('investments')
      const debtLines = lines.filter((l) => Number(l.balance) < 0)
      const assets = lines.map((l) => Number(l.balance)).filter((b) => b > 0)
      const financialAssets = assets.reduce((x, y) => x + y, 0)
      const debts = -sum(debtLines)
      const valuedLines = lines.filter((l) => l.type === 'property' || l.type === 'other_asset')
      const retirementLines = inGroup('retirement')
      const healthLines = inGroup('healthSavings')
      return HttpResponse.json({
        asOf,
        financialAssets: financialAssets.toFixed(2),
        debts: debts.toFixed(2),
        netWorth: (financialAssets - debts).toFixed(2),
        bankMoney: { total: sum(bank).toFixed(2), accounts: bank },
        cards: { total: sum(cards).toFixed(2), accounts: cards },
        loans: { total: sum(loans).toFixed(2), accounts: loans },
        mortgages: { total: sum(mortgages).toFixed(2), accounts: mortgages },
        investments: { total: sum(investmentLines).toFixed(2), accounts: investmentLines },
        retirement: { total: sum(retirementLines).toFixed(2), accounts: retirementLines },
        healthSavings: { total: sum(healthLines).toFixed(2), accounts: healthLines },
        propertyAndOther: { total: sum(valuedLines).toFixed(2), accounts: valuedLines },
        debtLines,
        notTracked: state.accounts
          .filter((a) => a.openedOn > asOf)
          .map((a) => ({ accountId: a.id, name: a.name, type: a.type, openedOn: a.openedOn })),
      })
    }),
    http.get('*/api/v1/spending/history', ({ request }) => {
      log(request)
      const totals = new Map<string, number>()
      live()
        .filter((a) => counted(a, 'expense'))
        .forEach((a) => {
          const month = a.occurredOn.slice(0, 7)
          totals.set(month, (totals.get(month) ?? 0) + effect(a))
        })
      const recorded = [...totals.keys()].sort()
      const sum = [...totals.values()].reduce((a, b) => a + b, 0)
      const months = recorded.length ? monthsThrough(recorded[0], today.slice(0, 7)) : []
      return HttpResponse.json({
        months: months.map((m) => ({
          month: m,
          total: (totals.get(m) ?? 0).toFixed(2),
          recorded: totals.has(m),
        })),
        recordedMonths: recorded.length,
        averageRecordedMonth: recorded.length ? (sum / recorded.length).toFixed(2) : null,
        annualEstimate: recorded.length ? ((sum * 12) / recorded.length).toFixed(2) : null,
      })
    }),
    ...valueHandlers({
      accounts: state.accounts,
      members: state.members,
      values: state.values,
      today,
      newId,
      log,
      problem,
      keys: new Map<string, string>(),
    }),
    ...transferHandlers(),
    http.get('*/api/v1/accounts/:id', ({ request, params }) => {
      log(request)
      const account = state.accounts.find((a) => a.id === params.id)
      return account ? HttpResponse.json(account) : problem(404, 'Account not found')
    }),
    http.post('*/api/v1/accounts', async ({ request }) => {
      log(request)
      const body = (await request.json()) as NewAccountBody
      if (typeTraits(body.type).kind === 'investment') return createInvestment(body)
      const traits = typeTraits(body.type)
      const failure =
        validateAccount(body.name, body.ownerMemberIds) ??
        validateOwners(state.members, body.ownerMemberIds, []) ??
        (traits.singleOwner && new Set(body.ownerMemberIds).size > 1
          ? problem(400, singleOwnerMessage(body.type))
          : null) ??
        validateOpening(body, today) ??
        validateSide(body) ??
        (traits.recordsCreator && !body.enteredByMemberId
          ? problem(400, 'Choose who entered this')
          : null) ??
        (traits.plan && Number(amountOrZero(body.openingBalance)) < 0
          ? problem(400, 'Plan value must be zero or greater')
          : null)
      if (failure) return failure
      // A card is entered as a positive figure with a side and stored with the asset sign (owed negative).
      const entered = amountOrZero(body.openingBalance) as string
      const owed =
        (body.type === 'credit_card' && body.balanceSide === 'owed') || isDebtType(body.type)
      const opening = owed && Number(entered) !== 0 ? (-Number(entered)).toFixed(2) : entered
      const account: MockAccount = {
        id: newId(),
        type: body.type,
        name: body.name.trim(),
        institution: body.institution?.trim() || null,
        ownerMemberIds: body.ownerMemberIds,
        openedOn: body.openedOn,
        openingAmount: opening,
        balance: { amount: opening, asOf: body.openedOn },
        status: 'active',
      }
      state.accounts.push(account)
      if (traits.recordsCreator) noteAccountEvent(account.id, 'set_up', body.enteredByMemberId)
      return HttpResponse.json(account, { status: 201 })
    }),
    http.put('*/api/v1/accounts/:id', async ({ request, params }) => {
      log(request)
      const body = (await request.json()) as Record<string, unknown>
      const account = state.accounts.find((a) => a.id === params.id)
      if (!account) return problem(404, 'Account not found')
      if (
        Object.keys(body).some(
          (key) => !['name', 'institution', 'ownerMemberIds', 'enteredByMemberId'].includes(key),
        )
      ) {
        return problem(400, 'Edit account changes details only, not the balance or date')
      }
      const failure =
        validateAccount(body.name as string, body.ownerMemberIds as string[]) ??
        validateOwners(state.members, body.ownerMemberIds as string[], account.ownerMemberIds) ??
        (typeTraits(account.type).recordsCreator &&
        account.status !== 'draft' &&
        !sameOwners(body.ownerMemberIds as string[], account.ownerMemberIds)
          ? problem(400, 'Use Change owner to change who owns this account. It is reviewed first.')
          : null) ??
        ((!typeTraits(account.type).recordsCreator || account.status === 'draft') &&
        typeTraits(account.type).singleOwner &&
        new Set(body.ownerMemberIds as string[]).size > 1
          ? problem(400, singleOwnerMessage(account.type))
          : null)
      if (failure) return failure
      const ownersBefore = account.ownerMemberIds
      const renamedFrom = account.name
      account.name = (body.name as string).trim()
      if (renamedFrom !== account.name)
        noteAccountEvent(account.id, 'renamed', body.enteredByMemberId, renamedFrom)
      account.institution = (body.institution as string | undefined)?.trim() || null
      account.ownerMemberIds = body.ownerMemberIds as string[]
      if (!sameOwners(ownersBefore, account.ownerMemberIds))
        noteAccountEvent(
          account.id,
          'owner_changed',
          body.enteredByMemberId,
          `${ownerWords(state.members, ownersBefore)} → ${ownerWords(state.members, account.ownerMemberIds)}`,
        )
      return HttpResponse.json(account)
    }),
    // The owner correction (slice 18c): the review makes every check the save makes and writes nothing.
    http.post('*/api/v1/accounts/:id/owner-correction/review', async ({ request, params }) => {
      log(request)
      const checked = checkOwnerCorrection(
        state,
        params.id as string,
        (await request.json()) as Record<string, unknown>,
      )
      if ('failure' in checked) return checked.failure
      const named = (ids: string[]) =>
        ids
          .map((id) => state.members.find((m) => m.id === id)!)
          .map((m) => ({ id: m.id, name: m.label ? `${m.name} (${m.label})` : m.name }))
          .sort((a, b) => a.name.localeCompare(b.name))
      return HttpResponse.json({
        accountId: checked.account.id,
        name: checked.account.name,
        type: checked.account.type,
        from: named(checked.account.ownerMemberIds),
        to: named(checked.owners),
        balance: checked.account.balance.amount,
      })
    }),
    http.post('*/api/v1/accounts/:id/owner-correction', async ({ request, params }) => {
      log(request)
      const body = (await request.json()) as Record<string, unknown>
      const checked = checkOwnerCorrection(state, params.id as string, body)
      if ('failure' in checked) return checked.failure
      noteAccountEvent(
        checked.account.id,
        'owner_changed',
        body.enteredByMemberId,
        `${ownerWords(state.members, checked.account.ownerMemberIds)} → ${ownerWords(state.members, checked.owners)}`,
      )
      checked.account.ownerMemberIds = checked.owners
      return HttpResponse.json(checked.account)
    }),
  )

  return state
}

/** The member as the API returns it: `active` and `nameHistory` always present. */
function memberBody(member: MockMember) {
  return { ...member, active: member.active !== false, nameHistory: member.nameHistory ?? [] }
}

/** An inactive member cannot become a new owner but may stay on an account they already own. */
const sameOwners = (a: string[], b: string[]) =>
  [...new Set(a)].sort().join() === [...new Set(b)].sort().join()

/** "Maya and Sam": the owners as the history names them. */
function ownerWords(members: MockMember[], ids: string[]): string {
  return ids
    .map((id) => members.find((m) => m.id === id))
    .filter((m): m is MockMember => !!m)
    .map((m) => (m.label ? `${m.name} (${m.label})` : m.name))
    .sort((a, b) => a.localeCompare(b))
    .join(' and ')
}

/** The checks the server makes for an owner correction, shared by its review and its save. */
function checkOwnerCorrection(
  state: { accounts: MockAccount[]; members: MockMember[] },
  id: string,
  body: Record<string, unknown>,
) {
  const account = state.accounts.find((a) => a.id === id)
  if (!account) return { failure: problem(404, 'Account not found') }
  const traits = typeTraits(account.type)
  const owners = [...new Set((body.ownerMemberIds as string[] | undefined) ?? [])]
  const failure =
    (!traits.recordsCreator
      ? problem(400, 'Change who owns this account from Edit account')
      : null) ??
    (account.status === 'draft'
      ? problem(409, `${account.name} is a draft. Choose its owner in Finish setup.`)
      : null) ??
    (owners.length === 0 ? problem(400, 'Choose an owner') : null) ??
    (traits.singleOwner && owners.length > 1
      ? problem(400, singleOwnerMessage(account.type))
      : null) ??
    validateOwners(state.members, owners, account.ownerMemberIds) ??
    (sameOwners(owners, account.ownerMemberIds)
      ? problem(
          400,
          traits.plan
            ? 'Choose a different participant'
            : traits.singleOwner
              ? 'Choose a different owner'
              : 'Choose different owners',
        )
      : null) ??
    (!body.enteredByMemberId ? problem(400, 'Choose who entered this') : null)
  return failure ? { failure } : { account, owners }
}

function validateOwners(members: MockMember[], owners: string[], current: string[]) {
  const added = owners.filter((id) => !current.includes(id))
  return members.some((m) => added.includes(m.id) && m.active === false)
    ? problem(400, 'Choose an active member')
    : null
}

function validateMember(others: MockMember[], name: string, label: string) {
  if (!name.trim()) return problem(400, 'Member name must be 1 to 120 characters')
  const key = (v: string | null) => (v ?? '').trim().toLowerCase()
  if (others.some((m) => key(m.name) === key(name) && key(m.label) === key(label))) {
    return problem(
      409,
      'A member with this name and label already exists, or the household does not exist',
    )
  }
  return null
}

type NewAccountBody = {
  type: string
  name: string
  institution?: string
  ownerMemberIds: string[]
  openedOn: string
  openingBalance: string | null
  balanceSide?: string
  enteredByMemberId?: string
}

function amountOrZero(value: string | null) {
  if (value === null || value.trim() === '') return '0.00'
  return /^-?\d+(\.\d{1,2})?$/.test(value.trim()) ? Number(value).toFixed(2) : null
}

function validateAccount(name: string, owners: string[]) {
  if (!name?.trim()) return problem(400, 'Enter an account name')
  if (!owners?.length) return problem(400, 'Choose an owner')
  return null
}

/** A card amount needs Owed or Card credit and is never negative; any other type takes no side. */
function validateSide(body: NewAccountBody) {
  if (isDebtType(body.type)) {
    if (body.balanceSide) return problem(400, 'Owed or Card credit applies to a card only')
    return Number(amountOrZero(body.openingBalance)) < 0
      ? problem(400, 'Enter zero or a positive amount owed')
      : null
  }
  const card = body.type === 'credit_card'
  if (!card) {
    return body.balanceSide ? problem(400, 'Owed or Card credit applies to a card only') : null
  }
  const entered = Number(amountOrZero(body.openingBalance))
  if (entered < 0) return problem(400, 'Enter a valid amount')
  if (entered !== 0 && body.balanceSide !== 'owed' && body.balanceSide !== 'credit') {
    return problem(400, 'Choose Owed or Card credit')
  }
  return null
}

function validateOpening(body: NewAccountBody, today: string) {
  if (amountOrZero(body.openingBalance) === null) return problem(400, 'Enter a valid amount')
  if (body.openedOn > today) return problem(400, 'The opening date cannot be in the future')
  return null
}
