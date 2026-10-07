import { fireEvent, screen, waitFor, within } from '@testing-library/react'
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
const ID = '44444444-4444-4444-8444-444444444444'

const carLoan = (patch: Partial<MockAccount> = {}): MockAccount => ({
  id: ID,
  type: 'loan',
  name: 'Car Loan',
  institution: 'Maple Credit',
  ownerMemberIds: [maya.id, sam.id],
  openedOn: '2026-09-01',
  openingAmount: '-20000.00',
  balance: { amount: '-20000.00', asOf: '2026-09-01' },
  status: 'active',
  ...patch,
})

beforeEach(() => window.localStorage.setItem('wealthmesh.enteringAs', maya.id))

// Slice 16a, group 1: loan setup. The loan's words are a debt's: Lender, Amount owed, Balance owed.
type User = ReturnType<typeof renderRoute>['user']

async function fill(user: User, name: string, owed: string, lender = '') {
  await user.selectOptions(await screen.findByLabelText('Account type'), 'loan')
  await user.type(screen.getByLabelText('Account name'), name)
  if (lender) await user.type(screen.getByLabelText('Lender'), lender)
  await user.click(screen.getByRole('checkbox', { name: 'Maya' }))
  await user.click(screen.getByRole('checkbox', { name: 'Sam' }))
  fireEvent.change(screen.getByLabelText('As of'), { target: { value: '2026-09-01' } })
  if (owed) await user.type(screen.getByLabelText('Amount owed'), owed)
}

