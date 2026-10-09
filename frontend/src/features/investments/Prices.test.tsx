import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockApi } from '../../test/mockApi'
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
const seed = { household, members: [maya, sam] }

beforeEach(() => window.localStorage.setItem('wealthmesh.enteringAs', maya.id))

const rows = [
  { type: 'brokerage', name: 'Redwood Brokerage', cost: '200.00', gain: '-$200.00' },
  { type: '401k', name: 'Harbor 401k', cost: '200.00', gain: '-$200.00' },
  { type: 'traditional_ira', name: 'Willow Traditional IRA', cost: '200.00', gain: '-$200.00' },
  { type: 'roth_ira', name: 'Willow Roth IRA', cost: '200.00', gain: '-$200.00' },
  { type: 'hsa', name: 'Meadow HSA', cost: '200.00', gain: '-$200.00' },
  { type: 'hsa', name: 'Meadow HSA Unknown Cost', cost: null, gain: null },
] as const

const accountOf = (type: string, name: string, id: string, status = 'active') => ({
  id,
  type,
  name,
  institution: null,
  ownerMemberIds: [maya.id],
  openedOn: '2026-09-01',
  openingAmount: '2000.00',
  balance: { amount: '2000.00', asOf: '2026-09-01' },
  status: status as 'active',
})

const openingOf = (cost: string | null): MockOpening => ({
  total: '2000.00',
  cash: '1000.00',
  blank: false,
  holdings: [{ symbol: 'HOME', quantity: '10', price: '100.00', valueOn: '2026-09-01', cost }],
  statementId: null,
})

type User = ReturnType<typeof renderRoute>['user']

async function fillPrice(user: User, price: string, on: string) {
  await user.click(await screen.findByRole('button', { name: 'Record a price' }))
  await screen.findByRole('heading', { name: /Record a price for/ })
  await user.type(screen.getByLabelText('Market price'), price)
  fireEvent.change(screen.getByLabelText('Price date'), { target: { value: on } })
}

describe.each(
  rows.map((row, index) => ({ row, id: `44444444-4444-4444-8444-44444444444${index}` })),
)('$row.name price', ({ row, id }) => {
  const account = accountOf(row.type, row.name, id)
  const seeded = () => ({ ...seed, accounts: [account], openings: { [id]: openingOf(row.cost) } })

  it('V2_HOLDINGS_008 a known $0.00 price is reviewed with the zero highlighted, saved, and the Balance equals cash', async () => {
    const api = mockApi(seeded())
    const { user } = renderRoute(`/accounts/${id}`)
    await fillPrice(user, '0', '2026-09-30')
    await user.click(screen.getByRole('button', { name: 'Review price' }))
    const heading = await screen.findByRole('heading', { name: /Review the HOME price/ })
    const review = heading.closest('section')!
    // The zero is highlighted and says the shares remain recorded.
    expect(within(review).getByRole('note')).toHaveTextContent('HOME will be worth $0.00')
    expect(within(review).getByRole('note')).toHaveTextContent('Your 10 shares stay recorded')
    expect(review).toHaveTextContent('$1,000.00')
    expect(review).toHaveTextContent('$2,000.00')
    // The review wrote nothing.
    expect(api.requests.filter((r) => r.startsWith('POST') && !r.endsWith('/review'))).toHaveLength(
      0,
    )
    await user.click(within(review).getByRole('button', { name: 'Confirm price' }))

    // The sentence says what changed and takes focus; the one Balance equals cash.
    const status = await screen.findByText(
      `HOME is priced at 0.00 on 2026-09-30. ${row.name}'s Balance is $1,000.00 as of 2026-09-30.`,
    )
    expect(status).toHaveAttribute('role', 'status')
    await vi.waitFor(() => expect(status).toHaveFocus())
    const card = await screen.findByRole('region', { name: 'Holdings' })
    await vi.waitFor(() =>
      expect(
        within(card).getByText('Balance', { selector: 'dt' }).nextElementSibling,
      ).toHaveTextContent('$1,000.00 dated 2026-09-30'),
    )
    const dd = (label: string) =>
      within(card).getByText(label, { selector: 'dt' }).nextElementSibling
    expect(dd('Cash')).toHaveTextContent('$1,000.00')
    expect(dd('Holdings')).toHaveTextContent('$0.00')
    expect(dd('Shares')).toHaveTextContent('10')
    // Cost is unchanged; a missing cost still says Not available, never zero.
    // The account and the security both keep the cost; a missing cost still says Not available, never zero.
    for (const label of within(card).getAllByText('Purchase cost', { selector: 'dt' }))
      expect(label.nextElementSibling).toHaveTextContent(row.cost ? '$200.00' : 'Not available')
    for (const label of within(card).getAllByText('Gain', { selector: 'dt' }))
      expect(label.nextElementSibling).toHaveTextContent(row.gain ?? 'Not available')
    const prices = await screen.findByRole('list', { name: 'Recorded prices' })
    expect(prices).toHaveTextContent('HOME $0.00 for 2026-09-30')
    expect(prices).toHaveTextContent('Entered by Maya')
  })
})

