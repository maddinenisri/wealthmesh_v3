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
const [rentCategory, , , salary] = CATEGORIES
const bonus = CATEGORIES.find((category) => category.name === 'Bonus')!

const checking = (balance: string): MockAccount => ({
  id: '44444444-4444-4444-8444-444444444444',
  type: 'checking',
  name: 'Everyday Checking',
  institution: 'Harbor Bank',
  ownerMemberIds: [maya.id],
  openedOn: '2026-09-01',
  openingAmount: '5000.00',
  balance: { amount: balance, asOf: '2026-09-03' },
  status: 'active',
})
const savings: MockAccount = {
  id: '66666666-6666-4666-8666-666666666666',
  type: 'savings',
  name: 'Emergency Savings',
  institution: 'Harbor Bank',
  ownerMemberIds: [sam.id],
  openedOn: '2026-09-01',
  openingAmount: '10000.00',
  balance: { amount: '10000.00', asOf: '2026-09-01' },
  status: 'active',
}
const rent: MockActivity = {
  id: '55555555-5555-4555-8555-555555555555',
  accountId: '44444444-4444-4444-8444-444444444444',
  kind: 'expense',
  amount: '1500.00',
  occurredOn: '2026-09-03',
  description: 'Rent',
  categoryId: rentCategory.id,
  enteredByMemberId: sam.id,
}
const pay: MockActivity = {
  ...rent,
  id: '77777777-7777-4777-8777-777777777777',
  kind: 'income',
  amount: '6000.00',
  occurredOn: '2026-09-02',
  description: 'Salary',
  categoryId: salary.id,
}

beforeEach(() => window.localStorage.clear())

type User = ReturnType<typeof renderRoute>['user']

async function openEdit(user: User, name: string) {
  await user.selectOptions(await screen.findByLabelText('Entering as'), 'Maya')
  await user.click(await screen.findByRole('button', { name }))
}

async function review(user: User) {
  await user.click(screen.getByRole('button', { name: 'Review' }))
  return screen.findByRole('region', { name: 'Effect of this change' })
}

