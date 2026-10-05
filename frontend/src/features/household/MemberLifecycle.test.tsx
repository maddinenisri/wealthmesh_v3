import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { mockApi, type MockAccount } from '../../test/mockApi'
import { renderRoute } from '../../test/render'

const household = { id: '11111111-1111-4111-8111-111111111111', name: 'Maya and Sam' }
const maya = {
  id: '22222222-2222-4222-8222-222222222222',
  householdId: household.id,
  name: 'Maya',
  label: null,
}
const sam = {
  id: '33333333-3333-4333-8333-333333333333',
  householdId: household.id,
  name: 'Sam',
  label: null,
}
const joint: MockAccount = {
  id: '44444444-4444-4444-8444-444444444444',
  type: 'checking',
  name: 'Everyday Checking',
  institution: null,
  ownerMemberIds: [maya.id, sam.id],
  openedOn: '2026-09-01',
  openingAmount: '5000.00',
  balance: { amount: '5000.00', asOf: '2026-09-01' },
  status: 'active',
}
/** Fresh copies per test: the mock API edits the members it is given. */
const seed = () => ({
  household,
  members: [{ ...maya }, { ...sam }],
  accounts: [{ ...joint }],
})

beforeEach(() => window.localStorage.clear())

describe('joint owners', () => {
  it('V2_HOUSEHOLD_SETUP_001 sets up an account owned by both, shows both names, counts it once and keeps owners when the household is renamed', async () => {
    mockApi({ household, members: [maya, sam] })
    const { user } = renderRoute('/accounts/new')

    await user.type(await screen.findByLabelText('Account name'), 'Everyday Checking')
    const owners = screen.getByRole('group', { name: 'Owners' })
    await user.click(within(owners).getByRole('checkbox', { name: 'Maya' }))
    await user.click(within(owners).getByRole('checkbox', { name: 'Sam' }))
    fireEvent.change(screen.getByLabelText('Opened on'), { target: { value: '2026-09-01' } })
    await user.type(screen.getByLabelText('Balance'), '5000.00')
    await user.click(screen.getByRole('button', { name: 'Save account' }))

    const row = (await screen.findByRole('link', { name: 'Everyday Checking' })).closest('tr')!
    expect(row).toHaveTextContent('Maya, Sam')
    await user.click(within(row).getByRole('link', { name: 'Everyday Checking' }))
    expect(await screen.findByText('Maya, Sam')).toBeInTheDocument()
  })

  it('V2_HOUSEHOLD_SETUP_001 counts the shared account once in wealth and keeps its owners after renaming the household', async () => {
    mockApi(seed())
    const { user } = renderRoute('/')

    const wealth = await screen.findByRole('region', { name: 'Accounts and wealth' })
    expect(await within(wealth).findByText('Everyday Checking')).toBeInTheDocument()
    expect(within(wealth).getByText(/Financial assets/)).toHaveTextContent('$5,000.00')
    expect(within(wealth).getAllByRole('listitem')).toHaveLength(1)
    expect(within(wealth).getByText('Maya, Sam')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Rename household' }))
    const field = screen.getByLabelText('Household name')
    await user.clear(field)
    await user.type(field, 'Our Household')
    await user.click(screen.getByRole('button', { name: 'Save household name' }))

    expect(await screen.findByRole('heading', { name: 'Our Household' })).toBeInTheDocument()
    expect(within(wealth).getByText('Maya, Sam')).toBeInTheDocument()
    expect(within(wealth).getByText(/Financial assets/)).toHaveTextContent('$5,000.00')
  })

  it('V2_HOUSEHOLD_SETUP_001 asks for at least one owner and focuses the owner choices', async () => {
    mockApi({ household, members: [maya, sam] })
    const { user } = renderRoute('/accounts/new')

    await user.type(await screen.findByLabelText('Account name'), 'Everyday Checking')
    await user.click(screen.getByRole('button', { name: 'Save account' }))

    expect(await screen.findByText('Choose an owner')).toBeInTheDocument()
    expect(
      within(screen.getByRole('group', { name: 'Owners' })).getAllByRole('checkbox')[0],
    ).toHaveFocus()
  })
})

describe('renaming a member', () => {
  it('V2_MEMBERS_005 reviews the rename, keeps accounts and the earlier name, and cancelling saves nothing', async () => {
    const api = mockApi(seed())
    const { user } = renderRoute('/')

    await user.click(await screen.findByRole('button', { name: 'Edit member Maya' }))
    const name = screen.getAllByLabelText('Member name')[0]
    await user.clear(name)
    await user.type(name, 'Maya Patel')
    await user.click(screen.getByRole('button', { name: 'Review rename' }))

    const review = screen.getByRole('region', { name: 'Review rename' })
    expect(review).toHaveTextContent('Maya')
    expect(review).toHaveTextContent('Maya Patel')
    expect(review).toHaveTextContent('Accounts, balances and entries stay the same')

    await user.click(within(review).getByRole('button', { name: 'Cancel' }))
    expect(api.requests).not.toContain(`PUT /api/v1/household-members/${maya.id}`)
    expect(screen.queryByRole('region', { name: 'Review rename' })).not.toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: 'Members' })).getByText('Maya'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit member Maya' }))
    const again = screen.getAllByLabelText('Member name')[0]
    await user.clear(again)
    await user.type(again, 'Maya Patel')
    await user.click(screen.getByRole('button', { name: 'Review rename' }))
    await user.click(screen.getByRole('button', { name: 'Confirm rename' }))

    const members = await screen.findByRole('region', { name: 'Members' })
    expect(await within(members).findByText('Maya Patel')).toBeInTheDocument()
    expect(within(members).getByText('Earlier name: Maya')).toBeInTheDocument()
    const wealth = screen.getByRole('region', { name: 'Accounts and wealth' })
    expect(await within(wealth).findByText('Maya Patel, Sam')).toBeInTheDocument()
    expect(within(wealth).getByText(/Financial assets/)).toHaveTextContent('$5,000.00')
    expect(api.activity).toHaveLength(0)
  })

  it('V2_MEMBERS_005 saving without a change closes the form without a review', async () => {
    const api = mockApi(seed())
    const { user } = renderRoute('/')

    await user.click(await screen.findByRole('button', { name: 'Edit member Maya' }))
    await user.click(screen.getByRole('button', { name: 'Review rename' }))

    expect(screen.queryByRole('region', { name: 'Review rename' })).not.toBeInTheDocument()
    expect(api.requests).not.toContain(`PUT /api/v1/household-members/${maya.id}`)
  })
})

