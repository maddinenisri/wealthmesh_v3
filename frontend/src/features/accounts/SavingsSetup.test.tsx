import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { mockApi, type MockAccount } from '../../test/mockApi'
import { renderRoute } from '../../test/render'

const household = { id: '11111111-1111-4111-8111-111111111111', name: 'Maya and Sam' }
const maya = {
  id: '22222222-2222-4222-8222-222222222222',
  householdId: household.id,
  name: 'Maya',
  label: null,
}
const sam = { ...maya, id: '33333333-3333-4333-8333-333333333333', name: 'Sam' }
const seed = { household, members: [maya, sam] }

const emergency = (ownerMemberIds: string[]): MockAccount => ({
  id: '44444444-4444-4444-8444-444444444444',
  type: 'savings',
  name: 'Emergency Savings',
  institution: 'Harbor Bank',
  ownerMemberIds,
  openedOn: '2026-09-01',
  openingAmount: '10000.00',
  balance: { amount: '10000.00', asOf: '2026-09-01' },
  status: 'active',
})

beforeEach(() => window.localStorage.clear())

async function chooseSavings(user: ReturnType<typeof renderRoute>['user']) {
  await user.selectOptions(await screen.findByLabelText('Account type'), 'savings')
}

async function fillSavings(
  user: ReturnType<typeof renderRoute>['user'],
  { balance = '$10,000.00', date = '2026-09-01' } = {},
) {
  await chooseSavings(user)
  await user.type(screen.getByLabelText('Account name'), 'Emergency Savings')
  await user.type(screen.getByLabelText('Bank'), 'Harbor Bank')
  await user.click(screen.getByRole('checkbox', { name: 'Sam' }))
  fireEvent.change(screen.getByLabelText('Opened on'), { target: { value: date } })
  if (balance) await user.type(screen.getByLabelText('Balance'), balance)
}

describe('adding a savings account', () => {
  it('lets Savings be chosen, and every type is offered', async () => {
    mockApi(seed)
    renderRoute('/accounts/new')
    const type = await screen.findByLabelText('Account type')
    expect(within(type).getByRole('option', { name: 'Savings' })).toBeEnabled()
    expect(within(type).getByRole('option', { name: '401(k)' })).toBeEnabled()
    expect(within(type).queryByRole('option', { name: /coming soon/ })).not.toBeInTheDocument()
  })

  it('V2_SAVINGS_001 follows Emergency Savings from the list to its detail and its actions', async () => {
    const api = mockApi(seed)
    const { user } = renderRoute('/accounts/new')

    await fillSavings(user)
    await user.click(screen.getByRole('button', { name: 'Save account' }))

    const row = (await screen.findByRole('link', { name: 'Emergency Savings' })).closest('tr')!
    expect(row).toHaveTextContent('Sam')
    expect(row).toHaveTextContent('Harbor Bank')
    expect(row).toHaveTextContent('$10,000.00')
    expect(row).toHaveTextContent('2026-09-01')
    expect(api.accounts[0]).toMatchObject({ type: 'savings', openingAmount: '10000.00' })

    await user.click(within(row).getByRole('link', { name: 'Emergency Savings' }))
    expect(await screen.findByRole('heading', { name: 'Emergency Savings' })).toBeInTheDocument()
    const detail = screen.getByRole('main')
    expect(detail).toHaveTextContent('Savings account')
    expect(detail).toHaveTextContent('Initial Balance$10,000.00 on 2026-09-01')
    expect(detail).toHaveTextContent('No money activity has been recorded yet.')
    for (const action of ['Add money in', 'Add money out', 'Add transfer', 'Update balance']) {
      expect(screen.getByRole('button', { name: action })).toBeInTheDocument()
    }
    expect(screen.getByRole('link', { name: 'Edit account' })).toBeInTheDocument()
  })

  it('V2_HOUSEHOLD_SETUP_004 starts on the server date and keeps a date chosen for a known balance', async () => {
    const today = '2026-09-05'
    const api = mockApi({ ...seed, today })
    const { user } = renderRoute('/accounts/new')

    await chooseSavings(user)
    await user.type(screen.getByLabelText('Account name'), 'Emergency Savings')
    await user.click(screen.getByRole('checkbox', { name: 'Sam' }))
    await user.type(screen.getByLabelText('Balance'), '$10,000.00')
    expect(screen.getByLabelText('Opened on')).toHaveValue(today)

    fireEvent.change(screen.getByLabelText('Opened on'), { target: { value: '2026-09-01' } })
    await user.click(screen.getByRole('button', { name: 'Save account' }))

    await user.click(await screen.findByRole('link', { name: 'Emergency Savings' }))
    expect(await screen.findByRole('main')).toHaveTextContent(
      'Initial Balance$10,000.00 on 2026-09-01',
    )
    expect(api.accounts[0]).toMatchObject({ type: 'savings', openedOn: '2026-09-01' })
  })

  it('V2_SAVINGS_011 explains an invalid Balance, keeps the details and adds nothing when cancelled', async () => {
    const api = mockApi(seed)
    const { user } = renderRoute('/accounts/new')

    await fillSavings(user, { balance: 'ten thousand' })
    await user.click(screen.getByRole('button', { name: 'Save account' }))

    expect(await screen.findByText('Enter a valid amount')).toBeInTheDocument()
    expect(screen.getByLabelText('Account name')).toHaveValue('Emergency Savings')
    expect(screen.getByLabelText('Bank')).toHaveValue('Harbor Bank')
    expect(screen.getByLabelText('Opened on')).toHaveValue('2026-09-01')
    expect(api.requests.some((r) => r.startsWith('POST'))).toBe(false)

    const balance = screen.getByLabelText('Balance')
    await user.clear(balance)
    await user.type(balance, '$10,000.00')
    await user.click(screen.getByRole('link', { name: 'Cancel' }))

    expect(await screen.findByText('No accounts yet')).toBeInTheDocument()
    expect(api.accounts).toHaveLength(0)
  })

  it('V2_SAVINGS_011 saves the corrected savings account once the Balance is valid', async () => {
    const api = mockApi(seed)
    const { user } = renderRoute('/accounts/new')

    await fillSavings(user, { balance: 'ten thousand' })
    await user.click(screen.getByRole('button', { name: 'Save account' }))
    await screen.findByText('Enter a valid amount')
    const balance = screen.getByLabelText('Balance')
    await user.clear(balance)
    await user.type(balance, '$10,000.00')
    await user.click(screen.getByRole('button', { name: 'Save account' }))

    expect(await screen.findByRole('link', { name: 'Emergency Savings' })).toBeInTheDocument()
    expect(api.accounts).toHaveLength(1)
    expect(api.accounts[0]).toMatchObject({ type: 'savings', openingAmount: '10000.00' })
  })
})

