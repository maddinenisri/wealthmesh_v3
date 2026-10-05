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
const card: MockAccount = {
  id: '44444444-4444-4444-8444-444444444444',
  type: 'credit_card',
  name: 'Everyday Credit Card',
  institution: 'Harbor Cards',
  ownerMemberIds: [maya.id],
  openedOn: '2026-09-01',
  openingAmount: '0.00',
  balance: { amount: '0.00', asOf: '2026-09-01' },
  status: 'active',
}
const checking: MockAccount = {
  id: '55555555-5555-4555-8555-555555555555',
  type: 'checking',
  name: 'Everyday Checking',
  institution: 'Harbor Bank',
  ownerMemberIds: [maya.id],
  openedOn: '2026-09-01',
  openingAmount: '5000.00',
  balance: { amount: '5000.00', asOf: '2026-09-01' },
  status: 'active',
}

const seed = () => ({ household, members: [maya, sam], accounts: [{ ...card }, { ...checking }] })

beforeEach(() => window.localStorage.setItem('wealthmesh.enteringAs', sam.id))

type User = ReturnType<typeof renderRoute>['user']

async function fillRow(
  user: User,
  n: number,
  fields: { date: string; amount: string; category: string },
) {
  fireEvent.change(await screen.findByLabelText(`Date ${n}`), { target: { value: fields.date } })
  await user.clear(screen.getByLabelText(`Amount ${n}`))
  await user.type(screen.getByLabelText(`Amount ${n}`), fields.amount)
  await user.selectOptions(screen.getByLabelText(`Category ${n}`), fields.category)
}

const posts = (api: ReturnType<typeof mockApi>) => api.requests.filter((r) => r.startsWith('POST'))

describe('several expenses at once', () => {
  it('V2_EXPENSE_003 reviews four $150.00 purchases with dates, card and total, saves none until confirmed, then saves them once even when the first answer is lost', async () => {
    const api = mockApi(seed())
    const { user } = renderRoute(`/accounts/${card.id}`)
    await user.click(await screen.findByRole('button', { name: 'Add several purchases' }))
    await user.click(screen.getByRole('button', { name: 'Add another purchase' }))
    await user.click(screen.getByRole('button', { name: 'Add another purchase' }))
    const dates = ['2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27']
    for (const [index, date] of dates.entries())
      await fillRow(user, index + 1, { date, amount: '150.00', category: 'Groceries' })
    await user.click(screen.getByRole('button', { name: 'Review' }))

    const review = await screen.findByRole('region', { name: 'Review purchases' })
    expect(review).toHaveTextContent('Charged to Everyday Credit Card')
    const table = within(review).getByRole('table', { name: 'Prepared purchases' })
    for (const date of dates) expect(within(table).getByText(date)).toBeInTheDocument()
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(4)
    rows.forEach((row) => expect(row).toHaveTextContent('$150.00'))
    expect(review).toHaveTextContent('Total$600.00')
    expect(review).toHaveTextContent('Everyday Credit Card Balance after$600.00 owed')
    expect(api.activity).toHaveLength(0)
    expect(posts(api)).toEqual([])

    api.loseNextExpenseResponse = true
    await user.click(within(review).getByRole('button', { name: 'Confirm saving all' }))
    expect(await within(review).findByRole('alert')).toHaveTextContent(
      'The server took too long to answer',
    )
    await user.click(within(review).getByRole('button', { name: 'Confirm saving all' }))
    await screen.findByRole('cell', { name: '2026-09-27' })
    expect(api.activity).toHaveLength(4)
    expect(api.keys).toHaveLength(2)
    expect(api.keys[0]).toBe(api.keys[1])
    expect(api.accounts[0].balance.amount).toBe('-600.00')
  })

  it('V2_EXPENSE_004 Cancel at the review of $880.00 saves nothing and leaves checking at $5,000.00', async () => {
    const api = mockApi(seed())
    const { user } = renderRoute(`/accounts/${checking.id}`)
    await user.click(await screen.findByRole('button', { name: 'Add several expenses' }))
    await fillRow(user, 1, { date: '2026-09-05', amount: '180.00', category: 'Utilities' })
    await fillRow(user, 2, { date: '2026-09-08', amount: '700.00', category: 'Rent' })
    await user.click(screen.getByRole('button', { name: 'Review' }))
    const review = await screen.findByRole('region', { name: 'Review expenses' })
    expect(review).toHaveTextContent('Total$880.00')
    await user.click(within(review).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('region', { name: 'Review expenses' })).toBeNull()
    expect(api.activity).toHaveLength(0)
    expect(posts(api)).toEqual([])
    expect(api.accounts[1].balance.amount).toBe('5000.00')
    expect(screen.getByRole('button', { name: 'Add several expenses' })).toHaveFocus()
  })

  it('V2_EXPENSE_005 an invalid -$100.00 amount names its row, nothing is saved and every entered value stays', async () => {
    const api = mockApi(seed())
    const { user } = renderRoute(`/accounts/${card.id}`)
    await user.click(await screen.findByRole('button', { name: 'Add several purchases' }))
    await fillRow(user, 1, { date: '2026-09-06', amount: '150.00', category: 'Groceries' })
    await fillRow(user, 2, { date: '2026-09-13', amount: '-100.00', category: 'Groceries' })
    await user.click(screen.getByRole('button', { name: 'Review' }))

    expect(await screen.findByText('Enter an amount greater than zero')).toBeInTheDocument()
    expect(screen.getByLabelText('Amount 2')).toHaveFocus()
    expect(screen.getByLabelText('Amount 1')).toHaveValue('150.00')
    expect(screen.getByLabelText('Date 1')).toHaveValue('2026-09-06')
    expect(screen.getByLabelText('Category 1')).toHaveDisplayValue('Groceries')
    expect(screen.getByLabelText('Date 2')).toHaveValue('2026-09-13')
    expect(screen.queryByRole('region', { name: 'Review purchases' })).toBeNull()
    expect(api.activity).toHaveLength(0)
    expect(posts(api)).toEqual([])
    expect(api.accounts[0].balance.amount).toBe('0.00')
  })
})

