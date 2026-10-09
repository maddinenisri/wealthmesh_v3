import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
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
const ID = '44444444-4444-4444-8444-444444444444'

const draft: MockAccount = {
  id: ID,
  type: '401k',
  name: 'Harbor 401k',
  institution: 'Harbor Benefits',
  ownerMemberIds: [sam.id],
  openedOn: '2026-09-01',
  openingAmount: '0.00',
  balance: { amount: '0.00', asOf: '2026-09-01' },
  status: 'draft',
}
const opening: MockOpening = {
  total: '80000.00',
  cash: null,
  blank: false,
  holdings: [{ symbol: 'HOME', quantity: '200', price: '100.00', valueOn: '2026-09-01' }],
  statementId: null,
}

beforeEach(() => window.localStorage.setItem('wealthmesh.enteringAs', maya.id))

describe('one review at a time on an investment account (carried from 17)', () => {
  it('V2_401K_007 Cancel draft closes a review open on the status card, and the status card closes Cancel draft', async () => {
    mockApi({
      household,
      members: [maya, sam],
      accounts: [draft],
      openings: { [ID]: opening },
      today: '2026-10-03',
    })
    const { user } = renderRoute(`/accounts/${ID}`)
    await user.click(await screen.findByRole('button', { name: 'Cancel draft' }))
    expect(await screen.findByRole('heading', { name: 'Cancel this draft?' })).toBeVisible()

    // Open a review on the status card: the draft question closes.
    const card = screen.getByRole('region', { name: /status/i })
    const trigger = within(card).getAllByRole('button')[0]
    await user.click(trigger)
    expect(screen.queryByRole('heading', { name: 'Cancel this draft?' })).toBeNull()

    // Cancel draft again: the status card's review closes.
    await user.click(screen.getByRole('button', { name: 'Cancel draft' }))
    const question = await screen.findByRole('heading', { name: 'Cancel this draft?' })
    expect(question).toBeVisible()
    expect(screen.queryByRole('region', { name: /^Review/ })).toBeNull()
    // Focus is in the review that just opened, not back on the trigger of the one that closed (visual review, 18c).
    const panel = question.parentElement!.closest('[tabindex]') as HTMLElement
    await waitFor(() => expect(panel.contains(document.activeElement)).toBe(true))
    expect(document.activeElement).not.toBe(trigger)
  })
})
