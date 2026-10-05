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
const sam = { ...maya, id: '33333333-3333-4333-8333-333333333333', name: 'Sam' }

const savings: MockAccount = {
  id: '44444444-4444-4444-8444-444444444444',
  type: 'savings',
  name: 'Emergency Savings',
  institution: 'Harbor Bank',
  ownerMemberIds: [sam.id],
  openedOn: '2026-09-01',
  openingAmount: '10000.00',
  balance: { amount: '10000.00', asOf: '2026-09-01' },
  status: 'active',
}

beforeEach(() => window.localStorage.clear())

describe('savings interest', () => {
  it('V2_INCOME_002 records Interest income on savings, found from savings and the monthly Income view', async () => {
    const api = mockApi({ household, members: [maya, sam], accounts: [{ ...savings }] })
    const { user } = renderRoute(`/accounts/${savings.id}`)
    await user.selectOptions(await screen.findByLabelText('Entering as'), 'Sam')
    await user.click(await screen.findByRole('button', { name: 'Add money in' }))

    await user.type(await screen.findByLabelText('Amount'), '25.00')
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-09-15' } })
    await user.selectOptions(screen.getByLabelText('Category'), 'Interest')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    await user.click(await screen.findByRole('button', { name: 'Confirm saving' }))

    expect(await screen.findByText('$10,025', { exact: false })).toBeInTheDocument()
    expect(api.activity).toHaveLength(1)
    expect(api.activity[0]).toMatchObject({
      kind: 'income',
      amount: '25.00',
      accountId: savings.id,
    })
    expect(api.requests).toContain(`POST /api/v1/accounts/${savings.id}/income`)
    expect(api.requests.some((r) => r.includes('balance-corrections'))).toBe(false)

    // The dated Interest entry is on the savings account's activity list...
    const list = await screen.findByRole('region', { name: /activity/i })
    expect(within(list).getByText('Interest')).toBeInTheDocument()
    expect(within(list).getByText('2026-09-15')).toBeInTheDocument()

    // ...and in the monthly Income view, with no spending.
    await user.click(screen.getByRole('link', { name: 'Spending' }))
    fireEvent.change(await screen.findByLabelText('Month'), { target: { value: '2026-09' } })
    const income = await screen.findByRole('region', { name: 'Income' })
    expect(await within(income).findByText(/Income/, { selector: 'p' })).toHaveTextContent('$25.00')
    await user.click(
      await within(await screen.findByRole('list', { name: 'Income by category' })).findByRole(
        'button',
        { name: 'Interest' },
      ),
    )
    const table = await screen.findByRole('table', { name: 'Income entries' })
    expect(within(table).getByRole('row', { name: /Interest/ })).toHaveTextContent(
      'Emergency Savings',
    )
    const review = screen.getByRole('region', { name: 'Month review' })
    expect(within(review).getByText(/^Spending/)).toHaveTextContent('$0.00')
  })
})
