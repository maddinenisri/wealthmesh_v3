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

const everyday: MockAccount = {
  id: '44444444-4444-4444-8444-444444444444',
  type: 'credit_card',
  name: 'Everyday Credit Card',
  institution: 'Harbor Cards',
  ownerMemberIds: [maya.id],
  openedOn: '2026-09-01',
  openingAmount: '-1000.00',
  balance: { amount: '-1000.00', asOf: '2026-09-01' },
  status: 'active',
}

beforeEach(() => window.localStorage.clear())

type User = ReturnType<typeof renderRoute>['user']

async function fillCard(
  user: User,
  { name = 'Everyday Credit Card', balance = '$1,000.00', side = 'Owed' } = {},
) {
  await user.selectOptions(await screen.findByLabelText('Account type'), 'credit_card')
  if (name) await user.type(screen.getByLabelText('Account name'), name)
  await user.type(screen.getByLabelText('Issuer'), 'Harbor Cards')
  await user.click(screen.getByRole('checkbox', { name: 'Maya' }))
  fireEvent.change(screen.getByLabelText('Opened on'), { target: { value: '2026-09-01' } })
  if (balance) {
    await user.type(screen.getByLabelText('Balance'), balance)
    await user.selectOptions(screen.getByLabelText('Balance means'), side)
  }
}

