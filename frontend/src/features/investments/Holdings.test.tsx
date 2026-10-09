import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockApi } from '../../test/mockApi'
import { renderRoute } from '../../test/render'

const household = { id: '11111111-1111-4111-8111-111111111111', name: 'Maya and Sam' }
const maya = {
  id: '22222222-2222-4222-8222-222222222222',
  householdId: household.id,
  name: 'Maya',
  label: null,
}
const sam = { ...maya, id: '33333333-3333-4333-8333-333333333333', name: 'Sam' }
const seed = { household, members: [maya, sam] }

beforeEach(() => window.localStorage.setItem('wealthmesh.enteringAs', maya.id))

/** Each type as its feature file words it (slice 19a); `ids` are the scenario IDs it cites. */
const types = [
  {
    ids: 'V2_BROKERAGE_001',
    wire: 'brokerage',
    noun: 'brokerage',
    name: 'Redwood Brokerage',
    institution: 'Redwood Investments',
    total: '20000.00',
    cash: '15000.00',
    shares: '50',
    holdings: '5000.00',
  },
  {
    ids: 'V2_401K_001',
    wire: '401k',
    noun: '401(k)',
    name: 'Harbor 401k',
    institution: 'Harbor Benefits',
    total: '80000.00',
    cash: '60000.00',
    shares: '200',
    holdings: '20000.00',
  },
  {
    ids: 'V2_HSA_001',
    wire: 'hsa',
    noun: 'HSA',
    name: 'Meadow HSA',
    institution: 'Meadow Health Savings',
    total: '3050.00',
    cash: '1050.00',
    shares: '20',
    holdings: '2000.00',
  },
  {
    ids: 'V2_ROTH_IRA_001',
    wire: 'roth_ira',
    noun: 'Roth IRA',
    name: 'Willow Roth IRA',
    institution: 'Willow Investments',
    total: '6000.00',
    cash: '1000.00',
    shares: '50',
    holdings: '5000.00',
  },
  {
    ids: 'V2_TRAD_IRA_001',
    wire: 'traditional_ira',
    noun: 'Traditional IRA',
    name: 'Willow Traditional IRA',
    institution: 'Willow Investments',
    total: '30000.00',
    cash: '20000.00',
    shares: '100',
    holdings: '10000.00',
  },
]

const dollars = (text: string) =>
  Number(text).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

const accountOf = (type: (typeof types)[number], index: number) => ({
  id: `44444444-4444-4444-8444-44444444444${index}`,
  type: type.wire,
  name: type.name,
  institution: type.institution,
  ownerMemberIds: [maya.id],
  openedOn: '2026-09-01',
  openingAmount: type.total,
  balance: { amount: type.total, asOf: '2026-09-01' },
  status: 'active' as const,
})

const openingOf = (type: (typeof types)[number]) => ({
  total: type.total,
  cash: type.cash,
  blank: false,
  holdings: [{ symbol: 'HOME', quantity: type.shares, price: '100.00', valueOn: '2026-09-01' }],
  statementId: null,
})

describe.each(types.map((type, index) => ({ type, index })))(
  '$type.name holdings',
  ({ type, index }) => {
    const account = accountOf(type, index)

    it(`${type.ids} the detail shows cash, holdings and the one Balance dated 2026-09-01, and cost and gain say Not available`, async () => {
      mockApi({ ...seed, accounts: [account], openings: { [account.id]: openingOf(type) } })
      renderRoute(`/accounts/${account.id}`)
      const card = await screen.findByRole('region', { name: 'Holdings' })
      await within(card).findByText('HOME')
      const figure = (label: string) =>
        within(card).getByText(label, { selector: 'dt' }).nextElementSibling
      expect(figure('Cash')).toHaveTextContent(dollars(type.cash))
      expect(figure('Holdings')).toHaveTextContent(dollars(type.holdings))
      expect(figure('Value')).toHaveTextContent(dollars(type.holdings))
      const balance = within(card).getByText('Balance', { selector: 'dt' }).nextElementSibling!
      expect(balance).toHaveTextContent(`${dollars(type.total)} dated 2026-09-01`)
      // The whole-account lines and the security's own both say Not available, never $0.00.
      const costs = within(card).getAllByText('Purchase cost', { selector: 'dt' })
      expect(costs).toHaveLength(2)
      for (const label of costs) expect(label.nextElementSibling).toHaveTextContent('Not available')
      for (const label of within(card).getAllByText('Gain', { selector: 'dt' }))
        expect(label.nextElementSibling).toHaveTextContent('Not available')
      expect(card).not.toHaveTextContent('$0.00')
    })

    it(`${type.ids} the list and the Household page show the same Balance and date`, async () => {
      mockApi({ ...seed, accounts: [account], openings: { [account.id]: openingOf(type) } })
      renderRoute('/accounts')
      const row = (await screen.findByRole('link', { name: type.name })).closest('tr')!
      expect(row).toHaveTextContent(dollars(type.total))
      expect(row).toHaveTextContent('as of 2026-09-01')
    })

    it(`${type.ids} the Household page names the date the prices were last updated beside the account`, async () => {
      mockApi({ ...seed, accounts: [account], openings: { [account.id]: openingOf(type) } })
      renderRoute('/')
      const group = await screen.findByRole('region', { name: 'Investments' })
      const item = (await within(group).findByText(type.name)).closest('li')!
      expect(item).toHaveTextContent(dollars(type.total))
      // One date phrase: the opening price date is the latest price, so "Balance dated" is not shown beside it (19b).
      expect(item).toHaveTextContent('Prices last updated 2026-09-01')
      expect(item).not.toHaveTextContent('Balance dated')
      expect(item).not.toHaveTextContent('Value dated')
    })
  },
)

