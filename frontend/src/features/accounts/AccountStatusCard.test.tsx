import { screen, waitFor, within } from '@testing-library/react'
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
const savings = (status = 'active'): MockAccount => ({
  id: '44444444-4444-4444-8444-444444444444',
  type: 'savings',
  name: 'Emergency Savings',
  institution: 'Harbor Bank',
  ownerMemberIds: [maya.id],
  openedOn: '2026-09-01',
  openingAmount: '10000.00',
  balance: { amount: '10000.00', asOf: '2026-09-01' },
  status,
})

beforeEach(() => window.localStorage.setItem('wealthmesh.enteringAs', maya.id))

describe('Archive and restore an account', () => {
  it('V2_ACCOUNT_LIFECYCLE_001 the review says the Balance stays in wealth, Cancel changes nothing and returns focus, Confirm archives and moves focus to the status line', async () => {
    const api = mockApi({ household, members: [maya], accounts: [savings()] })
    const { user } = renderRoute(`/accounts/${savings().id}`)
    const opener = await screen.findByRole('button', { name: 'Archive account' })
    await user.click(opener)

    const review = await screen.findByRole('region', { name: 'Review archiving Emergency Savings' })
    expect(review).toHaveTextContent('Its $10,000.00 will remain in wealth')
    expect(review).toHaveTextContent('does not close an account at its bank')
    await user.click(within(review).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('region', { name: /Review archiving/ })).toBeNull()
    expect(opener).toHaveFocus()
    expect(api.requests.filter((line) => line.startsWith('POST '))).toHaveLength(0)

    await user.click(opener)
    await user.click(
      within(await screen.findByRole('region', { name: /Review archiving/ })).getByRole('button', {
        name: 'Archive Emergency Savings',
      }),
    )
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent(
      'Emergency Savings is archived. Its $10,000.00 stays in wealth.',
    )
    await waitFor(() => expect(status).toHaveFocus())
    expect(screen.getByRole('button', { name: 'Restore account' })).toBeInTheDocument()
    // Archived: no new money, but its history stays editable.
    expect(screen.getByRole('button', { name: 'Add money in' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add transfer' })).toBeDisabled()
  })

  it('V2_ACCOUNT_LIFECYCLE_001 restore returns the account to the active list with the same Balance', async () => {
    mockApi({ household, members: [maya], accounts: [savings('archived')] })
    const { user } = renderRoute(`/accounts/${savings().id}`)
    await user.click(await screen.findByRole('button', { name: 'Restore account' }))
    const review = await screen.findByRole('region', { name: 'Review restoring Emergency Savings' })
    expect(review).toHaveTextContent('same Balance ($10,000.00)')
    await user.click(within(review).getByRole('button', { name: 'Restore Emergency Savings' }))
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('active again')
    await waitFor(() => expect(status).toHaveFocus())
    expect(screen.getByRole('button', { name: 'Add money in' })).toBeEnabled()
  })

  it('V2_CHECKING_012 the Accounts list hides archived accounts until "Show archived and closed" is on, and labels them', async () => {
    mockApi({ household, members: [maya], accounts: [savings('archived')] })
    const { user } = renderRoute('/accounts')
    expect(await screen.findByText('No active accounts')).toBeInTheDocument()
    await user.click(screen.getByLabelText(/Show archived and closed accounts \(1\)/))
    const row = await screen.findByRole('row', { name: /Emergency Savings/ })
    expect(row).toHaveTextContent('Archived')
  })

  it('V2_ACCOUNT_LIFECYCLE_003 closing with money left explains the zero rule and cannot be confirmed', async () => {
    mockApi({ household, members: [maya], accounts: [savings()] })
    const { user } = renderRoute(`/accounts/${savings().id}`)
    await user.click(await screen.findByRole('button', { name: 'Close account' }))
    const review = await screen.findByRole('region', { name: 'Review closing Emergency Savings' })
    expect(review).toHaveTextContent('Closing needs a zero Balance')
    expect(review).toHaveTextContent('$10,000.00')
    expect(review).toHaveTextContent('record a transfer')
    expect(within(review).getByRole('button', { name: 'Close Emergency Savings' })).toBeDisabled()
  })

  it('V2_ACCOUNT_LIFECYCLE_003 a zero account closes, focus goes to the status line, entries are off until Reopen', async () => {
    const zero = { ...savings(), balance: { amount: '0.00', asOf: '2026-09-01' } }
    mockApi({ household, members: [maya], accounts: [zero] })
    const { user } = renderRoute(`/accounts/${zero.id}`)
    const opener = await screen.findByRole('button', { name: 'Close account' })
    await user.click(opener)
    const review = await screen.findByRole('region', { name: 'Review closing Emergency Savings' })
    await user.click(within(review).getByRole('button', { name: 'Cancel' }))
    expect(opener).toHaveFocus()
    await user.click(opener)
    await user.click(
      within(await screen.findByRole('region', { name: /Review closing/ })).getByRole('button', {
        name: 'Close Emergency Savings',
      }),
    )
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('Emergency Savings is closed with a $0.00 Balance')
    await waitFor(() => expect(status).toHaveFocus())
    expect(screen.getByRole('button', { name: 'Add money in' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Reopen account' }))
    const reopen = await screen.findByRole('region', { name: 'Review reopening Emergency Savings' })
    await user.click(within(reopen).getByRole('button', { name: 'Reopen Emergency Savings' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add money in' })).toBeEnabled())
    expect(await screen.findByRole('status')).toHaveTextContent('open again')
  })

  it('V2_ACCOUNT_LIFECYCLE_005 deleting an unused account lands on the list with a focused status line and Undo, which brings it back', async () => {
    const unused = { ...savings(), name: 'Test Savings', openingAmount: '0.00' }
    const api = mockApi({ household, members: [maya], accounts: [unused] })
    const { user } = renderRoute(`/accounts/${unused.id}`)
    const opener = await screen.findByRole('button', { name: 'Delete account' })
    await user.click(opener)
    const review = await screen.findByRole('region', { name: 'Review deleting Test Savings' })
    expect(await within(review).findByText(/no saved history/)).toBeInTheDocument()
    await user.click(within(review).getByRole('button', { name: 'Cancel' }))
    expect(opener).toHaveFocus()
    await user.click(opener)
    await user.click(await screen.findByRole('button', { name: 'Delete Test Savings' }))
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('Test Savings is deleted. Wealth does not change.')
    await waitFor(() => expect(status).toHaveFocus())
    expect(screen.queryByRole('row', { name: /Test Savings/ })).toBeNull()
    await user.click(within(status).getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('is back'))
    await waitFor(() => expect(screen.getByRole('status')).toHaveFocus())
    expect(await screen.findByRole('row', { name: /Test Savings/ })).toBeInTheDocument()
    expect(api.requests.filter((line) => line.endsWith('/undo-delete'))).toHaveLength(1)
  })

  it('V2_ACCOUNT_LIFECYCLE_006 an account with saved history cannot be deleted: the reasons show and Archive or Close is offered', async () => {
    const used = { ...savings(), balance: { amount: '0.00', asOf: '2026-09-10' } }
    mockApi({ household, members: [maya], accounts: [used] })
    const { user } = renderRoute(`/accounts/${used.id}`)
    await user.click(await screen.findByRole('button', { name: 'Delete account' }))
    const review = await screen.findByRole('region', { name: 'Review deleting Emergency Savings' })
    expect(await within(review).findByText(/Saved history must be retained/)).toBeInTheDocument()
    expect(review).toHaveTextContent('a starting Balance of $10,000.00')
    expect(within(review).queryByRole('button', { name: /^Delete / })).toBeNull()
    await user.click(within(review).getByRole('button', { name: 'Review archiving instead' }))
    expect(
      await screen.findByRole('region', { name: 'Review archiving Emergency Savings' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it("V2_ACCOUNT_LIFECYCLE_001 a change is kept in the account's status history with who made it and when", async () => {
    mockApi({ household, members: [maya], accounts: [savings()] })
    const { user } = renderRoute(`/accounts/${savings().id}`)
    await user.click(await screen.findByRole('button', { name: 'Archive account' }))
    const review = await screen.findByRole('region', { name: 'Review archiving Emergency Savings' })
    expect(review).toHaveTextContent('Entered by: Maya')
    await user.click(within(review).getByRole('button', { name: 'Archive Emergency Savings' }))
    const history = await screen.findByRole('region', { name: 'Status history' })
    expect(await within(history).findByText(/Archived by Maya/)).toBeInTheDocument()
    expect(history).toHaveTextContent('2026-10-06')
  })

  it('V2_ACCOUNT_LIFECYCLE_003 Confirm waits for who is entering', async () => {
    window.localStorage.removeItem('wealthmesh.enteringAs')
    mockApi({ household, members: [maya], accounts: [savings()] })
    const { user } = renderRoute(`/accounts/${savings().id}`)
    await user.click(await screen.findByRole('button', { name: 'Archive account' }))
    const review = await screen.findByRole('region', { name: 'Review archiving Emergency Savings' })
    expect(within(review).getByRole('button', { name: 'Archive Emergency Savings' })).toBeDisabled()
  })
})