describe('editing a savings account', () => {
  it('V2_SAVINGS_003 renames, changes owner and bank and leaves the balance to Update balance', async () => {
    const api = mockApi({ ...seed, accounts: [emergency([maya.id])] })
    const { user } = renderRoute('/accounts/44444444-4444-4444-8444-444444444444')

    await user.click(await screen.findByRole('link', { name: 'Edit account' }))
    const name = await screen.findByLabelText('Account name')
    await user.clear(name)
    await user.type(name, 'Household Emergency Fund')
    await user.click(screen.getByRole('checkbox', { name: 'Sam' }))
    await user.click(screen.getByRole('checkbox', { name: 'Maya' }))
    const bank = screen.getByLabelText('Bank')
    await user.clear(bank)
    await user.type(bank, 'Harbor Credit Union')
    expect(screen.queryByLabelText('Balance')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save details' }))

    const detail = await screen.findByRole('main')
    expect(await screen.findByRole('heading', { name: 'Household Emergency Fund' })).toBeVisible()
    expect(detail).toHaveTextContent('Sam')
    expect(detail).toHaveTextContent('Harbor Credit Union')
    expect(detail).toHaveTextContent('Initial Balance$10,000.00 on 2026-09-01')
    expect(api.accounts[0]).toMatchObject({ openingAmount: '10000.00', openedOn: '2026-09-01' })
    await user.click(screen.getByRole('button', { name: 'Update balance' }))
    expect(screen.getByLabelText('Date')).toBeInTheDocument()
  })

  it('V2_SAVINGS_004 cancelling an edit keeps the name, owner and date', async () => {
    const api = mockApi({ ...seed, accounts: [emergency([sam.id])] })
    const { user } = renderRoute('/accounts/44444444-4444-4444-8444-444444444444/edit')

    const name = await screen.findByLabelText('Account name')
    await user.clear(name)
    await user.type(name, 'Holiday Savings')
    await user.click(screen.getByRole('link', { name: 'Cancel' }))

    expect(await screen.findByRole('heading', { name: 'Emergency Savings' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveTextContent('Initial Balance$10,000.00 on 2026-09-01')
    expect(api.requests.some((r) => r.startsWith('PUT'))).toBe(false)
    await user.click(screen.getByRole('link', { name: 'Accounts' }))
    const row = (await screen.findByRole('link', { name: 'Emergency Savings' })).closest('tr')!
    expect(row).toHaveTextContent('Sam')
    expect(row).toHaveTextContent('$10,000.00')
  })
})

describe('updating a savings balance', () => {
  it('V2_SAVINGS_008 reviews a $2,000.00 increase, asks for a reason and cancel saves nothing', async () => {
    const account = emergency([sam.id])
    const api = mockApi({ ...seed, accounts: [account] })
    const { user } = renderRoute(`/accounts/${account.id}`)

    await user.selectOptions(await screen.findByLabelText('Entering as'), 'Sam')
    await user.click(await screen.findByRole('button', { name: 'Update balance' }))
    await user.type(await screen.findByLabelText('Balance'), '12000.00')
    const date = screen.getByLabelText('Date')
    await user.clear(date)
    await user.type(date, '2026-09-30')
    await user.click(screen.getByRole('button', { name: 'Review' }))

    const review = await screen.findByRole('region', { name: 'Review balance update' })
    expect(await within(review).findByText('$2,000.00 increase')).toBeInTheDocument()
    expect(review).toHaveTextContent('Reason')

    await user.click(within(review).getByRole('button', { name: 'Cancel' }))
    expect(
      api.requests.some((r) => r.startsWith('POST') && r.endsWith('/balance-corrections')),
    ).toBe(false)
    expect(api.activity).toHaveLength(0)
    expect(await screen.findByRole('main')).toHaveTextContent('Initial Balance$10,000.00')
    await user.click(screen.getByRole('link', { name: 'Accounts' }))
    const row = (await screen.findByRole('link', { name: 'Emergency Savings' })).closest('tr')!
    expect(row).toHaveTextContent('$10,000.00')
  })
})
