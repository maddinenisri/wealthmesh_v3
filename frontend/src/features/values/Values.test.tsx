import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { mockApi, type MockAccount } from '../../test/mockApi'
import type { MockValue } from '../../test/mockValues'
import { renderRoute } from '../../test/render'

const household = { id: '11111111-1111-4111-8111-111111111111', name: 'Maya and Sam' }
const maya = {
  id: '22222222-2222-4222-8222-222222222222',
  householdId: household.id,
  name: 'Maya',
  label: null,
}
const sam = { ...maya, id: '33333333-3333-4333-8333-333333333333', name: 'Sam' }

const asset = (
  type: 'property' | 'other_asset',
  name: string,
  amount: string,
  status = 'active',
): MockAccount => ({
  id: '44444444-4444-4444-8444-444444444444',
  type,
  name,
  institution: null,
  ownerMemberIds: [maya.id],
  openedOn: '2026-09-01',
  openingAmount: amount,
  balance: { amount, asOf: '2026-09-01' },
  status,
})
const home = () => asset('property', 'Family Home', '300000.00')
const car = () => asset('other_asset', 'Family Car', '30000.00')

const value = (patch: Partial<MockValue>): MockValue => ({
  id: '55555555-5555-4555-8555-555555555555',
  accountId: '44444444-4444-4444-8444-444444444444',
  valueOn: '2026-09-30',
  amount: '28000.00',
  reason: 'Updated resale estimate',
  planned: false,
  enteredBy: sam.id,
  replacesId: null,
  replaced: false,
  removedAt: null,
  removedBy: null,
  createdAt: '2026-09-30T10:00:00Z',
  ...patch,
})

const ACCOUNT = '/accounts/44444444-4444-4444-8444-444444444444'
const seed = (account: MockAccount, values: MockValue[] = []) => ({
  household,
  members: [maya, sam],
  accounts: [account],
  values,
  today: '2026-10-03',
})

beforeEach(() => window.localStorage.setItem('wealthmesh.enteringAs', maya.id))

type User = ReturnType<typeof renderRoute>['user']

async function fillValue(user: User, amount: string, date: string, reason = '') {
  await user.click(await screen.findByRole('button', { name: 'Record new value' }))
  await user.type(await screen.findByLabelText('Value'), amount)
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: date } })
  if (reason) await user.type(screen.getByLabelText('Reason (optional)'), reason)
  await user.click(screen.getByRole('button', { name: 'Review' }))
}

/** The saves and changes the UI made: a review writes nothing, so it is not counted. */
const post = (api: { requests: string[] }) =>
  api.requests.filter((r) => r.startsWith('POST') && !r.endsWith('/review'))

