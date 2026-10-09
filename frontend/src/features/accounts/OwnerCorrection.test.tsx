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
const CHECKING = '44444444-4444-4444-8444-444444444445'

const TYPES = [
  { wire: '401k', id: '401K', name: 'Harbor 401k', noun: '401(k)' },
  {
    wire: 'traditional_ira',
    id: 'TRAD_IRA',
    name: 'Willow Traditional IRA',
    noun: 'Traditional IRA',
  },
  { wire: 'roth_ira', id: 'ROTH_IRA', name: 'Willow Roth IRA', noun: 'Roth IRA' },
  { wire: 'hsa', id: 'HSA', name: 'Meadow HSA', noun: 'HSA' },
]

const account = (
  type: string,
  name: string,
  ownerMemberIds: string[],
  patch: Partial<MockAccount> = {},
): MockAccount => ({
  id: ID,
  type,
  name,
  institution: 'Harbor Benefits',
  ownerMemberIds,
  openedOn: '2026-09-01',
  openingAmount: '80000.00',
  balance: { amount: '80000.00', asOf: '2026-09-01' },
  status: 'active',
  ...patch,
})
const opening: MockOpening = {
  total: '80000.00',
  cash: '60000.00',
  blank: false,
  holdings: [{ symbol: 'HOME', quantity: '200', price: '100.00', valueOn: '2026-09-01' }],
  statementId: null,
}
const seed = (accounts: MockAccount[]) => ({
  household,
  members: [maya, sam],
  accounts,
  openings: { [ID]: opening },
  today: '2026-10-03',
})

beforeEach(() => window.localStorage.setItem('wealthmesh.enteringAs', maya.id))

describe('owner choices on the four investment types', () => {
  for (const type of TYPES) {
    it(`V2_${type.id}_007 ${type.noun}: each choice is one named member, "Maya and Sam" is not offered, and the hint says everyone can still see it`, async () => {
      mockApi(seed([account(type.wire, type.name, [sam.id])]))
      renderRoute(`/accounts/${ID}/owner`)

      const group = await screen.findByRole('group', { name: 'Owner' })
      const choices = within(group).getAllByRole('radio')
      expect(choices.map((choice) => choice.getAttribute('aria-label') ?? choice.id)).toHaveLength(
        2,
      )
      expect(within(group).getByRole('radio', { name: 'Maya' })).not.toBeChecked()
      expect(within(group).getByRole('radio', { name: 'Sam' })).toBeChecked()
      expect(within(group).queryByRole('radio', { name: /Maya and Sam|Maya, Sam/ })).toBeNull()
      expect(within(group).queryByRole('checkbox')).toBeNull()
      expect(
        screen.getByText(
          `Choose the one member who owns this ${type.noun}. Everyone in the household can still see it.`,
        ),
      ).toBeVisible()
      expect(screen.queryByText(/joint account/i)).toBeNull()
    })
  }

  it('Q-064 a setup form offers one owner for a 401(k) and several for a brokerage', async () => {
    mockApi(seed([]))
    const { user } = renderRoute('/accounts/new')
    await user.selectOptions(await screen.findByLabelText('Account type'), '401k')
    expect(screen.getByRole('group', { name: 'Owner' })).toBeVisible()
    expect(screen.getAllByRole('radio').length).toBeGreaterThan(0)
    await user.selectOptions(screen.getByLabelText('Account type'), 'brokerage')
    const owners = screen.getByRole('group', { name: 'Owners' })
    expect(within(owners).getAllByRole('checkbox')).toHaveLength(2)
    expect(screen.getByText(/Two or more makes it a joint account/)).toBeVisible()
  })
})

