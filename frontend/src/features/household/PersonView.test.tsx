import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { mockApi, type MockAccount } from '../../test/mockApi'
import type { MockOpening } from '../../test/mockInvestments'
import { renderRoute } from '../../test/render'

const household = { id: '11111111-1111-4111-8111-111111111111', name: 'Maya and Sam' }
const maya = {
  id: '22222222-2222-4222-8222-222222222222',
  householdId: household.id,
  name: 'Maya',
  label: null,
}
const sam = { ...maya, id: '33333333-3333-4333-8333-333333333333', name: 'Sam' }
const CHECKING = '44444444-4444-4444-8444-444444444441'
const K401 = '44444444-4444-4444-8444-444444444442'
const IRA = '44444444-4444-4444-8444-444444444443'

const make = (
  id: string,
  type: string,
  name: string,
  owners: string[],
  amount: string,
): MockAccount => ({
  id,
  type,
  name,
  institution: null,
  ownerMemberIds: owners,
  openedOn: '2026-09-01',
  openingAmount: amount,
  balance: { amount, asOf: '2026-09-01' },
  status: 'active',
})
const opening = (total: string): MockOpening => ({
  total,
  cash: null,
  blank: false,
  holdings: [],
  statementId: null,
})
// MEMBERS_002: joint checking $5,000; Sam's 401(k) $80,000; Maya's Traditional IRA $30,000.
const seed = () => ({
  household,
  members: [maya, sam],
  accounts: [
    make(CHECKING, 'checking', 'Everyday Checking', [maya.id, sam.id], '5000.00'),
    make(K401, '401k', 'Harbor 401k', [sam.id], '80000.00'),
    make(IRA, 'traditional_ira', 'Willow Traditional IRA', [maya.id], '30000.00'),
  ],
  openings: { [K401]: opening('80000.00'), [IRA]: opening('30000.00') },
  today: '2026-10-03',
})

const thisView = async () => {
  const region = await screen.findByRole('region', { name: 'Accounts and wealth' })
  const list = await within(region).findByRole('region', { name: 'Accounts in this view' })
  return { region, list }
}

describe('the per-person view (MEMBERS_002)', () => {
  it('V2_MEMBERS_002 Sam sees the checking once and the 401(k) once with total assets of $85,000.00', async () => {
    mockApi(seed())
    const { user } = renderRoute('/')
    const { region } = await thisView()
    await user.selectOptions(within(region).getByLabelText('View'), 'Sam')

    await waitFor(() =>
      expect(within(region).getByText(/Financial assets/)).toHaveTextContent('$85,000.00'),
    )
    const { list } = await thisView()
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Everyday Checking')
    expect(rows[1]).toHaveTextContent('Harbor 401k')
    expect(within(list).queryByText('Willow Traditional IRA')).toBeNull()
    expect(within(region).getByText(/Showing the accounts of Sam: 2 accounts\./)).toBeVisible()
    // The select keeps focus, the sentence is announced as a status, the address keeps the view.
    expect(within(region).getByLabelText('View')).toHaveFocus()
    expect(within(region).getByRole('status')).toHaveTextContent('Showing the accounts of Sam')
  })

  it('V2_MEMBERS_002 Maya sees the checking once and the Traditional IRA once with total assets of $35,000.00', async () => {
    mockApi(seed())
    const { user } = renderRoute('/')
    const { region } = await thisView()
    await user.selectOptions(within(region).getByLabelText('View'), 'Maya')
    await waitFor(() =>
      expect(within(region).getByText(/Financial assets/)).toHaveTextContent('$35,000.00'),
    )
    const { list } = await thisView()
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(within(list).getByText('Everyday Checking')).toBeVisible()
    expect(within(list).getByText('Willow Traditional IRA')).toBeVisible()
  })

  it("V2_MEMBERS_002 the whole household shows each account once with total assets of $115,000.00, and says the joint checking is in each person's view and counted once", async () => {
    mockApi(seed())
    const { user } = renderRoute('/?view=' + sam.id)
    const { region } = await thisView()
    await waitFor(() =>
      expect(within(region).getByText(/Financial assets/)).toHaveTextContent('$85,000.00'),
    )
    await user.selectOptions(within(region).getByLabelText('View'), 'Whole household')
    await waitFor(() =>
      expect(within(region).getByText(/Financial assets/)).toHaveTextContent('$115,000.00'),
    )
    const { list } = await thisView()
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    expect(within(region).getByRole('status')).toHaveTextContent(
      "Showing the whole household: 3 accounts, each counted once. Everyday Checking is a joint account: it appears in each person's view and is counted once for the household.",
    )
  })

  it("V2_MEMBERS_002 the joint line is also on a person's view; a 401(k) is one row in the list although it is in two groups", async () => {
    mockApi(seed())
    renderRoute('/?view=' + sam.id)
    const { region, list } = await thisView()
    expect(within(region).getByRole('status')).toHaveTextContent(
      "Everyday Checking is a joint account: it appears in each person's view and is counted once for the household.",
    )
    expect(within(list).getAllByText('Harbor 401k')).toHaveLength(1)
    // The groups below stay as views, and a view is not added.
    expect(within(region).getByRole('region', { name: 'Investments' })).toHaveTextContent(
      'Harbor 401k',
    )
    expect(within(region).getByRole('region', { name: 'Retirement' })).toHaveTextContent(
      'Harbor 401k',
    )
  })

  it("V2_MEMBERS_002 What changed stays the household's and says so when a person is chosen", async () => {
    mockApi(seed())
    renderRoute('/?view=' + sam.id)
    await thisView()
    const over = await screen.findByRole('region', { name: 'Wealth on a date' })
    expect(over).toHaveTextContent("This is for the whole household, not Sam's accounts alone.")
  })

  it('V2_MEMBERS_002 an address naming nobody in the household shows the whole household', async () => {
    mockApi(seed())
    renderRoute('/?view=99999999-9999-4999-8999-999999999999')
    const { region } = await thisView()
    await waitFor(() =>
      expect(within(region).getByText(/Financial assets/)).toHaveTextContent('$115,000.00'),
    )
  })
})