describe('record a price', () => {
  const id = '44444444-4444-4444-8444-444444444440'
  const account = accountOf('brokerage', 'Redwood Brokerage', id)
  const base = () => ({ ...seed, accounts: [account], openings: { [id]: openingOf(null) } })

  it('V2_HOLDINGS_008 Back returns to the form with its values and focus on its heading, and clears a save error', async () => {
    mockApi(base())
    const { user } = renderRoute(`/accounts/${id}`)
    await fillPrice(user, '130', '2026-09-30')
    await user.click(screen.getByRole('button', { name: 'Review price' }))
    await screen.findByRole('heading', { name: /Review the HOME price/ })
    await user.click(screen.getByRole('button', { name: 'Back' }))
    const form = await screen.findByRole('heading', { name: /Record a price for/ })
    await vi.waitFor(() => expect(form).toHaveFocus())
    expect(screen.getByLabelText('Market price')).toHaveValue('130')
    expect(screen.getByLabelText('Price date')).toHaveValue('2026-09-30')
  })

  it('V2_HOLDINGS_008 Cancel saves nothing and returns focus to the Record a price button', async () => {
    const api = mockApi(base())
    const { user } = renderRoute(`/accounts/${id}`)
    await fillPrice(user, '130', '2026-09-30')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    const opener = await screen.findByRole('button', { name: 'Record a price' })
    await vi.waitFor(() => expect(opener).toHaveFocus())
    expect(api.requests.filter((r) => r.startsWith('POST'))).toHaveLength(0)
    expect(screen.queryByText(/is priced at/)).not.toBeInTheDocument()
  })

  it('V2_HOLDINGS_008 a price older than the opening price date is refused in the review, with its message, and nothing is saved', async () => {
    const dated = {
      ...base(),
      openings: {
        [id]: {
          ...openingOf(null),
          holdings: [
            { symbol: 'HOME', quantity: '10', price: '100.00', valueOn: '2026-09-20', cost: null },
          ],
        },
      },
    }
    const api = mockApi(dated)
    const { user } = renderRoute(`/accounts/${id}`)
    await fillPrice(user, '130', '2026-09-10')
    await user.click(screen.getByRole('button', { name: 'Review price' }))
    expect(
      await screen.findByText(
        "HOME's opening price is dated 2026-09-20; record a price on or after it",
      ),
    ).toBeVisible()
    expect(api.requests.filter((r) => r.startsWith('POST') && !r.endsWith('/review'))).toHaveLength(
      0,
    )
  })

  it('V2_HOLDINGS_008 a negative price and a date before setup are refused at their fields and nothing is sent', async () => {
    const api = mockApi(base())
    const { user } = renderRoute(`/accounts/${id}`)
    await fillPrice(user, '-1', '2026-08-31')
    await user.click(screen.getByRole('button', { name: 'Review price' }))
    expect(await screen.findByText('Holding market price must be zero or greater')).toBeVisible()
    expect(
      screen.getByText(
        'Review the earlier tracking start before saving. The Setup date is 2026-09-01.',
      ),
    ).toBeVisible()
    expect(api.requests.filter((r) => r.startsWith('POST'))).toHaveLength(0)
  })

  it('V2_HOLDINGS_008 Q-070 an archived account offers no Record a price, and says why', async () => {
    mockApi({ ...base(), accounts: [{ ...account, status: 'archived' as const }] })
    renderRoute(`/accounts/${id}`)
    expect(
      await screen.findByText(/is archived, so no price can be recorded until it is active/),
    ).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Record a price' })).not.toBeInTheDocument()
  })

  it('Q-069 a second price for the same date replaces the first: the history keeps it, marked Replaced, with who and when; the Balance history keeps the older Balance', async () => {
    const earlier: MockPrice = {
      id: 'p-1',
      accountId: id,
      symbol: 'HOME',
      price: '130.00',
      valueOn: '2026-09-30',
      enteredByMemberId: sam.id,
      enteredByName: 'Sam',
      enteredAt: '2026-10-01T10:00:00.000Z',
      replacedAt: null,
      key: 'k-1',
    }
    mockApi({
      ...base(),
      accounts: [{ ...account, balance: { amount: '2300.00', asOf: '2026-09-30' } }],
      prices: [earlier],
    })
    const { user } = renderRoute(`/accounts/${id}`)
    await fillPrice(user, '140', '2026-09-30')
    await user.click(screen.getByRole('button', { name: 'Review price' }))
    const heading = await screen.findByRole('heading', { name: /Review the HOME price/ })
    expect(heading.closest('section')).toHaveTextContent(
      'It replaces the 130.00 price for this date that Sam recorded',
    )
    await user.click(screen.getByRole('button', { name: 'Confirm price' }))
    await screen.findByText(/HOME is priced at 140.00 on 2026-09-30/)
    const list = await screen.findByRole('list', { name: 'Recorded prices' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('HOME $140.00 for 2026-09-30')
    expect(items[0]).not.toHaveTextContent('Replaced')
    expect(items[1]).toHaveTextContent('HOME $130.00 for 2026-09-30')
    expect(items[1]).toHaveTextContent('Replaced')
    expect(items[1]).toHaveTextContent('Entered by Sam')
    expect(items[1]).toHaveTextContent('replaced on')
    const history = screen.getByRole('region', { name: 'Balance history' })
    expect(history).toHaveTextContent('2026-09-01 $2,000.00')
    expect(history).toHaveTextContent('2026-09-30 $2,400.00')
  })
})
