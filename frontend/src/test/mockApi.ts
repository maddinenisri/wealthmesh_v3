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
  } = {},
) {
  const today = seed.today ?? '2026-10-03'
  const state = {
    household: seed.household ?? (null as MockHousehold | null),
    members: [...(seed.members ?? [])],
    accounts: [...(seed.accounts ?? [])],
    /** "METHOD /path" for every request the UI made, in order. */
    requests: [] as string[],
  }
  let nextId = 1
  const newId = () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`
  const log = (request: Request) =>
    state.requests.push(`${request.method} ${new URL(request.url).pathname}`)

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
