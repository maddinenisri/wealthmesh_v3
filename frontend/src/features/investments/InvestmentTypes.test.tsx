import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { mockApi } from '../../test/mockApi'
import { renderRoute } from '../../test/render'

const para = (text: string) => (_: string, element: Element | null) =>
  element?.tagName === 'P' && element.textContent === text

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

/** Each type as its feature file words it (slice 17b); `ids` are the scenario IDs it cites. */
const types = [
  {
    ids: 'V2_401K_002 V2_401K_003 V2_401K_005 V2_401K_006',
    wire: '401k',
    option: '401(k)',
    noun: '401(k)',
    name: 'Harbor 401k',
    institution: 'Harbor Benefits',
    owner: 'Sam',
    total: '80000',
    shares: '200',
  },
  {
    ids: 'V2_HSA_002 V2_HSA_003 V2_HSA_005 V2_HSA_006',
    wire: 'hsa',
    option: 'Health savings account (HSA)',
    noun: 'HSA',
    name: 'Meadow HSA',
    institution: 'Meadow Health Savings',
    owner: 'Maya',
    total: '3050',
    shares: '20',
  },
  {
    ids: 'V2_ROTH_IRA_002 V2_ROTH_IRA_003 V2_ROTH_IRA_005 V2_ROTH_IRA_006',
    wire: 'roth_ira',
    option: 'Roth IRA',
    noun: 'Roth IRA',
    name: 'Willow Roth IRA',
    institution: 'Willow Investments',
    owner: 'Maya',
    total: '6000',
    shares: '50',
  },
  {
    ids: 'V2_TRAD_IRA_002 V2_TRAD_IRA_003 V2_TRAD_IRA_005 V2_TRAD_IRA_006',
    wire: 'traditional_ira',
    option: 'Traditional IRA',
    noun: 'Traditional IRA',
    name: 'Willow Traditional IRA',
    institution: 'Willow Investments',
    owner: 'Maya',
    total: '30000',
    shares: '100',
  },
]
type Type = (typeof types)[number]
type User = ReturnType<typeof renderRoute>['user']

async function fill(
  user: User,
  type: Type,
  fields: { total?: string; cash?: string; holdings?: string[][] } = {},
) {
  await user.selectOptions(await screen.findByLabelText('Account type'), type.wire)
  await user.type(screen.getByLabelText('Account name'), type.name)
  await user.type(screen.getByLabelText('Institution'), type.institution)
  await user.click(screen.getByRole('checkbox', { name: type.owner }))
  fireEvent.change(screen.getByLabelText('Setup date'), { target: { value: '2026-09-01' } })
  if (fields.total) await user.type(screen.getByLabelText('Opening total'), fields.total)
  if (fields.cash) await user.type(screen.getByLabelText('Cash'), fields.cash)
  for (const [index, [symbol, quantity, price, on]] of (fields.holdings ?? []).entries()) {
    const n = index + 1
    await user.click(screen.getByRole('button', { name: 'Add a holding' }))
    await user.type(screen.getByLabelText(`Holding ${n} name or symbol`), symbol)
    await user.type(screen.getByLabelText(`Holding ${n} quantity`), quantity)
    await user.type(screen.getByLabelText(`Holding ${n} market price`), price)
    if (on)
      fireEvent.change(screen.getByLabelText(`Holding ${n} value date`), { target: { value: on } })
  }
}

