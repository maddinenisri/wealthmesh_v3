import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { mockApi, type MockAccount } from '../../test/mockApi'
import type { MockOpening, MockPrice } from '../../test/mockInvestments'
import { renderRoute } from '../../test/render'

const household = { id: '11111111-1111-4111-8111-111111111111', name: 'Maya and Sam' }
const maya = {
  id: '22222222-2222-4222-8222-222222222222',
  householdId: household.id,
  name: 'Maya',
  label: null,
}
const sam = { ...maya, id: '33333333-3333-4333-8333-333333333333', name: 'Sam' }
const REDWOOD = '44444444-4444-4444-8444-444444444441'
const HARBOR = '44444444-4444-4444-8444-444444444442'
const WILLOW = '44444444-4444-4444-8444-444444444443'

beforeEach(() => window.localStorage.setItem('wealthmesh.enteringAs', maya.id))

const account = (
  id: string,
  type: string,
  name: string,
  balance: string,
  patch: Partial<MockAccount> = {},
): MockAccount => ({
  id,
  type,
  name,
  institution: 'Harbor Benefits',
  ownerMemberIds: [maya.id],
  openedOn: '2026-09-01',
  openingAmount: balance,
  balance: { amount: balance, asOf: '2026-09-30' },
  status: 'active',
  ...patch,
})

const opening = (
  cash: string,
  quantity: string,
  cost: string | undefined,
  patch: Partial<MockOpening> = {},
): MockOpening => ({
  total: null,
  cash,
  blank: false,
  holdings: [
    {
      symbol: 'HOME',
      quantity,
      price: '100.00',
      valueOn: '2026-09-01',
      ...(cost ? { cost } : {}),
    },
  ],
  statementId: null,
  ...patch,
})

const price: MockPrice = {
  id: 'p-1',
  accountId: REDWOOD,
  symbol: 'HOME',
  price: '110.00',
  valueOn: '2026-09-30',
  enteredByMemberId: maya.id,
  enteredByName: 'Maya',
  enteredAt: '2026-09-30T12:00:00.000Z',
  replacedAt: null,
  key: 'k-1',
}

// HOLDINGS_002 and 003: Redwood 16,000 cash and 50 HOME priced 110 (cost 4,500); Harbor 60,000 and 200 at 100 (cost
// 15,000); Willow 20,000 and 100 at 100 with the cost unknown.
const seed = (patch: Partial<MockAccount> = {}) => ({
  household,
  members: [maya, sam],
  accounts: [
    account(REDWOOD, 'brokerage', 'Redwood Brokerage', '21500.00'),
    account(HARBOR, '401k', 'Harbor 401k', '80000.00'),
    account(WILLOW, 'traditional_ira', 'Willow Traditional IRA', '30000.00', patch),
  ],
  openings: {
    [REDWOOD]: opening('16000.00', '50', '4500.00'),
    [HARBOR]: opening('60000.00', '200', '15000.00'),
    [WILLOW]: opening('20000.00', '100', undefined),
  },
  prices: [price],
  today: '2026-10-03',
})

