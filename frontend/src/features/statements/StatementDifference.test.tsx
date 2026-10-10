import { fireEvent, screen, waitFor, within } from '@testing-library/react'
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
const ID = '44444444-4444-4444-8444-444444444444'
const STATEMENT = '55555555-5555-4555-8555-555555555555'

beforeEach(() => window.localStorage.setItem('wealthmesh.enteringAs', maya.id))

// Redwood Brokerage on Sep 30: $16,000.00 cash and 50 HOME priced $110.00 (opened at $100.00), Balance $21,500.00.
const brokerage = (): MockAccount => ({
  id: ID,
  type: 'brokerage',
  name: 'Redwood Brokerage',
  institution: 'Harbor Benefits',
  ownerMemberIds: [sam.id],
  openedOn: '2026-09-01',
  openingAmount: '21000.00',
  balance: { amount: '21500.00', asOf: '2026-09-30' },
  status: 'active',
})
const opened: MockOpening = {
  total: null,
  cash: '16000.00',
  blank: false,
  holdings: [{ symbol: 'HOME', quantity: '50', price: '100.00', valueOn: '2026-09-01' }],
  statementId: null,
}
const price: MockPrice = {
  id: 'p-1',
  accountId: ID,
  symbol: 'HOME',
  price: '110.00',
  valueOn: '2026-09-30',
  enteredByMemberId: maya.id,
  enteredByName: 'Maya',
  enteredAt: '2026-09-30T12:00:00.000Z',
  replacedAt: null,
  key: 'k-1',
}
const seed = {
  household,
  members: [maya, sam],
  accounts: [brokerage()],
  openings: { [ID]: { ...opened } },
  prices: [price],
  today: '2026-10-03',
}

/** Waits for focus to settle, then checks it. */
async function focused(element: HTMLElement) {
  await waitFor(() => expect(element).toHaveFocus())
}

async function fillStatement(user: ReturnType<typeof renderRoute>['user'], total: string) {
  await user.click(await screen.findByRole('button', { name: 'Attach statement' }))
  fireEvent.change(await screen.findByLabelText('Statement date'), {
    target: { value: '2026-09-30' },
  })
  await user.type(screen.getByLabelText('Statement balance'), total)
}

