import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { mockApi, type MockAccount, type MockActivity } from '../../test/mockApi'
import { renderRoute } from '../../test/render'

const household = { id: '11111111-1111-4111-8111-111111111111', name: 'Maya and Sam' }
const sam = {
  id: '33333333-3333-4333-8333-333333333333',
  householdId: household.id,
  name: 'Sam',
  label: null,
}
const GROCERIES = 'c0000000-0000-4000-8000-000000000003'
const DINING = 'c0000000-0000-4000-8000-000000000005'
const everyday: MockAccount = {
  id: '44444444-4444-4444-8444-444444444444',
  type: 'checking',
  name: 'Everyday Checking',
  institution: 'Harbor Bank',
  ownerMemberIds: [sam.id],
  openedOn: '2026-09-01',
  openingAmount: '5000.00',
  balance: { amount: '4880.00', asOf: '2026-09-10' },
  status: 'active',
}
const payment: MockActivity = {
  id: '55555555-5555-4555-8555-555555555555',
  accountId: everyday.id,
  kind: 'expense',
  amount: '120.00',
  occurredOn: '2026-09-10',
  description: 'Mixed shop',
  categoryId: '',
  classification: null,
  enteredByMemberId: sam.id,
  portions: [
    { categoryId: GROCERIES, classification: 'essential', amount: '90.00' },
    { categoryId: DINING, classification: 'discretionary', amount: '30.00' },
  ],
}

const seed = () => ({
  household,
  members: [sam],
  accounts: [{ ...everyday }],
  activity: [{ ...payment }],
})

beforeEach(() => window.localStorage.clear())

describe('removing and restoring a split expense', () => {
  it('V2_SPLITS_004 reviews both portions and the $120.00 returning, removes the payment and Undo restores it', async () => {
    const api = mockApi(seed())
    const { user } = renderRoute(`/accounts/${everyday.id}`)
    await user.selectOptions(await screen.findByLabelText('Entering as'), 'Sam')

    await user.click(await screen.findByRole('button', { name: 'Remove Mixed shop' }))
    const review = await screen.findByRole('region', { name: 'Review removal' })
    expect(review).toHaveTextContent('Mixed shop (split)')
    expect(within(review).getByText(/Groceries \$90\.00/)).toBeInTheDocument()
    expect(within(review).getByText(/Dining \$30\.00/)).toBeInTheDocument()
    expect(review).toHaveTextContent('$5,000.00')
    expect(api.activity[0].removedAt).toBeFalsy()
    await user.click(within(review).getByRole('button', { name: 'Confirm removal' }))

    expect(await screen.findByText('No money activity has been recorded yet.')).toBeInTheDocument()
    expect(api.accounts[0].balance.amount).toBe('5000.00')
    expect(api.activity).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Show history' }))
    await user.click(await screen.findByRole('button', { name: 'Undo Mixed shop' }))
    const undo = await screen.findByRole('region', { name: 'Review Undo' })
    expect(within(undo).getByText(/Groceries \$90\.00/)).toBeInTheDocument()
    await user.click(within(undo).getByRole('button', { name: 'Confirm Undo' }))

    const list = await screen.findByRole('table', { name: '' })
    expect(await within(list).findByText(/Groceries \$90\.00/)).toBeInTheDocument()
    expect(api.accounts[0].balance.amount).toBe('4880.00')
    expect(api.activity.filter((a) => !a.removedAt)).toHaveLength(1)
  })
})
