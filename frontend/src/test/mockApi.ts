import { http, HttpResponse } from 'msw'
import { server } from './server'

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
    portions: shownPortions(a),
    movementId: a.movementId ?? null,
    counterAccountId: counter?.accountId ?? null,
    counterAccountName: counter
      ? (accounts.find((x) => x.id === counter.accountId)?.name ?? null)
      : null,
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

function problem(status: number, message: string) {
  return HttpResponse.json({ status, error: 'Error', message }, { status })
}

/**
 * In-memory stand-in for the backend, registered on the MSW server.
 * Mirrors the real API's rules closely enough for UI tests: singleton household,
 * 404 before creation, 400 for blank names and 409 for duplicate members. Accounts follow the same
 * rules as the backend: blank name, invalid amount, missing owner and future opening date are 400.
 */
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
    openingRevisions: [] as MockOpeningRevision[],
    /** Save keys seen on POST expenses, in order. */
    keys: [] as string[],
    /** When true the next expense is stored but its response is lost (a slow or dropped answer). */
    loseNextExpenseResponse: false,
    /** "METHOD /path" for every request the UI made, in order. */
    requests: [] as string[],
  }
  let nextId = 1
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
    a.kind === 'expense' || a.kind === 'transfer_out' || a.kind === 'card_payment'
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
    }
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
    }
    if (!/^-?\d+(\.\d{1,2})?$/.test(body.balance)) return problem(400, 'Enter a valid amount')
    const owner = state.accounts.find((a) => a.id === accountId)
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
    const out = rows.find((a) => a.kind === 'transfer_out' || a.kind === 'card_payment')!
    const into = rows.find((a) => a.kind === 'transfer_in' || a.kind === 'card_payment_in')!
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
    },
    key: string,
    replaces?: { out: MockActivity; into?: MockActivity },
    kinds: readonly [string, string] = ['transfer_out', 'transfer_in'],
  ) => {
    const movementId = newId()
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
      },
      {
        ...base,
        id: newId(),
        accountId: body.toAccountId,
        kind: kinds[1],
        replacesId: replaces?.into?.id,
      },
    )
    adjust(
      state.accounts.find((a) => a.id === body.fromAccountId)!,
      -Number(body.amount),
    )
    adjust(
      state.accounts.find((a) => a.id === body.toAccountId)!,
      Number(body.amount),
    )
    return movementId
  }
  /** A card's typed amount is positive with a side and is held with the asset sign; others take no side. */
  const signedFor = (account: MockAccount, amount: string, side: string | null | undefined) => {
    const value = Number(amount)
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
    if (path === 'transfers') {
      return from.type === 'credit_card' || to.type === 'credit_card'
        ? problem(400, 'Use Record payment to pay a card')
        : null
    }
    if (from.type === 'credit_card')
      return problem(400, 'Pay a card from a checking or savings account')
    return to.type === 'credit_card' ? null : problem(400, 'Choose a card to pay')
  }
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
    path: 'transfers' | 'card-payments',
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
      add(from.id, -amount)
      add(to.id, amount)
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
  ]
  const transferHandlers = () => [
    ...movementHandlers('transfers', ['transfer_out', 'transfer_in'], 'transfer'),
    ...movementHandlers('card-payments', ['card_payment', 'card_payment_in'], 'payment'),
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

  server.use(
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
    ...(['archive', 'restore'] as const).map((action) =>
      http.post(`*/api/v1/accounts/:id/${action}`, ({ request, params }) => {
        log(request)
        const existing = state.accounts.find((a) => a.id === params.id)
        if (!existing) return problem(404, `Account not found: ${String(params.id)}`)
        existing.status = action === 'archive' ? 'archived' : 'active'
        return HttpResponse.json(existing)
      }),
    ),
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
        overdraft: after < 0 && account.type !== 'credit_card',
      })
    }),
    http.post('*/api/v1/accounts/:id/balance-corrections', async ({ request, params }) => {
      log(request)
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
        const amount = Number(query.get('openingAmount'))
        const current = currentBalance(account)
        return HttpResponse.json({
          originalAmount: Number(account.openingAmount).toFixed(2),
          originalOn: account.openedOn,
          openingAmount: amount.toFixed(2),
          openedOn: query.get('openedOn'),
          currentBalance: current.toFixed(2),
          currentBalanceAfter: (current - Number(account.openingAmount) + amount).toFixed(2),
          overdraft: current - Number(account.openingAmount) + amount < 0,
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
      const account = state.accounts.find((a) => a.id === params.id)
      if (!account) return problem(404, 'Account not found')
      const key = request.headers.get('Idempotency-Key') ?? ''
      const body = (await request.json()) as {
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
          const sign = entry.kind === 'income' ? 1 : -1
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
      return HttpResponse.json({
        month,
        income: income.toFixed(2),
        spending: spending.toFixed(2),
        incomeMinusSpending: (income - spending).toFixed(2),
      })
    }),
    http.get('*/api/v1/wealth', ({ request }) => {
      log(request)
      const balances = state.accounts.map((a) => Number(a.balance.amount))
      return HttpResponse.json({
        financialAssets: balances
          .filter((b) => b > 0)
          .reduce((x, y) => x + y, 0)
          .toFixed(2),
        debts: balances
          .filter((b) => b < 0)
          .reduce((x, y) => x - y, 0)
          .toFixed(2),
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
    ...transferHandlers(),
    http.get('*/api/v1/accounts/:id', ({ request, params }) => {
      log(request)
      const account = state.accounts.find((a) => a.id === params.id)
      return account ? HttpResponse.json(account) : problem(404, 'Account not found')
    }),
    http.post('*/api/v1/accounts', async ({ request }) => {
      log(request)
      const body = (await request.json()) as NewAccountBody
      const failure =
        validateAccount(body.name, body.ownerMemberIds) ??
        validateOwners(state.members, body.ownerMemberIds, []) ??
        validateOpening(body, today) ??
        validateSide(body)
      if (failure) return failure
      // A card is entered as a positive figure with a side and stored with the asset sign (owed negative).
      const entered = amountOrZero(body.openingBalance) as string
      const opening =
        body.type === 'credit_card' && body.balanceSide === 'owed' && Number(entered) !== 0
          ? (-Number(entered)).toFixed(2)
          : entered
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
      return HttpResponse.json(account, { status: 201 })
    }),
    http.put('*/api/v1/accounts/:id', async ({ request, params }) => {
      log(request)
      const body = (await request.json()) as Record<string, unknown>
      const account = state.accounts.find((a) => a.id === params.id)
      if (!account) return problem(404, 'Account not found')
      if (
        Object.keys(body).some((key) => !['name', 'institution', 'ownerMemberIds'].includes(key))
      ) {
        return problem(400, 'Edit account changes details only, not the balance or date')
      }
      const failure =
        validateAccount(body.name as string, body.ownerMemberIds as string[]) ??
        validateOwners(state.members, body.ownerMemberIds as string[], account.ownerMemberIds)
      if (failure) return failure
      account.name = (body.name as string).trim()
      account.institution = (body.institution as string | undefined)?.trim() || null
      account.ownerMemberIds = body.ownerMemberIds as string[]
      return HttpResponse.json(account)
    }),
  )

  return state
}

/** The member as the API returns it: `active` and `nameHistory` always present. */
function memberBody(member: MockMember) {
  return { ...member, active: member.active !== false, nameHistory: member.nameHistory ?? [] }
}

/** An inactive member cannot become a new owner but may stay on an account they already own. */
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
