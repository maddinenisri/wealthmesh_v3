import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { CATEGORIES, mockApi, type MockAccount, type MockActivity } from '../../test/mockApi'
import { renderRoute } from '../../test/render'

const household = { id: '11111111-1111-4111-8111-111111111111', name: 'Maya and Sam' }
const maya = {
  id: '22222222-2222-4222-8222-222222222222',
  householdId: household.id,
  name: 'Maya',
  label: null,
}
const sam = { ...maya, id: '33333333-3333-4333-8333-333333333333', name: 'Sam' }
const dining = CATEGORIES.find((category) => category.name === 'Dining')!

const checking = (balance = '5000.00'): MockAccount => ({
  id: '44444444-4444-4444-8444-444444444444',
  type: 'checking',
  name: 'Everyday Checking',
  institution: 'Harbor Bank',
  ownerMemberIds: [maya.id],
  openedOn: '2026-09-01',
  openingAmount: '5000.00',
  balance: { amount: balance, asOf: '2026-09-01' },
  status: 'active',
})
const savingsAccount = (id: string, name: string, balance: string): MockAccount => ({
  id,
  type: 'savings',
  name,
  institution: 'Harbor Bank',
  ownerMemberIds: [sam.id],
  openedOn: '2026-09-01',
  openingAmount: balance,
  balance: { amount: balance, asOf: '2026-09-01' },
  status: 'active',
})
const emergency = () =>
  savingsAccount('66666666-6666-4666-8666-666666666666', 'Emergency Savings', '10000.00')
const holiday = () =>
  savingsAccount('77777777-7777-4777-8777-777777777777', 'Holiday Savings', '500.00')

/** A saved 2000.00 transfer from checking to Emergency Savings, as the server would hold it. */
const transferRows = (): MockActivity[] => {
  const base = {
    amount: '2000.00',
    occurredOn: '2026-09-04',
    description: null,
    categoryId: '',
    enteredByMemberId: maya.id,
    createdAt: '2026-09-04T09:00:00Z',
    movementId: '88888888-8888-4888-8888-888888888888',
  }
  return [
    {
      ...base,
      id: 'a0000000-0000-4000-8000-000000000001',
      accountId: checking().id,
      kind: 'transfer_out',
    },
    {
      ...base,
      id: 'a0000000-0000-4000-8000-000000000002',
      accountId: emergency().id,
      kind: 'transfer_in',
    },
  ]
}

beforeEach(() => window.localStorage.clear())

type User = ReturnType<typeof renderRoute>['user']

async function enteringAs(user: User) {
  await user.selectOptions(await screen.findByLabelText('Entering as'), 'Maya')
}

async function openTransfer(user: User) {
  await enteringAs(user)
  await user.click(await screen.findByRole('button', { name: 'Add transfer' }))
  await screen.findByRole('heading', { name: 'Add transfer' })
}

const posts = (requests: string[]) => requests.filter((line) => line.startsWith('POST '))

