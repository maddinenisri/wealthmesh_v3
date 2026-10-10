import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { mockApi } from '../../test/mockApi'
import type { MockPrice } from '../../test/mockInvestments'
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
const SAVINGS = '44444444-4444-4444-8444-444444444442'
const BROKERAGE = '44444444-4444-4444-8444-444444444443'

beforeEach(() => window.localStorage.setItem('wealthmesh.enteringAs', maya.id))

const make = (id: string, type: string, name: string, amount: string, asOf = '2026-09-01') => ({
  id,
  type,
  name,
  institution: null,
  ownerMemberIds: [maya.id],
  openedOn: '2026-09-01',
  openingAmount: amount,
  balance: { amount, asOf },
  status: 'active' as const,
})

// WEALTH_001/009: checking $5,120.00, savings $12,000.00 and a brokerage of $16,000.00 cash and 50 HOME at $110.00
// ($21,500.00 on Sep 30). HOME is priced at $130.00 on Oct 2: +$1,000.00 by today, Oct 3.
const price: MockPrice = {
  id: 'p-1',
  accountId: BROKERAGE,
  symbol: 'HOME',
  price: '130.00',
  valueOn: '2026-10-02',
  enteredByMemberId: maya.id,
  enteredByName: 'Maya',
  enteredAt: '2026-10-02T12:00:00.000Z',
  replacedAt: null,
  key: 'k-1',
}

const seed = () => ({
  household,
  members: [maya, sam],
  accounts: [
    make(CHECKING, 'checking', 'Everyday Checking', '5120.00'),
    make(SAVINGS, 'savings', 'Emergency Savings', '12000.00'),
    make(BROKERAGE, 'brokerage', 'Redwood Brokerage', '21500.00', '2026-10-02'),
  ].map((a) =>
    a.id === BROKERAGE ? { ...a, balance: { amount: '22500.00', asOf: '2026-10-02' } } : a,
  ),
  openings: {
    [BROKERAGE]: {
      total: '21500.00',
      cash: '16000.00',
      blank: false,
      holdings: [{ symbol: 'HOME', quantity: '50', price: '110.00', valueOn: '2026-09-01' }],
      statementId: null,
    },
  },
  prices: [price],
  today: '2026-10-03',
})

describe('the September 30 snapshot and its trend (WEALTH_001, WEALTH_009)', () => {
  it('V2_WEALTH_001 the Household page lists Bank money with checking and savings and their total', async () => {
    mockApi(seed())
    renderRoute('/')
    const bank = await screen.findByRole('region', { name: 'Bank money' })
    expect(bank).toHaveTextContent('Everyday Checking')
    expect(bank).toHaveTextContent('$5,120.00')
    expect(bank).toHaveTextContent('Emergency Savings')
    expect(bank).toHaveTextContent('$12,000.00')
    expect(bank).toHaveTextContent('$17,120.00')
  })

  it('V2_WEALTH_001 V2_WEALTH_009 September 30 ignores the later price: $38,620.00, today $39,620.00', async () => {
    mockApi(seed())
    renderRoute('/')
    const card = await screen.findByRole('region', { name: 'Wealth on a date' })
    expect(await within(card).findByText(/Household wealth on 2026-10-03/)).toHaveTextContent(
      '$39,620.00',
    )
    fireEvent.change(within(card).getByLabelText('Show wealth on'), {
      target: { value: '2026-09-30' },
    })
    const sep30 = await within(card).findByText(/Household wealth on 2026-09-30/)
    expect(sep30).toHaveTextContent('$38,620.00')
    expect(within(card).getByText(/Financial assets/)).toHaveTextContent('$38,620.00')
    expect(within(card).getByText(/Debts/)).toHaveTextContent('$0.00')
    const investments = within(card).getByRole('region', {
      name: 'Investment balances on this date',
    })
    expect(investments).toHaveTextContent('$21,500.00')
    expect(investments).not.toHaveTextContent('$22,500.00')
  })

  it('V2_WEALTH_009 the trend reads both dates and the increase, and another end date gives another answer', async () => {
    mockApi(seed())
    renderRoute('/')
    const card = await screen.findByRole('region', { name: 'Wealth on a date' })
    fireEvent.change(within(card).getByLabelText('From'), { target: { value: '2026-09-30' } })
    fireEvent.change(within(card).getByLabelText('To'), { target: { value: '2026-10-03' } })
    const change = await within(card).findByRole('region', { name: 'Wealth change' })
    expect(change).toHaveTextContent(
      'Wealth went from $38,620.00 on 2026-09-30 to $39,620.00 on 2026-10-03: a change of $1,000.00.',
    )
    expect(within(change).getByText('Investment price changes').closest('li')).toHaveTextContent(
      '$1,000.00',
    )
    // The same start, an end date before the price: no increase.
    fireEvent.change(within(card).getByLabelText('To'), { target: { value: '2026-10-01' } })
    await waitFor(() =>
      expect(within(card).getByRole('region', { name: 'Wealth change' })).toHaveTextContent(
        'Wealth went from $38,620.00 on 2026-09-30 to $38,620.00 on 2026-10-01: a change of $0.00.',
      ),
    )
  })
})
