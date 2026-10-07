import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { mockApi, type MockAccount, type MockActivity } from '../../test/mockApi'
import { renderRoute } from '../../test/render'

const household = { id: '11111111-1111-4111-8111-111111111111', name: 'Maya and Sam' }
const maya = {
  id: '22222222-2222-4222-8222-222222222222',
  householdId: household.id,
  name: 'Maya',
  label: null,
}
const CHECKING = '44444444-4444-4444-8444-444444444444'
const MORTGAGE = '55555555-5555-4555-8555-555555555555'
const MOVEMENT = '66666666-6666-4666-8666-666666666666'

const checking = (balance: string): MockAccount => ({
  id: CHECKING,
  type: 'checking',
  name: 'Everyday Checking',
  institution: 'Harbor Bank',
  ownerMemberIds: [maya.id],
  openedOn: '2026-09-01',
  openingAmount: '5000.00',
  balance: { amount: balance, asOf: '2026-09-01' },
  status: 'active',
})
const homeMortgage = (owed: string): MockAccount => ({
  id: MORTGAGE,
  type: 'mortgage',
  name: 'Home Mortgage',
  institution: 'Maple Bank',
  ownerMemberIds: [maya.id],
  openedOn: '2026-09-01',
  openingAmount: '-200000.00',
  balance: { amount: `-${owed}`, asOf: '2026-09-01' },
  status: 'active',
})
const base = {
  categoryId: '',
  occurredOn: '2026-09-15',
  description: null,
  enteredByMemberId: maya.id,
  createdAt: '2026-09-15T10:00:00Z',
  movementId: MOVEMENT,
}
/** One saved payment: $1,200.00 from checking, $800.00 principal and $400.00 interest. */
const savedRows = (): MockActivity[] => [
  {
    ...base,
    id: '77777777-7777-4777-8777-777777777771',
    accountId: CHECKING,
    kind: 'loan_payment',
    amount: '1200.00',
    principal: '800.00',
    interest: '400.00',
  },
  {
    ...base,
    id: '77777777-7777-4777-8777-777777777772',
    accountId: MORTGAGE,
    kind: 'loan_payment_in',
    amount: '800.00',
  },
]
const afterPayment = () => [checking('3800.00'), homeMortgage('199200.00')]

beforeEach(() => window.localStorage.setItem('wealthmesh.enteringAs', maya.id))

const posts = (requests: string[]) => requests.filter((line) => line.startsWith('POST '))