describe('recording a value', () => {
  it('V2_PROPERTY_003 reviews a new estimate, saves it, and says the Balance and where it is dated', async () => {
    const api = mockApi(seed(home()))
    const { user } = renderRoute(ACCOUNT)

    await fillValue(user, '$320,000.00', '2026-09-30', 'September estimate')
    const review = await screen.findByRole('region', { name: 'Review value' })
    // The review swaps in place of the form, so it takes focus itself (checklist).
    await waitFor(() =>
      expect(review.parentElement).toContainElement(document.activeElement as HTMLElement),
    )
    expect(review).toHaveTextContent('Change$20,000.00 asset value increase')
    expect(review).toHaveTextContent('Family Home Balance after$320,000.00, dated 2026-09-30')
    expect(review).toHaveTextContent('excluded from income and spending')
    expect(post(api)).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Confirm value' }))
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent(
      'Saved $320,000.00 dated 2026-09-30. Family Home Balance is $320,000.00, dated 2026-09-30.',
    )
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Value history' })).toHaveFocus(),
    )
    const table = screen.getByRole('table')
    expect(within(table).getByText('$320,000.00').closest('tr')).toHaveTextContent('Current')
    expect(within(table).getByText('$300,000.00').closest('tr')).toHaveTextContent('Earlier value')
    expect(post(api)).toHaveLength(1)
  })

  it('V2_OTHER_ASSET_003 names a lower estimate as an asset value decrease with its reason and member', async () => {
    mockApi(seed(car()))
    const { user } = renderRoute(ACCOUNT)

    await fillValue(user, '28,000.00', '2026-09-30', 'Updated resale estimate')
    const review = await screen.findByRole('region', { name: 'Review value' })
    expect(review).toHaveTextContent('Change$2,000.00 asset value decrease')
    expect(review).toHaveTextContent('Value on 2026-09-30 before this$30,000.00')
    expect(review).toHaveTextContent('Reason')
    expect(review).toHaveTextContent('Entered by: Maya')
    await user.click(screen.getByRole('button', { name: 'Confirm value' }))

    const row = (await screen.findByText('$28,000.00')).closest('tr')!
    expect(row).toHaveTextContent('Updated resale estimate · Entered by Maya')
  })

  it('V2_OTHER_ASSET_005 Cancel from the review changes nothing', async () => {
    const api = mockApi(seed(car()))
    const { user } = renderRoute(ACCOUNT)

    await fillValue(user, '28,000.00', '2026-09-30')
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('region', { name: 'Review value' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Record new value' })).toHaveFocus()
    expect(post(api)).toHaveLength(0)
    expect(screen.getByRole('table')).toHaveTextContent('$30,000.00')
    expect(screen.getByRole('table')).not.toHaveTextContent('$28,000.00')
  })

  it('V2_DATED_VALUE_004 pressing Confirm twice saves one estimate', async () => {
    const api = mockApi(seed(car()))
    const { user } = renderRoute(ACCOUNT)

    await fillValue(user, '28,000.00', '2026-09-30')
    const confirm = await screen.findByRole('button', { name: 'Confirm value' })
    await user.dblClick(confirm)

    await screen.findByRole('status')
    expect(post(api).filter((r) => r.endsWith('/values'))).toHaveLength(1)
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(3)
  })

  it('V2_PROPERTY_006 a future date is guided to a plan that is listed and never counted', async () => {
    const api = mockApi(seed(home()))
    const { user } = renderRoute(ACCOUNT)

    await fillValue(user, '330,000.00', '2026-12-31')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(
      'Future values are not completed account history. Save it as a future plan, or choose a date on or before today.',
    )
    expect(post(api)).toHaveLength(0)

    await user.click(within(alert).getByRole('button', { name: 'Save as a future plan' }))
    const review = await screen.findByRole('region', { name: 'Review plan' })
    expect(review).toHaveTextContent('Family Home Balance after$300,000.00, dated 2026-09-01')
    expect(review).toHaveTextContent('never counted in the Balance')
    await user.click(screen.getByRole('button', { name: 'Confirm plan' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Saved a plan of $330,000.00 for 2026-12-31. It is not counted in the Balance or wealth.',
    )
    const row = screen.getByText('$330,000.00').closest('tr')!
    expect(row).toHaveTextContent('Plan')
    expect(screen.getByText('$300,000.00').closest('tr')).toHaveTextContent('Current')
  })

  it('V2_PROPERTY_006 "Choose another date" returns focus to the date', async () => {
    mockApi(seed(home()))
    const { user } = renderRoute(ACCOUNT)

    await fillValue(user, '330,000.00', '2026-12-31')
    await user.click(await screen.findByRole('button', { name: 'Choose another date' }))
    expect(screen.getByLabelText('Date')).toHaveFocus()
  })

  it('V2_PROPERTY_004 a negative or invalid value is explained on the field and nothing is saved', async () => {
    const api = mockApi(seed(home()))
    const { user } = renderRoute(ACCOUNT)

    await fillValue(user, '-1.00', '2026-09-30')
    expect(await screen.findByText('Enter zero or a positive property value')).toBeInTheDocument()
    const field = screen.getByLabelText('Value')
    await user.clear(field)
    await user.type(field, 'abc')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(await screen.findByText('Enter a valid amount')).toBeInTheDocument()
    expect(post(api)).toHaveLength(0)
  })
})

describe('correcting, removing and restoring a value', () => {
  it('V2_PROPERTY_003 a correction needs a reason, shows what it replaces, and keeps the original in history', async () => {
    const api = mockApi(
      seed({ ...home(), balance: { amount: '320000.00', asOf: '2026-09-30' } }, [
        value({ amount: '320000.00', reason: 'September estimate' }),
      ]),
    )
    const { user } = renderRoute(ACCOUNT)

    await user.click(
      await screen.findByRole('button', { name: 'Correct $320,000.00 dated 2026-09-30' }),
    )
    expect(await screen.findByLabelText('Value')).toHaveValue('320000.00')
    await user.clear(screen.getByLabelText('Value'))
    await user.type(screen.getByLabelText('Value'), '315,000.00')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(await screen.findByText('Enter a reason')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Reason'), 'Copied the wrong estimate')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    const review = await screen.findByRole('region', { name: 'Review value correction' })
    expect(review).toHaveTextContent('Replaces$320,000.00 dated 2026-09-30')
    await user.click(screen.getByRole('button', { name: 'Confirm correction' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Corrected to $315,000.00')
    const table = screen.getByRole('table')
    expect(within(table).getByText('$315,000.00').closest('tr')).toHaveTextContent('Current')
    expect(within(table).getByText('$320,000.00').closest('tr')).toHaveTextContent(
      'Replaced by a correction',
    )
    expect(post(api).filter((r) => r.endsWith('/correction'))).toHaveLength(1)
  })

  it('V2_OTHER_ASSET_006 removing an estimate returns the earlier value with its older date; Undo brings it back', async () => {
    mockApi(seed({ ...car(), balance: { amount: '28000.00', asOf: '2026-09-30' } }, [value({})]))
    const { user } = renderRoute(ACCOUNT)

    await user.click(
      await screen.findByRole('button', { name: 'Remove $28,000.00 dated 2026-09-30' }),
    )
    const review = await screen.findByRole('region', { name: 'Review removal' })
    expect(review).toHaveTextContent(
      'The latest effective Balance will return to $30,000.00, dated 2026-09-01.',
    )
    expect(review).toHaveTextContent('The value stays in history')
    await user.click(await screen.findByRole('button', { name: 'Confirm removal' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Removed $28,000.00 dated 2026-09-30. Family Car Balance is $30,000.00, dated 2026-09-01.',
    )
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Value history' })).toHaveFocus(),
    )
    const removed = screen.getByText('$28,000.00').closest('tr')!
    expect(removed).toHaveTextContent('Removed')
    expect(removed).toHaveTextContent('Removed by Maya')

    await user.click(
      screen.getByRole('button', { name: 'Undo removal of $28,000.00 dated 2026-09-30' }),
    )
    await user.click(await screen.findByRole('button', { name: 'Confirm Undo' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Restored $28,000.00')
    expect(screen.getByText('$28,000.00').closest('tr')).toHaveTextContent('Current')
  })

  it('V2_PROPERTY_005 Cancel from a removal leaves the value in place and focus on its button', async () => {
    const api = mockApi(
      seed({ ...car(), balance: { amount: '28000.00', asOf: '2026-09-30' } }, [value({})]),
    )
    const { user } = renderRoute(ACCOUNT)

    const opener = await screen.findByRole('button', {
      name: 'Remove $28,000.00 dated 2026-09-30',
    })
    await user.click(opener)
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(post(api)).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Remove $28,000.00 dated 2026-09-30' })).toHaveFocus()
  })

  it('V2_PROPERTY_005 a plan can be removed and restored, and its review does not speak of a Balance', async () => {
    mockApi(
      seed(home(), [
        value({ valueOn: '2026-12-31', amount: '330000.00', planned: true, reason: null }),
      ]),
    )
    const { user } = renderRoute(ACCOUNT)

    await user.click(
      await screen.findByRole('button', { name: 'Remove $330,000.00 dated 2026-12-31' }),
    )
    const review = await screen.findByRole('region', { name: 'Review removal' })
    expect(review).toHaveTextContent('Remove the plan $330,000.00 dated 2026-12-31.')
    expect(review).not.toHaveTextContent('latest effective Balance')
    await user.click(screen.getByRole('button', { name: 'Confirm removal' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Removed the plan $330,000.00 dated 2026-12-31.',
    )
  })
})

describe('state of the account', () => {
  it('V2_PROPERTY_005 an archived account offers corrections but no new value or plan', async () => {
    mockApi(
      seed({ ...car(), status: 'archived', balance: { amount: '28000.00', asOf: '2026-09-30' } }, [
        value({}),
      ]),
    )
    renderRoute(ACCOUNT)

    expect(await screen.findByRole('button', { name: /Correct \$28,000.00/ })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Record new value' })).not.toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveTextContent('Restore it to record a new value')
  })

  it('V2_PROPERTY_005 a closed account disables every change', async () => {
    mockApi(
      seed({ ...car(), status: 'closed', balance: { amount: '0.00', asOf: '2026-09-30' } }, [
        value({ amount: '0.00' }),
      ]),
    )
    renderRoute(ACCOUNT)

    expect(await screen.findByRole('button', { name: /Correct \$0.00/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Remove \$0.00/ })).toBeDisabled()
    expect(screen.getByRole('main')).toHaveTextContent('Reopen it to record or change a value')
  })
})