describe('adding a credit card', () => {
  it('V2_CARD_001 shows $1,000.00 owed in the list and detail with its issuer, owner and date', async () => {
    const api = mockApi(seed)
    const { user } = renderRoute('/accounts/new')

    await fillCard(user)
    await user.click(screen.getByRole('button', { name: 'Save account' }))

    const row = (await screen.findByRole('link', { name: 'Everyday Credit Card' })).closest('tr')!
    expect(row).toHaveTextContent('$1,000.00 owed')
    expect(row).toHaveTextContent('Harbor Cards')
    expect(row).toHaveTextContent('Maya')
    expect(row).toHaveTextContent('2026-09-01')
    expect(row).not.toHaveTextContent('Overdrawn')
    expect(api.accounts[0]).toMatchObject({ type: 'credit_card', openingAmount: '-1000.00' })
    expect(api.requests).toContain('POST /api/v1/accounts')

    await user.click(within(row).getByRole('link', { name: 'Everyday Credit Card' }))
    const detail = await screen.findByRole('main')
    expect(await within(detail).findByText('Credit card account')).toBeInTheDocument()
    expect(detail).toHaveTextContent('Initial Balance$1,000.00 owed on 2026-09-01')
    expect(detail).toHaveTextContent('Issuer')
    expect(detail).toHaveTextContent('No money activity has been recorded yet.')
    for (const action of ['Record purchase', 'Record refund', 'Record payment']) {
      expect(screen.getByRole('button', { name: action })).toBeInTheDocument()
    }
    expect(screen.queryByRole('button', { name: 'Add money in' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add transfer' })).not.toBeInTheDocument()
  })

  it('V2_CARD_003 shows $50.00 Card credit, not debt, in the list', async () => {
    const api = mockApi(seed)
    const { user } = renderRoute('/accounts/new')

    await fillCard(user, { name: 'Rewards Credit Card', balance: '$50.00', side: 'Card credit' })
    await user.click(screen.getByRole('button', { name: 'Save account' }))

    const row = (await screen.findByRole('link', { name: 'Rewards Credit Card' })).closest('tr')!
    expect(row).toHaveTextContent('$50.00 Card credit')
    expect(row).not.toHaveTextContent('owed')
    expect(api.accounts[0]).toMatchObject({ openingAmount: '50.00' })
  })

  it('V2_CARD_001 asks what a blank Balance means only once an amount is typed', async () => {
    const api = mockApi(seed)
    const { user } = renderRoute('/accounts/new')

    await fillCard(user, { balance: '' })
    await user.click(screen.getByRole('button', { name: 'Save account' }))

    const row = (await screen.findByRole('link', { name: 'Everyday Credit Card' })).closest('tr')!
    expect(row).toHaveTextContent('$0.00 owed')
    expect(api.accounts[0]).toMatchObject({ openingAmount: '0.00' })
    expect(api.requests.some((r) => r.startsWith('POST'))).toBe(true)
  })

  it('V2_CARD_005 explains a missing name, keeps issuer, Balance and date, and adds nothing on Cancel', async () => {
    const api = mockApi(seed)
    const { user } = renderRoute('/accounts/new')

    await fillCard(user, { name: '' })
    await user.click(screen.getByRole('button', { name: 'Save account' }))

    expect(await screen.findByText('Enter an account name')).toBeInTheDocument()
    expect(screen.getByLabelText('Issuer')).toHaveValue('Harbor Cards')
    expect(screen.getByLabelText('Balance')).toHaveValue('$1,000.00')
    expect(screen.getByLabelText('Opened on')).toHaveValue('2026-09-01')
    expect(api.requests.some((r) => r.startsWith('POST'))).toBe(false)

    await user.type(screen.getByLabelText('Account name'), 'Everyday Credit Card')
    await user.click(screen.getByRole('link', { name: 'Cancel' }))
    expect(await screen.findByText('No accounts yet')).toBeInTheDocument()
    expect(api.accounts).toHaveLength(0)
  })

  it('V2_CARD_014 explains an invalid amount, then saves $1,000.00 owed as the one card Balance', async () => {
    const api = mockApi(seed)
    const { user } = renderRoute('/accounts/new')

    await fillCard(user, { balance: 'one thousand' })
    await user.click(screen.getByRole('button', { name: 'Save account' }))

    expect(await screen.findByText('Enter a valid amount')).toBeInTheDocument()
    expect(api.accounts).toHaveLength(0)

    const balance = screen.getByLabelText('Balance')
    await user.clear(balance)
    await user.type(balance, '$1,000.00')
    await user.selectOptions(screen.getByLabelText('Balance means'), 'Owed')
    await user.click(screen.getByRole('button', { name: 'Save account' }))

    const row = (await screen.findByRole('link', { name: 'Everyday Credit Card' })).closest('tr')!
    expect(row).toHaveTextContent('$1,000.00 owed')
    expect(api.accounts).toHaveLength(1)
  })
})

describe('the Household card', () => {
  it('V2_CARD_003 lists a card owed and a Card credit separately and flags neither as overdrawn', async () => {
    const credit: MockAccount = {
      ...everyday,
      id: '55555555-5555-4555-8555-555555555555',
      name: 'Rewards Credit Card',
      openingAmount: '50.00',
      balance: { amount: '50.00', asOf: '2026-09-01' },
    }
    mockApi({ ...seed, accounts: [{ ...everyday }, credit] })
    renderRoute('/')

    const cards = await screen.findByRole('region', { name: 'Cards' })
    const owed = within(cards).getByRole('link', { name: 'Everyday Credit Card' }).closest('li')!
    expect(owed).toHaveTextContent('$1,000.00 owed')
    const rewards = within(cards).getByRole('link', { name: 'Rewards Credit Card' }).closest('li')!
    expect(rewards).toHaveTextContent('$50.00 Card credit')
    expect(owed).not.toHaveTextContent('Overdrawn')
  })
})

describe('editing a credit card', () => {
  it('V2_CARD_004 changes name, owner and issuer and leaves the Balance as $1,000.00 owed', async () => {
    const api = mockApi({ ...seed, accounts: [{ ...everyday }] })
    const { user } = renderRoute(`/accounts/${everyday.id}/edit`)

    const name = await screen.findByLabelText('Account name')
    // The form starts from what is saved, not from blanks.
    expect(name).toHaveValue('Everyday Credit Card')
    expect(screen.getByLabelText('Issuer')).toHaveValue('Harbor Cards')
    expect(screen.getByRole('checkbox', { name: 'Maya' })).toBeChecked()
    await user.clear(name)
    await user.type(name, 'Household Card')
    const issuer = screen.getByLabelText('Issuer')
    await user.clear(issuer)
    await user.type(issuer, 'Harbor Credit Union')
    await user.click(screen.getByRole('checkbox', { name: 'Maya' }))
    await user.click(screen.getByRole('checkbox', { name: 'Sam' }))
    await user.click(screen.getByRole('button', { name: 'Save details' }))

    const detail = await screen.findByRole('main')
    expect(await within(detail).findByRole('heading', { name: 'Household Card' })).toBeVisible()
    expect(detail).toHaveTextContent('Harbor Credit Union')
    expect(detail).toHaveTextContent('Sam')
    expect(detail).toHaveTextContent('$1,000.00 owed')
    expect(api.accounts[0]).toMatchObject({ balance: { amount: '-1000.00', asOf: '2026-09-01' } })
    expect(screen.queryByLabelText('Balance')).not.toBeInTheDocument()
  })
})
