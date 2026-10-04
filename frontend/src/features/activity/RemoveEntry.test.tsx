import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { mockApi, type MockAccount, type MockActivity } from '../../test/mockApi'
import { renderRoute } from '../../test/render'

const household = { id: '11111111-1111-4111-8111-111111111111', name: 'Maya and Sam' }
const maya = {
  id: '22222222-2222-4222-8222-222222222222',
  householdId: household.id,
  name: 'Maya',
  label: null,
}
const sam = {
  id: '33333333-3333-4333-8333-333333333333',
  householdId: household.id,
  name: 'Sam',
  label: null,
}
const checking = (balance: string, asOf: string): MockAccount => ({
  id: '44444444-4444-4444-8444-444444444444',
  type: 'checking',
  name: 'Everyday Checking',
  institution: 'Harbor Bank',
  ownerMemberIds: [maya.id],
  openedOn: '2026-09-01',
  openingAmount: '5000.00',
  balance: { amount: balance, asOf },
  status: 'active',
})
const GROCERIES = 'c0000000-0000-4000-8000-000000000003'
const SALARY = 'c0000000-0000-4000-8000-000000000004'
const accountId = '44444444-4444-4444-8444-444444444444'

const groceries: MockActivity = {
  id: '55555555-5555-4555-8555-555555555555',
  accountId,
  kind: 'expense',
  amount: '125.00',
  occurredOn: '2026-09-10',
  description: 'Groceries',
  categoryId: GROCERIES,
  enteredByMemberId: sam.id,
}
const salary: MockActivity = {
  id: '66666666-6666-4666-8666-666666666666',
  accountId,
  kind: 'income',
  amount: '6000.00',
  occurredOn: '2026-09-02',
  description: 'Salary',
  categoryId: SALARY,
  enteredByMemberId: maya.id,
}

beforeEach(() => window.localStorage.clear())

describe('removing an entry', () => {
  it('V2_EXPENSE_009 cancels a removal, confirms it, and restores it with Undo', async () => {
    const api = mockApi({
      household,
      members: [maya, sam],
      accounts: [checking('4875.00', '2026-09-10')],
      activity: [{ ...groceries }],
    })
    const { user } = renderRoute(`/accounts/${accountId}`)
    await user.selectOptions(await screen.findByLabelText('Entering as'), 'Sam')

    await user.click(await screen.findByRole('button', { name: 'Remove Groceries' }))
    const review = await screen.findByRole('region', { name: 'Review removal' })
    expect(review).toHaveTextContent('$5,000.00')
    expect(review).toHaveTextContent('September spending after removal')
    expect(review).toHaveTextContent('Removing a tracked expense does not obtain a merchant refund')
    await user.click(within(review).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('region', { name: 'Review removal' })).not.toBeInTheDocument()
    expect(api.accounts[0].balance.amount).toBe('4875.00')
    expect(screen.getByRole('button', { name: 'Remove Groceries' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove Groceries' }))
    await user.click(await screen.findByRole('button', { name: 'Confirm removal' }))
    expect(await screen.findByText('No money activity has been recorded yet.')).toBeInTheDocument()
    expect(api.accounts[0].balance.amount).toBe('5000.00')

    await user.click(screen.getByRole('button', { name: 'Show history' }))
    const history = await screen.findByRole('table', { name: 'History' })
    expect(history).toHaveTextContent('Removed by Sam')
    await user.click(within(history).getByRole('button', { name: 'Undo Groceries' }))
    await user.click(await screen.findByRole('button', { name: 'Confirm Undo' }))

    expect(await screen.findByRole('button', { name: 'Remove Groceries' })).toBeInTheDocument()
    expect(await screen.findByRole('table', { name: 'History' })).toHaveTextContent(
      'Restored by Sam',
    )
    expect(api.accounts[0].balance.amount).toBe('4875.00')
    expect(api.activity.filter((a) => !a.removedAt)).toHaveLength(1)
    expect(api.activity[0].occurredOn).toBe('2026-09-10')
    expect(api.requests).toContain(
      `POST /api/v1/accounts/${accountId}/activity/${groceries.id}/undo`,
    )
  })

  it('V2_INCOME_004 previews the Balance and September Income, removes the salary and undoes it', async () => {
    const api = mockApi({
      household,
      members: [maya, sam],
      accounts: [checking('11000.00', '2026-09-02')],
      activity: [{ ...salary }],
    })
    const { user } = renderRoute(`/accounts/${accountId}`)
    await user.selectOptions(await screen.findByLabelText('Entering as'), 'Maya')

    await user.click(await screen.findByRole('button', { name: 'Remove Salary' }))
    const review = await screen.findByRole('region', { name: 'Review removal' })
    expect(await within(review).findByText('September Income after removal')).toBeInTheDocument()
    expect(review).toHaveTextContent('$5,000.00')
    expect(review).toHaveTextContent('$0.00')
    expect(review).toHaveTextContent('This does not reverse a bank deposit')
    await user.click(within(review).getByRole('button', { name: 'Confirm removal' }))

    await user.click(await screen.findByRole('button', { name: 'Show history' }))
    await user.click(await screen.findByRole('button', { name: 'Undo Salary' }))
    await user.click(await screen.findByRole('button', { name: 'Confirm Undo' }))

    expect(await screen.findByRole('button', { name: 'Remove Salary' })).toBeInTheDocument()
    expect(api.accounts[0].balance.amount).toBe('11000.00')
    expect(api.activity.filter((a) => !a.removedAt && a.kind === 'income')).toHaveLength(1)
  })

  it('shows the server message and keeps the entry when removal is refused', async () => {
    mockApi({
      household,
      members: [maya, sam],
      accounts: [checking('4875.00', '2026-09-10')],
      activity: [{ ...groceries, removedAt: null }],
    })
    const { user } = renderRoute(`/accounts/${accountId}`)
    await user.click(await screen.findByRole('button', { name: 'Remove Groceries' }))
    // No one is chosen to enter this, so Confirm stays disabled.
    expect(await screen.findByRole('button', { name: 'Confirm removal' })).toBeDisabled()
  })
})
