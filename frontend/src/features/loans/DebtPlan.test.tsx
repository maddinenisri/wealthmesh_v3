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
const ID = '44444444-4444-4444-8444-444444444444'
const FUTURE =
  'A future amount is not completed account history. Save it as a future plan, or choose a date on or before today.'

const debt = (type: 'loan' | 'mortgage'): MockAccount => ({
  id: ID,
  type,
  name: type === 'loan' ? 'Car Loan' : 'Home Mortgage',
  institution: 'Maple',
  ownerMemberIds: [maya.id],
  openedOn: '2026-09-01',
  openingAmount: type === 'loan' ? '-20000.00' : '-200000.00',
  balance: {
    amount: type === 'loan' ? '-20000.00' : '-200000.00',
    asOf: '2026-09-01',
  },
  status: 'active',
})
const seed = (type: 'loan' | 'mortgage') => ({
  household,
  members: [maya],
  accounts: [debt(type)],
  today: '2026-10-03',
})

beforeEach(() => window.localStorage.setItem('wealthmesh.enteringAs', maya.id))

const posts = (requests: string[]) => requests.filter((line) => line.startsWith('POST '))
type User = ReturnType<typeof renderRoute>['user']

async function proposeFuture(user: User, amount: string) {
  await user.click(await screen.findByRole('button', { name: 'Update balance owed' }))
  const form = await screen.findByRole('region', { name: 'Update balance owed' })
  await user.type(within(form).getByLabelText('Balance owed'), amount)
  fireEvent.change(within(form).getByLabelText('Date'), { target: { value: '2026-12-31' } })
  await user.click(within(form).getByRole('button', { name: 'Review' }))
  return form
}

