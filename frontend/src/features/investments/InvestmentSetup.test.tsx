import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockApi, type MockAccount } from '../../test/mockApi'
import type { MockOpening } from '../../test/mockInvestments'
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
const ID = '44444444-4444-4444-8444-444444444444'
const STATEMENT = '55555555-5555-4555-8555-555555555555'

const brokerage = (patch: Partial<MockAccount> = {}): MockAccount => ({
  id: ID,
  type: 'brokerage',
  name: 'Redwood Brokerage',
  institution: 'Harbor Benefits',
  ownerMemberIds: [sam.id],
  openedOn: '2026-09-01',
  openingAmount: '20000.00',
  balance: { amount: '20000.00', asOf: '2026-09-01' },
  status: 'active',
  ...patch,
})
const opened: MockOpening = {
  total: '20000.00',
  cash: '15000.00',
  blank: false,
  holdings: [{ symbol: 'HOME', quantity: '50', price: '100.00', valueOn: '2026-09-01' }],
  statementId: null,
}
const draftOpening: MockOpening = {
  total: '80000.00',
  cash: null,
  blank: false,
  holdings: [{ symbol: 'HOME', quantity: '200', price: '100.00', valueOn: '2026-09-01' }],
  statementId: null,
}
const draftAccount = () =>
  brokerage({
    status: 'draft',
    openingAmount: '0.00',
    balance: { amount: '0.00', asOf: '2026-09-01' },
  })

beforeEach(() => window.localStorage.setItem('wealthmesh.enteringAs', maya.id))

type User = ReturnType<typeof renderRoute>['user']

/** Fills the investment setup form; `holdings` are [symbol, quantity, price, value date]. */
async function fill(
  user: User,
  fields: { total?: string; cash?: string; holdings?: string[][] } = {},
  name = 'Redwood Brokerage',
) {
  await user.selectOptions(await screen.findByLabelText('Account type'), 'brokerage')
  await user.type(screen.getByLabelText('Account name'), name)
  await user.type(screen.getByLabelText('Institution'), 'Harbor Benefits')
  await user.click(screen.getByRole('checkbox', { name: 'Sam' }))
  fireEvent.change(screen.getByLabelText('Setup date'), { target: { value: '2026-09-01' } })
  if (fields.total) await user.type(screen.getByLabelText('Opening total'), fields.total)
  if (fields.cash) await user.type(screen.getByLabelText('Cash'), fields.cash)
  const holdings = fields.holdings ?? []
  for (const [index, [symbol, quantity, price, on]] of holdings.entries()) {
    const n = index + 1
    await user.click(screen.getByRole('button', { name: 'Add a holding' }))
    await user.type(screen.getByLabelText(`Holding ${n} name or symbol`), symbol)
    await user.type(screen.getByLabelText(`Holding ${n} quantity`), quantity)
    await user.type(screen.getByLabelText(`Holding ${n} market price`), price)
    if (on)
      fireEvent.change(screen.getByLabelText(`Holding ${n} value date`), { target: { value: on } })
  }
}

