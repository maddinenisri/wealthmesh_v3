import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { CATEGORIES, mockApi, type MockAccount } from '../../test/mockApi'
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
const [rent, utilities, groceries] = CATEGORIES

const everyday: MockAccount = {
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

const seed = () => ({ household, members: [maya, sam], accounts: [{ ...everyday }] })

beforeEach(() => window.localStorage.clear())

async function openForm(user: ReturnType<typeof renderRoute>['user']) {
  await user.click(await screen.findByRole('button', { name: 'Add money out' }))
}

async function fillExpense(
  user: ReturnType<typeof renderRoute>['user'],
  fields: { description?: string; amount: string; date: string; category: string },
) {
  const description = await screen.findByLabelText('Description')
  if (fields.description) await user.type(description, fields.description)
  await user.type(screen.getByLabelText('Amount'), fields.amount)
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: fields.date } })
  await user.selectOptions(screen.getByLabelText('Category'), fields.category)
}

async function enterAs(user: ReturnType<typeof renderRoute>['user'], name: string) {
  await user.selectOptions(await screen.findByLabelText('Entering as'), name)
}

describe('recording an expense', () => {
  it('V2_EXPENSE_010 rejects a zero purchase and keeps what was entered', async () => {
    const api = mockApi(seed())
    const { user } = renderRoute(`/accounts/${everyday.id}`)
    await openForm(user)

    await fillExpense(user, { amount: '0.00', date: '2026-09-10', category: 'Groceries' })
    await user.click(screen.getByRole('button', { name: 'Review' }))

    expect(await screen.findByText('Enter an amount greater than zero')).toBeInTheDocument()
    expect(screen.getByLabelText('Date')).toHaveValue('2026-09-10')
    expect(screen.getByLabelText('Category')).toHaveDisplayValue('Groceries')
    expect(screen.getByText('Everyday Checking', { selector: 'strong' })).toBeInTheDocument()
    expect(api.activity).toHaveLength(0)
    expect(api.accounts[0].balance.amount).toBe('5000.00')
  })

  it('sends a date before the opening date to the historical setup review and saves nothing', async () => {
    const api = mockApi(seed())
    const { user } = renderRoute(`/accounts/${everyday.id}`)
    await openForm(user)

    await fillExpense(user, { amount: '20.00', date: '2026-08-15', category: 'Groceries' })
    await user.click(screen.getByRole('button', { name: 'Review' }))

    expect(
      await screen.findByRole('region', { name: 'Review historical setup' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Review money out' })).toBeNull()
    expect(api.activity).toHaveLength(0)
    expect(api.requests.filter((r) => r.startsWith('POST'))).toEqual([])
  })

  it('V2_CHECKING_011 rejects -$100.00, then saves $100.00 once when the answer to the first save is lost', async () => {
    const api = mockApi(seed())
    const { user } = renderRoute(`/accounts/${everyday.id}`)
    await enterAs(user, 'Maya')
    await openForm(user)

    await fillExpense(user, { amount: '-$100.00', date: '2026-09-10', category: 'Groceries' })
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(await screen.findByText('Enter an amount greater than zero')).toBeInTheDocument()
    expect(screen.getByLabelText('Category')).toHaveDisplayValue('Groceries')

    await user.clear(screen.getByLabelText('Amount'))
    await user.type(screen.getByLabelText('Amount'), '$100.00')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(screen.getByText(/Entered by:/)).toHaveTextContent('Entered by: Maya')

    api.loseNextExpenseResponse = true
    await user.click(screen.getByRole('button', { name: 'Confirm saving' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The server took too long to answer')
    await user.click(screen.getByRole('button', { name: 'Confirm saving' }))

    await screen.findByRole('cell', { name: '2026-09-10' })
    expect(api.activity).toHaveLength(1)
    expect(api.keys).toHaveLength(2)
    expect(api.keys[0]).toBe(api.keys[1])
    expect(await screen.findByText('$4,900', { exact: false })).toBeInTheDocument()
    expect(api.activity[0]).toMatchObject({ amount: '100.00', enteredByMemberId: maya.id })
  })

  it('D-025 asks who is entering when no name is chosen yet, and lets the name change at review', async () => {
    const api = mockApi(seed())
    const { user } = renderRoute(`/accounts/${everyday.id}`)
    await openForm(user)
    await fillExpense(user, { amount: '180.00', date: '2026-09-05', category: 'Utilities' })
    await user.click(screen.getByRole('button', { name: 'Review' }))

    expect(screen.getByRole('button', { name: 'Confirm saving' })).toBeDisabled()
    const review = screen.getByRole('region', { name: 'Review money out' })
    await user.selectOptions(within(review).getByLabelText('Entered by'), 'Sam')
    expect(within(review).getByText(/Entered by:/)).toHaveTextContent('Entered by: Sam')

    await user.click(within(review).getByRole('button', { name: 'Change' }))
    await user.selectOptions(within(review).getByLabelText('Entered by'), 'Maya')
    await user.click(screen.getByRole('button', { name: 'Confirm saving' }))
    await screen.findByRole('cell', { name: '2026-09-05' })
    expect(api.activity[0].enteredByMemberId).toBe(maya.id)
  })
})

describe('the monthly spending view', () => {
  const bill = {
    id: '55555555-5555-4555-8555-555555555555',
    accountId: everyday.id,
    kind: 'expense',
    amount: '180.00',
    occurredOn: '2026-09-05',
    description: 'Electricity',
    categoryId: utilities.id,
    enteredByMemberId: sam.id,
  }

  it('V2_EXPENSE_001 follows a bill from September spending to its details', async () => {
    mockApi({
      ...seed(),
      accounts: [{ ...everyday, balance: { amount: '4820.00', asOf: '2026-09-05' } }],
      activity: [bill],
    })
    const { user } = renderRoute('/spending')

    fireEvent.change(await screen.findByLabelText('Month'), { target: { value: '2026-09' } })
    const categories = await screen.findByRole('list', { name: 'Spending by category' })
    await user.click(within(categories).getByRole('button', { name: 'Utilities' }))

    const table = await screen.findByRole('table', { name: 'Expenses in this category' })
    const row = within(table).getByRole('row', { name: /Electricity/ })
    expect(row).toHaveTextContent('$180.00')
    expect(row).toHaveTextContent('2026-09-05')
    expect(row).toHaveTextContent('Everyday Checking')

    await user.click(within(row).getByRole('button', { name: 'Electricity' }))
    const details = screen.getByLabelText('Expense details')
    expect(details).toHaveTextContent('Everyday Checking')
    expect(details).toHaveTextContent('2026-09-05')
    expect(details).toHaveTextContent('$180.00')
    expect(details).toHaveTextContent('Utilities')
  })

  it('clears the open category when another month is chosen from the history', async () => {
    mockApi({ ...seed(), activity: [bill] })
    const { user } = renderRoute('/spending')

    fireEvent.change(await screen.findByLabelText('Month'), { target: { value: '2026-09' } })
    const categories = await screen.findByRole('list', { name: 'Spending by category' })
    await user.click(within(categories).getByRole('button', { name: 'Utilities' }))
    await screen.findByRole('table', { name: 'Expenses in this category' })

    const history = screen.getByRole('region', { name: 'Spending history' })
    await user.click(await within(history).findByRole('button', { name: 'October 2026' }))

    expect(await screen.findByText('No expenses recorded for October')).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Expenses in this category' })).toBeNull()
  })

  it('V2_MONTHLY_005 labels an annual estimate from one recorded month and keeps October empty', async () => {
    mockApi({
      ...seed(),
      activity: [
        { ...bill, amount: '1500.00', categoryId: rent.id, description: 'Rent' },
        { ...bill, id: 'a2', amount: '180.00' },
        { ...bill, id: 'a3', amount: '1980.00', categoryId: groceries.id, description: 'Food' },
      ],
    })
    const { user } = renderRoute('/spending')

    const history = await screen.findByRole('region', { name: 'Spending history' })
    expect(await within(history).findByText(/Average recorded month/)).toHaveTextContent(
      '$3,660.00',
    )
    expect(within(history).getByText(/Average recorded month/)).toHaveTextContent(
      'based on 1 recorded month',
    )
    const estimate = within(history).getByText(/Annual spending estimate/)
    expect(estimate).toHaveTextContent('$43,920.00')
    expect(estimate).toHaveTextContent('based on that one month')
    expect(within(history).getByText(/not twelve months of actual spending/)).toBeInTheDocument()

    await user.click(within(history).getByRole('button', { name: 'October 2026' }))
    expect(await screen.findByText('No expenses recorded for October')).toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: 'October 2026' })).queryByText(/\$/),
    ).toBeNull()
  })
})

describe('two people in one workspace', () => {
  it('V2_MEMBERS_001 offers both names for owner and for who entered a record, with no sign-in', async () => {
    mockApi({ household, members: [maya, sam] })
    renderRoute('/accounts/new')

    const owner = await screen.findByLabelText('Owner')
    expect(
      within(owner)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Choose an owner', 'Maya', 'Sam'])
    const enteringAs = await screen.findByLabelText('Entering as')
    expect(
      within(enteringAs)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Choose a name', 'Maya', 'Sam'])
    expect(screen.queryByLabelText(/password/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /sign in|log in/i })).toBeNull()
  })
})
