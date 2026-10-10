import { fireEvent, screen, within } from '@testing-library/react'
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
const BROKERAGE = '44444444-4444-4444-8444-444444444442'

beforeEach(() => window.localStorage.setItem('wealthmesh.enteringAs', maya.id))

const make = (id: string, type: string, name: string, amount: string) => ({
  id,
  type,
  name,
  institution: null,
  ownerMemberIds: [maya.id],
  openedOn: '2026-09-01',
  openingAmount: amount,
  balance: { amount, asOf: '2026-09-01' },
  status: 'active' as const,
})

const price = (valueOn: string, amount: string): MockPrice => ({
  id: `p-${valueOn}`,
  accountId: BROKERAGE,
  symbol: 'HOME',
  price: amount,
  valueOn,
  enteredByMemberId: maya.id,
  enteredByName: 'Maya',
  enteredAt: '2026-09-30T12:00:00.000Z',
  replacedAt: null,
  key: `k-${valueOn}`,
})

// WEALTH_004: checking $5,120.00 and a brokerage with $15,000.00 cash and 50 HOME last priced at $100.00 on Sep 1.
const seed = (prices: MockPrice[] = [], balance = '20000.00') => ({
  household,
  members: [maya, sam],
  accounts: [
    make(CHECKING, 'checking', 'Everyday Checking', '5120.00'),
    {
      ...make(BROKERAGE, 'brokerage', 'Redwood Brokerage', '20000.00'),
      balance: { amount: balance, asOf: prices.length ? '2026-09-30' : '2026-09-01' },
    },
  ],
  openings: {
    [BROKERAGE]: {
      total: '20000.00',
      cash: '15000.00',
      blank: false,
      holdings: [{ symbol: 'HOME', quantity: '50', price: '100.00', valueOn: '2026-09-01' }],
      statementId: null,
    },
  },
  prices,
  today: '2026-09-30',
})

