import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { mockApi } from '../../test/mockApi'
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

beforeEach(() => window.localStorage.clear())

// Scenarios built here (the test titles below are generated per type): V2_PROPERTY_002, V2_PROPERTY_004,
// V2_OTHER_ASSET_002 and V2_OTHER_ASSET_004.
type User = ReturnType<typeof renderRoute>['user']

async function fill(user: User, type: string, name: string, balance: string) {
  await user.selectOptions(await screen.findByLabelText('Account type'), type)
  await user.type(screen.getByLabelText('Account name'), name)
  await user.click(screen.getByRole('checkbox', { name: 'Sam' }))
  fireEvent.change(screen.getByLabelText('Value date'), { target: { value: '2026-09-01' } })
  if (balance) await user.type(screen.getByLabelText('Value'), balance)
}

describe.each([
  { type: 'property', label: 'Property', name: 'Land', id: 'PROPERTY', kind: 'property' },
  {
    type: 'other_asset',
    label: 'Other asset',
    name: 'Collectibles',
    id: 'OTHER_ASSET',
    kind: 'asset',
  },
])('adding a $label', ({ type, label, name, id, kind }) => {
  it(`V2_${id}_002 a blank Balance is reviewed as $0.00 on its date and saved by one Confirm`, async () => {
    const api = mockApi(seed)
    const { user } = renderRoute('/accounts/new')

    await fill(user, type, name, '')
    await user.click(screen.getByRole('button', { name: 'Review' }))

    expect(
      await screen.findByText(para(`${name} will start at $0.00 on 2026-09-01.`)),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: `Review new ${label.toLowerCase()}` })).toBeVisible()
    expect(api.requests.some((r) => r.startsWith('POST'))).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    const row = (await screen.findByRole('link', { name })).closest('tr')!
    expect(row).toHaveTextContent('$0.00')
    expect(api.accounts).toHaveLength(1)
    expect(api.accounts[0]).toMatchObject({ type, openingAmount: '0.00' })
    expect(api.requests.filter((r) => r.startsWith('POST'))).toHaveLength(1)
  })

  it(`V2_${id}_002 Back from the review keeps the details and Cancel saves nothing`, async () => {
    const api = mockApi(seed)
    const { user } = renderRoute('/accounts/new')

    await fill(user, type, name, '$25,000.00')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(
      await screen.findByText(para(`${name} will start at $25,000.00 on 2026-09-01.`)),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Back' }))

    expect(screen.getByLabelText('Account name')).toHaveValue(name)
    expect(screen.getByLabelText('Value')).toHaveValue('$25,000.00')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    await user.click(await screen.findByRole('link', { name: 'Cancel' }))
    expect(await screen.findByText('No accounts yet')).toBeInTheDocument()
    expect(api.requests.some((r) => r.startsWith('POST'))).toBe(false)
  })

  it(`V2_${id}_004 a negative or invalid amount is explained and nothing is created`, async () => {
    const api = mockApi(seed)
    const { user } = renderRoute('/accounts/new')

    await fill(user, type, name, '-1.00')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(await screen.findByText(`Enter zero or a positive ${kind} value`)).toBeInTheDocument()

    const balance = screen.getByLabelText('Value')
    await user.clear(balance)
    await user.type(balance, 'abc')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(await screen.findByText('Enter a valid amount')).toBeInTheDocument()
    expect(api.requests.some((r) => r.startsWith('POST'))).toBe(false)
  })

  it(`V2_${id}_002 the account page shows its value history and no money buttons`, async () => {
    mockApi({
      ...seed,
      accounts: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          type,
          name,
          institution: null,
          ownerMemberIds: [sam.id],
          openedOn: '2026-09-01',
          openingAmount: '0.00',
          balance: { amount: '0.00', asOf: '2026-09-01' },
          status: 'active',
        },
      ],
    })
    renderRoute('/accounts/44444444-4444-4444-8444-444444444444')

    expect(await screen.findByRole('heading', { name: 'Value history' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveTextContent(`${label} account`)
    for (const action of ['Add money in', 'Add money out', 'Add transfer', 'Update balance']) {
      expect(screen.queryByRole('button', { name: action })).not.toBeInTheDocument()
    }
  })
})
