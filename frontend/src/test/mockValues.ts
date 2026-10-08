import { http, HttpResponse } from 'msw'
import { isDebt, isValued } from '../features/accounts/accountTypes'
import type { MockAccount } from './mockApi'

/** A dated value of a property or other asset, as the server keeps it. */
export type MockValue = {
  id: string
  accountId: string
  valueOn: string
  amount: string
  reason: string | null
  planned: boolean
  enteredBy: string
  replacesId: string | null
  replaced: boolean
  removedAt: string | null
  removedBy: string | null
  createdAt: string
  /** A defined benefit statement's credits. */
  payCredit?: string | null
  interestCredit?: string | null
}

type Context = {
  accounts: MockAccount[]
  members: { id: string; name: string }[]
  values: MockValue[]
  today: string
  newId: () => string
  log: (request: Request) => void
  problem: (status: number, message: string) => Response
  /** Save keys seen, with the value each one saved. */
  keys: Map<string, string>
  /** What was done to values, newest first, as `GET .../values` returns it. */
  events?: Record<string, unknown>[]
}

const money = (value: number) => value.toFixed(2)

/** The value a property or other asset counts on a date: its latest effective value by then, else its setup value. */
export function valuedPoint(values: MockValue[], account: MockAccount, on: string) {
  const latest = values
    .filter(
      (v) =>
        v.accountId === account.id && !v.removedAt && !v.replaced && !v.planned && v.valueOn <= on,
    )
    .sort((a, b) => b.valueOn.localeCompare(a.valueOn) || b.createdAt.localeCompare(a.createdAt))[0]
  return latest
    ? { amount: latest.amount, on: latest.valueOn }
    : { amount: account.openingAmount, on: account.openedOn }
}