describe('setting up a brokerage', () => {
  it('V2_BROKERAGE_002 the form speaks of an institution, a setup date, an opening total, cash and holdings', async () => {
    mockApi(seed)
    const { user } = renderRoute('/accounts/new')
    await user.selectOptions(await screen.findByLabelText('Account type'), 'brokerage')
    expect(
      within(screen.getByLabelText('Account type')).getByRole('option', { name: 'Brokerage' }),
    ).toBeEnabled()
    for (const label of ['Institution', 'Setup date', 'Opening total', 'Cash']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
    expect(screen.getByRole('heading', { name: 'Holdings' })).toBeVisible()
    expect(screen.queryByLabelText('Bank')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Balance')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Opened on')).not.toBeInTheDocument()
  })

  it('V2_BROKERAGE_002 Review with nobody chosen as entering asks who is setting up and sends nothing', async () => {
    window.localStorage.removeItem('wealthmesh.enteringAs')
    const api = mockApi(seed)
    const { user } = renderRoute('/accounts/new')
    await fill(user)
    expect(screen.getByLabelText('Entered by')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Review' }))
    const alert = await screen.findByText('Choose who is setting up this account')
    expect(alert).toHaveAttribute('role', 'alert')
    await vi_waitFocus(screen.getByLabelText('Entered by'))
    expect(api.requests).not.toContain('POST /api/v1/accounts/opening-preview')
    // The message reads as an error (red), like every other refusal.
    expect(alert).toHaveClass('text-negative')
    await user.selectOptions(screen.getByLabelText('Entered by'), 'Maya')
    // The chooser turns into "Entered by: Maya (Change)": focus goes to Change, not the body.
    await vi_waitFocus(screen.getByRole('button', { name: 'Change' }))
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(await screen.findByRole('heading', { name: 'Review new brokerage' })).toBeVisible()
  })

  it('V2_BROKERAGE_003 with nobody entering, the draft page offers the chooser and Cancel draft waits for a choice', async () => {
    window.localStorage.removeItem('wealthmesh.enteringAs')
    mockApi({ ...seed, accounts: [draftAccount()], openings: { [ID]: { ...draftOpening } } })
    const { user } = renderRoute(`/accounts/${ID}`)
    const cancel = await screen.findByRole('button', { name: 'Cancel draft' })
    expect(cancel).toBeDisabled()
    // The reason is on the page, not only in a tooltip (Cowork fault 1).
    expect(screen.getByText('Choose who is entering to cancel this draft.')).toBeVisible()
    expect(cancel).toHaveAccessibleDescription('Choose who is entering to cancel this draft.')
    await user.selectOptions(await screen.findByLabelText('Entered by'), 'Maya')
    expect(screen.getByRole('button', { name: 'Cancel draft' })).toBeEnabled()
  })

  it('V2_BROKERAGE_002 history says who set it up and when: the member who entered it, not the owner', async () => {
    const api = mockApi(seed)
    const { user } = renderRoute('/accounts/new')
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(await screen.findByText(/Set up by: Maya\./)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    const history = await screen.findByText(/Set up by Maya/)
    expect(history).toBeVisible()
    expect(history.textContent).not.toMatch(/Sam/)
    expect(api.accounts[0].ownerMemberIds).toEqual([sam.id])
  })

  it('V2_BROKERAGE_002 a blank starting amount is reviewed as cash $0.00 with no holdings, then saved by Confirm', async () => {
    const api = mockApi(seed)
    const { user } = renderRoute('/accounts/new')
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Review' }))

    expect(await screen.findByRole('heading', { name: 'Review new brokerage' })).toBeVisible()
    expect(
      screen.getByText(para('Redwood Brokerage will start at $0.00 on 2026-09-01.')),
    ).toBeVisible()
    expect(
      screen.getByText(/starting amount was left blank, so cash starts at \$0\.00/),
    ).toBeVisible()
    expect(api.requests).not.toContain('POST /api/v1/accounts')

    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    const status = await screen.findByText(
      'Redwood Brokerage is set up with a Balance of $0.00 as of 2026-09-01.',
    )
    expect(status).toHaveAttribute('role', 'status')
    await vi_waitFocus(status)
    expect(await screen.findByText(/No starting amount was entered/)).toBeVisible()
    expect(api.accounts[0]).toMatchObject({
      type: 'brokerage',
      status: 'active',
      openingAmount: '0.00',
    })
    expect(api.requests.filter((r) => r === 'POST /api/v1/accounts')).toHaveLength(1)
  })

  it('V2_BROKERAGE_006 a total that does not match cash plus holdings is shown, cannot be confirmed, and Back returns to the form', async () => {
    const api = mockApi(seed)
    const { user } = renderRoute('/accounts/new')
    await fill(user, { total: '80000', cash: '100', holdings: [['HOME', '1', '100']] })
    await user.click(screen.getByRole('button', { name: 'Review' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The opening total $80,000.00 does not match cash plus holdings $200.00',
    )
    expect(
      screen.getByText(
        para(
          'Calculated Balance $200.00 (cash plus holdings) against the opening total $80,000.00. The difference is $79,800.00.',
        ),
      ),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
    expect(screen.getByText('$100.00', { selector: 'dd' })).toBeVisible()

    const scrolled = vi.fn()
    Element.prototype.scrollIntoView = scrolled
    await user.click(screen.getByRole('button', { name: 'Back' }))
    // The mismatch is about the total, so Back lands on it (it can sit below the fold on a narrow window).
    await vi_waitFocus(screen.getByLabelText('Opening total'))
    // Not left on the bottom edge: the field is brought to the middle so its hint and the Cash below it show.
    expect(scrolled).toHaveBeenCalledWith({ block: 'center' })
    expect(screen.getByLabelText('Cash')).toHaveValue('100')
    const total = screen.getByLabelText('Opening total')
    await user.clear(total)
    await user.type(total, '200')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(
      await screen.findByText(para('Redwood Brokerage will start at $200.00 on 2026-09-01.')),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled()
    expect(api.requests).not.toContain('POST /api/v1/accounts')
  })

  const invalid: [
    string,
    { total?: string; cash?: string; holdings?: string[][] },
    string,
    string,
  ][] = [
    ['cash -$1.00', { cash: '-1.00' }, 'Cash', 'Cash must be zero or greater'],
    [
      'quantity 0',
      { cash: '1', holdings: [['HOME', '0', '100']] },
      'Holding 1 quantity',
      'Enter more than zero shares',
    ],
    [
      'quantity -2',
      { cash: '1', holdings: [['HOME', '-2', '100']] },
      'Holding 1 quantity',
      'Enter more than zero shares',
    ],
    [
      'price -$1.00',
      { cash: '1', holdings: [['HOME', '1', '-1.00']] },
      'Holding 1 market price',
      'Holding market price must be zero or greater',
    ],
    [
      'value date 2026-10-04',
      { cash: '1', holdings: [['HOME', '1', '100', '2026-10-04']] },
      'Holding 1 value date',
      'Future values are not completed account history',
    ],
    [
      'value date 2026-08-31',
      { cash: '1', holdings: [['HOME', '1', '100', '2026-08-31']] },
      'Holding 1 value date',
      'Review the earlier tracking start before saving. The Setup date is 2026-09-01.',
    ],
  ]
  it.each(invalid)(
    'V2_BROKERAGE_005 %s is explained at its field, takes focus, and nothing is sent',
    async (_name, fields, label, message) => {
      const api = mockApi(seed)
      const { user } = renderRoute('/accounts/new')
      await fill(user, fields)
      await user.click(screen.getByRole('button', { name: 'Review' }))

      expect(await screen.findByText(message)).toBeVisible()
      expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true')
      await vi_waitFocus(screen.getByLabelText(label))
      expect(api.requests.filter((r) => r.startsWith('POST'))).toHaveLength(0)
      expect(api.accounts).toHaveLength(0)
    },
  )

  it('V2_BROKERAGE_005 removing a holding puts focus on the next one, and on Add a holding when none is left', async () => {
    mockApi(seed)
    const { user } = renderRoute('/accounts/new')
    await fill(user, {
      cash: '1',
      holdings: [
        ['AAA', '1', '1'],
        ['BBB', '2', '2'],
      ],
    })
    await user.click(screen.getByRole('button', { name: 'Remove holding 1' }))
    await vi_waitFocus(screen.getByLabelText('Holding 1 name or symbol'))
    expect(screen.getByLabelText('Holding 1 name or symbol')).toHaveValue('BBB')
    await user.click(screen.getByRole('button', { name: 'Remove holding 1' }))
    await vi_waitFocus(screen.getByRole('button', { name: 'Add a holding' }))
  })
})

describe('an incomplete setup is a draft', () => {
  it('V2_BROKERAGE_003 Review with the cash unanswered keeps a draft that is listed as one and adds nothing to wealth', async () => {
    const api = mockApi(seed)
    const { user } = renderRoute('/accounts/new')
    await fill(user, { total: '80000', holdings: [['HOME', '200', '100']] })
    await user.click(screen.getByRole('button', { name: 'Review' }))

    // Review shows what a draft is before anything is saved (Cowork fault 3).
    expect(await screen.findByRole('heading', { name: 'Review new brokerage' })).toBeVisible()
    expect(screen.getByText(/Redwood Brokerage will be saved as a draft/)).toBeVisible()
    expect(screen.getByText('Not answered yet', { selector: 'dd' })).toBeVisible()
    expect(screen.queryByText(/will start at/)).not.toBeInTheDocument()
    expect(screen.queryByText(/no unexplained amount/)).not.toBeInTheDocument()
    expect(api.requests).not.toContain('POST /api/v1/accounts')
    expect(api.accounts).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Save draft' }))

    const status = await screen.findByText(
      /Redwood Brokerage is saved as a draft\. It needs the opening cash/,
    )
    expect(status).toHaveAttribute('role', 'status')
    expect(status).toHaveTextContent('not worked out from the total')
    await vi_waitFocus(status)
    expect(api.accounts[0]).toMatchObject({ status: 'draft', openingAmount: '0.00' })
    expect(screen.getByRole('button', { name: 'Finish setup' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Cancel draft' })).toBeEnabled()
    expect(screen.getByLabelText('Account details')).toHaveTextContent(
      'BalanceNone yet. A draft adds nothing to household wealth.',
    )
    expect(screen.getByLabelText('Account details')).toHaveTextContent('Institution')

    await user.click(screen.getByRole('link', { name: 'Accounts' }))
    const row = (await screen.findByRole('link', { name: 'Redwood Brokerage' })).closest('tr')!
    expect(row).toHaveTextContent('Draft')
    expect(row).toHaveTextContent('No Balance yet')
  })

  it('V2_BROKERAGE_003 Cancel on the draft asks once, then discards it with a sentence and no Undo', async () => {
    const api = mockApi({
      ...seed,
      accounts: [draftAccount()],
      openings: { [ID]: { ...draftOpening } },
    })
    const { user } = renderRoute(`/accounts/${ID}`)
    await user.click(await screen.findByRole('button', { name: 'Cancel draft' }))
    // One question first: it cannot be undone (Cowork fault 1).
    const ask = await screen.findByRole('region', { name: 'Cancel this draft?' })
    expect(ask).toHaveTextContent('cannot be brought back')
    expect(api.accounts).toHaveLength(1)
    await user.click(within(ask).getByRole('button', { name: 'Keep draft' }))
    await vi_waitFocus(screen.getByRole('button', { name: 'Cancel draft' }))
    expect(api.accounts).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Cancel draft' }))
    await user.click(
      within(await screen.findByRole('region', { name: 'Cancel this draft?' })).getByRole(
        'button',
        { name: 'Discard draft' },
      ),
    )

    const status = await screen.findByText(
      'Redwood Brokerage draft is cancelled and removed. Nothing was added to household wealth.',
    )
    await vi_waitFocus(status)
    expect(screen.queryByRole('link', { name: 'Redwood Brokerage' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
    expect(api.accounts).toHaveLength(0)
    expect(api.requests).not.toContain(`POST /api/v1/accounts/${ID}/delete`)
  })

  it('V2_BROKERAGE_003 Finish setup opens on what the draft kept, Cancel returns focus to its button, and nothing is saved', async () => {
    const api = mockApi({
      ...seed,
      accounts: [draftAccount()],
      openings: { [ID]: { ...draftOpening } },
    })
    const { user } = renderRoute(`/accounts/${ID}`)
    const open = await screen.findByRole('button', { name: 'Finish setup' })
    await user.click(open)

    expect(
      await screen.findByRole('heading', { name: 'Finish setup of Redwood Brokerage' }),
    ).toBeVisible()
    expect(screen.getByLabelText('Opening total')).toHaveValue('80000.00')
    expect(screen.getByLabelText('Cash')).toHaveValue('')
    expect(screen.getByLabelText('Holding 1 name or symbol')).toHaveValue('HOME')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await vi_waitFocus(screen.getByRole('button', { name: 'Finish setup' }))
    expect(api.requests.some((r) => r.startsWith('PUT'))).toBe(false)
    expect(api.accounts[0].status).toBe('draft')
  })

  it('V2_BROKERAGE_003 finishing with the cash answered activates the account, says so, and takes focus; Back keeps the form', async () => {
    const api = mockApi({
      ...seed,
      accounts: [draftAccount()],
      openings: { [ID]: { ...draftOpening } },
    })
    const { user } = renderRoute(`/accounts/${ID}`)
    await user.click(await screen.findByRole('button', { name: 'Finish setup' }))
    await user.type(await screen.findByLabelText('Cash'), '60000')
    await user.click(screen.getByRole('button', { name: 'Review' }))

    expect(
      await screen.findByRole('heading', { name: 'Review finishing Redwood Brokerage' }),
    ).toBeVisible()
    expect(
      screen.getByText(para('Redwood Brokerage will start at $80,000.00 on 2026-09-01.')),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await vi_waitFocus(await screen.findByLabelText('Opening total'))
    expect(screen.getByLabelText('Cash')).toHaveValue('60000')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    await user.click(await screen.findByRole('button', { name: 'Confirm' }))

    const status = await screen.findByText(
      'Redwood Brokerage is set up with a Balance of $80,000.00 as of 2026-09-01. It now counts in household wealth.',
    )
    await vi_waitFocus(status)
    expect(api.accounts[0]).toMatchObject({ status: 'active', openingAmount: '80000.00' })
    expect(screen.queryByRole('button', { name: 'Cancel draft' })).not.toBeInTheDocument()
  })

  it('V2_BROKERAGE_003 finishing again without cash keeps the draft and says so', async () => {
    mockApi({ ...seed, accounts: [draftAccount()], openings: { [ID]: { ...draftOpening } } })
    const { user } = renderRoute(`/accounts/${ID}`)
    await user.click(await screen.findByRole('button', { name: 'Finish setup' }))
    await user.click(await screen.findByRole('button', { name: 'Review' }))
    // The cash is still unanswered: the review says so and states nothing that is not true (Cowork fault 2).
    const review = await screen.findByRole('region', { name: 'Review finishing Redwood Brokerage' })
    expect(review).toHaveTextContent('Cash has not been answered')
    expect(review).toHaveTextContent('Not answered yet')
    expect(review).not.toHaveTextContent('will start at')
    expect(review).not.toHaveTextContent('no unexplained amount')
    expect(review).not.toHaveTextContent('$0.00')
    await user.click(await screen.findByRole('button', { name: 'Save draft' }))
    const status = await screen.findByText(/is still a draft: the opening cash is needed to finish/)
    await vi_waitFocus(status)
    expect(screen.getByRole('button', { name: 'Finish setup' })).toBeEnabled()
  })
})

describe('review-pass faults of the screenshot step', () => {
  it('V2_BROKERAGE_003 the draft page does not show $0.00 cash that was never answered, and Finish setup hints that a blank cash keeps the draft', async () => {
    mockApi({ ...seed, accounts: [draftAccount()], openings: { [ID]: { ...draftOpening } } })
    const { user } = renderRoute(`/accounts/${ID}`)
    const opening = await screen.findByRole('region', { name: 'Opening' })
    expect(opening).toHaveTextContent('Cash')
    expect(opening).toHaveTextContent('Not answered yet')
    expect(opening).not.toHaveTextContent('$0.00')
    await user.click(screen.getByRole('button', { name: 'Finish setup' }))
    expect(await screen.findByText(/A blank cash keeps this a draft/)).toBeVisible()
    expect(screen.queryByText(/Leave everything blank to start at \$0\.00/)).not.toBeInTheDocument()
  })

  it('V2_BROKERAGE_003 Review inside Finish setup scrolls to and focuses the review heading', async () => {
    mockApi({ ...seed, accounts: [draftAccount()], openings: { [ID]: { ...draftOpening } } })
    const { user } = renderRoute(`/accounts/${ID}`)
    await user.click(await screen.findByRole('button', { name: 'Finish setup' }))
    await user.type(await screen.findByLabelText('Cash'), '1')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    const heading = await screen.findByRole('heading', {
      name: 'Review finishing Redwood Brokerage',
    })
    await vi_waitFocus(heading.closest('div[tabindex="-1"]') as HTMLElement)
  })

  it('V2_INV_CORRECTION_005 saving a statement says so and the Balance stays', async () => {
    mockApi({ ...seed, accounts: [brokerage()], openings: { [ID]: { ...opened } } })
    const { user } = renderRoute(`/accounts/${ID}`)
    await user.click(await screen.findByRole('button', { name: 'Attach statement' }))
    fireEvent.change(await screen.findByLabelText('Statement date'), {
      target: { value: '2026-09-01' },
    })
    await user.type(screen.getByLabelText('Statement balance'), '20000')
    await user.click(screen.getByRole('button', { name: 'Save statement' }))
    const sentence = await screen.findByText(
      'Statement saved. A statement never changes the Balance.',
    )
    expect(sentence).toHaveAttribute('role', 'status')
    await vi_waitFocus(screen.getByRole('heading', { name: 'Supporting statements' }))
  })

  it('V2_BROKERAGE_002 the details card calls the starting figure the Opening Balance', async () => {
    mockApi({ ...seed, accounts: [brokerage()], openings: { [ID]: { ...opened } } })
    renderRoute(`/accounts/${ID}`)
    const details = await screen.findByLabelText('Account details')
    expect(details).toHaveTextContent('Opening Balance')
    expect(details).not.toHaveTextContent('Initial Balance')
  })
})

describe('Cowork pass faults', () => {
  it('V2_BROKERAGE_005 a holding too large to record is explained at its field, in view, before anything is sent', async () => {
    const api = mockApi(seed)
    const { user } = renderRoute('/accounts/new')
    await fill(user, { cash: '1', holdings: [['HOME', '1000000', '1000000000000']] })
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(await screen.findByText('That amount is too large to record')).toBeVisible()
    await vi_waitFocus(screen.getByLabelText('Holding 1 market price'))
    expect(api.requests.filter((r) => r.startsWith('POST'))).toHaveLength(0)
  })

  it('V2_BROKERAGE_005 text that is not a number of shares is not told to be more than zero', async () => {
    mockApi(seed)
    const { user } = renderRoute('/accounts/new')
    await fill(user, { cash: '1', holdings: [['HOME', 'abc', '100']] })
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(await screen.findByText('Enter a valid number of shares')).toBeVisible()
  })

  it('V2_BROKERAGE_002 a fund name can be 120 characters', async () => {
    mockApi(seed)
    const { user } = renderRoute('/accounts/new')
    await fill(user, { cash: '1', holdings: [['F'.repeat(120), '1', '1']] })
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(await screen.findByRole('heading', { name: 'Review new brokerage' })).toBeVisible()
    expect(screen.queryByText('Use 40 characters or fewer.')).not.toBeInTheDocument()
  })

  it('V2_BROKERAGE_003 the draft notice names no total when none was typed, and the card does not repeat it', async () => {
    mockApi(seed)
    const { user } = renderRoute('/accounts/new')
    await fill(user, { holdings: [['HOME', '1', '100']] })
    await user.click(screen.getByRole('button', { name: 'Review' }))
    // The review says "worked out from the total" only when a total was typed (Cowork fault 2).
    expect(await screen.findByText(/will be saved as a draft/)).not.toHaveTextContent('total')
    await user.click(await screen.findByRole('button', { name: 'Save draft' }))
    const status = await screen.findByText(/is saved as a draft/)
    expect(status).not.toHaveTextContent('worked out from the total')
    expect(screen.getAllByText(/adds nothing to household wealth/)).toHaveLength(1)
  })

  it('V2_ACCOUNT_LIFECYCLE_007 the arrival sentence goes when a review of the status card opens', async () => {
    mockApi(seed)
    const { user } = renderRoute('/accounts/new')
    await fill(user, { holdings: [['HOME', '1', '100']] })
    await user.click(screen.getByRole('button', { name: 'Review' }))
    await user.click(await screen.findByRole('button', { name: 'Save draft' }))
    expect(await screen.findByText(/is saved as a draft/)).toBeVisible()

    await user.click(await screen.findByRole('button', { name: 'Delete account' }))
    expect(
      await screen.findByText(
        /has no saved entries, reminders or statements, so it can be deleted/,
      ),
    ).toBeVisible()
    expect(screen.queryByText(/is saved as a draft/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText(/is saved as a draft/)).not.toBeInTheDocument()
  })

  it('V2_BROKERAGE_002 Household lists the brokerage under Investments with a total that adds up', async () => {
    mockApi({ ...seed, accounts: [brokerage()], openings: { [ID]: { ...opened } } })
    renderRoute('/')
    const group = await screen.findByRole('region', { name: 'Investments' })
    expect(group).toHaveTextContent('$20,000.00')
    expect(within(group).getByText('Redwood Brokerage')).toBeVisible()
  })
})

describe('deleting a draft', () => {
  it('V2_ACCOUNT_LIFECYCLE_007 the reviewed delete leaves wealth alone, and Undo brings back the same draft', async () => {
    const api = mockApi({
      ...seed,
      accounts: [draftAccount()],
      openings: { [ID]: { ...draftOpening } },
    })
    const { user } = renderRoute(`/accounts/${ID}`)
    await user.click(await screen.findByRole('button', { name: 'Delete account' }))
    expect(
      await screen.findByText(
        /has no saved entries, reminders or statements, so it can be deleted/,
      ),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Delete Redwood Brokerage' }))

    const status = await screen.findByText('Redwood Brokerage is deleted. Wealth does not change.')
    await vi_waitFocus(status)
    expect(api.accounts).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    const back = await screen.findByText(
      /Redwood Brokerage is back as a draft\. It needs its opening cash/,
    )
    await vi_waitFocus(back)
    const row = screen.getByRole('link', { name: 'Redwood Brokerage' }).closest('tr')!
    expect(row).toHaveTextContent('Draft')
    expect(api.accounts[0].status).toBe('draft')
  })
})

describe('a brokerage on the Household page', () => {
  it('V2_BROKERAGE_003 a draft or a brokerage is not listed under Bank money, whose rows add up to its total', async () => {
    const checking: MockAccount = {
      ...brokerage({ id: '66666666-6666-4666-8666-666666666666' }),
      type: 'checking',
      name: 'Everyday Checking',
      institution: 'Harbor Bank',
      openingAmount: '1000.00',
      balance: { amount: '1000.00', asOf: '2026-09-01' },
    }
    mockApi({
      ...seed,
      accounts: [
        checking,
        brokerage(),
        brokerage({
          id: '77777777-7777-4777-8777-777777777777',
          name: 'Draft One',
          status: 'draft',
        }),
      ],
      openings: { [ID]: { ...opened } },
    })
    renderRoute('/')
    const bank = await screen.findByRole('region', { name: 'Bank money' })
    expect(within(bank).getByText('Everyday Checking')).toBeVisible()
    expect(within(bank).queryByText('Redwood Brokerage')).not.toBeInTheDocument()
    expect(within(bank).queryByText('Draft One')).not.toBeInTheDocument()
  })
})

describe('a brokerage in its own words', () => {
  it('V2_BROKERAGE_002 the edit page says institution and keeps the opening out of reach', async () => {
    mockApi({ ...seed, accounts: [brokerage()], openings: { [ID]: { ...opened } } })
    renderRoute(`/accounts/${ID}/edit`)
    expect(await screen.findByLabelText('Institution')).toHaveValue('Harbor Benefits')
    expect(
      screen.getByText(
        'Change the name or institution. The opening cash and holdings are not changed here, and a new owner is chosen with Change owner, which is reviewed first.',
      ),
    ).toBeVisible()
    expect(screen.queryByLabelText('Bank')).not.toBeInTheDocument()
    expect(screen.queryByText(/Update balance/)).not.toBeInTheDocument()
  })

  it('V2_BROKERAGE_002 the close review does not send the person to a transfer that does not exist yet', async () => {
    mockApi({ ...seed, accounts: [brokerage()], openings: { [ID]: { ...opened } } })
    const { user } = renderRoute(`/accounts/${ID}`)
    await user.click(await screen.findByRole('button', { name: 'Close account' }))
    const review = await screen.findByRole('region', { name: 'Review closing Redwood Brokerage' })
    expect(review).toHaveTextContent('Closing needs a zero Balance')
    expect(review).toHaveTextContent('Moving money out of an investment account comes later')
    expect(review).not.toHaveTextContent('record a transfer')
  })
})

describe('a supporting statement and the opening', () => {
  const linked = { ...opened, statementId: STATEMENT }
  const statement = {
    id: STATEMENT,
    accountId: ID,
    statementOn: '2026-09-01',
    balance: '20000.00',
    note: 'September 1 statement',
    enteredByMemberId: maya.id,
  }

  it('V2_INV_CORRECTION_005 removing the statement shows the review, keeps the opening breakdown and the Balance, and says so', async () => {
    const api = mockApi({
      ...seed,
      accounts: [brokerage()],
      openings: { [ID]: { ...linked } },
      statements: [{ ...statement }],
    })
    const { user } = renderRoute(`/accounts/${ID}`)
    expect(await screen.findByText('Opening')).toBeVisible()
    await user.click(await screen.findByRole('button', { name: 'Remove statement' }))

    expect(
      await screen.findByRole('heading', { name: 'Review removing the statement' }),
    ).toBeVisible()
    expect(
      await screen.findByText(
        /1 opening breakdown uses this statement\. Removing it keeps the recorded cash, shares and price, and the Balance stays \$20,000\.00/,
      ),
    ).toBeVisible()
    expect(
      await screen.findByText(/Undo for a removed statement comes in a later release/),
    ).toBeVisible()
    expect(api.statements[0].removedAt).toBeUndefined()
    const review = screen.getByRole('region', { name: 'Review removing the statement' })
    await user.click(within(review).getByRole('button', { name: 'Remove statement' }))

    const status = await screen.findByText(
      /September 1 statement is removed\. The recorded cash, shares and price and the Balance stay/,
    )
    expect(status).toBeVisible()
    await vi_waitFocus(screen.getByRole('heading', { name: 'Supporting statements' }))
    expect(screen.getByText(/Removed by Maya/)).toBeVisible()
    // A removed statement no longer supports anything (Cowork fault 5).
    expect(screen.queryByText(/supports the opening/)).not.toBeInTheDocument()
    expect(screen.getByText('$15,000.00', { selector: 'dd' })).toBeVisible()
    expect(screen.getByRole('cell', { name: 'HOME' })).toBeVisible()
    expect(api.accounts[0].balance.amount).toBe('20000.00')
  })

  it('V2_INV_CORRECTION_005 a statement that shows a different figure than the Balance says so', async () => {
    mockApi({
      ...seed,
      accounts: [brokerage()],
      openings: { [ID]: { ...linked } },
      statements: [{ ...statement, balance: '2600.00' }],
    })
    renderRoute(`/accounts/${ID}`)
    expect(
      await screen.findByText(/The statement shows \$2,600\.00; the Balance is \$20,000\.00/),
    ).toBeVisible()
  })

  it('V2_INV_CORRECTION_005 Cancel on the removal review saves nothing and returns focus to the button', async () => {
    const api = mockApi({
      ...seed,
      accounts: [brokerage()],
      openings: { [ID]: { ...linked } },
      statements: [{ ...statement }],
    })
    const { user } = renderRoute(`/accounts/${ID}`)
    expect(await screen.findByText(/September 1 statement/)).toBeVisible()
    await user.click(await screen.findByRole('button', { name: 'Remove statement' }))
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    await vi_waitFocus(screen.getByRole('button', { name: 'Remove statement' }))
    expect(api.statements[0].removedAt).toBeUndefined()
    expect(api.requests.filter((r) => r.includes('/removal') && r.startsWith('POST'))).toHaveLength(
      0,
    )
  })

  it('V2_INV_CORRECTION_005 the removal review opened on a second statement is about that one', async () => {
    const api = mockApi({
      ...seed,
      accounts: [brokerage()],
      openings: { [ID]: { ...linked } },
      statements: [
        { ...statement },
        {
          ...statement,
          id: '88888888-8888-4888-8888-888888888888',
          note: 'October statement',
          key: 'k2',
        },
      ],
    })
    const { user } = renderRoute(`/accounts/${ID}`)
    expect(await screen.findByText(/October statement/)).toBeVisible()
    const first = (await screen.findAllByRole('button', { name: 'Remove statement' }))[0]
    await user.click(first)
    const review = await screen.findByRole('region', { name: 'Review removing the statement' })
    expect(review).toHaveTextContent('September 1 statement dated')
    await user.click(within(review).getByRole('button', { name: 'Cancel' }))
    const again = screen.getAllByRole('button', { name: 'Remove statement' })
    await user.click(again[1])
    expect(
      await screen.findByRole('region', { name: 'Review removing the statement' }),
    ).toHaveTextContent('October statement dated')
    expect(api.statements.every((s) => !s.removedAt)).toBe(true)
  })

  it('V2_INV_CORRECTION_005 a new statement can back the opening when none does, and the opening is named', async () => {
    const api = mockApi({ ...seed, accounts: [brokerage()], openings: { [ID]: { ...opened } } })
    const { user } = renderRoute(`/accounts/${ID}`)
    await user.click(await screen.findByRole('button', { name: 'Attach statement' }))
    fireEvent.change(await screen.findByLabelText('Statement date'), {
      target: { value: '2026-09-01' },
    })
    await user.type(screen.getByLabelText('Statement balance'), '20000')
    await user.click(
      screen.getByRole('checkbox', { name: /supports the opening cash and holdings/ }),
    )
    await user.click(screen.getByRole('button', { name: 'Save statement' }))
    expect(await screen.findByText(/supports the opening/)).toBeVisible()
    expect([...api.openings.values()][0].statementId).not.toBeNull()
  })
})

/** Waits for the animation frame that moves focus, then checks it. */
async function vi_waitFocus(element: HTMLElement) {
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  expect(element).toHaveFocus()
}
