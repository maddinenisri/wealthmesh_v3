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
const seed = () => ({
  household,
  members: [maya, sam],
  accounts: [{ ...everyday }],
  today: '2026-09-10',
})

beforeEach(() => window.localStorage.clear())

type User = ReturnType<typeof renderRoute>['user']

async function enter(
  user: User,
  button: string,
  fields: { amount: string; date: string; category: string },
) {
  await user.click(await screen.findByRole('button', { name: button }))
  await user.type(await screen.findByLabelText('Amount'), fields.amount)
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: fields.date } })
  await user.selectOptions(screen.getByLabelText('Category'), fields.category)
}

describe('reminders', () => {
  it('V2_EXPENSE_011 keeps a future bill as a reminder, not as spending', async () => {
    const api = mockApi(seed())
    const { user } = renderRoute(`/accounts/${everyday.id}`)
    await user.selectOptions(await screen.findByLabelText('Entering as'), 'Sam')

    await enter(user, 'Add money out', {
      amount: '180.00',
      date: '2026-09-30',
      category: 'Utilities',
    })
    expect(await screen.findByText(/future activity is a plan or reminder/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save reminder' }))
    const review = await screen.findByRole('region', { name: 'Review reminder' })
    expect(review).toHaveTextContent('$180.00')
    await user.click(within(review).getByRole('button', { name: 'Confirm reminder' }))

    const reminders = await screen.findByRole('region', { name: 'Reminders' })
    expect(await within(reminders).findByText(/Utilities/)).toBeInTheDocument()
    expect(reminders).toHaveTextContent('$180.00')
    expect(reminders).toHaveTextContent('2026-09-30')
    expect(api.reminders).toHaveLength(1)
    expect(api.activity).toHaveLength(0)
    expect(api.accounts[0].balance.amount).toBe('5000.00')
    expect(api.requests).toContain(`POST /api/v1/accounts/${everyday.id}/reminders`)
    expect(api.requests).not.toContain(`POST /api/v1/accounts/${everyday.id}/expenses`)
  })

  it('V2_INCOME_006 offers Save reminder for an expected salary and shows it as expected, not received', async () => {
    const api = mockApi(seed())
    const { user } = renderRoute(`/accounts/${everyday.id}`)
    await user.selectOptions(await screen.findByLabelText('Entering as'), 'Maya')

    await enter(user, 'Add money in', { amount: '6000.00', date: '2026-09-30', category: 'Salary' })
    expect(
      await screen.findByText(/future date cannot be recorded as completed income/i),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save reminder' }))
    await user.click(await screen.findByRole('button', { name: 'Confirm reminder' }))

    const reminders = await screen.findByRole('region', { name: 'Reminders' })
    expect(await within(reminders).findByText(/expected/i)).toBeInTheDocument()
    expect(reminders).toHaveTextContent('$6,000.00')
    expect(reminders).toHaveTextContent('2026-09-30')
    expect(api.accounts[0].balance.amount).toBe('5000.00')
    expect(api.activity).toHaveLength(0)
  })

  it('still reviews a dated-today entry as completed money', async () => {
    const api = mockApi(seed())
    const { user } = renderRoute(`/accounts/${everyday.id}`)
    await user.selectOptions(await screen.findByLabelText('Entering as'), 'Sam')
    await enter(user, 'Add money out', {
      amount: '10.00',
      date: '2026-09-10',
      category: 'Utilities',
    })
    expect(screen.queryByRole('button', { name: 'Save reminder' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(await screen.findByText('Review money out')).toBeInTheDocument()
    expect(api.reminders).toHaveLength(0)
  })
})
