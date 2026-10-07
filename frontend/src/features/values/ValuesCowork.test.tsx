import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { mockApi, type MockAccount } from '../../test/mockApi'
import type { MockValue } from '../../test/mockValues'
import { renderRoute } from '../../test/render'

// Slice 15, owner's Cowork pass (9 faults). Each test failed before its fix.
const household = { id: '11111111-1111-4111-8111-111111111111', name: 'Maya and Sam' }
const maya = {
  id: '22222222-2222-4222-8222-222222222222',
  householdId: household.id,
  name: 'Maya',
  label: null,
}
const sam = { ...maya, id: '33333333-3333-4333-8333-333333333333', name: 'Sam' }
const ID = '44444444-4444-4444-8444-444444444444'

const home = (patch: Partial<MockAccount> = {}): MockAccount => ({
  id: ID,
  type: 'property',
  name: 'Family Home',
  institution: null,
  ownerMemberIds: [maya.id],
  openedOn: '2026-09-01',
  openingAmount: '50000.00',
  balance: { amount: '50000.00', asOf: '2026-09-01' },
  status: 'active',
  ...patch,
})

const value = (patch: Partial<MockValue> = {}): MockValue => ({
  id: '55555555-5555-4555-8555-555555555555',
  accountId: ID,
  valueOn: '2026-09-30',
  amount: '60000.00',
  reason: 'September estimate',
  planned: false,
  enteredBy: maya.id,
  replacesId: null,
  replaced: false,
  removedAt: null,
  removedBy: null,
  createdAt: '2026-09-30T10:05:00',
  ...patch,
})

const seed = (account: MockAccount, values: MockValue[] = []) => ({
  household,
  members: [maya, sam],
  accounts: [account],
  values,
  today: '2026-10-03',
})

beforeEach(() => window.localStorage.setItem('wealthmesh.enteringAs', maya.id))

describe('Close on a valued account (faults 1 and 2)', () => {
  it('V2_PROPERTY_005 Close with a value tells the person to record a $0.00 value, not a transfer', async () => {
    mockApi(seed(home()))
    const { user } = renderRoute(`/accounts/${ID}`)
    await user.click(await screen.findByRole('button', { name: 'Close account' }))
    const review = await screen.findByRole('region', { name: 'Review closing Family Home' })
    expect(review).toHaveTextContent('record a $0.00 value')
    expect(review).not.toHaveTextContent('transfer')
  })

  it('V2_PROPERTY_005 a plan is named in the Close review and Confirm is disabled until it is removed', async () => {
    mockApi(
      seed(home({ openingAmount: '0.00', balance: { amount: '0.00', asOf: '2026-09-01' } }), [
        value({ valueOn: '2026-12-01', amount: '50000.00', planned: true, reason: null }),
      ]),
    )
    const { user } = renderRoute(`/accounts/${ID}`)
    await user.click(await screen.findByRole('button', { name: 'Close account' }))
    const review = await screen.findByRole('region', { name: 'Review closing Family Home' })
    expect(
      await within(review).findByText(/has 1 planned value\. Remove it first/),
    ).toBeInTheDocument()
    expect(within(review).getByRole('button', { name: 'Close Family Home' })).toBeDisabled()
    expect(review).not.toHaveTextContent('will be marked closed')
  })
})

describe('Add account for a property (faults 3 and 7)', () => {
  it('V2_PROPERTY_002 the form speaks of a value and a value date, has no Bank, and says "owns this property"', async () => {
    mockApi(seed(home()))
    const { user } = renderRoute('/accounts/new')
    await user.selectOptions(await screen.findByLabelText('Account type'), 'property')
    expect(screen.getByLabelText('Value')).toBeInTheDocument()
    expect(screen.getByLabelText('Value date')).toBeInTheDocument()
    expect(screen.queryByLabelText('Bank')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Balance')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Opened on')).not.toBeInTheDocument()
    expect(screen.getByText(/everyone who owns this property/)).toBeInTheDocument()
    expect(screen.queryByText(/joint account/)).not.toBeInTheDocument()
  })

  it('V2_PROPERTY_002 nothing on the page for a property still says Balance (found by the screenshot step)', async () => {
    mockApi(seed(home()))
    const { user } = renderRoute('/accounts/new')
    await user.selectOptions(await screen.findByLabelText('Account type'), 'property')
    expect(screen.getByRole('main')).not.toHaveTextContent('Balance')
  })

  it('V2_PROPERTY_002 Back from the review puts focus in the form', async () => {
    mockApi({ ...seed(home()), accounts: [] })
    const { user } = renderRoute('/accounts/new')
    await user.selectOptions(await screen.findByLabelText('Account type'), 'property')
    await user.type(screen.getByLabelText('Account name'), 'Land')
    await user.click(screen.getByRole('checkbox', { name: 'Sam' }))
    await user.click(screen.getByRole('button', { name: 'Review' }))
    await user.click(await screen.findByRole('button', { name: 'Back' }))
    await waitFor(() => expect(screen.getByLabelText('Account name')).toHaveFocus())
  })

  it('V2_PROPERTY_002 the property page has no Bank row and calls its setup figure a value', async () => {
    mockApi(seed(home()))
    renderRoute(`/accounts/${ID}`)
    const details = await screen.findByLabelText('Account details')
    expect(details).not.toHaveTextContent('Bank')
    expect(details).toHaveTextContent('Initial value$50,000.00 on 2026-09-01')
  })
})