describe('removing a member', () => {
  it('V2_MEMBERS_006 reviews removing Sam and cancelling leaves both active and checking jointly owned', async () => {
    const api = mockApi(seed())
    const { user } = renderRoute('/')

    await user.click(await screen.findByRole('button', { name: 'Remove member Sam' }))
    const review = screen.getByRole('region', { name: 'Review removing Sam' })
    expect(review).toHaveTextContent('Everyday Checking')
    expect(review).toHaveTextContent('Balances and history do not change')
    expect(review).toHaveTextContent('stays listed as an owner')
    await user.click(within(review).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('region', { name: 'Review removing Sam' })).not.toBeInTheDocument()
    expect(api.requests).not.toContain(`POST /api/v1/household-members/${sam.id}/deactivate`)
    const members = screen.getByRole('region', { name: 'Members' })
    expect(within(members).queryByText('Inactive')).not.toBeInTheDocument()
    const wealth = screen.getByRole('region', { name: 'Accounts and wealth' })
    expect(await within(wealth).findByText('Maya, Sam')).toBeInTheDocument()
    expect(within(wealth).getByText(/Financial assets/)).toHaveTextContent('$5,000.00')
  })

  it('V2_MEMBERS_006 confirming removes Sam from new choices, keeps him on the account and can restore him', async () => {
    mockApi(seed())
    const { user } = renderRoute('/')

    await user.click(await screen.findByRole('button', { name: 'Remove member Sam' }))
    await user.click(screen.getByRole('button', { name: 'Remove Sam' }))

    const members = screen.getByRole('region', { name: 'Members' })
    expect(await within(members).findByText('Inactive')).toBeInTheDocument()
    const wealth = screen.getByRole('region', { name: 'Accounts and wealth' })
    expect(within(wealth).getByText('Maya, Sam (inactive)')).toBeInTheDocument()

    await user.click(within(members).getByRole('button', { name: 'Restore member Sam' }))
    await within(members).findByRole('button', { name: 'Remove member Sam' })
    expect(within(members).queryByText('Inactive')).not.toBeInTheDocument()
  })

  it('V2_MEMBERS_006 offers only active members as new owners but keeps an existing inactive owner on edit', async () => {
    mockApi({ ...seed(), members: [maya, { ...sam, active: false }] })
    const newForm = renderRoute('/accounts/new')
    const owners = await screen.findByRole('group', { name: 'Owners' })
    expect(within(owners).getAllByRole('checkbox')).toHaveLength(1)
    expect(within(owners).getByRole('checkbox', { name: 'Maya' })).toBeInTheDocument()
    newForm.unmount()

    renderRoute(`/accounts/${joint.id}/edit`)
    const editOwners = await screen.findByRole('group', { name: 'Owners' })
    const boxes = within(editOwners).getAllByRole('checkbox')
    expect(boxes).toHaveLength(2)
    expect(within(editOwners).getByRole('checkbox', { name: 'Sam (inactive)' })).toBeChecked()
  })
})

