import { http, HttpResponse } from 'msw'
import { server } from './server'

type MockHousehold = { id: string; name: string }
type MockMember = { id: string; householdId: string; name: string; label: string | null }
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
  categoryId: string
  enteredByMemberId: string | null
  createdAt?: string
  reason?: string | null
  replacesId?: string | null
  /** Set when the entry was removed or replaced; such rows never count. */
  removedAt?: string | null
  events?: { action: string; byName: string; at: string }[]
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
  categoryId: string
  enteredByMemberId: string
}

/** The seeded category list the backend ships (names and kinds only). */
export const CATEGORIES = [
  { id: 'c0000000-0000-4000-8000-000000000001', name: 'Rent', kind: 'spending' },
  { id: 'c0000000-0000-4000-8000-000000000002', name: 'Utilities', kind: 'spending' },
  { id: 'c0000000-0000-4000-8000-000000000003', name: 'Groceries', kind: 'spending' },
  { id: 'c0000000-0000-4000-8000-000000000004', name: 'Salary', kind: 'income' },
  { id: 'c0000000-0000-4000-8000-000000000005', name: 'Dining', kind: 'spending' },
  { id: 'c0000000-0000-4000-8000-000000000006', name: 'Bank fees', kind: 'spending' },
]

function decorate(a: MockActivity, accounts: MockAccount[]) {
  return {
    ...a,
    accountName: accounts.find((x) => x.id === a.accountId)?.name ?? '',
    categoryName: CATEGORIES.find((c) => c.id === a.categoryId)?.name ?? null,
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
  } = {},
) {
  const today = seed.today ?? '2026-10-03'
  const state = {
    household: seed.household ?? (null as MockHousehold | null),
    members: [...(seed.members ?? [])],
    accounts: [...(seed.accounts ?? [])],
    activity: [...(seed.activity ?? [])],
    reminders: [] as MockReminder[],
    /** Save keys seen on POST expenses, in order. */
    keys: [] as string[],
    /** When true the next expense is stored but its response is lost (a slow or dropped answer). */
    loseNextExpenseResponse: false,
    /** "METHOD /path" for every request the UI made, in order. */
    requests: [] as string[],
  }
  let nextId = 1
  const newId = () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`
  const log = (request: Request) =>
    state.requests.push(`${request.method} ${new URL(request.url).pathname}`)

  const nameOf = (id: string | null | undefined) =>
    state.members.find((m) => m.id === id)?.name ?? ''
  const live = () => state.activity.filter((a) => !a.removedAt)
  const signed = (a: MockActivity) => (a.kind === 'expense' ? -Number(a.amount) : Number(a.amount))
  /** Opening amount plus live activity up to a date, leaving out one row. */
  const balanceOn = (account: MockAccount, date: string, excluding?: string) =>
    Number(account.openingAmount) +
    live()
      .filter((a) => a.accountId === account.id && a.occurredOn <= date && a.id !== excluding)
      .reduce((sum, a) => sum + signed(a), 0)
  const currentBalance = (account: MockAccount) => balanceOn(account, '9999-12-31')
  const monthTotals = (month: string, kind: string) => {
    const rows = live().filter((a) => a.kind === kind && a.occurredOn.startsWith(month))
    const byCategory = new Map<string, { total: number; count: number }>()
    rows.forEach((a) => {
      const row = byCategory.get(a.categoryId) ?? { total: 0, count: 0 }
      byCategory.set(a.categoryId, { total: row.total + Number(a.amount), count: row.count + 1 })
    })
    return {
      month,
      total: rows.reduce((sum, a) => sum + Number(a.amount), 0).toFixed(2),
      categories: [...byCategory].map(([categoryId, row]) => ({
        categoryId,
        name: CATEGORIES.find((c) => c.id === categoryId)?.name,
        total: row.total.toFixed(2),
        count: row.count,
      })),
    }
  }

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
      return HttpResponse.json(state.members.filter((m) => m.householdId === householdId))
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
      return HttpResponse.json(member, { status: 201 })
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
      existing.name = body.name.trim()
      existing.label = body.label.trim() || null
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
      return HttpResponse.json(CATEGORIES.filter((c) => !kind || c.kind === kind))
    }),
    http.get('*/api/v1/accounts/:id/activity', ({ request, params }) => {
      log(request)
      return HttpResponse.json(
        live()
          .filter((a) => a.accountId === params.id)
          .map((a) => decorate(a, state.accounts))
          .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn)),
      )
    }),
    http.get('*/api/v1/accounts/:id/activity/history', ({ request, params }) => {
      log(request)
      const name = (id: string | null | undefined) => nameOf(id) || null
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
              enteredByName: name(a.enteredByMemberId),
              createdAt: a.createdAt ?? '2026-10-03T09:00:00Z',
              reason: a.reason ?? null,
              replacesId: a.replacesId ?? null,
              replacedById: replacement?.id ?? null,
              events: a.events ?? [],
              status: replacement ? 'replaced' : a.removedAt ? 'removed' : 'effective',
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
      const requested = Number(query.get('requested'))
      const asOn = query.get('asOn') ?? ''
      if (!account) return problem(404, 'Account not found')
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
        overdraft: after < 0,
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
      }
      const account = state.accounts.find((a) => a.id === params.id)
      if (!account) return problem(404, 'Account not found')
      if (!body.reason?.trim()) return problem(400, 'Enter a reason')
      const existing = state.activity.find((a) => a.key === key)
      if (existing) return HttpResponse.json(decorate(existing, state.accounts), { status: 200 })
      const replaced = state.activity.find((a) => a.id === body.replacesId)
      const difference = Number(body.requestedBalance) - balanceOn(account, body.asOn, replaced?.id)
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
        categoryId: body.categoryId,
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
        const body = (await request.json()) as ExpenseBody & { reason?: string }
        const account = state.accounts.find((a) => a.id === params.id)
        const original = state.activity.find((a) => a.id === params.activityId)
        if (!account || !original) return problem(404, 'Entry not found')
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
          categoryId: body.categoryId,
          enteredByMemberId: body.enteredByMemberId,
          createdAt: '2026-10-03T09:05:00Z',
          reason: body.reason?.trim() || null,
          replacesId: original.id,
        }
        state.activity.push(entry)
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
    ...(['expenses', 'income'] as const).map((path) =>
      http.post(`*/api/v1/accounts/:id/${path}`, async ({ request, params }) => {
        const kind = path === 'income' ? 'income' : 'expense'
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
        const entry: MockActivity = {
          id: newId(),
          accountId: account.id,
          key,
          kind,
          amount: amount.toFixed(2),
          occurredOn: body.occurredOn,
          description: body.description.trim() || null,
          categoryId: body.categoryId,
          enteredByMemberId: body.enteredByMemberId,
        }
        state.activity.push(entry)
        account.balance = {
          amount: (Number(account.balance.amount) + (kind === 'income' ? amount : -amount)).toFixed(
            2,
          ),
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
        return HttpResponse.json(
          monthTotals(new URL(request.url).searchParams.get('month') ?? '', kind),
        )
      }),
      http.get(`*/api/v1/${path}/entries`, ({ request }) => {
        log(request)
        const query = new URL(request.url).searchParams
        return HttpResponse.json(
          live()
            .filter(
              (a) =>
                a.kind === kind &&
                a.occurredOn.startsWith(query.get('month') ?? '') &&
                a.categoryId === query.get('categoryId'),
            )
            .map((a) => decorate(a, state.accounts)),
        )
      }),
    ]),
    http.get('*/api/v1/review', ({ request }) => {
      log(request)
      const month = new URL(request.url).searchParams.get('month') ?? ''
      const income = Number(monthTotals(month, 'income').total)
      const spending = Number(monthTotals(month, 'expense').total)
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
        .filter((a) => a.kind === 'expense')
        .forEach((a) => {
          const month = a.occurredOn.slice(0, 7)
          totals.set(month, (totals.get(month) ?? 0) + Number(a.amount))
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
    http.get('*/api/v1/accounts/:id', ({ request, params }) => {
      log(request)
      const account = state.accounts.find((a) => a.id === params.id)
      return account ? HttpResponse.json(account) : problem(404, 'Account not found')
    }),
    http.post('*/api/v1/accounts', async ({ request }) => {
      log(request)
      const body = (await request.json()) as NewAccountBody
      const failure =
        validateAccount(body.name, body.ownerMemberIds) ?? validateOpening(body, today)
      if (failure) return failure
      const opening = amountOrZero(body.openingBalance) as string
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
      const failure = validateAccount(body.name as string, body.ownerMemberIds as string[])
      if (failure) return failure
      account.name = (body.name as string).trim()
      account.institution = (body.institution as string | undefined)?.trim() || null
      account.ownerMemberIds = body.ownerMemberIds as string[]
      return HttpResponse.json(account)
    }),
  )

  return state
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

function validateOpening(body: NewAccountBody, today: string) {
  if (amountOrZero(body.openingBalance) === null) return problem(400, 'Enter a valid amount')
  if (body.openedOn > today) return problem(400, 'The opening date cannot be in the future')
  return null
}