describe('adding a transfer', () => {
  it('V2_CHECKING_010 reviews both account names, amount, date and Balances; cancelling saves nothing', async () => {
    const api = mockApi({
      household,
      members: [maya, sam],
      accounts: [checking(), emergency()],
    })
    const { user } = renderRoute(`/accounts/${checking().id}`)
    await openTransfer(user)

    expect(screen.getByLabelText('From')).toHaveDisplayValue('Everyday Checking (Checking)')
    await user.selectOptions(screen.getByLabelText('To'), 'Emergency Savings (Savings)')
    await user.type(screen.getByLabelText('Amount'), '2000.00')
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-09-04' } })
    await user.click(screen.getByRole('button', { name: 'Review' }))

    const heading = await screen.findByRole('heading', { name: 'Review transfer' })
    expect(heading).toHaveFocus()
    const effect = await screen.findByRole('region', { name: 'Effect of this transfer' })
    expect(await within(effect).findByText('Everyday Checking Balance')).toBeInTheDocument()
    expect(effect).toHaveTextContent('Everyday Checking Balance$3,000.00')
    expect(effect).toHaveTextContent('Emergency Savings Balance$12,000.00')
    expect(effect).toHaveTextContent('not income or spending')
    expect(screen.getByText('Emergency Savings')).toBeInTheDocument()
    expect(screen.getByText('2026-09-04')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(posts(api.requests)).toHaveLength(0)
    expect(api.accounts[0].balance.amount).toBe('5000.00')
    expect(api.accounts[1].balance.amount).toBe('10000.00')
    // Focus returns to the button that opened the panel.
    expect(await screen.findByRole('button', { name: 'Add transfer' })).toHaveFocus()
  })

  it('V2_SAVINGS_010 refuses the same account and keeps the amount and date; cancelling saves nothing', async () => {
    const api = mockApi({
      household,
      members: [maya, sam],
      accounts: [savingsAccount(emergency().id, 'Emergency Savings', '10000.00'), checking()],
    })
    const { user } = renderRoute(`/accounts/${emergency().id}`)
    await openTransfer(user)

    await user.selectOptions(screen.getByLabelText('To'), 'Emergency Savings (Savings)')
    await user.type(screen.getByLabelText('Amount'), '500.00')
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-09-20' } })
    await user.click(screen.getByRole('button', { name: 'Review' }))

    const message = await screen.findByText('Choose a different account')
    expect(message).toBeInTheDocument()
    expect(screen.getByLabelText('To')).toHaveFocus()
    expect(screen.getByLabelText('Amount')).toHaveValue('500.00')
    expect(screen.getByLabelText('Date')).toHaveValue('2026-09-20')
    expect(posts(api.requests)).toHaveLength(0)

    await user.selectOptions(screen.getByLabelText('To'), 'Everyday Checking (Checking)')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    await screen.findByRole('heading', { name: 'Review transfer' })
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(posts(api.requests)).toHaveLength(0)
    expect(api.accounts[0].balance.amount).toBe('10000.00')
    expect(api.accounts[1].balance.amount).toBe('5000.00')
  })

  it('V2_SAVINGS_002 confirming moves the money on both sides and adds no income or spending', async () => {
    const api = mockApi({
      household,
      members: [maya, sam],
      accounts: [checking(), emergency()],
    })
    const { user } = renderRoute(`/accounts/${checking().id}`)
    await openTransfer(user)

    await user.selectOptions(screen.getByLabelText('To'), 'Emergency Savings (Savings)')
    await user.type(screen.getByLabelText('Amount'), '2000.00')
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-09-04' } })
    await user.click(screen.getByRole('button', { name: 'Review' }))
    await screen.findByRole('region', { name: 'Effect of this transfer' })
    await user.click(await screen.findByRole('button', { name: 'Confirm transfer' }))

    await screen.findByRole('link', { name: 'Emergency Savings' })
    expect(api.requests).toContain('POST /api/v1/transfers')
    expect(api.accounts[0].balance.amount).toBe('3000.00')
    expect(api.accounts[1].balance.amount).toBe('12000.00')
    expect(api.keys).toHaveLength(1)
    // The row names the other account and opens it: both sides are one click apart.
    const row = screen.getByRole('row', { name: /Transfer to Emergency Savings/ })
    expect(within(row).getByRole('link', { name: 'Emergency Savings' })).toHaveAttribute(
      'href',
      `/accounts/${emergency().id}`,
    )
    expect(row).toHaveTextContent('-$2,000.00')
  })
})

describe('changing and removing a transfer', () => {
  const seeded = () =>
    mockApi({
      household,
      members: [maya, sam],
      accounts: [
        checking('3000.00'),
        { ...emergency(), balance: { amount: '12000.00', asOf: '2026-09-04' } },
        holiday(),
      ],
      activity: transferRows(),
    })

  it('V2_TRANSFER_003 refuses the account itself as the destination; a cancelled review changes nothing', async () => {
    const api = seeded()
    const { user } = renderRoute(`/accounts/${checking().id}`)
    await enteringAs(user)
    await user.click(
      await screen.findByRole('button', { name: 'Edit transfer to Emergency Savings' }),
    )
    await screen.findByRole('heading', { name: 'Edit transfer' })

    // The form starts from the saved transfer.
    expect(screen.getByLabelText('From')).toHaveDisplayValue('Everyday Checking (Checking)')
    expect(screen.getByLabelText('To')).toHaveDisplayValue('Emergency Savings (Savings)')
    expect(screen.getByLabelText('Amount')).toHaveValue('2000.00')
    await user.selectOptions(screen.getByLabelText('To'), 'Everyday Checking (Checking)')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(await screen.findByText('Choose a different account')).toBeInTheDocument()
    expect(posts(api.requests)).toHaveLength(0)

    await user.selectOptions(screen.getByLabelText('To'), 'Emergency Savings (Savings)')
    await user.clear(screen.getByLabelText('Amount'))
    await user.type(screen.getByLabelText('Amount'), '1500.00')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    await screen.findByRole('heading', { name: 'Review change' })
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(posts(api.requests)).toHaveLength(0)
    expect(api.activity.every((row) => !row.removedAt)).toBe(true)
    expect(api.accounts.map((a) => a.balance.amount)).toEqual(['3000.00', '12000.00', '500.00'])
  })

  it('V2_TRANSFER_001 reviews the three Balances after a change of amount, date and destination', async () => {
    const api = seeded()
    const { user } = renderRoute(`/accounts/${checking().id}`)
    await enteringAs(user)
    await user.click(
      await screen.findByRole('button', { name: 'Edit transfer to Emergency Savings' }),
    )
    await screen.findByRole('heading', { name: 'Edit transfer' })
    await user.selectOptions(screen.getByLabelText('To'), 'Holiday Savings (Savings)')
    await user.clear(screen.getByLabelText('Amount'))
    await user.type(screen.getByLabelText('Amount'), '1500.00')
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-09-05' } })
    await user.type(screen.getByLabelText('Reason'), 'Wrong savings account')
    await user.click(screen.getByRole('button', { name: 'Review' }))

    const effect = await screen.findByRole('region', { name: 'Effect of this transfer' })
    expect(await within(effect).findByText('Holiday Savings Balance')).toBeInTheDocument()
    expect(effect).toHaveTextContent('Everyday Checking Balance$3,500.00')
    expect(effect).toHaveTextContent('Emergency Savings Balance$10,000.00')
    expect(effect).toHaveTextContent('Holiday Savings Balance$2,000.00')
    expect(screen.getByText('Emergency Savings changed to Holiday Savings')).toBeInTheDocument()
    expect(screen.getByText('$2,000.00 changed to $1,500.00')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Confirm transfer' }))
    await screen.findByRole('link', { name: 'Holiday Savings' })
    expect(
      api.requests.some((line) => /POST \/api\/v1\/transfers\/.+\/replacement/.test(line)),
    ).toBe(true)
    expect(api.accounts.map((a) => a.balance.amount)).toEqual(['3500.00', '10000.00', '2000.00'])
    // The original pair is kept, replaced.
    expect(api.activity.filter((row) => row.removedAt)).toHaveLength(2)
    expect(api.activity.filter((row) => !row.removedAt)).toHaveLength(2)
  })

  it('V2_TRANSFER_002 removes both sides and Undo restores them, from the history', async () => {
    const api = seeded()
    const { user } = renderRoute(`/accounts/${checking().id}`)
    await enteringAs(user)
    await user.click(
      await screen.findByRole('button', { name: 'Remove transfer to Emergency Savings' }),
    )
    await screen.findByRole('heading', { name: 'Review removal' })
    expect(screen.getByText('Everyday Checking Balance after removal')).toBeInTheDocument()
    expect(screen.getByText('Emergency Savings Balance after removal')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirm removal' }))
    await screen.findByText('No money activity has been recorded yet.')
    expect(api.accounts.map((a) => a.balance.amount)).toEqual(['5000.00', '10000.00', '500.00'])

    await user.click(screen.getByRole('button', { name: 'Show history' }))
    const history = await screen.findByRole('table', { name: 'History' })
    expect(within(history).getByText('Removed')).toBeInTheDocument()
    expect(within(history).getByText(/Removed by Maya/)).toBeInTheDocument()
    await user.click(
      within(history).getByRole('button', { name: 'Undo transfer to Emergency Savings' }),
    )
    await screen.findByRole('heading', { name: 'Review Undo' })
    await user.click(screen.getByRole('button', { name: 'Confirm Undo' }))

    await screen.findAllByRole('row', { name: /Transfer to Emergency Savings/ })
    expect(api.accounts.map((a) => a.balance.amount)).toEqual(['3000.00', '12000.00', '500.00'])
    expect(api.activity.filter((row) => !row.removedAt)).toHaveLength(2)
  })
})

describe('an expense that was a transfer', () => {
  it('V2_EXPENSE_008 reviews the Balances and September spending, needs a reason, and keeps the expense in history', async () => {
    const expense: MockActivity = {
      id: 'b0000000-0000-4000-8000-000000000001',
      accountId: checking().id,
      kind: 'expense',
      amount: '2000.00',
      occurredOn: '2026-09-04',
      description: 'Other spending',
      categoryId: dining.id,
      enteredByMemberId: maya.id,
    }
    const api = mockApi({
      household,
      members: [maya, sam],
      accounts: [checking('3000.00'), { ...emergency() }],
      activity: [expense],
    })
    const { user } = renderRoute(`/accounts/${checking().id}`)
    await enteringAs(user)
    await user.click(await screen.findByRole('button', { name: 'Edit Other spending' }))
    await user.click(await screen.findByRole('button', { name: 'Change to transfer' }))
    await screen.findByRole('heading', { name: 'Change to transfer' })
    await user.selectOptions(screen.getByLabelText('Destination'), 'Emergency Savings (Savings)')
    await user.click(screen.getByRole('button', { name: 'Review' }))

    const effect = await screen.findByRole('region', { name: 'Effect of this transfer' })
    expect(await within(effect).findByText('Emergency Savings Balance')).toBeInTheDocument()
    expect(effect).toHaveTextContent('Everyday Checking Balance$3,000.00')
    expect(effect).toHaveTextContent('Emergency Savings Balance$12,000.00')
    expect(effect).toHaveTextContent('September spending$0.00')
    expect(screen.getByRole('heading', { name: 'Review change to transfer' })).toHaveFocus()

    // A reason is required.
    await user.click(screen.getByRole('button', { name: 'Confirm transfer' }))
    expect(await screen.findByText('Give a reason for the change')).toBeInTheDocument()
    expect(posts(api.requests)).toHaveLength(0)
    await user.type(screen.getByLabelText('Reason'), 'This money moved to our savings')
    await user.click(screen.getByRole('button', { name: 'Confirm transfer' }))

    await screen.findByRole('row', { name: /Transfer to Emergency Savings/ })
    expect(api.accounts.map((a) => a.balance.amount)).toEqual(['3000.00', '12000.00'])
    expect(api.activity.find((row) => row.id === expense.id)?.removedAt).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Show history' }))
    const history = await screen.findByRole('table', { name: 'History' })
    expect(within(history).getByText('Changed to a transfer')).toBeInTheDocument()
    expect(within(history).getByText('This money moved to our savings')).toBeInTheDocument()
  })
})

describe('transfers in the wider picture', () => {
  it('V2_SAVINGS_007 shows the other account on each side and keeps a transfer out of the Spending view', async () => {
    const api = mockApi({
      household,
      members: [maya, sam],
      accounts: [
        checking('3000.00'),
        { ...emergency(), balance: { amount: '12000.00', asOf: '2026-09-04' } },
      ],
      activity: transferRows(),
    })
    const { user } = renderRoute(`/accounts/${emergency().id}`)
    const row = await screen.findByRole('row', { name: /Transfer from Everyday Checking/ })
    expect(within(row).getByRole('link', { name: 'Everyday Checking' })).toHaveAttribute(
      'href',
      `/accounts/${checking().id}`,
    )
    expect(row).toHaveTextContent('$2,000.00')

    await user.click(screen.getByRole('link', { name: 'Spending' }))
    fireEvent.change(await screen.findByLabelText('Month'), { target: { value: '2026-09' } })
    await user.selectOptions(await screen.findByLabelText('Account'), 'Emergency Savings')
    const review = await screen.findByRole('region', { name: 'Month review' })
    expect(await within(review).findByText(/Spending/)).toBeInTheDocument()
    expect(review).toHaveTextContent('Spending $0.00')
    expect(review).toHaveTextContent('Income $0.00')
    expect(api.requests.some((line) => line.includes('/api/v1/review'))).toBe(true)
  })

  it('V2_SAVINGS_001 shows each account type in the Accounts list', async () => {
    mockApi({ household, members: [maya, sam], accounts: [checking(), emergency()] })
    renderRoute('/accounts')
    const row = await screen.findByRole('row', { name: /Emergency Savings/ })
    expect(within(row).getByText('Savings')).toBeInTheDocument()
    expect(
      within(await screen.findByRole('row', { name: /Everyday Checking/ })).getByText('Checking'),
    ).toBeInTheDocument()
  })
})