describe('the reviewed owner correction (Q-064)', () => {
  it('V2_401K_007 Maya reviews and saves the change to Maya: the review keeps the Balance, the account page says so with focus, and the history keeps Sam', async () => {
    const api = mockApi(seed([account('401k', 'Harbor 401k', [sam.id])]))
    const { user } = renderRoute(`/accounts/${ID}/owner`)
    await user.click(await screen.findByRole('radio', { name: 'Maya' }))
    await user.click(screen.getByRole('button', { name: 'Review' }))

    const review = await screen.findByRole('region', { name: 'Review owner change' })
    expect(review).toHaveTextContent('Harbor 401k owner changes from Sam to Maya.')
    expect(review).toHaveTextContent('Its cash, holdings and Balance of $80,000.00 stay the same.')
    expect(review).toHaveTextContent('the history keeps Sam as the previous owner')
    // A review writes nothing.
    expect(api.accounts[0].ownerMemberIds).toEqual([sam.id])
    expect(api.requests).not.toContain(`POST /api/v1/accounts/${ID}/owner-correction`)

    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent(
      'Harbor 401k was updated. Owner is now Maya. Sam stays in its history. Its cash, holdings and Balance of $80,000.00 are unchanged.',
    )
    expect(status).toHaveFocus()
    expect(api.accounts[0]).toMatchObject({
      ownerMemberIds: [maya.id],
      balance: { amount: '80000.00' },
    })
    const history = await screen.findByRole('region', { name: 'Status history' })
    expect(history).toHaveTextContent('Owner changed: Sam → Maya by Maya')
  })

  it('V2_HSA_007 Back from the review returns to the choices with focus on the owner, and nothing is saved', async () => {
    const api = mockApi(seed([account('hsa', 'Meadow HSA', [maya.id])]))
    const { user } = renderRoute(`/accounts/${ID}/owner`)
    await user.click(await screen.findByRole('radio', { name: 'Sam' }))
    await user.click(screen.getByRole('button', { name: 'Review' }))
    await user.click(await screen.findByRole('button', { name: 'Back' }))
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Sam' })).toHaveFocus())
    expect(api.accounts[0].ownerMemberIds).toEqual([maya.id])
  })

  it('V2_ROTH_IRA_007 Cancel returns to the account with its name focused, and nothing is saved', async () => {
    const api = mockApi(seed([account('roth_ira', 'Willow Roth IRA', [maya.id])]))
    const { user } = renderRoute(`/accounts/${ID}/owner`)
    await user.click(await screen.findByRole('radio', { name: 'Sam' }))
    await user.click(screen.getByRole('link', { name: 'Cancel' }))
    const heading = await screen.findByRole('heading', { name: 'Willow Roth IRA', level: 1 })
    await waitFor(() => expect(heading).toHaveFocus())
    expect(api.accounts[0].ownerMemberIds).toEqual([maya.id])
  })

  it('V2_TRAD_IRA_007 the review is refused as Confirm would be: naming the same owner is not a change', async () => {
    mockApi(seed([account('traditional_ira', 'Willow Traditional IRA', [maya.id])]))
    const { user } = renderRoute(`/accounts/${ID}/owner`)
    await screen.findByRole('radio', { name: 'Maya' })
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a different owner')
    expect(screen.queryByRole('region', { name: 'Review owner change' })).toBeNull()
  })

  it('V2_401K_007 an account that was joint before the rule opens with nobody chosen and needs one named member', async () => {
    const api = mockApi(seed([account('401k', 'Old Joint 401k', [maya.id, sam.id])]))
    const { user } = renderRoute(`/accounts/${ID}/owner`)
    await screen.findByRole('radio', { name: 'Maya' })
    expect(screen.getByRole('radio', { name: 'Maya' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'Sam' })).not.toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(await screen.findByText('Choose one owner')).toBeVisible()
    await user.click(screen.getByRole('radio', { name: 'Sam' }))
    await user.click(screen.getByRole('button', { name: 'Review' }))
    const review = await screen.findByRole('region', { name: 'Review owner change' })
    expect(review).toHaveTextContent('owner changes from Maya and Sam to Sam')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await screen.findByRole('status')
    expect(api.accounts[0].ownerMemberIds).toEqual([sam.id])
  })

  it('Q-064 without a chosen entering member the review asks who is making the change', async () => {
    window.localStorage.removeItem('wealthmesh.enteringAs')
    mockApi(seed([account('401k', 'Harbor 401k', [sam.id])]))
    const { user } = renderRoute(`/accounts/${ID}/owner`)
    await user.click(await screen.findByRole('radio', { name: 'Maya' }))
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Choose who is changing the 401(k)'s owner",
    )
  })

  it('V2_DB_006 a defined benefit says participant, and its plan value is the figure that stays', async () => {
    const api = mockApi(
      seed([
        account('defined_benefit', 'Harbor Plan', [sam.id], {
          openingAmount: '40000.00',
          balance: { amount: '40000.00', asOf: '2026-09-01' },
        }),
      ]),
    )
    const { user } = renderRoute(`/accounts/${ID}/owner`)
    expect(await screen.findByRole('heading', { name: 'Change participant' })).toBeVisible()
    expect(await screen.findByRole('group', { name: 'Participant' })).toBeVisible()
    await user.click(screen.getByRole('radio', { name: 'Maya' }))
    await user.click(screen.getByRole('button', { name: 'Review' }))
    const review = await screen.findByRole('region', { name: 'Review participant change' })
    expect(review).toHaveTextContent('participant changes from Sam to Maya')
    expect(review).toHaveTextContent('Its plan value of $40,000.00 stays the same.')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Harbor Plan was updated. Participant is now Maya. Sam stays in its history. Its plan value of $40,000.00 is unchanged.',
    )
    expect(api.accounts[0].ownerMemberIds).toEqual([maya.id])
  })

  it('V2_TRAD_IRA_007 a refusal takes focus and goes when a different owner is chosen; a missing Entered by sends focus to the chooser (visual review)', async () => {
    mockApi(seed([account('traditional_ira', 'Willow Traditional IRA', [maya.id])]))
    const { user } = renderRoute(`/accounts/${ID}/owner`)
    await screen.findByRole('radio', { name: 'Maya' })
    await user.click(screen.getByRole('button', { name: 'Review' }))
    const alert = await screen.findByRole('alert')
    await waitFor(() => expect(alert.closest('#owner-refusal')).toHaveFocus())
    await user.click(screen.getByRole('radio', { name: 'Sam' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())

    window.localStorage.removeItem('wealthmesh.enteringAs')
    const second = renderRoute(`/accounts/${ID}/owner`)
    const group = await second.findAllByRole('radio', { name: 'Sam' })
    await second.user.click(group.at(-1)!)
    await second.user.click(second.getAllByRole('button', { name: 'Review' }).at(-1)!)
    await waitFor(() => expect(document.activeElement?.closest('[data-entered-by]')).not.toBeNull())
  })

  it('V2_DB_006 the plan says participant in its refusal and in its history, and a joint owner before the rule reads in the plural', async () => {
    mockApi(
      seed([
        account('defined_benefit', 'Harbor Plan', [sam.id], {
          openingAmount: '40000.00',
          balance: { amount: '40000.00', asOf: '2026-09-01' },
        }),
      ]),
    )
    const { user } = renderRoute(`/accounts/${ID}/owner`)
    await screen.findByRole('radio', { name: 'Sam' })
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a different participant')
    await user.click(screen.getByRole('radio', { name: 'Maya' }))
    await user.click(screen.getByRole('button', { name: 'Review' }))
    await user.click(await screen.findByRole('button', { name: 'Confirm' }))
    const history = await screen.findByRole('region', { name: 'Status history' })
    expect(history).toHaveTextContent('Participant changed: Sam → Maya by Maya')
  })

  it('V2_401K_007 a joint row from before the rule: the review and the sentence say they stay in its history', async () => {
    mockApi(seed([account('401k', 'Old Joint 401k', [maya.id, sam.id])]))
    const { user } = renderRoute(`/accounts/${ID}/owner`)
    await user.click(await screen.findByRole('radio', { name: 'Maya' }))
    await user.click(screen.getByRole('button', { name: 'Review' }))
    const review = await screen.findByRole('region', { name: 'Review owner change' })
    expect(review).toHaveTextContent('keeps Maya and Sam as the previous owners')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Maya and Sam stay in its history.')
  })

  it('Q-064 a checking account is sent to Edit account for its owners', async () => {
    mockApi(seed([account('checking', 'Everyday Checking', [maya.id])]))
    renderRoute(`/accounts/${ID}/owner`)
    expect(await screen.findByText('Owners are changed in Edit account')).toBeVisible()
  })
})