/** Handlers for the dated values of a property or other asset (slice 15), mirroring `ValueService`. */
export function valueHandlers(ctx: Context) {
  const { accounts, values, today, problem } = ctx
  let tick = 0
  const stamp = () => `2026-10-03T10:00:${String(tick++).padStart(2, '0')}Z`
  const events = ctx.events ?? []
  const note = (
    action: string,
    memberId: unknown,
    valueOn: string | null,
    amount: string | null,
    detail: string | null,
  ) =>
    events.unshift({
      action,
      valueOn,
      amount,
      detail,
      byName: ctx.members.find((m) => m.id === memberId)?.name ?? '',
      at: '2026-10-03T10:00:00Z',
    })
  const nameOf = (id: string | null) => ctx.members.find((m) => m.id === id)?.name ?? null
  const effective = (accountId: string, excluding?: string) =>
    values
      .filter(
        (v) =>
          v.accountId === accountId &&
          !v.removedAt &&
          !v.replaced &&
          !v.planned &&
          v.id !== excluding,
      )
      .sort((a, b) => b.valueOn.localeCompare(a.valueOn) || b.createdAt.localeCompare(a.createdAt))
  const point = (account: MockAccount, excluding?: string) => {
    // A debt reads its payments and corrections, never a dated value: a plan changes nothing.
    if (isDebt(account.type))
      return { amount: account.balance.amount, on: today, id: null as string | null }
    const latest = effective(account.id, excluding)[0]
    return latest
      ? { amount: latest.amount, on: latest.valueOn, id: latest.id }
      : { amount: account.openingAmount, on: account.openedOn, id: null as string | null }
  }
  const refresh = (account: MockAccount) => {
    if (isDebt(account.type)) return
    const now = point(account)
    account.balance = { amount: now.amount, asOf: now.on }
  }
  const row = (v: MockValue, currentId: string | null) => ({
    id: v.id,
    valueOn: v.valueOn,
    amount: v.amount,
    reason: v.reason,
    status: v.removedAt
      ? 'removed'
      : v.replaced
        ? 'replaced'
        : v.planned
          ? 'planned'
          : v.id === currentId
            ? 'current'
            : 'earlier',
    enteredBy: nameOf(v.enteredBy),
    createdAt: v.createdAt,
    replacesId: v.replacesId,
    removedBy: nameOf(v.removedBy),
    removedAt: v.removedAt,
    planned: v.planned,
    initial: false,
    payCredit: v.payCredit ?? null,
    interestCredit: v.interestCredit ?? null,
  })
  const find = (id: unknown) => {
    const account = accounts.find((a) => a.id === id)
    return account && (isValued(account.type) || isDebt(account.type)) ? account : null
  }
  const isPlan = (account: MockAccount) => account.type === 'defined_benefit'
  const credit = (value: unknown, name: string) => {
    if (value == null || value === '') return { amount: '0.00' }
    if (typeof value !== 'string' || !/^-?\d+(\.\d{1,2})?$/.test(value))
      return { error: problem(400, 'Enter a valid amount') }
    if (Number(value) < 0) return { error: problem(400, `${name} must be zero or greater`) }
    return { amount: Number(value).toFixed(2) }
  }
  const parse = (account: MockAccount, body: Record<string, unknown>, replaced?: MockValue) => {
    const credited = body.payCredit != null || body.interestCredit != null
    if (credited && !isPlan(account))
      return { error: problem(400, 'Credits apply to a defined benefit only') }
    if (credited && body.amount != null)
      return { error: problem(400, 'Enter a plan value or credits, not both') }
    if (!credited && isPlan(account) && body.amount == null && body.plan !== true)
      return { error: problem(400, 'Enter a plan value or a credit') }
    let pay: string | null = null
    let interest: string | null = null
    if (credited) {
      const p = credit(body.payCredit, 'Pay credit')
      if ('error' in p) return { error: p.error }
      const i = credit(body.interestCredit, 'Benefit interest')
      if ('error' in i) return { error: i.error }
      pay = p.amount
      interest = i.amount
    }
    const amount = credited ? '0.00' : typeof body.amount === 'string' ? body.amount : ''
    if (!/^-?\d+(\.\d{1,2})?$/.test(amount)) return { error: problem(400, 'Enter a valid amount') }
    if (Number(amount) < 0)
      return {
        error: problem(
          400,
          isDebt(account.type)
            ? 'Enter zero or a positive amount owed'
            : isPlan(account)
              ? 'Plan value must be zero or greater'
              : account.type === 'property'
                ? 'Enter zero or a positive property value'
                : 'Enter zero or a positive asset value',
        ),
      }
    const valueOn = (body.valueOn as string | undefined) ?? replaced?.valueOn
    if (!valueOn) return { error: problem(400, 'Enter a date') }
    const plan = body.plan === true
    if (isPlan(account) && (plan || valueOn > today))
      return { error: problem(400, 'Future values are not completed account history') }
    if (isPlan(account) && valueOn < account.openedOn)
      return {
        error: problem(
          400,
          `Review the earlier tracking start before saving. The start is ${account.openedOn}.`,
        ),
      }
    if (plan && valueOn <= today)
      return {
        error: problem(400, 'A plan is dated after today. Choose a date on or before today.'),
      }
    if (!plan && valueOn > today)
      return {
        error: problem(
          400,
          'Future values are not completed account history. Save it as a future plan, or choose a date on or before today.',
        ),
      }
    if (isDebt(account.type) && !plan)
      return {
        error: problem(
          400,
          'What is owed changes by a payment or Update balance owed. A future amount can be saved as a plan.',
        ),
      }
    if (!plan && valueOn < account.openedOn)
      return {
        error: problem(
          400,
          `This date is before the account's start (${account.openedOn}). Review extending its history first.`,
        ),
      }
    const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null
    if (replaced && !reason) return { error: problem(400, 'Enter a reason') }
    // A statement with credits is the value in force on its date plus both credits.
    const base = credited ? basis(account, valueOn, replaced?.id) : 0
    return {
      amount: credited
        ? (base + Number(pay) + Number(interest)).toFixed(2)
        : (isDebt(account.type) ? -Number(amount) : Number(amount)).toFixed(2),
      valueOn,
      plan,
      reason,
      pay,
      interest,
    }
  }
  const basis = (account: MockAccount, on: string, excluding?: string) => {
    const earlier = effective(account.id, excluding).find((v) => v.valueOn <= on)
    return Number(earlier ? earlier.amount : account.openingAmount)
  }
  /** Household net worth and the Retirement total now, the way the server's review reads them. */
  const totals = (account: MockAccount, moved: number) => {
    if (!isPlan(account)) return {}
    const live = accounts.filter((a) => a.status !== 'draft')
    const net = live.reduce((x, a) => x + Number(a.balance.amount), 0)
    const retirement = live
      .filter((a) => a.type === 'defined_benefit')
      .reduce((x, a) => x + Number(a.balance.amount), 0)
    return {
      netWorthBefore: money(net),
      netWorthAfter: money(net + moved),
      retirementBefore: money(retirement),
      retirementAfter: money(retirement + moved),
    }
  }
  const figures = (
    account: MockAccount,
    parsed: { amount: string; valueOn: string; plan: boolean; pay?: string | null },
    excluding?: string,
  ) => {
    const now = point(account)
    const rest = point(account, excluding)
    const earlier = parsed.plan
      ? null
      : (effective(account.id, excluding).find((v) => v.valueOn <= parsed.valueOn) ?? null)
    const earlierPoint = earlier
      ? { amount: earlier.amount, on: earlier.valueOn }
      : parsed.valueOn >= account.openedOn
        ? { amount: account.openingAmount, on: account.openedOn }
        : null
    const after = parsed.plan
      ? now
      : parsed.valueOn < rest.on
        ? rest
        : { amount: parsed.amount, on: parsed.valueOn }
    return { now, earlier: earlierPoint, after }
  }
  const extension = (account: MockAccount, body: Record<string, unknown>, saving: boolean) => {
    const amount = typeof body.amount === 'string' ? body.amount : ''
    if (!/^-?\d+(\.\d{1,2})?$/.test(amount)) return { error: problem(400, 'Enter a valid amount') }
    const valueOn = body.valueOn as string | undefined
    if (!valueOn || valueOn >= account.openedOn)
      return {
        error: problem(400, `The new start must be before the current start (${account.openedOn})`),
      }
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
    if (saving && !reason) return { error: problem(400, 'Enter a reason') }
    return { amount: Number(amount).toFixed(2), valueOn }
  }
  /** The values as they read once the start is at (amount, on); before saving, the old opening is a value. */
  const timeline = (account: MockAccount, amount: string, on: string, preview: boolean) => {
    const now = point(account)
    const points = [
      { kind: 'opening', on, amount },
      ...(preview ? [{ kind: 'value', on: account.openedOn, amount: account.openingAmount }] : []),
      ...effective(account.id)
        .sort((a, b) => a.valueOn.localeCompare(b.valueOn))
        .map((v) => ({ kind: 'value', on: v.valueOn, amount: v.amount })),
    ]
    return {
      accountName: account.name,
      type: account.type,
      amount,
      openedOn: on,
      previousAmount: preview ? account.openingAmount : null,
      previousOn: preview ? account.openedOn : null,
      timeline: points,
      balance: now.amount,
      balanceOn: now.on,
    }
  }
  const result = (account: MockAccount, v: MockValue, before: string) => {
    const now = point(account)
    return HttpResponse.json({
      value: row(v, now.id),
      balanceBefore: before,
      balanceAfter: now.amount,
      balanceAfterOn: now.on,
    })
  }

  return [
    http.get('*/api/v1/accounts/:id/values', ({ request, params }) => {
      ctx.log(request)
      const account = find(params.id)
      if (!account) return problem(404, 'Account not found')
      const now = point(account)
      const rows = values.filter((v) => v.accountId === account.id).map((v) => row(v, now.id))
      const initial = {
        id: null,
        valueOn: account.openedOn,
        amount: account.openingAmount,
        reason: 'Initial value',
        status: now.id === null ? 'current' : 'earlier',
        enteredBy: null,
        createdAt: '2026-09-01T00:00:00Z',
        replacesId: null,
        removedBy: null,
        removedAt: null,
        planned: false,
        initial: true,
        payCredit: null,
        interestCredit: null,
      }
      return HttpResponse.json({
        values: [...rows, ...(isDebt(account.type) ? [] : [initial])].sort((a, b) =>
          b.valueOn.localeCompare(a.valueOn),
        ),
        events,
      })
    }),
    http.post('*/api/v1/accounts/:id/values/review', async ({ request, params }) => {
      ctx.log(request)
      const account = find(params.id)
      if (!account) return problem(404, 'Account not found')
      const body = (await request.json()) as Record<string, unknown>
      const parsed = parse(account, body)
      if ('error' in parsed) return parsed.error
      const f = figures(account, parsed)
      return HttpResponse.json({
        accountName: account.name,
        type: account.type,
        valueOn: parsed.valueOn,
        amount: parsed.amount,
        reason: parsed.reason,
        plan: parsed.plan,
        earlierAmount: parsed.plan ? null : (f.earlier?.amount ?? null),
        earlierOn: parsed.plan ? null : (f.earlier?.on ?? null),
        change:
          parsed.plan || !f.earlier
            ? null
            : money(Number(parsed.amount) - Number(f.earlier.amount)),
        balanceBefore: f.now.amount,
        balanceBeforeOn: f.now.on,
        balanceAfter: f.after.amount,
        balanceAfterOn: f.after.on,
        replacesAmount: null,
        replacesOn: null,
        payCredit: parsed.pay ?? null,
        interestCredit: parsed.interest ?? null,
        netWorthBefore: null,
        netWorthAfter: null,
        retirementBefore: null,
        retirementAfter: null,
        ...totals(account, Number(f.after.amount) - Number(f.now.amount)),
      })
    }),
    http.post(
      '*/api/v1/accounts/:id/values/:valueId/correction/review',
      async ({ request, params }) => {
        ctx.log(request)
        const account = find(params.id)
        const old = values.find((v) => v.id === params.valueId)
        if (!account || !old) return problem(404, 'Value not found')
        const body = (await request.json()) as Record<string, unknown>
        const parsed = parse(account, body, old)
        if ('error' in parsed) return parsed.error
        const f = figures(account, parsed, old.id)
        return HttpResponse.json({
          accountName: account.name,
          type: account.type,
          valueOn: parsed.valueOn,
          amount: parsed.amount,
          reason: parsed.reason,
          plan: false,
          earlierAmount: f.earlier?.amount ?? null,
          earlierOn: f.earlier?.on ?? null,
          change: f.earlier ? money(Number(parsed.amount) - Number(f.earlier.amount)) : null,
          balanceBefore: f.now.amount,
          balanceBeforeOn: f.now.on,
          balanceAfter: f.after.amount,
          balanceAfterOn: f.after.on,
          replacesAmount: old.amount,
          replacesOn: old.valueOn,
          payCredit: parsed.pay ?? null,
          interestCredit: parsed.interest ?? null,
          netWorthBefore: null,
          netWorthAfter: null,
          retirementBefore: null,
          retirementAfter: null,
          ...totals(account, Number(f.after.amount) - Number(f.now.amount)),
        })
      },
    ),
    http.post('*/api/v1/accounts/:id/values', async ({ request, params }) => {
      ctx.log(request)
      const account = find(params.id)
      if (!account) return problem(404, 'Account not found')
      if (account.status !== 'active')
        return problem(409, `${account.name} is ${account.status}. Restore it first.`)
      const key = request.headers.get('Idempotency-Key') ?? ''
      const body = (await request.json()) as Record<string, unknown>
      const seen = ctx.keys.get(key)
      if (seen) {
        const saved = values.find((v) => v.id === seen)!
        return result(account, saved, point(account).amount)
      }
      const parsed = parse(account, body)
      if ('error' in parsed) return parsed.error
      const before = point(account).amount
      const saved: MockValue = {
        id: ctx.newId(),
        accountId: account.id,
        valueOn: parsed.valueOn,
        amount: parsed.amount,
        reason: parsed.reason,
        planned: parsed.plan,
        enteredBy: body.enteredByMemberId as string,
        replacesId: null,
        replaced: false,
        removedAt: null,
        removedBy: null,
        createdAt: stamp(),
        payCredit: parsed.pay ?? null,
        interestCredit: parsed.interest ?? null,
      }
      values.push(saved)
      ctx.keys.set(key, saved.id)
      note(
        saved.planned ? 'planned' : 'saved',
        saved.enteredBy,
        saved.valueOn,
        saved.amount,
        saved.payCredit != null
          ? `Statement for ${saved.valueOn}: pay credit ${saved.payCredit} and benefit interest ${saved.interestCredit}, plan value ${saved.amount}`
          : `${saved.planned ? 'Plan for ' : 'Value for '}${saved.valueOn}: ${saved.amount}`,
      )
      refresh(account)
      const res = result(account, saved, before)
      return new HttpResponse(res.body, { status: 201, headers: res.headers })
    }),
    http.post('*/api/v1/accounts/:id/values/:valueId/correction', async ({ request, params }) => {
      ctx.log(request)
      const account = find(params.id)
      const old = values.find((v) => v.id === params.valueId)
      if (!account || !old) return problem(404, 'Value not found')
      if (account.status === 'closed')
        return problem(409, `${account.name} is closed. Reopen it first.`)
      const key = request.headers.get('Idempotency-Key') ?? ''
      const body = (await request.json()) as Record<string, unknown>
      if (ctx.keys.has(key))
        return result(
          account,
          values.find((v) => v.id === ctx.keys.get(key))!,
          '',
        )
      const parsed = parse(account, body, old)
      if ('error' in parsed) return parsed.error
      const before = point(account).amount
      old.replaced = true
      const saved: MockValue = {
        id: ctx.newId(),
        accountId: account.id,
        valueOn: parsed.valueOn,
        amount: parsed.amount,
        reason: parsed.reason,
        planned: false,
        enteredBy: body.enteredByMemberId as string,
        replacesId: old.id,
        replaced: false,
        removedAt: null,
        removedBy: null,
        createdAt: stamp(),
        payCredit: parsed.pay ?? null,
        interestCredit: parsed.interest ?? null,
      }
      values.push(saved)
      ctx.keys.set(key, saved.id)
      refresh(account)
      const res = result(account, saved, before)
      return new HttpResponse(res.body, { status: 201, headers: res.headers })
    }),
    http.post(
      '*/api/v1/accounts/:id/values/start-extension/review',
      async ({ request, params }) => {
        ctx.log(request)
        const account = find(params.id)
        if (!account) return problem(404, 'Account not found')
        const body = (await request.json()) as Record<string, unknown>
        const failure = extension(account, body, false)
        if ('error' in failure) return failure.error
        return HttpResponse.json(timeline(account, failure.amount, failure.valueOn, true))
      },
    ),
    http.post('*/api/v1/accounts/:id/values/start-extension', async ({ request, params }) => {
      ctx.log(request)
      const account = find(params.id)
      if (!account) return problem(404, 'Account not found')
      if (account.status === 'closed')
        return problem(409, `${account.name} is closed. Reopen it first.`)
      const body = (await request.json()) as Record<string, unknown>
      const key = request.headers.get('Idempotency-Key') ?? ''
      if (ctx.keys.has(key))
        return HttpResponse.json(timeline(account, account.openingAmount, account.openedOn, false))
      const parsed = extension(account, body, true)
      if ('error' in parsed) return parsed.error
      const previous = { amount: account.openingAmount, on: account.openedOn }
      values.push({
        id: ctx.newId(),
        accountId: account.id,
        valueOn: previous.on,
        amount: previous.amount,
        reason: 'Value when tracking began',
        planned: false,
        enteredBy: body.enteredByMemberId as string,
        replacesId: null,
        replaced: false,
        removedAt: null,
        removedBy: null,
        createdAt: stamp(),
      })
      note(
        'start_moved',
        body.enteredByMemberId,
        previous.on,
        previous.amount,
        `Start moved from ${previous.on} to ${parsed.valueOn}: ${String(body.reason)}`,
      )
      account.openingAmount = parsed.amount
      account.openedOn = parsed.valueOn
      ctx.keys.set(key, 'moved')
      refresh(account)
      return HttpResponse.json(timeline(account, parsed.amount, parsed.valueOn, false))
    }),
    http.get('*/api/v1/accounts/:id/values/:valueId/removal/review', ({ request, params }) => {
      ctx.log(request)
      const account = find(params.id)
      const target = values.find((v) => v.id === params.valueId)
      if (!account || !target) return problem(404, 'Value not found')
      const rest = point(account, target.id)
      return HttpResponse.json({
        value: row(target, point(account).id),
        balanceBefore: point(account).amount,
        balanceAfter: rest.amount,
        balanceAfterOn: rest.on,
      })
    }),
    ...(['removal', 'undo'] as const).map((action) =>
      http.post(`*/api/v1/accounts/:id/values/:valueId/${action}`, async ({ request, params }) => {
        ctx.log(request)
        const account = find(params.id)
        const target = values.find((v) => v.id === params.valueId)
        if (!account || !target) return problem(404, 'Value not found')
        if (account.status === 'closed')
          return problem(409, `${account.name} is closed. Reopen it first.`)
        const body = (await request.json()) as { enteredByMemberId?: string }
        const before = point(account).amount
        if (action === 'removal') {
          if (target.removedAt) return problem(409, 'This value was already removed.')
          target.removedAt = stamp()
          target.removedBy = body.enteredByMemberId ?? null
          note('removed', body.enteredByMemberId, target.valueOn, target.amount, null)
        } else {
          target.removedAt = null
          target.removedBy = null
          note('restored', body.enteredByMemberId, target.valueOn, target.amount, null)
        }
        refresh(account)
        return result(account, target, before)
      }),
    ),
  ]
}
