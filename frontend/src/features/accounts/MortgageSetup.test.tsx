import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { mockApi, type MockAccount } from '../../test/mockApi'
import { renderRoute } from '../../test/render'

const para = (text: string) => (_: string, element: Element | null) =>
  element?.tagName === 'P' && element.textContent === text

const household = { id: '11111111-1111-4111-8111-111111111111', name: 'Maya and Sam' }
const maya = {
  id: '22222222-2222-4222-8222-222222222222',
  householdId: household.id,
  name: 'Maya',
  label: null,
}
const sam = { ...maya, id: '33333333-3333-4333-8333-333333333333', name: 'Sam' }
const seed = { household, members: [maya, sam] }
const ID = '44444444-4444-4444-8444-444444444444'

const homeMortgage = (patch: Partial<MockAccount> = {}): MockAccount => ({
  id: ID,
  type: 'mortgage',
  name: 'Home Mortgage',
  institution: 'Maple Bank',
  ownerMemberIds: [maya.id, sam.id],
  openedOn: '2026-09-01',
  openingAmount: '-200000.00',
  balance: { amount: '-200000.00', asOf: '2026-09-01' },
  status: 'active',
  ...patch,
})

beforeEach(() => window.localStorage.setItem('wealthmesh.enteringAs', maya.id))

// Slice 16b, group 1: a mortgage is a debt like a loan (D-053), named and grouped on its own.
type User = ReturnType<typeof renderRoute>['user']

async function fill(user: User, name: string, owed: string, lender = '') {
  await user.selectOptions(await screen.findByLabelText('Account type'), 'mortgage')
  await user.type(screen.getByLabelText('Account name'), name)
  if (lender) await user.type(screen.getByLabelText('Lender'), lender)
  await user.click(screen.getByRole('checkbox', { name: 'Maya' }))
  await user.click(screen.getByRole('checkbox', { name: 'Sam' }))
  fireEvent.change(screen.getByLabelText('As of'), { target: { value: '2026-09-01' } })
  if (owed) await user.type(screen.getByLabelText('Amount owed'), owed)
}

describe('adding a mortgage', () => {
  it('V2_MORTGAGE_001 the form speaks of a lender and an amount owed, and the review shows both before saving', async () => {
    const api = mockApi(seed)
    const { user } = renderRoute('/accounts/new')

    await fill(user, 'Home Mortgage', '200000.00', 'Maple Bank')
    expect(screen.queryByLabelText('Bank')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Balance')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Review' }))

    expect(
      await screen.findByText(para('Home Mortgage will start at $200,000.00 owed on 2026-09-01.')),
    ).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Review new mortgage' })).toBeVisible()
    expect(screen.getByText('Lender: Maple Bank. Owners: Maya, Sam.')).toBeVisible()
    expect(api.requests.some((r) => r.startsWith('POST'))).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    const row = (await screen.findByRole('link', { name: 'Home Mortgage' })).closest('tr')!
    expect(row).toHaveTextContent('$200,000.00 owed')
    expect(row).toHaveTextContent('Mortgage')
    expect(api.accounts[0]).toMatchObject({ type: 'mortgage', openingAmount: '-200000.00' })
    expect(api.requests.filter((r) => r.startsWith('POST'))).toHaveLength(1)
  })

  it('V2_MORTGAGE_002 a blank amount owed is reviewed as $0.00 owed on its date and saved by one Confirm', async () => {
    const api = mockApi(seed)
    const { user } = renderRoute('/accounts/new')

    await fill(user, 'Future Home Mortgage', '')
    await user.click(screen.getByRole('button', { name: 'Review' }))

    expect(
      await screen.findByText(para('Future Home Mortgage will start at $0.00 owed on 2026-09-01.')),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    const row = (await screen.findByRole('link', { name: 'Future Home Mortgage' })).closest('tr')!
    expect(row).toHaveTextContent('$0.00 owed')
    expect(api.accounts[0]).toMatchObject({ type: 'mortgage', openingAmount: '0.00' })
  })

  it('V2_MORTGAGE_007 a negative or invalid amount owed is explained in a debt’s words and nothing is created', async () => {
    const api = mockApi(seed)
    const { user } = renderRoute('/accounts/new')

    await fill(user, 'Home Mortgage', '-1.00')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(await screen.findByText('Enter zero or a positive amount owed')).toBeInTheDocument()

    const owed = screen.getByLabelText('Amount owed')
    await user.clear(owed)
    await user.type(owed, 'abc')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(await screen.findByText('Enter a valid amount')).toBeInTheDocument()
    expect(api.requests.some((r) => r.startsWith('POST'))).toBe(false)
  })

  it('V2_MORTGAGE_001 the type list offers Mortgage as ready', async () => {
    mockApi(seed)
    renderRoute('/accounts/new')
    const type = await screen.findByLabelText('Account type')
    expect(within(type).getByRole('option', { name: 'Mortgage' })).toBeEnabled()
  })
})

