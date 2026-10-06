import { fireEvent, screen, within } from '@testing-library/react'
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
const HOME = '44444444-4444-4444-8444-444444444444'

const home = (amount: string, asOf: string): MockAccount => ({
  id: HOME,
  type: 'property',
  name: 'Family Home',
  institution: null,
  ownerMemberIds: [maya.id],
  openedOn: '2026-09-01',
  openingAmount: '300000.00',
  balance: { amount, asOf },
  status: 'active',
})

const estimate = (patch: Partial<MockValue> = {}): MockValue => ({
  id: '55555555-5555-4555-8555-555555555555',
  accountId: HOME,
  valueOn: '2026-09-30',
  amount: '320000.00',
  reason: 'September estimate',
  planned: false,
  enteredBy: maya.id,
  replacesId: null,
  replaced: false,
  removedAt: null,
  removedBy: null,
  createdAt: '2026-09-30T10:00:00Z',
  ...patch,
})

beforeEach(() => window.localStorage.setItem('wealthmesh.enteringAs', maya.id))

const seed = (account: MockAccount, values: MockValue[]) => ({
  household,
  members: [maya],
  accounts: [account],
  values,
  today: '2026-10-03',
})

const overTime = async () => await screen.findByRole('region', { name: 'Wealth on a date' })

describe('wealth on a date', () => {
  it('V2_PROPERTY_003 reads wealth on an earlier date from the value in force then, with its date', async () => {
    mockApi(seed(home('320000.00', '2026-09-30'), [estimate()]))
    renderRoute('/')

    const card = await overTime()
    expect(await within(card).findByText(/Household wealth on 2026-10-03/)).toHaveTextContent(
      '$320,000.00',
    )
    fireEvent.change(within(card).getByLabelText('Show wealth on'), {
      target: { value: '2026-09-15' },
    })
    expect(await within(card).findByText(/Household wealth on 2026-09-15/)).toHaveTextContent(
      '$300,000.00',
    )
    const group = within(card).getByRole('region', {
      name: 'Property and other assets on this date',
    })
    expect(group).toHaveTextContent('Family Home')
    expect(group).toHaveTextContent('Value dated 2026-09-01')
    expect(group).not.toHaveTextContent('Older value')
  })

  it('V2_PROPERTY_005 flags the older value date after an estimate is removed, on the household card and the date view', async () => {
    mockApi(
      seed(home('300000.00', '2026-09-01'), [
        estimate({ removedAt: '2026-10-02T10:00:00Z', removedBy: maya.id }),
      ]),
    )
    renderRoute('/')

    const accounts = await screen.findByRole('region', { name: 'Accounts and wealth' })
    const property = await within(accounts).findByRole('region', {
      name: 'Property and other assets',
    })
    expect(property.closest('section')).toHaveTextContent('Value dated 2026-09-01')
    expect(within(property).getByText('Older value')).toBeInTheDocument()
    const card = await overTime()
    expect(await within(card).findByText('Older value')).toBeInTheDocument()
  })

  it('V2_DATED_VALUE_002 names an account that had not begun tracking instead of counting it as zero', async () => {
    mockApi(seed(home('300000.00', '2026-09-01'), []))
    renderRoute('/')

    const card = await overTime()
    fireEvent.change(await within(card).findByLabelText('Show wealth on'), {
      target: { value: '2026-08-15' },
    })
    expect(
      await within(card).findByText(
        /Not tracking yet on 2026-08-15, so not counted: Family Home \(from 2026-09-01\)/,
      ),
    ).toBeInTheDocument()
    expect(within(card).getByText(/Household wealth on 2026-08-15/)).toHaveTextContent('$0.00')
  })
})

describe('what changed', () => {
  it('V2_PROPERTY_003 explains a property increase as an asset value change, not income', async () => {
    mockApi(seed(home('320000.00', '2026-09-30'), [estimate()]))
    renderRoute('/')

    const card = await overTime()
    fireEvent.change(await within(card).findByLabelText('From'), {
      target: { value: '2026-09-01' },
    })
    fireEvent.change(within(card).getByLabelText('To'), { target: { value: '2026-09-30' } })
    const change = await within(card).findByRole('region', { name: 'Wealth change' })
    expect(change).toHaveTextContent('Asset value change')
    expect(change.querySelector('li')).toHaveTextContent('Income')
    const moves = within(change).getByRole('list', { name: 'Value changes' })
    expect(moves).toHaveTextContent(
      'Family Home value increase of $20,000.00 ($300,000.00 to $320,000.00), an asset value change rather than income or spending.',
    )
    expect(change).toHaveTextContent('Transfers and card payments cancel out')
    expect(change).not.toHaveTextContent('Not explained')
  })

  it('V2_OTHER_ASSET_003 explains a lower estimate as a decrease', async () => {
    mockApi(
      seed(
        {
          ...home('28000.00', '2026-09-30'),
          type: 'other_asset',
          name: 'Family Car',
          openingAmount: '30000.00',
        },
        [estimate({ amount: '28000.00' })],
      ),
    )
    renderRoute('/')

    const card = await overTime()
    fireEvent.change(await within(card).findByLabelText('From'), {
      target: { value: '2026-09-01' },
    })
    fireEvent.change(within(card).getByLabelText('To'), { target: { value: '2026-09-30' } })
    const moves = await within(card).findByRole('list', { name: 'Value changes' })
    expect(moves).toHaveTextContent('Family Car value decrease of $2,000.00')
  })

  it('V2_PROPERTY_003 a start date after the end date is explained and asks nothing of the server', async () => {
    const api = mockApi(seed(home('300000.00', '2026-09-01'), []))
    renderRoute('/')

    const card = await overTime()
    fireEvent.change(await within(card).findByLabelText('From'), {
      target: { value: '2026-09-30' },
    })
    fireEvent.change(within(card).getByLabelText('To'), { target: { value: '2026-09-01' } })
    expect(
      await within(card).findByText('The start date must be on or before the end date'),
    ).toBeInTheDocument()
    expect(api.requests.some((r) => r.includes('/wealth/change'))).toBe(false)
  })
})
