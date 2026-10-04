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

const small: MockAccount = {
  id: '44444444-4444-4444-8444-444444444444',
  type: 'checking',
  name: 'Everyday Checking',
  institution: 'Harbor Bank',
  ownerMemberIds: [maya.id],
  openedOn: '2026-09-01',
  openingAmount: '50.00',
  balance: { amount: '50.00', asOf: '2026-09-01' },
  status: 'active',
}

beforeEach(() => window.localStorage.clear())

type User = ReturnType<typeof renderRoute>['user']

async function review(user: User, amount: string) {
  await user.selectOptions(await screen.findByLabelText('Entering as'), 'Sam')
  await user.click(await screen.findByRole('button', { name: 'Add money out' }))
  await user.type(await screen.findByLabelText('Amount'), amount)
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-09-05' } })
  await user.selectOptions(screen.getByLabelText('Category'), 'Groceries')
  await user.click(screen.getByRole('button', { name: 'Review' }))
  return screen.findByRole('region', { name: 'Review money out' })
}

describe('an actual overdraft', () => {
  it('V2_CHECKING_015 warns, saves what happened and shows the Balance as overdrawn, in debt', async () => {
    const api = mockApi({ household, members: [maya, sam], accounts: [{ ...small }] })
    const { user } = renderRoute(`/accounts/${small.id}`)

    const panel = await review(user, '$80.00')
    expect(within(panel).getByRole('alert')).toHaveTextContent(
      'This will leave Everyday Checking overdrawn by $30.00',
    )
    expect(within(panel).getByRole('alert')).toHaveTextContent(
      'records what happened and does not authorize a bank payment',
    )
    await user.click(within(panel).getByRole('button', { name: 'Confirm saving' }))

    const details = await screen.findByLabelText('Account details')
    expect(await within(details).findByText('Overdrawn by $30.00')).toBeInTheDocument()
    expect(details).toHaveTextContent('-$30')
    expect(details).toHaveTextContent(
      'This records what happened and does not authorize a bank payment.',
    )
    expect(api.activity).toHaveLength(1)

    await user.click(screen.getByRole('link', { name: 'Accounts' }))
    const row = await screen.findByRole('row', { name: /Everyday Checking/ })
    expect(within(row).getByText('Overdrawn by $30.00')).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Household' }))
    const wealth = await screen.findByRole('region', { name: 'Accounts and wealth' })
    expect(await within(wealth).findByText(/Debts/)).toHaveTextContent('$30.00')
    expect(within(wealth).getByText(/Financial assets/)).toHaveTextContent('$0.00')
  })

  it('does not warn when the Balance stays at or above zero', async () => {
    mockApi({ household, members: [maya, sam], accounts: [{ ...small }] })
    const { user } = renderRoute(`/accounts/${small.id}`)

    const panel = await review(user, '$50.00')
    expect(within(panel).queryByRole('alert')).toBeNull()
    expect(within(panel).getByRole('button', { name: 'Confirm saving' })).toBeEnabled()
  })
})