describe('opening cost', () => {
  async function openForm(user: ReturnType<typeof renderRoute>['user']) {
    await user.selectOptions(await screen.findByLabelText('Account type'), 'hsa')
    await user.type(screen.getByLabelText('Account name'), 'Meadow HSA')
    await user.type(screen.getByLabelText('Institution'), 'Meadow Health Savings')
    await user.click(screen.getByRole('radio', { name: 'Maya' }))
    fireEvent.change(screen.getByLabelText('Setup date'), { target: { value: '2026-09-01' } })
    await user.type(screen.getByLabelText('Cash'), '500')
  }

  async function addHolding(
    user: ReturnType<typeof renderRoute>['user'],
    n: number,
    fields: { quantity: string; cost?: string },
  ) {
    await user.click(screen.getByRole('button', { name: 'Add a holding' }))
    await user.type(screen.getByLabelText(`Holding ${n} name or symbol`), 'CARE')
    await user.type(screen.getByLabelText(`Holding ${n} quantity`), fields.quantity)
    await user.type(screen.getByLabelText(`Holding ${n} market price`), '250')
    fireEvent.change(screen.getByLabelText(`Holding ${n} value date`), {
      target: { value: '2026-09-30' },
    })
    if (fields.cost)
      await user.type(screen.getByLabelText(`Holding ${n} purchase cost`), fields.cost)
  }

  it('V2_HOLDINGS_004 a cost typed on one of two lines is saved on that line only, and the page shows the known 2 of 14', async () => {
    const api = mockApi(seed)
    const { user } = renderRoute('/accounts/new')
    await openForm(user)
    await addHolding(user, 1, { quantity: '2', cost: '400' })
    await addHolding(user, 2, { quantity: '12' })
    await user.click(screen.getByRole('button', { name: 'Review' }))
    const review = await screen.findByRole('heading', { name: 'Review new HSA' })
    expect(review).toBeVisible()
    const rows = screen.getAllByRole('row')
    // The line with a cost shows it and its gain; the other says Not available, never $0.00.
    expect(rows[1]).toHaveTextContent('$400.00')
    expect(rows[1]).toHaveTextContent('$100.00')
    expect(rows[2]).toHaveTextContent('Not available')
    expect(rows[2]).not.toHaveTextContent('$0.00')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(await screen.findByRole('region', { name: 'Holdings' })).toBeVisible()
    const saved = [...api.openings.values()][0]
    expect(saved.holdings.map((line) => line.cost)).toEqual(['400.00', null])
    const card = screen.getByRole('region', { name: 'Holdings' })
    const care = await within(card).findByRole('region', { name: 'CARE' })
    expect(care).toHaveTextContent('The cost is known for 2 of 14 shares (14.29% of the shares)')
    expect(care).toHaveTextContent('worth $500.00, cost $400.00 and show a gain of $100.00')
    expect(within(care).getByText('$3,500.00', { selector: 'dd' })).toBeVisible()
    // Cowork 19a: a partly known cost must not read as "Purchase cost: Not available" above a known $400.00.
    expect(within(care).queryByText('Purchase cost', { selector: 'dt' })).not.toBeInTheDocument()
    expect(
      within(care).getByText('Full purchase cost', { selector: 'dt' }).nextElementSibling,
    ).toHaveTextContent('Not available')
    expect(
      within(care).getByText('Full gain', { selector: 'dt' }).nextElementSibling,
    ).toHaveTextContent('Not available')
    // The whole-account figures are the full ones too: one for CARE, one for the account.
    expect(within(card).getAllByText('Full purchase cost', { selector: 'dt' })).toHaveLength(2)
    expect(within(card).getByText('$4,000.00')).toBeVisible()
  })

  it('V2_HSA_001 the review of a one-owner type says Owner, not Owners, and the cost field is not pre-filled with 0.00', async () => {
    mockApi(seed)
    const { user } = renderRoute('/accounts/new')
    await openForm(user)
    await addHolding(user, 1, { quantity: '2' })
    expect(screen.getByLabelText('Holding 1 purchase cost')).toHaveAttribute(
      'placeholder',
      'Unknown',
    )
    await user.click(screen.getByRole('button', { name: 'Review' }))
    await screen.findByRole('heading', { name: 'Review new HSA' })
    expect(screen.getByText(/Owner: Maya\./)).toBeVisible()
    expect(screen.queryByText(/Owners:/)).not.toBeInTheDocument()
  })

  it('V2_HOLDINGS_004 a negative cost is refused at its field and nothing is sent', async () => {
    const api = mockApi(seed)
    const { user } = renderRoute('/accounts/new')
    await openForm(user)
    await addHolding(user, 1, { quantity: '2', cost: '-5' })
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(await screen.findByText('Purchase cost must be zero or greater')).toBeVisible()
    expect(api.requests.filter((r) => r.startsWith('POST'))).toHaveLength(0)
  })

  it('V2_HOLDINGS_004 a cost left blank is unknown, not zero: the review says Not available', async () => {
    mockApi(seed)
    const { user } = renderRoute('/accounts/new')
    await openForm(user)
    await addHolding(user, 1, { quantity: '2' })
    await user.click(screen.getByRole('button', { name: 'Review' }))
    await screen.findByRole('heading', { name: 'Review new HSA' })
    const row = screen.getAllByRole('row')[1]
    expect(row).toHaveTextContent('Not available')
    expect(row).not.toHaveTextContent('$0.00')
  })
})