describe('Edit account no longer changes the owners of these types (Q-064)', () => {
  it('V2_401K_007 the Edit page shows the owner with a link to Change owner, and a rename keeps it', async () => {
    const api = mockApi(seed([account('401k', 'Harbor 401k', [sam.id])]))
    const { user } = renderRoute(`/accounts/${ID}/edit`)
    expect(await screen.findByText('Sam', { selector: 'strong' })).toBeVisible()
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.getByRole('link', { name: 'Change owner' })).toHaveAttribute(
      'href',
      `/accounts/${ID}/owner`,
    )
    const name = screen.getByLabelText('Account name')
    await user.clear(name)
    await user.type(name, 'Harbor Retirement')
    await user.click(screen.getByRole('button', { name: 'Save details' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Harbor Retirement was updated. It was Harbor 401k.',
    )
    expect(api.accounts[0].ownerMemberIds).toEqual([sam.id])
  })

  it('V2_401K_007 a joint 401(k) from before the rule can be renamed while its owners stay', async () => {
    const api = mockApi(seed([account('401k', 'Old Joint 401k', [maya.id, sam.id])]))
    const { user } = renderRoute(`/accounts/${ID}/edit`)
    const name = await screen.findByLabelText('Account name')
    expect(screen.getByText('Maya, Sam', { selector: 'strong' })).toBeVisible()
    expect(screen.getByText('Owners:')).toBeVisible()
    await user.clear(name)
    await user.type(name, 'Old Joint Retirement')
    await user.click(screen.getByRole('button', { name: 'Save details' }))
    await screen.findByRole('status')
    expect(api.accounts[0]).toMatchObject({
      name: 'Old Joint Retirement',
      ownerMemberIds: [maya.id, sam.id],
    })
  })

  it('V2_401K_007 a draft keeps its owner in the plain Edit, as one choice, so a draft that was joint can be corrected', async () => {
    const api = mockApi(
      seed([account('401k', 'Draft 401k', [maya.id, sam.id], { status: 'draft' })]),
    )
    const { user } = renderRoute(`/accounts/${ID}/edit`)
    const owner = await screen.findByRole('group', { name: 'Owner' })
    expect(within(owner).getAllByRole('radio')).toHaveLength(2)
    expect(screen.queryByRole('link', { name: 'Change owner' })).toBeNull()
    await user.click(within(owner).getByRole('radio', { name: 'Sam' }))
    await user.click(screen.getByRole('button', { name: 'Save details' }))
    await waitFor(() => expect(api.accounts[0].ownerMemberIds).toEqual([sam.id]))
  })

  it('Q-064 Cancel on the Edit page returns to the account with its name focused (carried from 18b)', async () => {
    mockApi(seed([account('401k', 'Harbor 401k', [sam.id])]))
    const { user } = renderRoute(`/accounts/${ID}/edit`)
    await user.click(await screen.findByRole('link', { name: 'Cancel' }))
    const heading = await screen.findByRole('heading', { name: 'Harbor 401k', level: 1 })
    await waitFor(() => expect(heading).toHaveFocus())
  })

  it('Q-064 a checking account keeps its owners in the plain Edit and records the change', async () => {
    const api = mockApi(
      seed([account('checking', 'Everyday Checking', [maya.id], { id: CHECKING })]),
    )
    const { user } = renderRoute(`/accounts/${CHECKING}/edit`)
    await user.click(await screen.findByRole('checkbox', { name: 'Sam' }))
    await user.click(screen.getByRole('button', { name: 'Save details' }))
    await screen.findByRole('status')
    expect(api.accounts[0].ownerMemberIds).toEqual([maya.id, sam.id])
    const history = await screen.findByRole('region', { name: 'Status history' })
    expect(history).toHaveTextContent('Owner changed: Maya → Maya and Sam by Maya')
  })
})
