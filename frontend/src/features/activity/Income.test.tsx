import { fireEvent, screen } from '@testing-library/react'
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
const sam = {
  id: '33333333-3333-4333-8333-333333333333',
  householdId: household.id,
  name: 'Sam',
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
  balance: { amount: '5000.00', asOf: '2026-09-01' },
  status: 'active',
}

const seed = () => ({ household, members: [maya, sam], accounts: [{ ...everyday }] })

beforeEach(() => window.localStorage.clear())

type User = ReturnType<typeof renderRoute>['user']

async function openForm(user: User) {
  await user.click(await screen.findByRole('button', { name: 'Add money in' }))
}

async function fillIncome(user: User, fields: { amount: string; date: string; category: string }) {
  await user.type(await screen.findByLabelText('Amount'), fields.amount)
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: fields.date } })
  await user.selectOptions(screen.getByLabelText('Category'), fields.category)
}

describe('recording income', () => {
  it.each(['$0.00', '-$100.00'])(
    'V2_INCOME_005 rejects the Salary amount %s and keeps what was entered',
    async (amount) => {
      const api = mockApi(seed())
      const { user } = renderRoute(`/accounts/${everyday.id}`)
      await openForm(user)

      await fillIncome(user, { amount, date: '2026-09-02', category: 'Salary' })
      await user.click(screen.getByRole('button', { name: 'Review' }))

      expect(await screen.findByText('Enter an amount greater than zero')).toBeInTheDocument()
      expect(screen.getByLabelText('Date')).toHaveValue('2026-09-02')
      expect(screen.getByLabelText('Category')).toHaveDisplayValue('Salary')
      expect(screen.getByText('Everyday Checking', { selector: 'strong' })).toBeInTheDocument()
      expect(api.activity).toHaveLength(0)
      expect(api.accounts[0].balance.amount).toBe('5000.00')
    },
  )

  it('offers income categories only, reviews with the person entering, and raises the Balance', async () => {
    const api = mockApi(seed())
    const { user } = renderRoute(`/accounts/${everyday.id}`)
    await user.selectOptions(await screen.findByLabelText('Entering as'), 'Maya')
    await openForm(user)

    const category = await screen.findByLabelText('Category')
    expect(category.querySelectorAll('option')).toHaveLength(4) // placeholder, Salary, Interest, Bonus
    await fillIncome(user, { amount: '6000.00', date: '2026-09-02', category: 'Salary' })
    await user.click(screen.getByRole('button', { name: 'Review' }))

    expect(await screen.findByText('Review money in')).toBeInTheDocument()
    expect(screen.getByText(/Entered by:/)).toHaveTextContent('Maya')
    await user.click(screen.getByRole('button', { name: 'Confirm saving' }))

    expect(await screen.findByText('$11,000', { exact: false })).toBeInTheDocument()
    expect(api.activity).toHaveLength(1)
    expect(api.activity[0].kind).toBe('income')
    expect(api.requests).toContain('POST /api/v1/accounts/' + everyday.id + '/income')
  })
})