describe.each(types)('$option setup', (type) => {
  it(`${type.ids} the type is offered, and the form uses an institution, a setup date, an opening total and cash`, async () => {
    mockApi(seed)
    const { user } = renderRoute('/accounts/new')
    const chooser = await screen.findByLabelText('Account type')
    expect(within(chooser).getByRole('option', { name: type.option })).toBeEnabled()
    await user.selectOptions(chooser, type.wire)
    for (const label of ['Institution', 'Setup date', 'Opening total', 'Cash']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
    expect(screen.queryByLabelText('Bank')).not.toBeInTheDocument()
  })

  it(`${type.ids} a blank setup is reviewed at $0.00, saved by Confirm, and the account says no starting amount was entered`, async () => {
    const api = mockApi(seed)
    const { user } = renderRoute('/accounts/new')
    await fill(user, type)
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(await screen.findByRole('heading', { name: `Review new ${type.noun}` })).toBeVisible()
    expect(screen.getByText(para(`${type.name} will start at $0.00 on 2026-09-01.`))).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(
      await screen.findByText(`${type.name} is set up with a Balance of $0.00 as of 2026-09-01.`),
    ).toHaveAttribute('role', 'status')
    expect(await screen.findByText(/No starting amount was entered/)).toBeVisible()
    expect(screen.getByText(`${type.noun} account`)).toBeVisible()
    expect(api.accounts[0]).toMatchObject({ type: type.wire, status: 'active' })
  })

  it(`${type.ids} an incomplete setup is a draft: the review asks for the cash, Cancel asks once and leaves no account`, async () => {
    const api = mockApi(seed)
    const { user } = renderRoute('/accounts/new')
    await fill(user, type, { total: type.total, holdings: [['HOME', type.shares, '100']] })
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(
      await screen.findByText(new RegExp(`${type.name} will be saved as a draft`)),
    ).toBeVisible()
    expect(screen.getByText('Not answered yet', { selector: 'dd' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(
      await screen.findByText(
        new RegExp(`${type.name} is saved as a draft\\. It needs the opening cash`),
      ),
    ).toBeVisible()
    expect(api.accounts[0]).toMatchObject({ type: type.wire, status: 'draft' })
    expect(await screen.findByText(/Draft saved by Maya/)).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Cancel draft' }))
    const ask = await screen.findByRole('region', { name: 'Cancel this draft?' })
    expect(api.accounts).toHaveLength(1)
    await user.click(within(ask).getByRole('button', { name: 'Discard draft' }))
    expect(
      await screen.findByText(
        `${type.name} draft is cancelled and removed. Nothing was added to household wealth.`,
      ),
    ).toBeVisible()
    expect(api.accounts).toHaveLength(0)
  })

  it(`${type.ids} an early holding value date names the setup date; a zero share count is refused at its field`, async () => {
    const api = mockApi(seed)
    const { user } = renderRoute('/accounts/new')
    await fill(user, type, { cash: '1', holdings: [['HOME', '0', '100', '2026-08-31']] })
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(await screen.findByText('Enter more than zero shares')).toBeVisible()
    expect(
      screen.getByText(
        'Review the earlier tracking start before saving. The Setup date is 2026-09-01.',
      ),
    ).toBeVisible()
    expect(api.requests.filter((r) => r.startsWith('POST'))).toHaveLength(0)
  })

  it(`${type.ids} a total that does not match cash plus holdings is shown and cannot be confirmed`, async () => {
    const api = mockApi(seed)
    const { user } = renderRoute('/accounts/new')
    await fill(user, type, {
      total: type.total,
      cash: '100',
      holdings: [['HOME', '1', '100']],
    })
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'does not match cash plus holdings $200.00',
    )
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
    expect(api.accounts).toHaveLength(0)
  })
})

describe('the four types in the lists', () => {
  const accounts = types.map((type, index) => ({
    id: `44444444-4444-4444-8444-44444444444${index}`,
    type: type.wire,
    name: type.name,
    institution: type.institution,
    ownerMemberIds: [maya.id],
    openedOn: '2026-09-01',
    openingAmount: '500.00',
    balance: { amount: '500.00', asOf: '2026-09-01' },
    status: 'active' as const,
  }))
  const openings = Object.fromEntries(
    accounts.map((account) => [
      account.id,
      {
        total: '500.00',
        cash: '400.00',
        blank: false,
        holdings: [{ symbol: 'HOME', quantity: '1', price: '100.00', valueOn: '2026-09-01' }],
        statementId: null,
      },
    ]),
  )

  it(`${types.map((type) => type.ids).join(' ')} the Accounts list names each type and the Household page counts them under Investments`, async () => {
    mockApi({ ...seed, accounts, openings })
    renderRoute('/accounts')
    for (const type of types) {
      const row = (await screen.findByRole('link', { name: type.name })).closest('tr')!
      expect(row).toHaveTextContent(type.option)
    }
  })

  it(`${types.map((type) => type.ids).join(' ')} the Household page lists the four under Investments with a total that adds up`, async () => {
    mockApi({ ...seed, accounts, openings })
    renderRoute('/')
    const group = await screen.findByRole('region', { name: 'Investments' })
    expect(group).toHaveTextContent('$2,000.00')
    for (const type of types) expect(within(group).getByText(type.name)).toBeVisible()
  })
})
