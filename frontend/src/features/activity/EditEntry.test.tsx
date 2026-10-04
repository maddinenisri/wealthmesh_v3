import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockApi, type MockAccount, type MockActivity } from '../../test/mockApi'
import { renderRoute } from '../../test/render'

const household = { id: '11111111-1111-4111-8111-111111111111', name: 'Maya and Sam' }
const maya = {
  id: '22222222-2222-4222-8222-222222222222',
  householdId: household.id,
  name: 'Maya',
  label: null,
}
const everyday: MockAccount = {
  id: '44444444-4444-4444-8444-444444444444',
  type: 'checking',
  name: 'Everyday Checking',
  institution: 'Harbor Bank',
  ownerMemberIds: [maya.id],
  openedOn: '2026-09-01',
  openingAmount: '5000.00',
  balance: { amount: '3400.00', asOf: '2026-09-03' },
  status: 'active',
}
const RENT = 'c0000000-0000-4000-8000-000000000001'
const DINING = 'c0000000-0000-4000-8000-000000000005'

const rent: MockActivity = {
  id: '55555555-5555-4555-8555-555555555555',
  accountId: everyday.id,
  kind: 'expense',
  amount: '1600.00',
  occurredOn: '2026-09-03',
  description: 'Rent',
  categoryId: RENT,
  enteredByMemberId: maya.id,
}

beforeEach(() => window.localStorage.clear())

describe('editing an entry', () => {
  it('V2_CHECKING_008 corrects the Rent amount with a reason and shows the history', async () => {
    const api = mockApi({
      household,
      members: [maya],
      accounts: [{ ...everyday }],
      activity: [{ ...rent }],
    })
    const { user } = renderRoute(`/accounts/${everyday.id}`)
    await user.selectOptions(await screen.findByLabelText('Entering as'), 'Maya')

    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    await user.click(await screen.findByRole('button', { name: 'Edit Rent' }))
    const amount = await screen.findByLabelText('Amount')
    // The form opens above the table, so it is brought into view and focused.
    expect(scrollIntoView).toHaveBeenCalled()
    expect(screen.getByRole('region', { name: 'Edit money out' }).parentElement).toHaveFocus()
    expect(amount).toHaveValue('1600.00')
    await user.clear(amount)
    await user.type(amount, '1500.00')
    await user.type(screen.getByLabelText('Reason'), 'Correct the rent amount')
    await user.click(screen.getByRole('button', { name: 'Review' }))

    expect(await screen.findByText('Review change')).toBeInTheDocument()
    expect(screen.getByText('$1,600.00 changed to $1,500.00')).toBeInTheDocument()
    expect(screen.getByText('Correct the rent amount')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirm saving' }))

    expect(await screen.findByText('$3,500', { exact: false })).toBeInTheDocument()
    expect(api.requests).toContain(
      `POST /api/v1/accounts/${everyday.id}/activity/${rent.id}/replacement`,
    )
    // one effective Rent expense in the activity list
    const list = await screen.findByRole('table')
    expect(within(list).getAllByText('Rent', { selector: 'td' })).toHaveLength(2) // description and category
    expect(within(list).getByRole('button', { name: 'Edit Rent' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show history' }))
    const history = await screen.findByRole('table', { name: 'History' })
    expect(history).toHaveTextContent('$1,600.00')
    expect(history).toHaveTextContent('$1,500.00')
    expect(history).toHaveTextContent('Replaced by Maya')
    expect(within(history).getByText('Correct the rent amount')).toBeInTheDocument()
    expect(within(history).getAllByText('Maya')).not.toHaveLength(0)
  })

  it('V2_EXPENSE_006 changes only the category and the review keeps account, amount and date', async () => {
    const dining: MockActivity = {
      ...rent,
      amount: '125.00',
      occurredOn: '2026-09-10',
      description: 'Supermarket',
      categoryId: DINING,
    }
    const api = mockApi({
      household,
      members: [maya],
      accounts: [{ ...everyday, balance: { amount: '4875.00', asOf: '2026-09-10' } }],
      activity: [dining],
    })
    const { user } = renderRoute(`/accounts/${everyday.id}`)
    await user.selectOptions(await screen.findByLabelText('Entering as'), 'Maya')

    await user.click(await screen.findByRole('button', { name: 'Edit Supermarket' }))
    await user.selectOptions(await screen.findByLabelText('Category'), 'Groceries')
    await user.click(screen.getByRole('button', { name: 'Review' }))

    expect(await screen.findByText('Review change')).toBeInTheDocument()
    expect(screen.getByText('Everyday Checking', { selector: 'dd' })).toBeInTheDocument()
    expect(document.body).toHaveTextContent('$125.00')
    expect(screen.getByText('2026-09-10', { selector: 'dd' })).toBeInTheDocument()
    expect(screen.getByText('Dining changed to Groceries')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirm saving' }))

    const list = await screen.findByRole('table')
    expect(await within(list).findByText('Groceries', { selector: 'td' })).toBeInTheDocument()
    expect(within(list).queryByText('Dining', { selector: 'td' })).not.toBeInTheDocument()
    expect(api.accounts[0].balance.amount).toBe('4875.00')
    expect(api.activity.filter((a) => !a.removedAt)).toHaveLength(1)
  })

  it('keeps the form and shows the message when the save is refused', async () => {
    mockApi({
      household,
      members: [maya],
      accounts: [{ ...everyday }],
      activity: [{ ...rent }],
    })
    const { user } = renderRoute(`/accounts/${everyday.id}`)
    await user.selectOptions(await screen.findByLabelText('Entering as'), 'Maya')
    await user.click(await screen.findByRole('button', { name: 'Edit Rent' }))
    const amount = await screen.findByLabelText('Amount')
    await user.clear(amount)
    await user.type(amount, '0.00')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(await screen.findByText('Enter an amount greater than zero')).toBeInTheDocument()
    fireEvent.change(amount, { target: { value: '1500.00' } })
    expect(amount).toHaveValue('1500.00')
  })
})
