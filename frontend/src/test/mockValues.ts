import { http, HttpResponse } from 'msw'
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
    const latest = effective(account.id, excluding)[0]
    return latest
      ? { amount: latest.amount, on: latest.valueOn, id: latest.id }
      : { amount: account.openingAmount, on: account.openedOn, id: null as string | null }
  }
  const refresh = (account: MockAccount) => {
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
  })
  const find = (id: unknown) => {
    const account = accounts.find((a) => a.id === id)
    return account && (account.type === 'property' || account.type === 'other_asset')
      ? account
      : null
  }
  const parse = (account: MockAccount, body: Record<string, unknown>, replaced?: MockValue) => {
    const amount = typeof body.amount === 'string' ? body.amount : ''
    if (!/^-?\d+(\.\d{1,2})?$/.test(amount)) return { error: problem(400, 'Enter a valid amount') }
    if (Number(amount) < 0)
      return {
        error: problem(
          400,
          account.type === 'property'
            ? 'Enter zero or a positive property value'
            : 'Enter zero or a positive asset value',
        ),
      }
    const valueOn = (body.valueOn as string | undefined) ?? replaced?.valueOn
    if (!valueOn) return { error: problem(400, 'Enter a date') }
    const plan = body.plan === true
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
    if (!plan && valueOn < account.openedOn)
      return {
        error: problem(
          400,
          `This date is before the account's start (${account.openedOn}). Review extending its history first.`,
        ),
      }
    const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null
    if (replaced && !reason) return { error: problem(400, 'Enter a reason') }
    return { amount: Number(amount).toFixed(2), valueOn, plan, reason }
  }
  const figures = (
    account: MockAccount,
    parsed: { amount: string; valueOn: string; plan: boolean },
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
      }
      return HttpResponse.json({
        values: [...rows, initial].sort((a, b) => b.valueOn.localeCompare(a.valueOn)),
        events: [],
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
      }
      values.push(saved)
      ctx.keys.set(key, saved.id)
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
        } else {
          target.removedAt = null
          target.removedBy = null
        }
        refresh(account)
        return result(account, target, before)
      }),
    ),
  ]
}