describe('moving an entry to another account', () => {
  it('V2_EXPENSE_007 reviews both Balances and both months, then keeps the original in history', async () => {
    const account = checking('3500.00')
    const api = mockApi({
      household,
      members: [maya, sam],
      accounts: [account, { ...savings }],
      activity: [{ ...rent }],
    })
    const { user } = renderRoute(`/accounts/${account.id}`)
    await openEdit(user, 'Edit Rent')

    // The form starts from the current values and shows where the entry is now.
    expect(screen.getByLabelText('Paid from')).toHaveDisplayValue('Everyday Checking')
    await user.selectOptions(screen.getByLabelText('Paid from'), 'Emergency Savings')
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-10-02' } })
    await user.type(screen.getByLabelText('Reason'), 'Correct payment account and date')
    const effect = await review(user)

    expect(await within(effect).findByText('Everyday Checking Balance')).toBeInTheDocument()
    expect(effect).toHaveTextContent('Everyday Checking Balance$5,000.00')
    expect(effect).toHaveTextContent('Emergency Savings Balance$8,500.00')
    expect(effect).toHaveTextContent('September spending$0.00')
    expect(effect).toHaveTextContent('October spending$1,500.00')
    expect(screen.getByText('Everyday Checking changed to Emergency Savings')).toBeInTheDocument()
    expect(api.activity).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Confirm saving' }))
    await screen.findByRole('heading', { name: 'Everyday Checking' })
    expect(api.requests).toContain(
      `POST /api/v1/accounts/${account.id}/activity/${rent.id}/replacement`,
    )
    expect(api.accounts[0].balance.amount).toBe('5000.00')
    expect(api.accounts[1].balance.amount).toBe('8500.00')
    expect(api.activity.filter((row) => !row.removedAt)).toHaveLength(1)

    // History on the account it moved to keeps the original account, date, who, time and reason.
    await user.click(screen.getByRole('link', { name: 'Accounts' }))
    await user.click(await screen.findByRole('link', { name: 'Emergency Savings' }))
    await user.click(await screen.findByRole('button', { name: 'Show history' }))
    const history = await screen.findByRole('table', { name: 'History' })
    expect(history).toHaveTextContent(
      'Replaced $1,500.00 Rent on Everyday Checking, dated 2026-09-03',
    )
    expect(history).toHaveTextContent('saved by Sam')
    expect(history).toHaveTextContent('Correct payment account and date')
    expect(history).toHaveTextContent('Maya')
  })

  it('V2_INCOME_003 reviews Salary corrected to Bonus in savings, cancel changes nothing, then confirm saves it', async () => {
    const account = checking('11000.00')
    const api = mockApi({
      household,
      members: [maya, sam],
      accounts: [account, { ...savings }],
      activity: [{ ...pay }],
    })
    const { user } = renderRoute(`/accounts/${account.id}`)
    await openEdit(user, 'Edit Salary')

    const fill = async () => {
      const amount = await screen.findByLabelText('Amount')
      await user.clear(amount)
      await user.type(amount, '6200.00')
      fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-10-02' } })
      await user.selectOptions(screen.getByLabelText('Category'), bonus.id)
      await user.selectOptions(screen.getByLabelText('Received into'), 'Emergency Savings')
    }
    await fill()
    const effect = await review(user)
    expect(effect).toHaveTextContent('Everyday Checking Balance$5,000.00')
    expect(effect).toHaveTextContent('Emergency Savings Balance$16,200.00')
    expect(effect).toHaveTextContent('September Income$0.00')
    expect(effect).toHaveTextContent('October Income$6,200.00')

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(api.requests.some((r) => r.endsWith('/replacement'))).toBe(false)
    expect(api.accounts.map((a) => a.balance.amount)).toEqual(['11000.00', '10000.00'])
    expect(api.activity).toHaveLength(1)
    expect(api.activity[0].removedAt ?? null).toBeNull()

    // Repeat the reviewed correction and confirm with a reason.
    await user.click(await screen.findByRole('button', { name: 'Edit Salary' }))
    await fill()
    await user.type(screen.getByLabelText('Reason'), 'Correct pay details')
    await review(user)
    await user.click(screen.getByRole('button', { name: 'Confirm saving' }))

    await screen.findByRole('heading', { name: 'Everyday Checking' })
    expect(api.accounts.map((a) => a.balance.amount)).toEqual(['5000.00', '16200.00'])
    expect(api.activity.filter((row) => !row.removedAt)).toMatchObject([
      { accountId: savings.id, amount: '6200.00', occurredOn: '2026-10-02', categoryId: bonus.id },
    ])
  })

  it('focuses the review heading when the review opens and returns focus to Edit on Cancel', async () => {
    const account = checking('3500.00')
    mockApi({
      household,
      members: [maya, sam],
      accounts: [account, { ...savings }],
      activity: [{ ...rent }],
    })
    const { user } = renderRoute(`/accounts/${account.id}`)
    await openEdit(user, 'Edit Rent')
    await user.selectOptions(screen.getByLabelText('Paid from'), 'Emergency Savings')
    await review(user)

    expect(screen.getByRole('heading', { name: 'Review change' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByRole('button', { name: 'Edit Rent' })).toHaveFocus()
  })

  it('names the account an entry moved to in the history of the account it left', async () => {
    const account = checking('3500.00')
    mockApi({
      household,
      members: [maya, sam],
      accounts: [account, { ...savings }],
      activity: [{ ...rent }],
    })
    const { user } = renderRoute(`/accounts/${account.id}`)
    await openEdit(user, 'Edit Rent')
    await user.selectOptions(screen.getByLabelText('Paid from'), 'Emergency Savings')
    await review(user)
    await user.click(screen.getByRole('button', { name: 'Confirm saving' }))

    await user.click(await screen.findByRole('button', { name: 'Show history' }))
    const history = await screen.findByRole('table', { name: 'History' })
    expect(history).toHaveTextContent('Moved to Emergency Savings')
  })
})