describe('older prices on the Household page (WEALTH_004)', () => {
  it("V2_WEALTH_004 wealth on Sep 30 uses each account's one Balance, shows when the prices were last updated and explains that the balances come from different dates", async () => {
    mockApi(seed())
    const { user } = renderRoute('/')
    const card = await screen.findByRole('region', { name: 'Wealth on a date' })
    const date = within(card).getByLabelText('Show wealth on')
    fireEvent.change(date, { target: { value: '2026-09-30' } })
    expect(await within(card).findByText(/Household wealth on 2026-09-30/)).toHaveTextContent(
      '$25,120.00',
    )
    expect(within(card).getByText(/Financial assets/)).toHaveTextContent('$25,120.00')
    const investments = within(card).getByRole('region', {
      name: 'Investment balances on this date',
    })
    expect(investments).toHaveTextContent('Redwood Brokerage')
    expect(investments).toHaveTextContent('$20,000.00')
    expect(investments).toHaveTextContent('Prices last updated 2026-09-01')
    expect(card).toHaveTextContent(
      'These balances come from different dates: 1 investment account uses prices dated before 2026-09-30.',
    )
    expect(card).toHaveTextContent('Redwood Brokerage: prices last updated 2026-09-01')
    expect(user).toBeDefined()
  })

  it('V2_WEALTH_004 after HOME is priced at $130.00 on Sep 30 the total is $26,620.00, the Balance $21,500.00, and the note is gone', async () => {
    mockApi(seed([price('2026-09-30', '130.00')], '21500.00'))
    renderRoute('/')
    const card = await screen.findByRole('region', { name: 'Wealth on a date' })
    fireEvent.change(within(card).getByLabelText('Show wealth on'), {
      target: { value: '2026-09-30' },
    })
    expect(await within(card).findByText(/Household wealth on 2026-09-30/)).toHaveTextContent(
      '$26,620.00',
    )
    const investments = within(card).getByRole('region', {
      name: 'Investment balances on this date',
    })
    expect(investments).toHaveTextContent('$21,500.00')
    expect(investments).toHaveTextContent('Prices last updated 2026-09-30')
    expect(card).not.toHaveTextContent('come from different dates')
    // An earlier date still reads the older price.
    fireEvent.change(within(card).getByLabelText('Show wealth on'), {
      target: { value: '2026-09-29' },
    })
    expect(await within(card).findByText(/Household wealth on 2026-09-29/)).toHaveTextContent(
      '$25,120.00',
    )
  })

  it('V2_WEALTH_004 the account list shows one date phrase per investment account: when its prices were last updated', async () => {
    mockApi(seed([price('2026-09-15', '120.00')], '21000.00'))
    renderRoute('/')
    const group = await screen.findByRole('region', { name: 'Investments' })
    const item = (await within(group).findByText('Redwood Brokerage')).closest('li')!
    expect(item).toHaveTextContent('$21,000.00')
    expect(item).toHaveTextContent('Prices last updated 2026-09-15')
    expect(item).not.toHaveTextContent('Balance dated')
    expect(item).not.toHaveTextContent('Value dated')
    // Today is Sep 30 and the latest price is older, so the total says its dates differ.
    const region = screen.getByRole('region', { name: 'Accounts and wealth' })
    expect(region).toHaveTextContent('Redwood Brokerage: prices last updated 2026-09-15')
  })

  it('V2_WEALTH_004 the change explanation shows a price move as its own line, never as income', async () => {
    mockApi(seed([price('2026-09-30', '130.00')], '21500.00'))
    renderRoute('/')
    const card = await screen.findByRole('region', { name: 'Wealth on a date' })
    fireEvent.change(within(card).getByLabelText('From'), { target: { value: '2026-09-01' } })
    fireEvent.change(within(card).getByLabelText('To'), { target: { value: '2026-09-30' } })
    const change = await within(card).findByRole('region', { name: 'Wealth change' })
    const row = within(change).getByText('Investment price changes').closest('li')!
    expect(row).toHaveTextContent('$1,500.00')
    expect(within(change).getByText('Income').closest('li')).toHaveTextContent('$0.00')
    expect(within(change).getByText('Spending').closest('li')).toHaveTextContent('$0.00')
  })

  it('V2_WEALTH_004 the change explanation names the account behind the price move, as the other lines do', async () => {
    mockApi(seed([price('2026-09-30', '130.00')], '21500.00'))
    renderRoute('/')
    const card = await screen.findByRole('region', { name: 'Wealth on a date' })
    fireEvent.change(within(card).getByLabelText('From'), { target: { value: '2026-09-01' } })
    fireEvent.change(within(card).getByLabelText('To'), { target: { value: '2026-09-30' } })
    const moves = await within(card).findByRole('list', { name: 'Price changes' })
    expect(moves).toHaveTextContent(
      'Redwood Brokerage price increase of $1,500.00, a price move rather than income or spending.',
    )
  })

  it('V2_ACCOUNT_LIFECYCLE_001 an archived account in the older-prices list carries its Archived label', async () => {
    const data = seed()
    mockApi({
      ...data,
      accounts: data.accounts.map((a) => (a.id === BROKERAGE ? { ...a, status: 'archived' } : a)),
    })
    renderRoute('/')
    const card = await screen.findByRole('region', { name: 'Wealth on a date' })
    fireEvent.change(within(card).getByLabelText('Show wealth on'), {
      target: { value: '2026-09-30' },
    })
    const note = await within(card).findByText(/Redwood Brokerage: prices last updated/)
    expect(note.closest('li')).toHaveTextContent('Archived')
  })

  it('V2_WEALTH_004 four accounts on older prices are a count and a folded list, not one long paragraph', async () => {
    const data = seed()
    const more = ['A', 'B', 'C'].map((letter, index) => {
      const id = `44444444-4444-4444-8444-44444444445${index}`
      return { id, account: make(id, 'brokerage', `Extra ${letter}`, '1000.00') }
    })
    mockApi({
      ...data,
      accounts: [...data.accounts, ...more.map((m) => m.account)],
      openings: {
        ...data.openings,
        ...Object.fromEntries(
          more.map((m) => [
            m.id,
            {
              total: '1000.00',
              cash: '500.00',
              blank: false,
              holdings: [{ symbol: 'HOME', quantity: '5', price: '100.00', valueOn: '2026-09-01' }],
              statementId: null,
            },
          ]),
        ),
      },
    })
    renderRoute('/')
    const card = await screen.findByRole('region', { name: 'Wealth on a date' })
    fireEvent.change(within(card).getByLabelText('Show wealth on'), {
      target: { value: '2026-09-30' },
    })
    expect(
      await within(card).findByText(/different dates: 4 investment accounts use prices/),
    ).toBeVisible()
    const details = card.querySelector('details')!
    expect(details).not.toHaveAttribute('open')
    expect(within(details).getByText('Show the accounts')).toBeVisible()
    expect(details).toHaveTextContent('Redwood Brokerage: prices last updated 2026-09-01')
    expect(details).toHaveTextContent('Extra C: prices last updated 2026-09-01')
  })
})