describe('save and add another', () => {
  it('V2_EXPENSE_002 keeps the card and Groceries, asks for the date and amount again, and September Groceries is $300.00', async () => {
    const api = mockApi(seed())
    const { user } = renderRoute(`/accounts/${card.id}`)
    await user.click(await screen.findByRole('button', { name: 'Record purchase' }))
    await user.type(await screen.findByLabelText('Amount'), '150.00')
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-09-06' } })
    await user.selectOptions(screen.getByLabelText('Category'), 'Groceries')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    await user.click(screen.getByRole('button', { name: 'Save and add another' }))

    const next = await screen.findByRole('region', { name: 'Record purchase' })
    expect(within(next).getByRole('status')).toHaveTextContent(
      'Saved $150.00 on 2026-09-06. Confirm the date and amount of the next purchase.',
    )
    expect(
      within(next).getByText('Everyday Credit Card', { selector: 'strong' }),
    ).toBeInTheDocument()
    expect(within(next).getByLabelText('Category')).toHaveDisplayValue('Groceries')
    expect(within(next).getByLabelText('Date')).toHaveValue('')
    expect(within(next).getByLabelText('Amount')).toHaveValue('')
    expect(api.activity).toHaveLength(1)

    await user.type(within(next).getByLabelText('Amount'), '150.00')
    fireEvent.change(within(next).getByLabelText('Date'), { target: { value: '2026-09-13' } })
    await user.click(within(next).getByRole('button', { name: 'Review' }))
    await user.click(screen.getByRole('button', { name: 'Confirm saving' }))
    await screen.findByRole('cell', { name: '2026-09-13' })
    expect(api.activity).toHaveLength(2)
    expect(api.keys[0]).not.toBe(api.keys[1])
    expect(api.accounts[0].balance.amount).toBe('-300.00')
  })
})