describe('the whole investment group (HOLDINGS_002)', () => {
  it('V2_HOLDINGS_002 HOME across three accounts: shares, value, known cost and gain, coverage, the Balances and the share of the group', async () => {
    mockApi(seed())
    renderRoute('/investments')
    expect(await screen.findByRole('heading', { name: 'Investment holdings' })).toBeVisible()
    const summary = await screen.findByRole('region', { name: 'All investment accounts summary' })
    expect(summary).toHaveTextContent('$131,500.00')
    const accounts = within(summary).getByRole('list', { name: 'Investment accounts' })
    expect(within(accounts).getByText('Redwood Brokerage').closest('li')).toHaveTextContent(
      '$21,500.00',
    )
    expect(within(accounts).getByText('Harbor 401k').closest('li')).toHaveTextContent('$80,000.00')
    expect(within(accounts).getByText('Willow Traditional IRA').closest('li')).toHaveTextContent(
      '$30,000.00',
    )
    const detail = screen.getByRole('region', { name: 'Selected security' })
    expect(detail).toHaveTextContent('350 shares valued at $35,500.00 across 3 accounts.')
    expect(detail).toHaveTextContent('Known purchase cost$19,500.00 for 250 shares')
    expect(detail).toHaveTextContent('Known gain$6,000.00 for 250 shares')
    expect(detail).toHaveTextContent('Full purchase costNot available')
    expect(detail).toHaveTextContent('Full gainNot available')
    expect(detail).toHaveTextContent('Known-cost share coverage71.43%')
    expect(detail).toHaveTextContent('100 shares have unknown cost')
    expect(detail).toHaveTextContent(
      'HOME is 27.00% of the investment Balance of $131,500.00. That is a different measure from the known-cost share coverage above.',
    )
  })

  it('V2_HOLDINGS_002 each account keeps its own price: the 50 shares are at $110.00 on Sep 30, the others at $100.00', async () => {
    mockApi(seed())
    renderRoute('/investments')
    const list = await screen.findByRole('list', { name: 'HOME by account' })
    const redwood = within(list).getByText('Redwood Brokerage').closest('li')!
    expect(redwood).toHaveTextContent('50 shares at $110.00 on 2026-09-30')
    expect(redwood).toHaveTextContent('Purchase cost $4,500.00, gain $1,000.00')
    const harbor = within(list).getByText('Harbor 401k').closest('li')!
    expect(harbor).toHaveTextContent('200 shares at $100.00 on 2026-09-01')
    expect(harbor).toHaveTextContent('Purchase cost $15,000.00, gain $5,000.00')
    const willow = within(list).getByText('Willow Traditional IRA').closest('li')!
    expect(willow).toHaveTextContent(
      'Purchase cost unknown for all 100 shares. Full cost: Not available.',
    )
    // Each account can be opened from the list.
    expect(within(redwood).getByRole('link', { name: 'Redwood Brokerage' })).toHaveAttribute(
      'href',
      `/accounts/${REDWOOD}`,
    )
  })

  it('V2_HOLDINGS_002 an archived account stays in the group, labeled', async () => {
    mockApi(seed({ status: 'archived' }))
    renderRoute('/investments')
    const accounts = await screen.findByRole('list', { name: 'Investment accounts' })
    expect(within(accounts).getByText('Willow Traditional IRA').closest('li')).toHaveTextContent(
      'Archived',
    )
    const list = screen.getByRole('list', { name: 'HOME by account' })
    expect(within(list).getByText('Willow Traditional IRA').closest('li')).toHaveTextContent(
      'Archived',
    )
  })

  it('V2_HOLDINGS_002 a price recorded later changes the group read: Redwood at $120.00 makes HOME $36,000.00', async () => {
    mockApi({
      ...seed(),
      prices: [price, { ...price, id: 'p-2', valueOn: '2026-10-01', price: '120.00', key: 'k-2' }],
      accounts: seed().accounts.map((a) =>
        a.id === REDWOOD ? { ...a, balance: { amount: '22000.00', asOf: '2026-10-01' } } : a,
      ),
    })
    renderRoute('/investments')
    const detail = await screen.findByRole('region', { name: 'Selected security' })
    expect(detail).toHaveTextContent('350 shares valued at $36,000.00')
    expect(
      await screen.findByRole('region', { name: 'All investment accounts summary' }),
    ).toHaveTextContent('$132,000.00')
  })

  it('V2_HOLDINGS_002 the chooser is named by its label alone, comes before the long account list, and share counts have thousands separators', async () => {
    const data = seed()
    mockApi({
      ...data,
      openings: { ...data.openings, [HARBOR]: opening('60000.00', '2469.1356', '15000.00') },
    })
    renderRoute('/investments')
    const chooser = await screen.findByRole('combobox', { name: 'Choose a security' })
    const accounts = screen.getByRole('region', { name: 'All investment accounts summary' })
    expect(
      chooser.compareDocumentPosition(accounts) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Selected security' })).toHaveTextContent(
      '2,469.1356 shares at $100.00',
    )
  })

  it('V2_HOLDINGS_001 no completed investment account says so and shows no security', async () => {
    mockApi({ household, members: [maya, sam], accounts: [] })
    renderRoute('/investments')
    expect(await screen.findByText('No completed investment accounts')).toBeVisible()
    expect(screen.queryByRole('region', { name: 'Selected security' })).not.toBeInTheDocument()
  })

  it('V2_HOLDINGS_002 the Household page links to the group view', async () => {
    mockApi(seed())
    const { user } = renderRoute('/')
    await user.click(
      await screen.findByRole('link', { name: 'See investment holdings by security' }),
    )
    expect(await screen.findByRole('heading', { name: 'Investment holdings' })).toBeVisible()
  })
})

describe('the selected account beside the group (HOLDINGS_003)', () => {
  it('V2_HOLDINGS_003 Redwood shows its cash, holdings and Balance and HOME as 25.58% of its Balance, apart from the group total', async () => {
    mockApi(seed())
    renderRoute(`/accounts/${REDWOOD}`)
    const holdings = await screen.findByRole('region', { name: 'Holdings' })
    expect(holdings).toHaveTextContent('Cash$16,000.00')
    expect(holdings).toHaveTextContent('Holdings$5,500.00')
    expect(holdings).toHaveTextContent('Balance$21,500.00')
    expect(holdings).toHaveTextContent("HOME is 25.58% of this account's Balance")
    // Neither the selected heading nor its holdings list includes the other accounts.
    expect(holdings).not.toHaveTextContent('Harbor 401k')
    expect(holdings).not.toHaveTextContent('$131,500.00')
    expect(holdings).not.toHaveTextContent('Willow')
    const group = await screen.findByRole('region', {
      name: 'Whole investment group, separate from this account',
    })
    expect(group).toHaveTextContent('All investment accounts')
    expect(group).toHaveTextContent('3 investment accounts hold $131,500.00')
    expect(group).toHaveTextContent('This is the whole group, not this account.')
    expect(
      within(group).getByRole('link', { name: 'See investment holdings by security' }),
    ).toHaveAttribute('href', '/investments')
  })
})

describe('Wealth on a date shows debts', () => {
  it('V2_WEALTH_004 the card shows Debts beside Financial assets so Household wealth explains itself', async () => {
    mockApi({
      ...seed(),
      accounts: [
        ...seed().accounts,
        account('44444444-4444-4444-8444-444444444449', 'credit_card', 'Everyday Card', '-1000.00'),
      ],
    })
    renderRoute('/')
    const card = await screen.findByRole('region', { name: 'Wealth on a date' })
    fireEvent.change(within(card).getByLabelText('Show wealth on'), {
      target: { value: '2026-09-30' },
    })
    expect(await within(card).findByText(/Household wealth on 2026-09-30/)).toBeVisible()
    expect(within(card).getByText(/^Debts/)).toHaveTextContent('Debts $1,000.00')
    expect(
      within(card).getByText('Household wealth is financial assets minus debts.'),
    ).toBeVisible()
  })
})