describe('keyboard focus and entered-by', () => {
  it('V2_MEMBERS_005 focuses the rename review, can go back to the typed name, and returns focus to Edit on cancel', async () => {
    mockApi(seed())
    const { user } = renderRoute('/')

    await user.click(await screen.findByRole('button', { name: 'Edit member Maya' }))
    const name = screen.getAllByLabelText('Member name')[0]
    await user.clear(name)
    await user.type(name, 'Maya Patel')
    await user.click(screen.getByRole('button', { name: 'Review rename' }))

    const review = screen.getByRole('region', { name: 'Review rename' })
    expect(review).toHaveFocus()
    await user.click(within(review).getByRole('button', { name: 'Change name' }))
    expect(screen.getAllByLabelText('Member name')[0]).toHaveValue('Maya Patel')

    await user.click(screen.getByRole('button', { name: 'Review rename' }))
    await user.click(
      within(screen.getByRole('region', { name: 'Review rename' })).getByRole('button', {
        name: 'Cancel',
      }),
    )
    expect(screen.getByRole('button', { name: 'Edit member Maya' })).toHaveFocus()
  })

  it('V2_MEMBERS_006 focuses the removal review and returns focus to the member after Cancel', async () => {
    mockApi(seed())
    const { user } = renderRoute('/')

    await user.click(await screen.findByRole('button', { name: 'Remove member Sam' }))
    const review = screen.getByRole('region', { name: 'Review removing Sam' })
    expect(review).toHaveFocus()
    await user.click(within(review).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Remove member Sam' })).toHaveFocus()
  })

  it('V2_MEMBERS_006 keeps focus on the Remove and Restore buttons as they swap', async () => {
    mockApi(seed())
    const { user } = renderRoute('/')

    await user.click(await screen.findByRole('button', { name: 'Remove member Sam' }))
    await user.click(screen.getByRole('button', { name: 'Remove Sam' }))
    const restore = await screen.findByRole('button', { name: 'Restore member Sam' })
    expect(restore).toHaveFocus()
    await user.click(restore)
    expect(await screen.findByRole('button', { name: 'Remove member Sam' })).toHaveFocus()
  })

  it('V2_MEMBERS_006 a removed member is not Entering as, even if this browser remembered them', async () => {
    window.localStorage.setItem('wealthmesh.enteringAs', sam.id)
    mockApi({ ...seed(), members: [{ ...maya }, { ...sam, active: false }] })
    renderRoute('/')

    const enteringAs = await screen.findByLabelText('Entering as')
    expect(enteringAs).toHaveDisplayValue('Choose a name')
    expect(within(enteringAs).queryByRole('option', { name: /Sam/ })).not.toBeInTheDocument()
  })
})

describe('when every member was removed', () => {
  it('V2_MEMBERS_006 asks to add or restore a member instead of showing an owner list nobody can pick from', async () => {
    mockApi({
      household,
      members: [
        { ...maya, active: false },
        { ...sam, active: false },
      ],
    })
    renderRoute('/accounts/new')

    expect(await screen.findByText('Add a household member first')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Owners' })).not.toBeInTheDocument()
  })
})
