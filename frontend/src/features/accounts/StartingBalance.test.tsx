import { screen, waitFor, within } from '@testing-library/react'
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
const SALARY = 'c0000000-0000-4000-8000-000000000004'
const RENT = 'c0000000-0000-4000-8000-000000000001'

const newBlankStart = (): MockAccount => ({
  id: '44444444-4444-4444-8444-444444444444',
  type: 'checking',
  name: 'Everyday Checking',
  institution: 'Harbor Bank',
  ownerMemberIds: [maya.id],
  openedOn: '2026-09-01',
  openingAmount: '0.00',
  balance: { amount: '4500.00', asOf: '2026-09-06' },
  status: 'active',
})

const blankStart = newBlankStart()

const entry = (patch: Partial<MockActivity>): MockActivity => ({
  id: '55555555-5555-4555-8555-555555555555',
  accountId: blankStart.id,
  kind: 'income',
  amount: '6000.00',
  occurredOn: '2026-09-05',
  description: 'Salary',
  categoryId: SALARY,
  enteredByMemberId: maya.id,
  ...patch,
})

const activity = [
  entry({}),
  entry({
    id: '55555555-5555-4555-8555-555555555556',
    kind: 'expense',
    amount: '1500.00',
    occurredOn: '2026-09-06',
    description: 'Rent',
    categoryId: RENT,
  }),
]

beforeEach(() => window.localStorage.clear())

async function chooseStartingBalance(user: ReturnType<typeof renderRoute>['user']) {
  await user.selectOptions(await screen.findByLabelText('Entering as'), 'Maya')
  await user.click(await screen.findByRole('button', { name: 'Update balance' }))
  await user.click(await screen.findByLabelText('Correct the starting balance'))
}

describe('correcting the starting balance', () => {
  it('V2_JOURNEY_004 reviews the original and corrected amount, then adds no income or entry', async () => {
    const api = mockApi({ household, members: [maya], accounts: [newBlankStart()], activity })
    const { user } = renderRoute(`/accounts/${blankStart.id}`)
    await chooseStartingBalance(user)

    const amount = await screen.findByLabelText('Starting balance')
    await user.type(amount, '5,000.00')
    const date = screen.getByLabelText('Date')
    await user.clear(date)
    await user.type(date, '2026-09-01')
    await user.click(screen.getByRole('button', { name: 'Review' }))

    const review = await screen.findByRole('region', { name: 'Review starting balance correction' })
    expect(await within(review).findByText('Original starting balance')).toBeInTheDocument()
    expect(review).toHaveTextContent('$0.00')
    expect(review).toHaveTextContent('$5,000.00')
    expect(review).toHaveTextContent('2026-09-01')
    expect(review).toHaveTextContent('Balance will change from $4,500.00 to $9,500.00')
    expect(review).toHaveTextContent('not income')

    // A reason is required before anything is saved.
    await user.click(within(review).getByRole('button', { name: 'Confirm correction' }))
    expect(await within(review).findByText('Enter a reason')).toBeInTheDocument()
    expect(api.openingRevisions).toHaveLength(0)

    await user.type(
      within(review).getByLabelText('Reason'),
      'Starting amount was omitted during setup',
    )
    expect(screen.queryByRole('radio', { name: 'Update the Balance on a date' })).toBeDisabled()
    await user.click(within(review).getByRole('button', { name: 'Confirm correction' }))

    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Account details' })).toHaveTextContent(
        '$9,500.00',
      ),
    )
    expect(api.accounts[0].balance.amount).toBe('9500.00')
    expect(api.openingRevisions).toHaveLength(1)
    expect(api.activity).toHaveLength(2)
    expect(api.activity.filter((a) => a.kind === 'income')).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Show history' }))
    const history = await screen.findByRole('table', { name: 'History' })
    await waitFor(() => expect(history).toHaveTextContent('Starting balance correction'))
    expect(history).toHaveTextContent('Initial Balance')
    expect(history).toHaveTextContent('Starting amount was omitted during setup')
    expect(history).toHaveTextContent('Salary')
    expect(history).toHaveTextContent('Rent')
    const rows = within(history).getAllByRole('row')
    const original = rows.find((row) => within(row).queryByText('Initial Balance'))!
    expect(original).toHaveTextContent('$0.00')
    expect(original).toHaveTextContent('Replaced')
    expect(original).toHaveTextContent('Replaced by Maya')
  })

  it('V2_JOURNEY_004 cancelling the review saves nothing', async () => {
    const api = mockApi({ household, members: [maya], accounts: [newBlankStart()], activity })
    const { user } = renderRoute(`/accounts/${blankStart.id}`)
    await chooseStartingBalance(user)
    await user.type(await screen.findByLabelText('Starting balance'), '5000')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    await screen.findByRole('region', { name: 'Review starting balance correction' })
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(api.openingRevisions).toHaveLength(0)
    expect(api.accounts[0].balance.amount).toBe('4500.00')
    expect(api.requests.filter((r) => r.startsWith('POST'))).toEqual([])
  })

  it('shows what the form refuses without a request', async () => {
    const api = mockApi({ household, members: [maya], accounts: [newBlankStart()], activity })
    const { user } = renderRoute(`/accounts/${blankStart.id}`)
    await chooseStartingBalance(user)
    await user.type(await screen.findByLabelText('Starting balance'), 'abc')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(await screen.findByText('Enter a valid amount')).toBeInTheDocument()
    expect(api.requests.some((r) => r.includes('starting-balance-corrections/preview'))).toBe(false)
  })

  it('an Update balance dated before tracking began opens the starting balance review', async () => {
    const account = { ...newBlankStart(), openedOn: '2026-09-10', openingAmount: '5000.00' }
    const api = mockApi({ household, members: [maya], accounts: [account] })
    const { user } = renderRoute(`/accounts/${account.id}`)
    await user.selectOptions(await screen.findByLabelText('Entering as'), 'Maya')
    await user.click(await screen.findByRole('button', { name: 'Update balance' }))
    await user.type(await screen.findByLabelText('Balance'), '6500')
    const date = screen.getByLabelText('Date')
    await user.clear(date)
    await user.type(date, '2026-09-01')
    await user.click(screen.getByRole('button', { name: 'Review' }))

    expect(await screen.findByRole('radio', { name: 'Correct the starting balance' })).toBeChecked()
    expect(screen.getByLabelText('Starting balance')).toHaveValue('6500.00')
    expect(screen.getByRole('status')).toHaveTextContent('before tracking began on 2026-09-10')
    expect(screen.getByLabelText('Date')).toHaveValue('2026-09-01')
    expect(api.requests.filter((r) => r.startsWith('POST'))).toEqual([])
  })
})