describe('a mortgage on its pages', () => {
  it('V2_MORTGAGE_001 the account page says Balance owed and Lender and offers no money buttons', async () => {
    mockApi({ ...seed, accounts: [homeMortgage()] })
    renderRoute(`/accounts/${ID}`)

    const details = await screen.findByLabelText('Account details')
    expect(within(details).getByText('Balance owed')).toBeInTheDocument()
    expect(within(details).getByText('Initial amount owed')).toBeInTheDocument()
    expect(within(details).getByText('Lender')).toBeInTheDocument()
    expect(within(details).getByText('Maple Bank')).toBeInTheDocument()
    expect(details).toHaveTextContent('Balance owed$200,000.00 as of 2026-09-01')
    expect(details).not.toHaveTextContent('-$200,000.00')
    expect(details).not.toHaveTextContent('Overdrawn')
    for (const action of ['Add money in', 'Add money out', 'Add transfer', 'Update balance']) {
      expect(screen.queryByRole('button', { name: action })).not.toBeInTheDocument()
    }
  })

  it('V2_MORTGAGE_001 editing the name keeps lender, owners, balance and date', async () => {
    const api = mockApi({ ...seed, accounts: [homeMortgage()] })
    const { user } = renderRoute(`/accounts/${ID}/edit`)

    expect(await screen.findByLabelText('Lender')).toHaveValue('Maple Bank')
    const name = screen.getByLabelText('Account name')
    await user.clear(name)
    await user.type(name, 'Maple Mortgage')
    await user.click(screen.getByRole('button', { name: 'Save details' }))

    expect(await screen.findByRole('heading', { name: 'Maple Mortgage' })).toBeInTheDocument()
    expect(api.accounts[0]).toMatchObject({
      name: 'Maple Mortgage',
      institution: 'Maple Bank',
      openingAmount: '-200000.00',
      openedOn: '2026-09-01',
    })
  })

  it('V2_MORTGAGE_001 Household lists the mortgage under Mortgages and the loan under Loans, each debt counted once', async () => {
    const other = '55555555-5555-4555-8555-555555555555'
    const base = homeMortgage()
    mockApi({
      ...seed,
      accounts: [
        base,
        {
          ...base,
          id: '66666666-6666-4666-8666-666666666666',
          type: 'loan',
          name: 'Car Loan',
          institution: 'Maple Credit',
          openingAmount: '-20000.00',
          balance: { amount: '-20000.00', asOf: '2026-09-01' },
        },
        {
          ...base,
          id: other,
          type: 'checking',
          name: 'Checking',
          institution: 'Harbor Bank',
          openingAmount: '5000.00',
          balance: { amount: '5000.00', asOf: '2026-09-01' },
        },
        {
          ...base,
          id: '77777777-7777-4777-8777-777777777777',
          type: 'property',
          name: 'Family Home',
          institution: null,
          openingAmount: '300000.00',
          balance: { amount: '300000.00', asOf: '2026-09-01' },
        },
      ],
    })
    renderRoute('/')

    const card = await screen.findByRole('region', { name: 'Accounts and wealth' })
    expect(await within(card).findByText(/Net worth/)).toHaveTextContent('$85,000.00')
    expect(within(card).getByText(/^Debts/)).toHaveTextContent('$220,000.00')
    const mortgages = within(card).getByRole('region', { name: 'Mortgages' })
    expect(mortgages).toHaveTextContent('Home Mortgage')
    expect(mortgages).toHaveTextContent('$200,000.00 owed')
    expect(mortgages).not.toHaveTextContent('Car Loan')
    const loans = within(card).getByRole('region', { name: 'Loans' })
    expect(loans).toHaveTextContent('Car Loan')
    expect(loans).not.toHaveTextContent('Home Mortgage')
    const debts = within(card).getByRole('region', { name: 'What makes up debts' })
    expect(within(debts).getAllByRole('listitem')).toHaveLength(2)
  })
})
