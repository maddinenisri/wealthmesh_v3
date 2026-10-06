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

const seed = () => ({ household, members: [maya], accounts: [{ ...everyday }] })

beforeEach(() => window.localStorage.clear())

type User = ReturnType<typeof renderRoute>['user']

async function openSplit(user: User) {
  await user.selectOptions(await screen.findByLabelText('Entering as'), 'Maya')
  await user.click(await screen.findByRole('button', { name: 'Split an expense' }))
}

async function fillSplit(user: User, second: string) {
  await user.type(await screen.findByLabelText('Description'), 'Mixed shop')
  await user.type(screen.getByLabelText('Amount'), '120.00')
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-09-10' } })
  await user.selectOptions(screen.getByLabelText('Category 1'), 'Groceries')
  await user.type(screen.getByLabelText('Portion amount 1'), '90.00')
  await user.selectOptions(screen.getByLabelText('Category 2'), 'Dining')
  await user.type(screen.getByLabelText('Portion amount 2'), second)
}

describe('splitting an expense', () => {
  it('V2_SPLITS_001 saves one $120.00 payment with its two portions and shows the split', async () => {
    const api = mockApi(seed())
    const { user } = renderRoute(`/accounts/${everyday.id}`)
    await openSplit(user)
    await fillSplit(user, '30.00')
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('All $120.00 is assigned.')
    await user.click(screen.getByRole('button', { name: 'Review' }))

    expect(await screen.findByText('Review split expense')).toBeInTheDocument()
    const portions = screen.getByRole('table', { name: 'Portions' })
    expect(within(portions).getByText('Groceries')).toBeInTheDocument()
    expect(within(portions).getByText('Dining')).toBeInTheDocument()
    expect(document.body).toHaveTextContent('Everyday Checking Balance after')
    expect(document.body).toHaveTextContent('$4,880.00')
    expect(api.activity).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Confirm saving' }))

    const list = await screen.findByRole('table')
    expect(await within(list).findByText('Mixed shop')).toBeInTheDocument()
    expect(within(list).getByText('Split')).toBeInTheDocument()
    expect(within(list).getByText(/Groceries \$90\.00 · Essential/)).toBeInTheDocument()
    expect(within(list).getByText(/Dining \$30\.00/)).toBeInTheDocument()
    expect(api.activity).toHaveLength(1)
    expect(api.activity[0].amount).toBe('120.00')
    expect(api.activity[0].categoryId).toBe('')
    expect(api.activity[0].portions).toHaveLength(2)
    expect(api.accounts[0].balance.amount).toBe('4880.00')
  })

  it('V2_SPLITS_003 reviews $115.00 assigned and $5.00 to assign, saves nothing, then saves at $30.00', async () => {
    const api = mockApi(seed())
    const { user } = renderRoute(`/accounts/${everyday.id}`)
    await openSplit(user)
    await fillSplit(user, '25.00')
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent(
      '$115.00 is assigned and $5.00 is still to assign.',
    )
    await user.click(screen.getByRole('button', { name: 'Review' }))

    expect(await screen.findByText('Review split expense')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      '$115.00 is assigned and $5.00 is still to assign.',
    )
    expect(screen.getByRole('button', { name: 'Confirm saving' })).toBeDisabled()
    expect(api.activity).toHaveLength(0)
    expect(api.accounts[0].balance.amount).toBe('5000.00')

    await user.click(screen.getByRole('button', { name: 'Back' }))
    const second = await screen.findByLabelText('Portion amount 2')
    await user.clear(second)
    await user.type(second, '30.00')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    await user.click(await screen.findByRole('button', { name: 'Confirm saving' }))

    await within(await screen.findByRole('table')).findByText('Mixed shop')
    expect(api.activity).toHaveLength(1)
    expect(api.accounts[0].balance.amount).toBe('4880.00')
  })

  it('V2_SPLITS_003 refuses a category used twice and an empty portion before the review', async () => {
    const api = mockApi(seed())
    const { user } = renderRoute(`/accounts/${everyday.id}`)
    await openSplit(user)
    await user.type(await screen.findByLabelText('Amount'), '10.00')
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-09-10' } })
    await user.selectOptions(screen.getByLabelText('Category 1'), 'Groceries')
    await user.selectOptions(screen.getByLabelText('Category 2'), 'Groceries')
    await user.click(screen.getByRole('button', { name: 'Review' }))

    expect(
      await screen.findAllByText('Each category can be used once in a split'),
    ).not.toHaveLength(0)
    expect(screen.getAllByText('Enter a valid amount')).toHaveLength(2)
    expect(api.activity).toHaveLength(0)
  })
})
