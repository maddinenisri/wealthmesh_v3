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
const CHECKING = '44444444-4444-4444-8444-444444444444'
const MORTGAGE = '55555555-5555-4555-8555-555555555555'
const LOAN = '88888888-8888-4888-8888-888888888888'

const checking = (): MockAccount => ({
  id: CHECKING,
  type: 'checking',
  name: 'Everyday Checking',
  institution: 'Harbor Bank',
  ownerMemberIds: [maya.id],
  openedOn: '2026-09-01',
  openingAmount: '5000.00',
  balance: { amount: '5000.00', asOf: '2026-09-01' },
  status: 'active',
})
const homeMortgage = (): MockAccount => ({
  id: MORTGAGE,
  type: 'mortgage',
  name: 'Home Mortgage',
  institution: 'Maple Bank',
  ownerMemberIds: [maya.id],
  openedOn: '2026-09-01',
  openingAmount: '-200000.00',
  balance: { amount: '-200000.00', asOf: '2026-09-01' },
  status: 'active',
})
const carLoan = (): MockAccount => ({
  ...homeMortgage(),
  id: LOAN,
  type: 'loan',
  name: 'Car Loan',
  institution: 'Maple Credit',
  openingAmount: '-20000.00',
  balance: { amount: '-20000.00', asOf: '2026-09-01' },
})

beforeEach(() => window.localStorage.setItem('wealthmesh.enteringAs', maya.id))

const posts = (requests: string[]) => requests.filter((line) => line.startsWith('POST '))
type User = ReturnType<typeof renderRoute>['user']

async function fill(
  user: User,
  form: HTMLElement,
  amount: string,
  principal: string,
  interest: string,
) {
  await user.type(within(form).getByLabelText('Payment amount'), amount)
  await user.type(within(form).getByLabelText('Principal'), principal)
  if (interest) await user.type(within(form).getByLabelText('Interest'), interest)
  fireEvent.change(within(form).getByLabelText('Date'), { target: { value: '2026-09-15' } })
}

// Slice 16b, group 2: a mortgage payment is the loan payment on a mortgage, and every word names the mortgage.
describe('paying a mortgage from checking', () => {
  it('V2_MORTGAGE_003 the button, the choice, the review and the effect all say mortgage, and the interest counts as Mortgage interest', async () => {
    const api = mockApi({ household, members: [maya], accounts: [checking(), homeMortgage()] })
    const { user } = renderRoute(`/accounts/${CHECKING}`)
    await user.click(await screen.findByRole('button', { name: 'Pay a mortgage' }))

    const form = await screen.findByRole('region', { name: 'Record payment' })
    await user.selectOptions(
      within(form).getByLabelText('Mortgage to pay'),
      'Home Mortgage (Mortgage)',
    )
    await fill(user, form, '1200.00', '800.00', '400.00')
    await user.click(within(form).getByRole('button', { name: 'Review' }))

    const review = await screen.findByRole('region', { name: 'Review payment' })
    expect(review).toHaveTextContent('Mortgage')
    expect(review).toHaveTextContent('Interest$400.00Counts as spending: Mortgage interest')
    expect(review).not.toHaveTextContent('Loan')
    const effect = await screen.findByRole('region', { name: 'Effect of this payment' })
    expect(effect).toHaveTextContent('Everyday Checking Balance$3,800.00')
    expect(effect).toHaveTextContent('Home Mortgage Balance owed$199,200.00 owed')
    expect(posts(api.requests)).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Confirm payment' }))
    const row = await screen.findByRole('row', { name: /Payment to Home Mortgage/ })
    expect(row).toHaveTextContent('-$1,200.00')
    expect(posts(api.requests)).toEqual(['POST /api/v1/loan-payments'])
    expect(api.accounts.find((a) => a.id === MORTGAGE)?.balance.amount).toBe('-199200.00')
    expect(api.accounts.find((a) => a.id === CHECKING)?.balance.amount).toBe('3800.00')
  })

  it('V2_MORTGAGE_006 portions that miss the payment name the $50.00 that remains unassigned and nothing is reviewed or saved', async () => {
    const api = mockApi({ household, members: [maya], accounts: [checking(), homeMortgage()] })
    const { user } = renderRoute(`/accounts/${CHECKING}`)
    await user.click(await screen.findByRole('button', { name: 'Pay a mortgage' }))
    const form = await screen.findByRole('region', { name: 'Record payment' })
    await user.selectOptions(
      within(form).getByLabelText('Mortgage to pay'),
      'Home Mortgage (Mortgage)',
    )
    await fill(user, form, '1200.00', '800.00', '350.00')
    await user.click(within(form).getByRole('button', { name: 'Review' }))
    expect(await within(form).findByText('$50.00 remains unassigned')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Review payment' })).not.toBeInTheDocument()
    expect(posts(api.requests)).toHaveLength(0)
  })

  it('V2_MORTGAGE_003 with a loan and a mortgage the button and the choice say loan or mortgage, and each review names its own interest category', async () => {
    mockApi({ household, members: [maya], accounts: [checking(), homeMortgage(), carLoan()] })
    const { user } = renderRoute(`/accounts/${CHECKING}`)
    await user.click(await screen.findByRole('button', { name: 'Pay a loan or mortgage' }))
    const form = await screen.findByRole('region', { name: 'Record payment' })
    await user.selectOptions(
      within(form).getByLabelText('Loan or mortgage to pay'),
      'Car Loan (Loan)',
    )
    await fill(user, form, '500.00', '450.00', '50.00')
    await user.click(within(form).getByRole('button', { name: 'Review' }))
    const review = await screen.findByRole('region', { name: 'Review payment' })
    expect(review).toHaveTextContent('Counts as spending: Loan interest')
  })

  it('V2_MORTGAGE_003 Record payment on the mortgage fixes the mortgage and asks which account paid', async () => {
    const api = mockApi({ household, members: [maya], accounts: [checking(), homeMortgage()] })
    const { user } = renderRoute(`/accounts/${MORTGAGE}`)
    await user.click(await screen.findByRole('button', { name: 'Record payment' }))
    const form = await screen.findByRole('region', { name: 'Record payment' })
    expect(within(form).getByText('Mortgage')).toBeInTheDocument()
    expect(within(form).getByText('Home Mortgage', { selector: 'p' })).toBeInTheDocument()
    await user.selectOptions(
      within(form).getByLabelText('Paid from'),
      'Everyday Checking (Checking)',
    )
    await fill(user, form, '1200.00', '800.00', '400.00')
    await user.click(within(form).getByRole('button', { name: 'Review' }))
    await screen.findByRole('region', { name: 'Review payment' })
    await user.click(await screen.findByRole('button', { name: 'Confirm payment' }))
    expect(await screen.findByText('Payment from', { exact: false })).toBeInTheDocument()
    expect(posts(api.requests)).toEqual(['POST /api/v1/loan-payments'])
  })
})