describe('Value history (faults 4, 5, 6 and 9)', () => {
  it('V2_PROPERTY_003 a date stays on one line and a row says when it was saved', async () => {
    mockApi(seed(home({ balance: { amount: '60000.00', asOf: '2026-09-30' } }), [value()]))
    renderRoute(`/accounts/${ID}`)
    const cell = (await screen.findByText('2026-09-30')).closest('td')!
    expect(cell.className).toContain('whitespace-nowrap')
    expect(cell.closest('tr')).toHaveTextContent('Entered by Maya on 2026-09-30 10:05')
  })

  it('V2_DATED_VALUE_002 an earlier start keeps its reason in a list of changes, and Undo leaves a trace', async () => {
    mockApi(seed(home({ balance: { amount: '60000.00', asOf: '2026-09-30' } }), [value()]))
    const { user } = renderRoute(`/accounts/${ID}`)

    await user.click(await screen.findByRole('button', { name: 'Record new value' }))
    await user.type(await screen.findByLabelText('Value'), '40,000.00')
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-08-01' } })
    await user.click(screen.getByRole('button', { name: 'Review' }))
    await user.type(await screen.findByLabelText('Reason'), 'Bought in June')
    await user.click(screen.getByRole('button', { name: 'Confirm earlier start' }))
    await screen.findByRole('status')

    await user.click(screen.getByRole('button', { name: /^Remove \$60,000.00/ }))
    await user.click(await screen.findByRole('button', { name: 'Confirm removal' }))
    await user.click(await screen.findByRole('button', { name: /^Undo removal of \$60,000.00/ }))
    await user.click(await screen.findByRole('button', { name: 'Confirm Undo' }))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/^Restored \$60,000.00/),
    )

    const changes = await screen.findByRole('list', { name: 'Changes' })
    expect(changes).toHaveTextContent('Start moved from 2026-09-01 to 2026-08-01: Bought in June')
    expect(changes).toHaveTextContent('Removed $60,000.00 dated 2026-09-30')
    expect(changes).toHaveTextContent('Restored $60,000.00 dated 2026-09-30')
    expect(changes).toHaveTextContent('Maya')
  })

  it('V2_PROPERTY_006 the plan form speaks of what it is expected to be worth', async () => {
    mockApi(seed(home()))
    const { user } = renderRoute(`/accounts/${ID}`)
    await user.click(await screen.findByRole('button', { name: 'Plan a future value' }))
    expect(await screen.findByText(/expect it to be worth on that date/)).toBeInTheDocument()
  })

  it('V2_PROPERTY_005 a status line goes when the account changes state', async () => {
    mockApi(seed(home({ balance: { amount: '60000.00', asOf: '2026-09-30' } }), [value()]))
    const { user } = renderRoute(`/accounts/${ID}`)
    await user.click(await screen.findByRole('button', { name: /^Remove \$60,000.00/ }))
    await user.click(await screen.findByRole('button', { name: 'Confirm removal' }))
    expect(
      await screen.findByText(/^Removed \$60,000.00 dated 2026-09-30\. Family Home Balance/),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Archive account' }))
    await user.click(await screen.findByRole('button', { name: 'Archive Family Home' }))
    await waitFor(() =>
      expect(
        screen.queryByText(/^Removed \$60,000.00 dated 2026-09-30\. Family Home Balance/),
      ).not.toBeInTheDocument(),
    )
  })
})