describe('opening cost, focus and Finish setup', () => {
  async function form(user: ReturnType<typeof renderRoute>['user']) {
    await user.selectOptions(await screen.findByLabelText('Account type'), 'hsa')
    await user.type(screen.getByLabelText('Account name'), 'Meadow HSA')
    await user.type(screen.getByLabelText('Institution'), 'Meadow Health Savings')
    await user.click(screen.getByRole('radio', { name: 'Maya' }))
    await user.type(screen.getByLabelText('Cash'), '500')
  }

  it('V2_HOLDINGS_004 Add a holding puts focus on the new holding name, and a second Add moves it to the second', async () => {
    mockApi(seed)
    const { user } = renderRoute('/accounts/new')
    await form(user)
    await user.click(screen.getByRole('button', { name: 'Add a holding' }))
    await vi.waitFor(() => expect(screen.getByLabelText('Holding 1 name or symbol')).toHaveFocus())
    await user.click(screen.getByRole('button', { name: 'Add a holding' }))
    await vi.waitFor(() => expect(screen.getByLabelText('Holding 2 name or symbol')).toHaveFocus())
  })

  it('V2_HOLDINGS_004 a negative cost is refused at its field: the field has focus and is marked invalid', async () => {
    mockApi(seed)
    const { user } = renderRoute('/accounts/new')
    await form(user)
    await user.click(screen.getByRole('button', { name: 'Add a holding' }))
    await user.type(screen.getByLabelText('Holding 1 name or symbol'), 'CARE')
    await user.type(screen.getByLabelText('Holding 1 quantity'), '2')
    await user.type(screen.getByLabelText('Holding 1 market price'), '250')
    await user.type(screen.getByLabelText('Holding 1 purchase cost'), '-5')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    const cost = await screen.findByLabelText('Holding 1 purchase cost')
    await vi.waitFor(() => expect(cost).toHaveFocus())
    expect(cost).toHaveAttribute('aria-invalid', 'true')
  })

  it('V2_HOLDINGS_004 Finish setup on a draft starts from the cost the draft kept', async () => {
    const draft = {
      ...accountOf(types[2], 7),
      status: 'draft' as const,
      openingAmount: '0.00',
      balance: { amount: '0.00', asOf: '2026-09-01' },
    }
    mockApi({
      ...seed,
      accounts: [draft],
      openings: {
        [draft.id]: {
          total: '1500.00',
          cash: null,
          blank: false,
          holdings: [
            {
              symbol: 'CARE',
              quantity: '4',
              price: '100.00',
              valueOn: '2026-09-01',
              cost: '300.00',
            },
          ],
          statementId: null,
        },
      },
    })
    const { user } = renderRoute(`/accounts/${draft.id}`)
    await user.click(await screen.findByRole('button', { name: 'Finish setup' }))
    expect(await screen.findByLabelText('Holding 1 purchase cost')).toHaveValue('300.00')
  })
})
