import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { mockApi, type MockAccount, type MockStatement } from '../../test/mockApi'
import { renderRoute } from '../../test/render'

const household = { id: '11111111-1111-4111-8111-111111111111', name: 'Maya and Sam' }
const maya = {
  id: '22222222-2222-4222-8222-222222222222',
  householdId: household.id,
  name: 'Maya',
  label: null,
}

const checking: MockAccount = {
  id: '44444444-4444-4444-8444-444444444444',
  type: 'checking',
  name: 'Everyday Checking',
  institution: 'Harbor Bank',
  ownerMemberIds: [maya.id],
  openedOn: '2026-09-01',
  openingAmount: '5000.00',
  balance: { amount: '5000.00', asOf: '2026-09-01' },
  status: 'active',
}

const september: MockStatement = {
  id: '66666666-6666-4666-8666-666666666666',
  accountId: checking.id,
  statementOn: '2026-09-30',
  balance: '5000.00',
  note: 'September statement',
  enteredByMemberId: maya.id,
}

beforeEach(() => window.localStorage.clear())

async function openAccount(user: ReturnType<typeof renderRoute>['user']) {
  await user.selectOptions(await screen.findByLabelText('Entering as'), 'Maya')
}

async function startRevision(user: ReturnType<typeof renderRoute>['user']) {
  const card = await screen.findByRole('region', { name: 'Supporting statements' })
  await user.click(
    await within(card).findByRole('button', { name: 'Replace with corrected version' }),
  )
  await user.clear(await screen.findByLabelText('Statement balance'))
  await user.type(screen.getByLabelText('Statement balance'), '5,000.00')
  await user.type(screen.getByLabelText('Reason'), 'Issuer supplied a corrected statement')
  await user.click(screen.getByRole('button', { name: 'Review' }))
  return await screen.findByRole('region', { name: 'Review statement replacement' })
}

describe('supporting statements', () => {
  it('V2_SUPPORTING_RECORD_003 cancelling a revision keeps the original active and saves nothing', async () => {
    const api = mockApi({
      household,
      members: [maya],
      accounts: [checking],
      statements: [september],
    })
    const { user } = renderRoute(`/accounts/${checking.id}`)
    await openAccount(user)

    const review = await startRevision(user)
    expect(review).toHaveTextContent('September statement')
    expect(review).toHaveTextContent('Your Balance stays $5,000.00')
    await user.click(within(review).getByRole('button', { name: 'Cancel' }))

    const card = await screen.findByRole('region', { name: 'Supporting statements' })
    expect(within(card).getByText('Active version')).toBeInTheDocument()
    expect(within(card).queryByText('Replaced')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Review statement replacement' })).toBeNull()
    expect(api.statements).toHaveLength(1)
    expect(api.requests.filter((r) => r.startsWith('POST') && r.includes('/statements'))).toEqual(
      [],
    )
    expect(screen.getByRole('region', { name: 'Account details' })).toHaveTextContent('$5,000.00')
  })

  it('confirming a revision makes the corrected copy active and keeps the original linked', async () => {
    const api = mockApi({
      household,
      members: [maya],
      accounts: [checking],
      statements: [september],
    })
    const { user } = renderRoute(`/accounts/${checking.id}`)
    await openAccount(user)

    const review = await startRevision(user)
    await user.click(within(review).getByRole('button', { name: 'Confirm replacement' }))

    const card = await screen.findByRole('region', { name: 'Supporting statements' })
    await waitFor(() => expect(within(card).getByText('Replaced')).toBeInTheDocument())
    expect(within(card).getByText('Active version')).toBeInTheDocument()
    expect(card).toHaveTextContent('Issuer supplied a corrected statement')
    expect(card).toHaveTextContent('Maya')
    expect(api.requests).toContain(
      `POST /api/v1/accounts/${checking.id}/statements/${september.id}/revision`,
    )
    expect(screen.getByRole('region', { name: 'Account details' })).toHaveTextContent('$5,000.00')
  })

  it('requires a reason before a revision is reviewed and sends nothing', async () => {
    const api = mockApi({
      household,
      members: [maya],
      accounts: [checking],
      statements: [september],
    })
    const { user } = renderRoute(`/accounts/${checking.id}`)
    await openAccount(user)
    const card = await screen.findByRole('region', { name: 'Supporting statements' })
    await user.click(
      await within(card).findByRole('button', { name: 'Replace with corrected version' }),
    )
    await user.click(await screen.findByRole('button', { name: 'Review' }))
    expect(await screen.findByText('Enter a reason')).toBeInTheDocument()
    expect(api.requests.filter((r) => r.startsWith('POST'))).toEqual([])
  })

  it('attaches a statement: it is listed, shows who attached it and does not change the Balance', async () => {
    const api = mockApi({ household, members: [maya], accounts: [checking] })
    const { user } = renderRoute(`/accounts/${checking.id}`)
    await openAccount(user)
    const card = await screen.findByRole('region', { name: 'Supporting statements' })
    expect(await within(card).findByText('No statements are attached.')).toBeInTheDocument()

    await user.click(within(card).getByRole('button', { name: 'Attach statement' }))
    await user.type(await screen.findByLabelText('Statement date'), '2026-09-30')
    await user.type(screen.getByLabelText('Statement balance'), '5000')
    await user.type(screen.getByLabelText('Note'), 'September statement')
    await user.click(screen.getByRole('button', { name: 'Save statement' }))

    await waitFor(() => expect(within(card).getByText('Active version')).toBeInTheDocument())
    expect(card).toHaveTextContent('$5,000.00')
    expect(card).toHaveTextContent('Maya')
    expect(api.statements).toHaveLength(1)
    expect(screen.getByRole('region', { name: 'Account details' })).toHaveTextContent('$5,000.00')
  })
})