describe('changing a mortgage payment', () => {
  it('V2_MORTGAGE_004 correcting the portions to $850.00 and $350.00 says what changed, keeps checking at $3,800.00 and moves the debt to $199,150.00 owed', async () => {
    const api = mockApi({
      household,
      members: [maya],
      accounts: afterPayment(),
      activity: savedRows(),
    })
    const { user } = renderRoute(`/accounts/${CHECKING}`)
    await user.click(await screen.findByRole('button', { name: /^Edit payment to/ }))
    const form = await screen.findByRole('region', { name: 'Edit payment' })
    const principal = await within(form).findByLabelText('Principal')
    expect(principal).toHaveValue('800.00')
    await user.clear(principal)
    await user.type(principal, '850.00')
    const interest = within(form).getByLabelText('Interest')
    await user.clear(interest)
    await user.type(interest, '350.00')
    await user.type(
      within(form).getByLabelText('Reason (optional)'),
      "Use lender's actual payment breakdown",
    )
    await user.click(within(form).getByRole('button', { name: 'Review' }))
    const review = await screen.findByRole('region', { name: 'Review change' })
    expect(review).toHaveTextContent('Mortgage')
    expect(review).toHaveTextContent('Principal$800.00 changed to $850.00')
    expect(review).toHaveTextContent('Interest$400.00 changed to $350.00')
    expect(review).toHaveTextContent('Counts as spending: Mortgage interest')
    const effect = await screen.findByRole('region', { name: 'Effect of this payment' })
    expect(await within(effect).findByText('Everyday Checking Balance')).toBeInTheDocument()
    expect(effect).toHaveTextContent('Everyday Checking Balance$3,800.00')
    expect(effect).toHaveTextContent('Home Mortgage Balance owed$199,150.00 owed')
    await user.click(screen.getByRole('button', { name: 'Confirm change' }))
    await screen.findByText('Includes interest')
    expect(posts(api.requests)).toEqual(['POST /api/v1/loan-payments/' + MOVEMENT + '/replacement'])
    expect(api.accounts.find((a) => a.id === MORTGAGE)?.balance.amount).toBe('-199150.00')
  })

  it('V2_MORTGAGE_005 removing the payment shows both Balances returning and the interest leaving spending; Undo brings it back', async () => {
    const api = mockApi({
      household,
      members: [maya],
      accounts: afterPayment(),
      activity: savedRows(),
    })
    const { user } = renderRoute(`/accounts/${MORTGAGE}`)
    await user.click(await screen.findByRole('button', { name: /^Remove payment from/ }))
    const review = await screen.findByRole('region', { name: 'Review removal' })
    expect(await within(review).findByText('Principal')).toBeInTheDocument()
    expect(review).toHaveTextContent('Mortgage')
    expect(review).toHaveTextContent('Payment$1,200.00')
    expect(review).toHaveTextContent('Everyday Checking Balance after removal$5,000.00')
    expect(review).toHaveTextContent('Home Mortgage Balance owed after removal$200,000.00 owed')
    expect(posts(api.requests)).toHaveLength(0)
    await user.click(within(review).getByRole('button', { name: 'Confirm removal' }))
    await screen.findByText('No payments have been recorded yet.')
    expect(api.accounts.find((a) => a.id === MORTGAGE)?.balance.amount).toBe('-200000.00')

    await user.click(screen.getByRole('button', { name: 'Show history' }))
    await user.click(await screen.findByRole('button', { name: /^Undo payment from/ }))
    const undo = await screen.findByRole('region', { name: 'Review Undo' })
    expect(await within(undo).findByText('Principal')).toBeInTheDocument()
    expect(undo).toHaveTextContent('Home Mortgage Balance owed after Undo$199,200.00 owed')
    await user.click(within(undo).getByRole('button', { name: 'Confirm Undo' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Restored the $1,200.00 payment')
    expect(api.accounts.find((a) => a.id === MORTGAGE)?.balance.amount).toBe('-199200.00')
    expect(api.accounts.find((a) => a.id === CHECKING)?.balance.amount).toBe('3800.00')
  })
})

describe('a lender correction of a mortgage', () => {
  it('V2_MORTGAGE_008 the review shows $200,000.00 owed becoming $199,900.00 owed, a $100.00 decrease in debt, not income; Cancel changes nothing; Confirm saves one correction', async () => {
    const api = mockApi({ household, members: [maya], accounts: [homeMortgage('200000.00')] })
    const { user } = renderRoute(`/accounts/${MORTGAGE}`)
    await user.click(await screen.findByRole('button', { name: 'Update balance owed' }))
    let form = await screen.findByRole('region', { name: 'Update balance owed' })
    await user.type(within(form).getByLabelText('Balance owed'), '199900.00')
    fireEvent.change(within(form).getByLabelText('Date'), { target: { value: '2026-09-30' } })
    await user.click(within(form).getByRole('button', { name: 'Review' }))
    let review = await screen.findByRole('region', { name: 'Review balance update' })
    expect(await within(review).findByText('Requested balance owed')).toBeInTheDocument()
    expect(review).toHaveTextContent('Requested balance owed$199,900.00 owed')
    expect(review).toHaveTextContent('Difference$100.00 decrease in debt')
    expect(review).toHaveTextContent('excluded from income and spending')

    // Cancel: nothing is saved and the figure stays.
    await user.click(within(review).getByRole('button', { name: 'Cancel' }))
    expect(posts(api.requests)).toHaveLength(0)
    expect(await screen.findByLabelText('Account details')).toHaveTextContent(
      'Balance owed$200,000.00 as of 2026-09-01',
    )

    await user.click(await screen.findByRole('button', { name: 'Update balance owed' }))
    form = await screen.findByRole('region', { name: 'Update balance owed' })
    await user.type(within(form).getByLabelText('Balance owed'), '199900.00')
    fireEvent.change(within(form).getByLabelText('Date'), { target: { value: '2026-09-30' } })
    await user.click(within(form).getByRole('button', { name: 'Review' }))
    review = await screen.findByRole('region', { name: 'Review balance update' })
    await waitFor(() =>
      expect(within(review).getByRole('heading', { name: 'Review balance update' })).toHaveFocus(),
    )
    await user.type(within(review).getByLabelText('Reason'), 'Lender correction')
    await user.click(within(review).getByRole('button', { name: 'Confirm correction' }))
    const row = (await screen.findByText(/Balance correction: Lender correction/)).closest('tr')!
    expect(row).toHaveTextContent('2026-09-30')
    expect(row).toHaveTextContent('$100.00 less owed')
    expect(posts(api.requests)).toEqual([`POST /api/v1/accounts/${MORTGAGE}/balance-corrections`])
    expect(api.accounts[0].balance.amount).toBe('-199900.00')
  })
})