describe('adding a loan', () => {
  it('V2_LOAN_001 the form speaks of a lender and an amount owed, and the review shows both before saving', async () => {
    const api = mockApi(seed)
    const { user } = renderRoute('/accounts/new')

    await fill(user, 'Car Loan', '20000.00', 'Maple Credit')
    expect(screen.queryByLabelText('Bank')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Balance')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Opened on')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Review' }))

    expect(
      await screen.findByText('Car Loan will start at $20,000.00 owed on 2026-09-01.'),
    ).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Review new loan' })).toBeVisible()
    expect(screen.getByText('Lender: Maple Credit. Owners: Maya, Sam.')).toBeVisible()
    expect(api.requests.some((r) => r.startsWith('POST'))).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    const row = (await screen.findByRole('link', { name: 'Car Loan' })).closest('tr')!
    expect(row).toHaveTextContent('$20,000.00 owed')
    expect(row).toHaveTextContent('Loan')
    expect(api.accounts[0]).toMatchObject({ type: 'loan', openingAmount: '-20000.00' })
    expect(api.requests.filter((r) => r.startsWith('POST'))).toHaveLength(1)
  })

  it('V2_LOAN_002 a blank amount owed is reviewed as $0.00 owed on its date and saved by one Confirm', async () => {
    const api = mockApi(seed)
    const { user } = renderRoute('/accounts/new')

    await fill(user, 'Personal Loan', '')
    await user.click(screen.getByRole('button', { name: 'Review' }))

    expect(
      await screen.findByText('Personal Loan will start at $0.00 owed on 2026-09-01.'),
    ).toBeVisible()
    expect(
      screen.getByText(/The amount owed was left blank, so it starts at \$0\.00 owed/),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    const row = (await screen.findByRole('link', { name: 'Personal Loan' })).closest('tr')!
    expect(row).toHaveTextContent('$0.00 owed')
    expect(api.accounts[0]).toMatchObject({ type: 'loan', openingAmount: '0.00' })
    expect(api.requests.filter((r) => r.startsWith('POST'))).toHaveLength(1)
  })

  it('V2_LOAN_005 a negative or invalid amount owed is explained in a debt’s words and nothing is created', async () => {
    const api = mockApi(seed)
    const { user } = renderRoute('/accounts/new')

    await fill(user, 'Car Loan', '-1.00')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(await screen.findByText('Enter zero or a positive amount owed')).toBeInTheDocument()

    const owed = screen.getByLabelText('Amount owed')
    await user.clear(owed)
    await user.type(owed, 'abc')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(await screen.findByText('Enter a valid amount')).toBeInTheDocument()
    expect(api.requests.some((r) => r.startsWith('POST'))).toBe(false)
  })

  it('V2_LOAN_001 Back from the review keeps the details and puts focus in the form; Cancel saves nothing', async () => {
    const api = mockApi(seed)
    const { user } = renderRoute('/accounts/new')

    await fill(user, 'Car Loan', '$20,000.00', 'Maple Credit')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    await screen.findByRole('heading', { name: 'Review new loan' })
    await user.click(screen.getByRole('button', { name: 'Back' }))

    expect(screen.getByLabelText('Amount owed')).toHaveValue('$20,000.00')
    expect(screen.getByLabelText('Lender')).toHaveValue('Maple Credit')
    await waitFor(() => expect(screen.getByLabelText('Account name')).toHaveFocus())
    await user.click(screen.getByRole('button', { name: 'Review' }))
    await user.click(await screen.findByRole('link', { name: 'Cancel' }))
    expect(await screen.findByText('No accounts yet')).toBeInTheDocument()
    expect(api.requests.some((r) => r.startsWith('POST'))).toBe(false)
  })

  it('V2_LOAN_001 the type list offers Loan as ready and Mortgage still as coming soon', async () => {
    mockApi(seed)
    renderRoute('/accounts/new')
    const type = await screen.findByLabelText('Account type')
    expect(within(type).getByRole('option', { name: 'Loan' })).toBeEnabled()
    expect(within(type).getByRole('option', { name: 'Mortgage (coming soon)' })).toBeDisabled()
  })
})

describe('a loan on its pages', () => {
  it('V2_LOAN_001 the account page says Balance owed and Lender, shows one owed figure and no money buttons', async () => {
    mockApi({ ...seed, accounts: [carLoan()] })
    renderRoute(`/accounts/${ID}`)

    const details = await screen.findByLabelText('Account details')
    expect(within(details).getByText('Balance owed')).toBeInTheDocument()
    expect(within(details).getByText('Initial amount owed')).toBeInTheDocument()
    expect(within(details).getByText('Lender')).toBeInTheDocument()
    expect(within(details).getByText('Maple Credit')).toBeInTheDocument()
    expect(within(details).queryByText('Balance')).not.toBeInTheDocument()
    expect(within(details).queryByText('Bank')).not.toBeInTheDocument()
    expect(details).toHaveTextContent('$20,000.00 owed')
    expect(details).not.toHaveTextContent('-$20,000.00')
    expect(details).not.toHaveTextContent('Overdrawn')
    for (const action of ['Add money in', 'Add money out', 'Add transfer', 'Update balance']) {
      expect(screen.queryByRole('button', { name: action })).not.toBeInTheDocument()
    }
  })

  it('V2_LOAN_001 editing the name keeps lender, owners, balance and date; the form says Lender', async () => {
    const api = mockApi({ ...seed, accounts: [carLoan()] })
    const { user } = renderRoute(`/accounts/${ID}/edit`)

    expect(await screen.findByLabelText('Lender')).toHaveValue('Maple Credit')
    expect(screen.queryByLabelText('Bank')).not.toBeInTheDocument()
    expect(screen.getByRole('main')).not.toHaveTextContent(/Update balance|bank/i)
    const name = screen.getByLabelText('Account name')
    await user.clear(name)
    await user.type(name, 'Blue Car Loan')
    await user.click(screen.getByRole('button', { name: 'Save details' }))

    expect(await screen.findByRole('heading', { name: 'Blue Car Loan' })).toBeInTheDocument()
    expect(api.accounts[0]).toMatchObject({
      name: 'Blue Car Loan',
      institution: 'Maple Credit',
      openingAmount: '-20000.00',
      openedOn: '2026-09-01',
    })
  })

  it('V2_LOAN_001 the Household card lists the loan under Loans, not Bank money, and counts its debt once', async () => {
    mockApi({
      ...seed,
      accounts: [
        carLoan(),
        {
          ...carLoan({ id: '55555555-5555-4555-8555-555555555555' }),
          type: 'checking',
          name: 'Checking',
          institution: 'Harbor Bank',
          openingAmount: '5000.00',
          balance: { amount: '5000.00', asOf: '2026-09-01' },
        },
      ],
    })
    renderRoute('/')

    const card = await screen.findByRole('region', { name: 'Accounts and wealth' })
    expect(await within(card).findByText(/Net worth/)).toHaveTextContent('-$15,000.00')
    expect(within(card).getByText(/^Debts/)).toHaveTextContent('$20,000.00')
    const loans = within(card).getByRole('region', { name: 'Loans' })
    expect(loans).toHaveTextContent('Car Loan')
    expect(loans).toHaveTextContent('$20,000.00 owed')
    const bank = within(card).getByRole('region', { name: 'Bank money' })
    expect(bank).not.toHaveTextContent('Car Loan')
    expect(bank).not.toHaveTextContent('counted once, as debt')
    const debts = within(card).getByRole('region', { name: 'What makes up debts' })
    expect(within(debts).getAllByRole('listitem')).toHaveLength(1)
    expect(debts).toHaveTextContent('$20,000.00 owed')
    expect(debts).not.toHaveTextContent('overdrawn')
  })

  it('V2_LOAN_001 Archive, Restore and Close reviews of a loan speak of the amount owed and payments', async () => {
    mockApi({ ...seed, accounts: [carLoan()] })
    const { user } = renderRoute(`/accounts/${ID}`)
    await user.click(await screen.findByRole('button', { name: 'Archive account' }))
    const archive = await screen.findByRole('region', { name: 'Review archiving Car Loan' })
    expect(archive).toHaveTextContent('$20,000.00 owed will remain in wealth as debt')
    expect(archive).not.toHaveTextContent(/transfers|bank|entries/)
    await user.click(within(archive).getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Close account' }))
    const close = await screen.findByRole('region', { name: 'Review closing Car Loan' })
    expect(close).toHaveTextContent(
      'Closing needs a zero Balance owed. Car Loan has $20,000.00 owed',
    )
    expect(close).toHaveTextContent('record a payment')
    expect(close).not.toHaveTextContent('transfer')
  })
})