describe.each([
  ['loan', 'Car Loan', '$20,000.00', '15000.00', '$15,000.00'],
  ['mortgage', 'Home Mortgage', '$200,000.00', '150000.00', '$150,000.00'],
] as const)('a future-dated amount on a %s', (type, name, now, typed, shown) => {
  it(`V2_DATED_VALUE_001 ${name}: a date after today is guided to a plan, the plan is reviewed and saved, listed, and the Balance owed stays ${now}`, async () => {
    const api = mockApi(seed(type))
    const { user } = renderRoute(`/accounts/${ID}`)

    const form = await proposeFuture(user, typed)
    const alert = await within(form).findByRole('alert')
    expect(alert).toHaveTextContent(FUTURE)
    expect(posts(api.requests)).toHaveLength(0)

    await user.click(within(alert).getByRole('button', { name: 'Save as a future plan' }))
    const plan = await screen.findByRole('region', { name: 'Plan a future amount owed' })
    expect(within(plan).getByLabelText('Amount owed')).toHaveValue(typed)
    expect(within(plan).getByLabelText('Planned for')).toHaveValue('2026-12-31')
    await user.click(within(plan).getByRole('button', { name: 'Review' }))

    const review = await screen.findByRole('region', { name: 'Review plan' })
    await waitFor(() =>
      expect(within(review).getByRole('heading', { name: 'Review plan' })).toHaveFocus(),
    )
    expect(await within(review).findByText(`${name} Balance owed after`)).toBeInTheDocument()
    expect(review).toHaveTextContent(`Planned amount owed${shown} owed`)
    expect(review).toHaveTextContent('Planned for2026-12-31')
    expect(review).toHaveTextContent(`${name} Balance owed now${now} owed`)
    expect(review).toHaveTextContent(`${name} Balance owed after${now} owed`)
    expect(review).toHaveTextContent('never counted in the Balance owed, wealth or any past date')
    expect(posts(api.requests)).toEqual([`POST /api/v1/accounts/${ID}/values/review`])

    await user.click(within(review).getByRole('button', { name: 'Confirm plan' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      `Saved a plan of ${shown} owed for 2026-12-31. It is not counted in the Balance owed or wealth.`,
    )
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Activity' })).toHaveFocus())
    expect(await screen.findByLabelText('Account details')).toHaveTextContent(
      `Balance owed${now} as of 2026-09-01`,
    )
    const plans = await screen.findByRole('region', { name: 'Planned amounts owed' })
    expect(plans).toHaveTextContent(`${shown} owed`)
    expect(plans).toHaveTextContent('2026-12-31')
    expect(api.accounts[0].balance.amount).toBe(type === 'loan' ? '-20000.00' : '-200000.00')
    expect(posts(api.requests).filter((line) => line.endsWith('/values'))).toHaveLength(1)
  })
})

describe('working with a plan on a debt', () => {
  it('V2_DATED_VALUE_001 "Choose another date" puts focus back on the date, and Back from the plan review puts focus on the plan form', async () => {
    mockApi(seed('loan'))
    const { user } = renderRoute(`/accounts/${ID}`)
    const form = await proposeFuture(user, '15000.00')
    await user.click(await within(form).findByRole('button', { name: 'Choose another date' }))
    expect(within(form).getByLabelText('Date')).toHaveFocus()

    await user.click(within(form).getByRole('button', { name: 'Review' }))
    await user.click(await within(form).findByRole('button', { name: 'Save as a future plan' }))
    const plan = await screen.findByRole('region', { name: 'Plan a future amount owed' })
    await user.click(within(plan).getByRole('button', { name: 'Review' }))
    await screen.findByRole('region', { name: 'Review plan' })
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Plan a future amount owed' })).toHaveFocus(),
    )
    expect(screen.getByLabelText('Amount owed')).toHaveValue('15000.00')
  })

  it('V2_DATED_VALUE_001 a plan is removed by a reviewed removal that says it changes nothing, stays listed as removed, and Undo brings it back', async () => {
    const api = mockApi(seed('loan'))
    const { user } = renderRoute(`/accounts/${ID}`)
    const form = await proposeFuture(user, '15000.00')
    await user.click(await within(form).findByRole('button', { name: 'Save as a future plan' }))
    const plan = await screen.findByRole('region', { name: 'Plan a future amount owed' })
    await user.click(within(plan).getByRole('button', { name: 'Review' }))
    await user.click(await screen.findByRole('button', { name: 'Confirm plan' }))
    await screen.findByRole('status')

    await user.click(await screen.findByRole('button', { name: 'Remove plan for 2026-12-31' }))
    const removal = await screen.findByRole('region', { name: 'Review removal' })
    expect(removal).toHaveTextContent('Remove the plan $15,000.00 owed dated 2026-12-31.')
    expect(removal).toHaveTextContent('No cash or spending changes')
    await user.click(within(removal).getByRole('button', { name: 'Confirm removal' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Removed the plan $15,000.00 owed dated 2026-12-31.',
    )
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Activity' })).toHaveFocus())
    const plans = await screen.findByRole('region', { name: 'Planned amounts owed' })
    expect(plans).toHaveTextContent('Removed')

    await user.click(within(plans).getByRole('button', { name: 'Undo plan for 2026-12-31' }))
    const undo = await screen.findByRole('region', { name: 'Review Undo' })
    expect(undo).toHaveTextContent('Bring back the plan $15,000.00 owed dated 2026-12-31.')
    expect(undo).toHaveTextContent('A plan is never counted')
    await user.click(within(undo).getByRole('button', { name: 'Confirm Undo' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Restored the plan $15,000.00 owed dated 2026-12-31.',
    )
    expect(api.accounts[0].balance.amount).toBe('-20000.00')
  })

  it('V2_DATED_VALUE_001 a negative amount is explained in a debt’s words and nothing is reviewed', async () => {
    const api = mockApi(seed('mortgage'))
    const { user } = renderRoute(`/accounts/${ID}`)
    const form = await proposeFuture(user, '15000.00')
    await user.click(await within(form).findByRole('button', { name: 'Save as a future plan' }))
    const plan = await screen.findByRole('region', { name: 'Plan a future amount owed' })
    const amount = within(plan).getByLabelText('Amount owed')
    await user.clear(amount)
    await user.type(amount, '-5.00')
    await user.click(within(plan).getByRole('button', { name: 'Review' }))
    expect(
      await within(plan).findByText('Enter zero or a positive amount owed'),
    ).toBeInTheDocument()
    expect(posts(api.requests)).toHaveLength(0)
  })

  it('V2_DATED_VALUE_001 no plan is listed until one is saved', async () => {
    mockApi(seed('loan'))
    renderRoute(`/accounts/${ID}`)
    await screen.findByLabelText('Account details')
    expect(screen.queryByRole('region', { name: 'Planned amounts owed' })).not.toBeInTheDocument()
  })
})

describe('plans on a closed debt', () => {
  it('V2_DATED_VALUE_001 a closed debt lists its removed plan but offers no Undo', async () => {
    mockApi({
      ...seed('loan'),
      accounts: [
        { ...debt('loan'), status: 'closed', balance: { amount: '0.00', asOf: '2026-09-01' } },
      ],
      values: [
        {
          id: 'v1',
          accountId: ID,
          valueOn: '2026-12-31',
          amount: '-15000.00',
          reason: null,
          planned: true,
          enteredBy: maya.id,
          replacesId: null,
          replaced: false,
          removedAt: '2026-10-01T10:00:00Z',
          removedBy: maya.id,
          createdAt: '2026-09-30T10:00:00Z',
        },
      ],
    } as never)
    renderRoute(`/accounts/${ID}`)
    const undo = await screen.findByRole('button', { name: 'Undo plan for 2026-12-31' })
    expect(undo).toBeDisabled()
  })
})

describe('closing a debt that has a plan', () => {
  it('V2_PROPERTY_005 the Close review of a debt that still owes names the amount owed and the plan', async () => {
    mockApi({
      ...seed('mortgage'),
      values: [
        {
          id: 'v1',
          accountId: ID,
          valueOn: '2026-12-31',
          amount: '-150000.00',
          reason: null,
          planned: true,
          enteredBy: maya.id,
          replacesId: null,
          replaced: false,
          removedAt: null,
          removedBy: null,
          createdAt: '2026-09-30T10:00:00Z',
        },
      ],
    } as never)
    const { user } = renderRoute(`/accounts/${ID}`)
    await user.click(await screen.findByRole('button', { name: 'Close account' }))
    const review = await screen.findByRole('region', { name: 'Review closing Home Mortgage' })
    await waitFor(() => expect(review).toHaveTextContent('has 1 planned value. Remove it first'))
    expect(review).toHaveTextContent('Closing needs a zero Balance owed')
  })
})
