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
const [rent, , groceries, salary] = CATEGORIES

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

const entry = {
  accountId: everyday.id,
  occurredOn: '2026-09-02',
  description: 'Salary',
}

beforeEach(() => window.localStorage.clear())

describe('income in the month review', () => {
  it('V2_INCOME_001 finds the salary from September income, with who entered it', async () => {
    mockApi({
      household,
      members: [maya, sam],
      accounts: [{ ...everyday, balance: { amount: '11000.00', asOf: '2026-09-02' } }],
      activity: [
        {
          ...entry,
          id: 'i1',
          kind: 'income',
          amount: '6000.00',
          categoryId: salary.id,
          enteredByMemberId: maya.id,
        },
      ],
    })
    const { user } = renderRoute('/spending')

    fireEvent.change(await screen.findByLabelText('Month'), { target: { value: '2026-09' } })
    const income = await screen.findByRole('region', { name: 'Income' })
    expect(await within(income).findByText(/Income/, { selector: 'p' })).toHaveTextContent('$6,000')
    await user.click(
      await within(await screen.findByRole('list', { name: 'Income by category' })).findByRole(
        'button',
        { name: 'Salary' },
      ),
    )

    const table = await screen.findByRole('table', { name: 'Income entries' })
    const row = within(table).getByRole('row', { name: /Salary/ })
    await user.click(within(row).getByRole('button', { name: 'Salary' }))
    const details = screen.getByLabelText('Income details')
    expect(details).toHaveTextContent('$6,000.00')
    expect(details).toHaveTextContent('2026-09-02')
    expect(details).toHaveTextContent('Everyday Checking')
    expect(details).toHaveTextContent('Salary')
    expect(details).toHaveTextContent('Maya')

    // Spending stays zero, Income minus spending is the salary, and the opening 5,000.00 is not income.
    const review = screen.getByRole('region', { name: 'Month review' })
    expect(await within(review).findByText(/Income minus spending/)).toHaveTextContent('$6,000')
    expect(within(review).getByText(/^Spending/)).toHaveTextContent('$0.00')
    expect(within(table).getAllByRole('row')).toHaveLength(2) // header and the one salary entry
  })

  it('V2_MONTHLY_004 shows Income minus spending beside the checking Balance and its date', async () => {
    mockApi({
      household,
      members: [maya, sam],
      accounts: [
        {
          ...everyday,
          openingAmount: '2780.00',
          balance: { amount: '5120.00', asOf: '2026-09-30' },
        },
      ],
      activity: [
        {
          ...entry,
          id: 'i1',
          occurredOn: '2026-09-30',
          kind: 'income',
          amount: '6000.00',
          categoryId: salary.id,
          enteredByMemberId: maya.id,
        },
        {
          ...entry,
          id: 'e1',
          kind: 'expense',
          amount: '1500.00',
          categoryId: rent.id,
          enteredByMemberId: sam.id,
        },
        {
          ...entry,
          id: 'e2',
          kind: 'expense',
          amount: '2160.00',
          categoryId: groceries.id,
          enteredByMemberId: sam.id,
        },
      ],
    })
    const { user } = renderRoute('/spending')

    fireEvent.change(await screen.findByLabelText('Month'), { target: { value: '2026-09' } })
    const review = await screen.findByRole('region', { name: 'Month review' })
    expect(await within(review).findByText(/Income minus spending/)).toHaveTextContent('$2,340.00')

    await user.click(screen.getByRole('link', { name: 'Accounts' }))
    await user.click(await screen.findByRole('link', { name: 'Everyday Checking' }))
    const details = await screen.findByLabelText('Account details')
    expect(await within(details).findByText('$5,120', { exact: false })).toBeInTheDocument()
    expect(details).toHaveTextContent('as of 2026-09-30')

    // Opening the account changed neither figure.
    await user.click(screen.getByRole('link', { name: 'Spending' }))
    fireEvent.change(await screen.findByLabelText('Month'), { target: { value: '2026-09' } })
    expect(
      await within(await screen.findByRole('region', { name: 'Month review' })).findByText(
        /Income minus spending/,
      ),
    ).toHaveTextContent('$2,340.00')
  })

  it('V2_CHECKING_002 starts at $0.00, then September income shows the $6,000.00 salary', async () => {
    const zero: MockAccount = {
      ...everyday,
      openingAmount: '0.00',
      balance: { amount: '0.00', asOf: '2026-09-01' },
    }
    mockApi({ household, members: [maya, sam], accounts: [zero] })
    const { user } = renderRoute(`/accounts/${zero.id}`)

    const details = await screen.findByLabelText('Account details')
    expect(details).toHaveTextContent('$0.00')
    expect(details).toHaveTextContent('as of 2026-09-01')
    expect(await screen.findByText('No money activity has been recorded yet.')).toBeInTheDocument()

    await user.selectOptions(await screen.findByLabelText('Entering as'), 'Maya')
    await user.click(await screen.findByRole('button', { name: 'Add money in' }))
    await user.type(await screen.findByLabelText('Amount'), '6000.00')
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-09-02' } })
    await user.selectOptions(screen.getByLabelText('Category'), 'Salary')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    await user.click(await screen.findByRole('button', { name: 'Confirm saving' }))
    expect(await within(details).findByText('$6,000', { exact: false })).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Spending' }))
    fireEvent.change(await screen.findByLabelText('Month'), { target: { value: '2026-09' } })
    const review = await screen.findByRole('region', { name: 'Month review' })
    expect(await within(review).findByText(/^Income$/)).toHaveTextContent('$6,000.00')
  })
})