describe('a statement reviewed against the calculated Balance (HOLDINGS_005)', () => {
  it("V2_HOLDINGS_005 the review shows the server's $100.00 difference and asks which cash, quantity or price needs correction", async () => {
    const api = mockApi(seed)
    const { user } = renderRoute(`/accounts/${ID}`)
    await fillStatement(user, '21400')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    const heading = await screen.findByRole('heading', { name: 'Review the statement' })
    await focused(heading)
    const review = screen.getByRole('region', { name: 'Review the statement' })
    expect(review).toHaveTextContent(
      'The statement total is $21,400.00 and the calculated Balance on 2026-09-30 is $21,500.00: a difference of $100.00. Which cash, quantity or price needs correction? Cash and quantity corrections come in a later release. Only a price can be recorded now.',
    )
    // Nothing is saved by the review, and the Balance is untouched.
    expect(api.statements).toHaveLength(0)
    expect(
      api.requests.filter((r) => r.startsWith('POST') && r.endsWith('/statements')),
    ).toHaveLength(0)
    expect(api.accounts[0].balance.amount).toBe('21500.00')
  })

  it('V2_HOLDINGS_005 Save statement ends with the difference in a sentence, focus on the heading, and the Balance unchanged', async () => {
    const api = mockApi(seed)
    const { user } = renderRoute(`/accounts/${ID}`)
    await fillStatement(user, '21400')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    await user.click(await screen.findByRole('button', { name: 'Save statement' }))
    const sentence = await screen.findByText(
      /^Statement saved\. The statement total is \$21,400\.00/,
    )
    expect(sentence).toHaveAttribute('role', 'status')
    expect(sentence).toHaveTextContent('a difference of $100.00')
    expect(sentence).toHaveTextContent('The Balance stays $21,500.00')
    expect(sentence).toHaveTextContent('To correct the difference, record a price.')
    await focused(screen.getByRole('heading', { name: 'Supporting statements' }))
    expect(api.statements).toHaveLength(1)
    expect(api.accounts[0].balance.amount).toBe('21500.00')
    // The statement is supporting history, not a second Balance.
    expect(screen.getByRole('region', { name: 'Holdings' })).toHaveTextContent('Balance$21,500.00')
  })

  it('V2_HOLDINGS_005 Back keeps the typed values and returns to the form heading; Cancel saves nothing and returns to the opener', async () => {
    const api = mockApi(seed)
    const { user } = renderRoute(`/accounts/${ID}`)
    await fillStatement(user, '21400')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    await user.click(await screen.findByRole('button', { name: 'Back' }))
    const form = await screen.findByRole('heading', { name: 'Attach statement' })
    await focused(form)
    expect(screen.getByLabelText('Statement balance')).toHaveValue('21400')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    await focused(screen.getByRole('button', { name: 'Attach statement' }))
    expect(api.statements).toHaveLength(0)
  })

  it('V2_HOLDINGS_005 a statement that matches says nothing needs correcting', async () => {
    mockApi(seed)
    const { user } = renderRoute(`/accounts/${ID}`)
    await fillStatement(user, '21500')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(await screen.findByText(/Nothing needs correcting/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Save statement' }))
    expect(
      await screen.findByText(
        'Statement saved. It matches the calculated Balance on 2026-09-30. A statement never changes the Balance.',
      ),
    ).toBeVisible()
  })
})

describe('the review refuses what the save refuses (HOLDINGS_005)', () => {
  it('V2_HOLDINGS_005 a closed account is refused in the review, shown at the form, and nothing is saved', async () => {
    const api = mockApi({ ...seed, accounts: [{ ...brokerage(), status: 'closed' }] })
    const { user } = renderRoute(`/accounts/${ID}`)
    await fillStatement(user, '21400')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(
      await screen.findByText('Redwood Brokerage is closed, so it takes no statement.'),
    ).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Review the statement' })).not.toBeInTheDocument()
    expect(api.statements).toHaveLength(0)
  })

  it('V2_HOLDINGS_005 a save refused after the review shows its error, and Back clears it from the form', async () => {
    const api = mockApi(seed)
    const { user } = renderRoute(`/accounts/${ID}`)
    await fillStatement(user, '21400')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    await screen.findByRole('heading', { name: 'Review the statement' })
    // The account is closed by someone else between the review and Save.
    api.accounts[0].status = 'closed'
    await user.click(screen.getByRole('button', { name: 'Save statement' }))
    expect(
      await screen.findByText('Redwood Brokerage is closed, so it takes no statement.'),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await focused(await screen.findByRole('heading', { name: 'Attach statement' }))
    expect(
      screen.queryByText('Redwood Brokerage is closed, so it takes no statement.'),
    ).not.toBeInTheDocument()
    expect(api.statements).toHaveLength(0)
  })
})

describe('Undo of a removed statement (SUPPORTING_RECORD_002)', () => {
  const linked: MockOpening = { ...opened, statementId: STATEMENT }
  const statement = {
    id: STATEMENT,
    accountId: ID,
    statementOn: '2026-09-01',
    balance: '21000.00',
    note: 'September 1 statement',
    enteredByMemberId: maya.id,
  }
  const removed = {
    ...statement,
    removedAt: '2026-10-02T12:00:00Z',
    removedByMemberId: sam.id,
    events: [{ action: 'removed' as const, memberId: sam.id, at: '2026-10-02T12:00:00Z' }],
  }

  it('V2_SUPPORTING_RECORD_002 Undo brings the same statement back once, keeps the link and the Balance, and shows both events in history', async () => {
    const api = mockApi({
      ...seed,
      openings: { [ID]: { ...linked } },
      statements: [{ ...removed }],
    })
    const { user } = renderRoute(`/accounts/${ID}`)
    expect(await screen.findByText(/Removed by Sam/)).toBeVisible()
    await user.click(await screen.findByRole('button', { name: 'Undo removal' }))
    const sentence = await screen.findByText(/^September 1 statement is restored once\./)
    expect(sentence).toHaveAttribute('role', 'status')
    expect(sentence).toHaveTextContent('still linked to the opening review')
    expect(sentence).toHaveTextContent('The removal and the Undo are in history.')
    await focused(screen.getByRole('heading', { name: 'Supporting statements' }))
    // One statement, active again, supporting the opening; the Undo button is gone; both events are listed.
    expect(api.statements).toHaveLength(1)
    expect(api.statements[0].removedAt).toBeUndefined()
    expect(screen.queryByRole('button', { name: 'Undo removal' })).not.toBeInTheDocument()
    expect(screen.getByText(/supports the opening/)).toBeVisible()
    const history = screen.getByRole('list', { name: 'Statement history' })
    expect(within(history).getAllByRole('listitem')).toHaveLength(2)
    expect(history).toHaveTextContent('Removed by Sam')
    expect(history).toHaveTextContent('Restored (Undo) by Maya')
    expect(api.accounts[0].balance.amount).toBe('21500.00')
    expect(api.requests.filter((r) => r.includes('/restore'))).toHaveLength(1)
  })

  it('V2_SUPPORTING_RECORD_002 Undo is offered only while removed, and asks who is entering when nobody is chosen', async () => {
    window.localStorage.removeItem('wealthmesh.enteringAs')
    mockApi({ ...seed, openings: { [ID]: { ...linked } }, statements: [{ ...removed }] })
    renderRoute(`/accounts/${ID}`)
    const undo = await screen.findByRole('button', { name: 'Undo removal' })
    expect(undo).toBeDisabled()
    expect(screen.getByLabelText('Entered by')).toBeVisible()
  })

  it('V2_SUPPORTING_RECORD_002 a statement that backs no opening is restored without saying it is linked', async () => {
    mockApi({ ...seed, statements: [{ ...removed }] })
    const { user } = renderRoute(`/accounts/${ID}`)
    await user.click(await screen.findByRole('button', { name: 'Undo removal' }))
    const sentence = await screen.findByText(/^September 1 statement is restored once/)
    expect(sentence).not.toHaveTextContent('linked to the opening review')
    expect(sentence).toHaveTextContent('The removal and the Undo are in history.')
  })

  it('V2_SUPPORTING_RECORD_002 the removal review says Undo is available afterwards', async () => {
    mockApi({ ...seed, openings: { [ID]: { ...linked } }, statements: [{ ...statement }] })
    const { user } = renderRoute(`/accounts/${ID}`)
    await user.click(await screen.findByRole('button', { name: 'Remove statement' }))
    expect(await screen.findByText(/You can Undo the removal afterwards/)).toBeVisible()
  })
})
