import { fireEvent, screen, within } from '@testing-library/react'
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

type User = ReturnType<typeof renderRoute>['user']

async function openEdit(user: User) {
  await user.selectOptions(await screen.findByLabelText('Entering as'), 'Sam')
  await user.click(await screen.findByRole('button', { name: 'Edit Mixed shop' }))
}

describe('correcting a split expense', () => {
  it('V2_SPLITS_002 reviews $80.00 and $40.00 with a reason and keeps the original split in history', async () => {
    const api = mockApi(seed())
    const { user } = renderRoute(`/accounts/${everyday.id}`)
    await openEdit(user)

    expect(await screen.findByText('Edit split expense')).toBeInTheDocument()
    expect(screen.getByLabelText('Portion amount 1')).toHaveValue('90.00')
    expect(screen.getByLabelText('Category 2')).toHaveDisplayValue('Dining')
    await user.clear(screen.getByLabelText('Portion amount 1'))
    await user.type(screen.getByLabelText('Portion amount 1'), '80.00')
    await user.clear(screen.getByLabelText('Portion amount 2'))
    await user.type(screen.getByLabelText('Portion amount 2'), '40.00')
    await user.type(screen.getByLabelText('Reason'), 'Gift receipt was ten dollars higher')
    await user.click(screen.getByRole('button', { name: 'Review' }))

    expect(await screen.findByText('Review change')).toBeInTheDocument()
    expect(document.body).toHaveTextContent('Before: Groceries $90.00, Dining $30.00')
    expect(document.body).toHaveTextContent('The original split stays in history')
    expect(document.body).toHaveTextContent('Gift receipt was ten dollars higher')
    expect(api.activity).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Confirm saving' }))

    const list = await screen.findByRole('table')
    expect(await within(list).findByText(/Groceries \$80\.00/)).toBeInTheDocument()
    expect(within(list).getByText(/Dining \$40\.00/)).toBeInTheDocument()
    expect(api.activity).toHaveLength(2)
    expect(api.activity[0].removedAt).toBeTruthy()
    expect(api.activity[1].reason).toBe('Gift receipt was ten dollars higher')
    expect(api.accounts[0].balance.amount).toBe('4880.00')

    await user.click(screen.getByRole('button', { name: 'Show history' }))
    const history = await screen.findByRole('table', { name: /history/i })
    // The portions show twice (a narrow and a wide layout); the replaced row keeps the original split.
    expect(await within(history).findAllByText(/Groceries \$90\.00/)).not.toHaveLength(0)
    expect(within(history).getAllByText(/Dining \$30\.00/)).not.toHaveLength(0)
    expect(within(history).getAllByText(/Groceries \$80\.00/)).not.toHaveLength(0)
  })

  it('V2_SPLITS_005 cancelling the review of a changed amount, date and portions changes nothing', async () => {
    const api = mockApi(seed())
    const { user } = renderRoute(`/accounts/${everyday.id}`)
    await openEdit(user)

    await user.clear(await screen.findByLabelText('Amount'))
    await user.type(screen.getByLabelText('Amount'), '150.00')
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-09-12' } })
    await user.clear(screen.getByLabelText('Portion amount 1'))
    await user.type(screen.getByLabelText('Portion amount 1'), '100.00')
    await user.clear(screen.getByLabelText('Portion amount 2'))
    await user.type(screen.getByLabelText('Portion amount 2'), '50.00')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(await screen.findByText('Review change')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    const list = await screen.findByRole('table')
    expect(await within(list).findByText('2026-09-10')).toBeInTheDocument()
    expect(within(list).getByText(/Groceries \$90\.00/)).toBeInTheDocument()
    expect(within(list).getByText(/Dining \$30\.00/)).toBeInTheDocument()
    expect(api.activity).toHaveLength(1)
    expect(api.activity[0].removedAt).toBeFalsy()
    expect(api.accounts[0].balance.amount).toBe('4880.00')
    expect(api.requests.some((r) => r.includes('/replacement') && r.startsWith('POST'))).toBe(false)
  })
})
