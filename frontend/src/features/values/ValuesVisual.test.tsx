import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { mockApi, type MockAccount } from '../../test/mockApi'
import type { MockValue } from '../../test/mockValues'
import { renderRoute } from '../../test/render'

// Faults the screenshot step (visual-reviewer) found on slice 15 after the owner's pass. Each test failed first.
const household = { id: '11111111-1111-4111-8111-111111111111', name: 'Maya and Sam' }
const maya = {
  id: '22222222-2222-4222-8222-222222222222',
  householdId: household.id,
  name: 'Maya',
  label: null,
}
const ID = '44444444-4444-4444-8444-444444444444'

const home = (patch: Partial<MockAccount> = {}): MockAccount => ({
  id: ID,
  type: 'property',
  name: 'Family Home',
  institution: null,
  ownerMemberIds: [maya.id],
  openedOn: '2026-09-01',
  openingAmount: '300000.00',
  balance: { amount: '320000.00', asOf: '2026-09-30' },
  status: 'active',
  ...patch,
})
const value = (patch: Partial<MockValue> = {}): MockValue => ({
  id: '55555555-5555-4555-8555-555555555555',
  accountId: ID,
  valueOn: '2026-09-30',
  amount: '320000.00',
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
const seed = (account: MockAccount, values: MockValue[] = [value()]) => ({
  household,
  members: [maya],
  accounts: [account],
  values,
  today: '2026-10-03',
})

beforeEach(() => window.localStorage.setItem('wealthmesh.enteringAs', maya.id))

const nowrap = (element: HTMLElement | null) => element?.closest('.whitespace-nowrap') !== null

describe('wrapping', () => {
  it('V2_PROPERTY_003 a time stamp in the details, a status word and a date in a review never break', async () => {
    mockApi(
      seed(home(), [
        value({ replaced: true }),
        value({
          id: '66666666-6666-4666-8666-666666666666',
          amount: '315000.00',
          replacesId: '55555555-5555-4555-8555-555555555555',
        }),
      ]),
    )
    renderRoute(`/accounts/${ID}`)
    const stamped = (await screen.findAllByText(/2026-09-30 10:05/))[0]
    expect(nowrap(stamped)).toBe(true)
    expect(screen.getByText('Replaced')).toBeInTheDocument()
    expect(screen.queryByText('Replaced by a correction')).not.toBeInTheDocument()
  })

  it('V2_PROPERTY_003 the dates in a review sentence stay whole', async () => {
    mockApi(seed(home()))
    const { user } = renderRoute(`/accounts/${ID}`)
    await user.click(await screen.findByRole('button', { name: 'Record new value' }))
    await user.type(await screen.findByLabelText('Value'), '330,000.00')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    const review = await screen.findByRole('region', { name: 'Review value' })
    const dated = within(review).getAllByText('2026-09-30')[0]
    expect(nowrap(dated)).toBe(true)
  })
})

describe('words of the thing shown', () => {
  it('V2_PROPERTY_002 a blank property review says the value was left blank', async () => {
    mockApi({ ...seed(home()), accounts: [] })
    const { user } = renderRoute('/accounts/new')
    await user.selectOptions(await screen.findByLabelText('Account type'), 'property')
    await user.type(screen.getByLabelText('Account name'), 'Land')
    await user.click(screen.getByRole('checkbox', { name: 'Maya' }))
    await user.click(screen.getByRole('button', { name: 'Review' }))
    const review = await screen.findByRole('region', { name: 'Review new property' })
    expect(review).toHaveTextContent('The value was left blank')
    expect(review).not.toHaveTextContent('Balance')
  })

  it('V2_PROPERTY_002 the edit page of a property does not talk about a bank or Update balance', async () => {
    mockApi(seed(home()))
    renderRoute(`/accounts/${ID}/edit`)
    expect(await screen.findByLabelText('Account name')).toBeInTheDocument()
    expect(screen.getByRole('main')).not.toHaveTextContent(/bank|Update balance/i)
  })

  it('V2_PROPERTY_005 Archive and Close reviews of a property talk about values, not entries, transfers or a bank', async () => {
    mockApi(
      seed(home({ openingAmount: '0.00', balance: { amount: '0.00', asOf: '2026-09-01' } }), []),
    )
    const { user } = renderRoute(`/accounts/${ID}`)
    await user.click(await screen.findByRole('button', { name: 'Archive account' }))
    const archive = await screen.findByRole('region', { name: 'Review archiving Family Home' })
    expect(archive).not.toHaveTextContent(/transfers|payments|bank/)
    await user.click(within(archive).getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Close account' }))
    const close = await screen.findByRole('region', { name: 'Review closing Family Home' })
    expect(close).toHaveTextContent('no new values')
    expect(close).not.toHaveTextContent('entries')
  })

  it('V2_PROPERTY_006 a plan is called a planned value, and its removal says the plan stays in history', async () => {
    mockApi(
      seed(home(), [
        value({ valueOn: '2026-12-01', amount: '330000.00', planned: true, reason: null }),
      ]),
    )
    const { user } = renderRoute(`/accounts/${ID}`)
    await user.click(await screen.findByRole('button', { name: /^Remove \$330,000.00/ }))
    const removal = await screen.findByRole('region', { name: 'Review removal' })
    expect(removal).toHaveTextContent('The plan stays in history')
    expect(removal).not.toHaveTextContent('The value stays in history')
  })

  it('V2_PROPERTY_006 the plan review labels the figure as the planned value', async () => {
    mockApi(seed(home()))
    const { user } = renderRoute(`/accounts/${ID}`)
    await user.click(await screen.findByRole('button', { name: 'Plan a future value' }))
    await user.type(await screen.findByLabelText('Value'), '340,000.00')
    fireEvent.change(screen.getByLabelText('Planned for'), { target: { value: '2026-12-01' } })
    await user.click(screen.getByRole('button', { name: 'Review' }))
    const review = await screen.findByRole('region', { name: 'Review plan' })
    expect(within(review).getByText('Planned value')).toBeInTheDocument()
  })

  it('V2_PROPERTY_003 a correction shows its change from the value it replaces, once', async () => {
    mockApi(seed(home()))
    const { user } = renderRoute(`/accounts/${ID}`)
    await user.click(await screen.findByRole('button', { name: /^Correct \$320,000.00/ }))
    await user.clear(await screen.findByLabelText('Value'))
    await user.type(screen.getByLabelText('Value'), '315,000.00')
    await user.type(screen.getByLabelText('Reason'), 'Wrong estimate')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    const review = await screen.findByRole('region', { name: 'Review value correction' })
    expect(review).toHaveTextContent(
      'Change from the value it replaces$5,000.00 asset value decrease',
    )
    expect(review).not.toHaveTextContent('before this')
  })

  it('V2_PROPERTY_003 the summary card of a property says Value, not Balance', async () => {
    mockApi(seed(home()))
    renderRoute(`/accounts/${ID}`)
    const details = await screen.findByLabelText('Account details')
    expect(within(details).getByText('Value')).toBeInTheDocument()
    expect(within(details).queryByText('Balance')).not.toBeInTheDocument()
  })

  it('V2_PROPERTY_006 the future-date guidance sits under the Date field it is about', async () => {
    mockApi(seed(home()))
    const { user } = renderRoute(`/accounts/${ID}`)
    await user.click(await screen.findByRole('button', { name: 'Record new value' }))
    await user.type(await screen.findByLabelText('Value'), '330,000.00')
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-12-31' } })
    await user.click(screen.getByRole('button', { name: 'Review' }))
    const alert = await screen.findByRole('alert')
    const date = screen.getByLabelText('Date')
    expect(date.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(
      screen.getByLabelText('Reason (optional)').compareDocumentPosition(alert) &
        Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy()
  })

  it('V2_DATED_VALUE_002 the system row that holds the old opening says nothing about who or when', async () => {
    mockApi(
      seed(home(), [
        value({
          valueOn: '2026-09-01',
          amount: '300000.00',
          reason: 'Value when tracking began',
          createdAt: '2026-08-01T00:00:00',
        }),
      ]),
    )
    renderRoute(`/accounts/${ID}`)
    const row = (await screen.findByText('Value when tracking began')).closest('tr')!
    expect(row).not.toHaveTextContent('Entered by')
  })
})
