import { screen, waitFor, within } from '@testing-library/react'
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

const newChecking = (): MockAccount => ({
  id: '44444444-4444-4444-8444-444444444444',
  type: 'checking',
  name: 'Everyday Checking',
  institution: 'Harbor Bank',
  ownerMemberIds: [maya.id],
  openedOn: '2026-09-10',
  openingAmount: '5000.00',
  balance: { amount: '5000.00', asOf: '2026-09-10' },
  status: 'active',
})

beforeEach(() => window.localStorage.clear())

async function enterRent(user: ReturnType<typeof renderRoute>['user']) {
  await user.selectOptions(await screen.findByLabelText('Entering as'), 'Maya')
  await user.click(await screen.findByRole('button', { name: 'Add money out' }))
  await user.type(await screen.findByLabelText('Amount'), '1500.00')
  const date = screen.getByLabelText('Date')
  await user.clear(date)
  await user.type(date, '2026-09-03')
  await user.selectOptions(screen.getByLabelText('Category'), 'Rent')
  await user.click(screen.getByRole('button', { name: 'Review' }))
}

describe('an expense dated before tracking began', () => {
  it('V2_CHECKING_016 asks for a historical setup review, previews it and saves both once', async () => {
    const api = mockApi({ household, members: [maya], accounts: [newChecking()] })
    const { user } = renderRoute('/accounts/44444444-4444-4444-8444-444444444444')
    await enterRent(user)

    const setup = await screen.findByRole('region', { name: 'Review historical setup' })
    expect(setup).toHaveTextContent('already represented in the 2026-09-10 amount')
    expect(api.requests.filter((r) => r.startsWith('POST'))).toEqual([])
    await user.clear(within(setup).getByLabelText('New tracking start'))
    await user.type(within(setup).getByLabelText('New tracking start'), '2026-09-01')
    await user.type(within(setup).getByLabelText('Initial Balance at that date'), '6,500.00')
    await user.type(within(setup).getByLabelText('Reason'), 'Rent was already in the amount')
    await user.click(within(setup).getByRole('button', { name: 'Review' }))

    const review = await screen.findByRole('region', { name: 'Review setup and expense' })
    expect(await within(review).findByText('Resulting Balance')).toBeInTheDocument()
    expect(review).toHaveTextContent('Rent')
    expect(review).toHaveTextContent('$1,500.00')
    expect(review).toHaveTextContent('2026-09-03')
    expect(review).toHaveTextContent('$6,500.00 on 2026-09-01')
    expect(review).toHaveTextContent('Previous start: $5,000.00 on 2026-09-10')
    expect(review).toHaveTextContent('Rent was already in the amount')
    expect(review).toHaveTextContent('$5,000.00')
    expect(review).toHaveTextContent('September spending will become $1,500.00')
    expect(api.requests.filter((r) => r.startsWith('POST'))).toEqual([])

    await user.click(within(review).getByRole('button', { name: 'Confirm setup and expense' }))
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Account details' })).toHaveTextContent(
        '$5,000.00',
      ),
    )
    expect(screen.getByRole('region', { name: 'Account details' })).toHaveTextContent('2026-09-01')
    expect(api.activity).toHaveLength(1)
    expect(api.openingRevisions).toHaveLength(1)
    expect(api.requests.filter((r) => r.endsWith('/historical-entries'))).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Show history' }))
    const history = await screen.findByRole('table', { name: 'History' })
    await waitFor(() => expect(history).toHaveTextContent('Tracking start moved'))
    expect(history).toHaveTextContent('Initial Balance')
    expect(history).toHaveTextContent('Rent was already in the amount')
  })

  it('V2_CHECKING_016 cancelling the review saves neither the start move nor the expense', async () => {
    const api = mockApi({ household, members: [maya], accounts: [newChecking()] })
    const { user } = renderRoute('/accounts/44444444-4444-4444-8444-444444444444')
    await enterRent(user)
    const setup = await screen.findByRole('region', { name: 'Review historical setup' })
    await user.click(within(setup).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('region', { name: 'Review historical setup' })).toBeNull()
    expect(api.activity).toHaveLength(0)
    expect(api.openingRevisions).toHaveLength(0)
    expect(api.requests.filter((r) => r.startsWith('POST'))).toEqual([])
  })

  it('asks for an amount and a start on or before the entry without a request', async () => {
    const api = mockApi({ household, members: [maya], accounts: [newChecking()] })
    const { user } = renderRoute('/accounts/44444444-4444-4444-8444-444444444444')
    await enterRent(user)
    const setup = await screen.findByRole('region', { name: 'Review historical setup' })
    await user.click(within(setup).getByRole('button', { name: 'Review' }))
    expect(await within(setup).findByText('Enter a valid amount')).toBeInTheDocument()
    await user.type(within(setup).getByLabelText('Initial Balance at that date'), '6500')
    await user.clear(within(setup).getByLabelText('New tracking start'))
    await user.type(within(setup).getByLabelText('New tracking start'), '2026-09-05')
    await user.click(within(setup).getByRole('button', { name: 'Review' }))
    expect(
      await within(setup).findByText('The new start must be on or before the entry date'),
    ).toBeInTheDocument()
    expect(api.requests.some((r) => r.includes('/preview'))).toBe(false)
  })
})
