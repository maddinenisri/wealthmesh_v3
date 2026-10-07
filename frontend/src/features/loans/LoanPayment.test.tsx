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
const LOAN = '55555555-5555-4555-8555-555555555555'
const MOVEMENT = '66666666-6666-4666-8666-666666666666'

const checking = (balance = '5000.00'): MockAccount => ({
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
const carLoan = (owed = '20000.00'): MockAccount => ({
  id: LOAN,
  type: 'loan',
  name: 'Car Loan',
  institution: 'Maple Credit',
  ownerMemberIds: [maya.id],
  openedOn: '2026-09-01',
  openingAmount: '-20000.00',
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
/** One saved payment: $500.00 from checking, $450.00 principal and $50.00 interest. */
const saved: MockActivity[] = [
  {
    ...base,
    id: '77777777-7777-4777-8777-777777777771',
    accountId: CHECKING,
    kind: 'loan_payment',
    amount: '500.00',
    principal: '450.00',
    interest: '50.00',
  },
  {
    ...base,
    id: '77777777-7777-4777-8777-777777777772',
    accountId: LOAN,
    kind: 'loan_payment_in',
    amount: '450.00',
  },
]
/** Fresh copies: the mock changes the rows it is given, and one test must not leave its removal for the next. */
const savedRows = (): MockActivity[] => saved.map((row) => ({ ...row }))
const afterPayment = [checking('4500.00'), carLoan('19550.00')]

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

describe('paying a loan from checking', () => {
  it('V2_LOAN_003 the form asks for the payment, its principal and its interest, shows what is left to assign, and the review names both portions and both Balances before Confirm saves one payment', async () => {
    const api = mockApi({ household, members: [maya], accounts: [checking(), carLoan()] })
    const { user } = renderRoute(`/accounts/${CHECKING}`)
    await user.click(await screen.findByRole('button', { name: 'Pay a loan' }))

    const form = await screen.findByRole('region', { name: 'Record payment' })
    expect(within(form).getByText('Paid from')).toBeInTheDocument()
    await user.selectOptions(within(form).getByLabelText('Loan to pay'), 'Car Loan (Loan)')
    await user.type(within(form).getByLabelText('Payment amount'), '500.00')
    await user.type(within(form).getByLabelText('Principal'), '450.00')
    expect(within(form).getByRole('status')).toHaveTextContent('$50.00 remains unassigned')
    await user.type(within(form).getByLabelText('Interest'), '50.00')
    expect(within(form).queryByRole('status')).not.toBeInTheDocument()
    fireEvent.change(within(form).getByLabelText('Date'), { target: { value: '2026-09-15' } })
    await user.click(within(form).getByRole('button', { name: 'Review' }))

    const review = await screen.findByRole('region', { name: 'Review payment' })
    expect(review).toHaveTextContent('Payment$500.00')
    expect(review).toHaveTextContent('Principal$450.00Reduces the amount owed')
    expect(review).toHaveTextContent('Interest$50.00Counts as spending: Loan interest')
    const effect = await screen.findByRole('region', { name: 'Effect of this payment' })
    expect(await within(effect).findByText('Everyday Checking Balance')).toBeInTheDocument()
    expect(effect).toHaveTextContent('Everyday Checking Balance$4,500.00')
    expect(effect).toHaveTextContent('Car Loan Balance owed$19,550.00 owed')
    expect(posts(api.requests)).toHaveLength(0)
    expect(screen.getByRole('heading', { name: 'Review payment' })).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Confirm payment' }))
    const row = await screen.findByRole('row', { name: /Payment to Car Loan/ })
    expect(row).toHaveTextContent('Car Loan')
    expect(row).toHaveTextContent('-$500.00')
    expect(row).toHaveTextContent('Includes interest')
    expect(posts(api.requests)).toEqual(['POST /api/v1/loan-payments'])
    expect(api.accounts.find((a) => a.id === LOAN)?.balance.amount).toBe('-19550.00')
    expect(api.accounts.find((a) => a.id === CHECKING)?.balance.amount).toBe('4500.00')
  })

  it('V2_LOAN_003 an interest left blank is none: the review says so and the whole payment is principal', async () => {
    mockApi({ household, members: [maya], accounts: [checking(), carLoan()] })
    const { user } = renderRoute(`/accounts/${CHECKING}`)
    await user.click(await screen.findByRole('button', { name: 'Pay a loan' }))
    const form = await screen.findByRole('region', { name: 'Record payment' })
    await user.selectOptions(within(form).getByLabelText('Loan to pay'), 'Car Loan (Loan)')
    await fill(user, form, '200.00', '200.00', '')
    await user.click(within(form).getByRole('button', { name: 'Review' }))
    const review = await screen.findByRole('region', { name: 'Review payment' })
    expect(review).toHaveTextContent('Interest$0.00No interest in this payment')
  })

  it('V2_LOAN_003 principal and interest that do not make up the payment are explained and nothing is reviewed or saved', async () => {
    const api = mockApi({ household, members: [maya], accounts: [checking(), carLoan()] })
    const { user } = renderRoute(`/accounts/${CHECKING}`)
    await user.click(await screen.findByRole('button', { name: 'Pay a loan' }))
    const form = await screen.findByRole('region', { name: 'Record payment' })
    await user.selectOptions(within(form).getByLabelText('Loan to pay'), 'Car Loan (Loan)')
    await fill(user, form, '500.00', '450.00', '40.00')
    await user.click(within(form).getByRole('button', { name: 'Review' }))
    expect(await within(form).findByText('$10.00 remains unassigned')).toBeInTheDocument()
    // The same words are not repeated as a second line under the field.
    expect(within(form).getAllByText(/remains unassigned/)).toHaveLength(1)
    const interest = within(form).getByLabelText('Interest')
    await user.clear(interest)
    await user.type(interest, '60.00')
    await user.click(within(form).getByRole('button', { name: 'Review' }))
    expect(
      await within(form).findByText('Principal and interest are $10.00 more than the payment'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Review payment' })).not.toBeInTheDocument()
    expect(posts(api.requests)).toHaveLength(0)
  })

  it('V2_LOAN_006 principal above the debt is explained in the review, Confirm stays off and no Balance changes', async () => {
    const api = mockApi({
      household,
      members: [maya],
      accounts: [checking(), carLoan('100.00')],
    })
    const { user } = renderRoute(`/accounts/${CHECKING}`)
    await user.click(await screen.findByRole('button', { name: 'Pay a loan' }))
    const form = await screen.findByRole('region', { name: 'Record payment' })
    await user.selectOptions(within(form).getByLabelText('Loan to pay'), 'Car Loan (Loan)')
    await fill(user, form, '160.00', '150.00', '10.00')
    await user.click(within(form).getByRole('button', { name: 'Review' }))

    const review = await screen.findByRole('region', { name: 'Review payment' })
    expect(
      await within(review).findByText(
        /Principal \$150\.00 is \$50\.00 more than the \$100\.00 owed/,
      ),
    ).toBeInTheDocument()
    expect(within(review).getByText(/lender refund or other asset/)).toBeInTheDocument()
    expect(within(review).getByRole('button', { name: 'Confirm payment' })).toBeDisabled()
    expect(posts(api.requests)).toHaveLength(0)
    expect(api.accounts.find((a) => a.id === LOAN)?.balance.amount).toBe('-100.00')
  })

  it('V2_LOAN_003 Pay a loan or mortgage is off with a reason while there is nothing to pay', async () => {
    mockApi({ household, members: [maya], accounts: [checking()] })
    renderRoute(`/accounts/${CHECKING}`)
    const button = await screen.findByRole('button', { name: 'Pay a loan or mortgage' })
    expect(button).toBeDisabled()
    expect(screen.getByText('Add a loan or mortgage to pay it from here.')).toBeInTheDocument()
  })
})

describe('a loan page', () => {
  it('V2_LOAN_003 lists the payment as its principal from the paying account, and opens the payment from either account with its portions', async () => {
    mockApi({
      household,
      members: [maya],
      accounts: afterPayment,
      activity: savedRows(),
    })
    const { user } = renderRoute(`/accounts/${LOAN}`)
    const row = (await screen.findByText('Payment from', { exact: false })).closest('tr')!
    expect(row).toHaveTextContent('Everyday Checking')
    expect(row).toHaveTextContent('$450.00 paid')
    expect(row).toHaveTextContent('Principal')
    expect(screen.queryByRole('button', { name: 'Add money in' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Update balance' })).not.toBeInTheDocument()

    await user.click(within(row).getByRole('button', { name: /^Edit payment from/ }))
    const form = await screen.findByRole('region', { name: 'Edit payment' })
    expect(within(form).getByLabelText('Payment amount')).toHaveValue('500.00')
    expect(within(form).getByLabelText('Principal')).toHaveValue('450.00')
    expect(within(form).getByLabelText('Interest')).toHaveValue('50.00')
  })

  it('V2_LOAN_003 Record payment on the loan fixes the loan and asks which account paid', async () => {
    const api = mockApi({ household, members: [maya], accounts: [checking(), carLoan()] })
    const { user } = renderRoute(`/accounts/${LOAN}`)
    await user.click(await screen.findByRole('button', { name: 'Record payment' }))
    const form = await screen.findByRole('region', { name: 'Record payment' })
    expect(within(form).getByText('Loan')).toBeInTheDocument()
    expect(within(form).getByText('Car Loan', { selector: 'p' })).toBeInTheDocument()
    await user.selectOptions(
      within(form).getByLabelText('Paid from'),
      'Everyday Checking (Checking)',
    )
    await fill(user, form, '500.00', '450.00', '50.00')
    await user.click(within(form).getByRole('button', { name: 'Review' }))
    await screen.findByRole('region', { name: 'Review payment' })
    await user.click(await screen.findByRole('button', { name: 'Confirm payment' }))
    expect(await screen.findByText('Payment from', { exact: false })).toBeInTheDocument()
    expect(posts(api.requests)).toEqual(['POST /api/v1/loan-payments'])
  })

  it('V2_LOAN_003 removing a payment shows both Balances after the removal and the interest leaving spending; Undo brings it back', async () => {
    const api = mockApi({
      household,
      members: [maya],
      accounts: afterPayment,
      activity: savedRows(),
    })
    const { user } = renderRoute(`/accounts/${LOAN}`)
    await user.click(await screen.findByRole('button', { name: /^Remove payment from/ }))
    const review = await screen.findByRole('region', { name: 'Review removal' })
    expect(await within(review).findByText('Principal')).toBeInTheDocument()
    expect(review).toHaveTextContent('Payment$500.00')
    expect(review).toHaveTextContent('Interest$50.00')
    expect(review).toHaveTextContent('Everyday Checking Balance after removal$5,000.00')
    expect(review).toHaveTextContent('Car Loan Balance owed after removal$20,000.00 owed')
    expect(review).toHaveTextContent('its interest leaves spending')
    expect(posts(api.requests)).toHaveLength(0)
    await user.click(within(review).getByRole('button', { name: 'Confirm removal' }))
    await screen.findByText('No payments have been recorded yet.')
    expect(api.accounts.find((a) => a.id === LOAN)?.balance.amount).toBe('-20000.00')

    await user.click(screen.getByRole('button', { name: 'Show history' }))
    await user.click(await screen.findByRole('button', { name: /^Undo payment from/ }))
    const undo = await screen.findByRole('region', { name: 'Review Undo' })
    expect(await within(undo).findByText('Principal')).toBeInTheDocument()
    expect(undo).toHaveTextContent('Car Loan Balance owed after Undo$19,550.00 owed')
    await user.click(within(undo).getByRole('button', { name: 'Confirm Undo' }))
    // The payment is in the list again (and the open history still shows its row).
    expect(await screen.findByRole('status')).toHaveTextContent('Restored the $500.00 payment')
    expect(await screen.findAllByRole('row', { name: /Payment from/ })).toHaveLength(2)
    expect(api.accounts.find((a) => a.id === LOAN)?.balance.amount).toBe('-19550.00')
  })

  it('V2_LOAN_003 correcting the portions starts from the saved payment, says what changed, and keeps the payment', async () => {
    const api = mockApi({
      household,
      members: [maya],
      accounts: afterPayment,
      activity: savedRows(),
    })
    const { user } = renderRoute(`/accounts/${CHECKING}`)
    await user.click(await screen.findByRole('button', { name: /^Edit payment to/ }))
    const form = await screen.findByRole('region', { name: 'Edit payment' })
    const principal = await within(form).findByLabelText('Principal')
    expect(principal).toHaveValue('450.00')
    await user.clear(principal)
    await user.type(principal, '400.00')
    const interest = within(form).getByLabelText('Interest')
    await user.clear(interest)
    await user.type(interest, '100.00')
    await user.type(within(form).getByLabelText('Reason (optional)'), "Use the lender's breakdown")
    await user.click(within(form).getByRole('button', { name: 'Review' }))
    const review = await screen.findByRole('region', { name: 'Review change' })
    expect(review).toHaveTextContent('Principal$450.00 changed to $400.00')
    expect(review).toHaveTextContent('Interest$50.00 changed to $100.00')
    const effect = await screen.findByRole('region', { name: 'Effect of this payment' })
    expect(await within(effect).findByText('Everyday Checking Balance')).toBeInTheDocument()
    expect(effect).toHaveTextContent('Everyday Checking Balance$4,500.00')
    expect(effect).toHaveTextContent('Car Loan Balance owed$19,600.00 owed')
    await user.click(screen.getByRole('button', { name: 'Confirm change' }))
    await screen.findByText('Includes interest')
    expect(posts(api.requests)).toEqual(['POST /api/v1/loan-payments/' + MOVEMENT + '/replacement'])
    expect(api.accounts.find((a) => a.id === LOAN)?.balance.amount).toBe('-19600.00')
  })

  it('V2_LOAN_003 a loan row names the whole payment and its interest, and two payments from one account have different button names', async () => {
    const second: MockActivity[] = [
      {
        ...base,
        id: '77777777-7777-4777-8777-777777777773',
        accountId: CHECKING,
        kind: 'loan_payment',
        amount: '300.00',
        occurredOn: '2026-09-20',
        movementId: '66666666-6666-4666-8666-666666666667',
        principal: '300.00',
        interest: '0.00',
      },
      {
        ...base,
        id: '77777777-7777-4777-8777-777777777774',
        accountId: LOAN,
        kind: 'loan_payment_in',
        amount: '300.00',
        occurredOn: '2026-09-20',
        movementId: '66666666-6666-4666-8666-666666666667',
      },
    ]
    mockApi({
      household,
      members: [maya],
      accounts: afterPayment,
      activity: [...savedRows(), ...second],
    })
    renderRoute(`/accounts/${LOAN}`)
    const row = (await screen.findAllByText('Payment from', { exact: false }))[1].closest('tr')!
    expect(row).toHaveTextContent('Part of a $500.00 payment, $50.00 of it interest')
    const names = (await screen.findAllByRole('button', { name: /^Edit payment from/ })).map(
      (button) => button.getAttribute('aria-label'),
    )
    expect(new Set(names).size).toBe(2)
    expect(names.join('|')).toContain('$450.00 on 2026-09-15')
  })

  it('V2_LOAN_003 after Confirm a status line says what was saved and the Activity heading takes focus; Back from the review puts focus in the form', async () => {
    mockApi({ household, members: [maya], accounts: [checking(), carLoan()] })
    const { user } = renderRoute(`/accounts/${CHECKING}`)
    await user.click(await screen.findByRole('button', { name: 'Pay a loan' }))
    const form = await screen.findByRole('region', { name: 'Record payment' })
    await user.selectOptions(within(form).getByLabelText('Loan to pay'), 'Car Loan (Loan)')
    await fill(user, form, '500.00', '450.00', '50.00')
    await user.click(within(form).getByRole('button', { name: 'Review' }))
    await screen.findByRole('region', { name: 'Review payment' })
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Record payment' })).toHaveFocus(),
    )
    await user.click(screen.getByRole('button', { name: 'Review' }))
    await user.click(await screen.findByRole('button', { name: 'Confirm payment' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Saved the $500.00 payment to Car Loan: $450.00 principal, $50.00 interest.',
    )
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Activity' })).toHaveFocus())
  })

  it('V2_LOAN_003 removing and bringing back a payment each leave a status line and focus on the Activity heading', async () => {
    mockApi({ household, members: [maya], accounts: afterPayment, activity: savedRows() })
    const { user } = renderRoute(`/accounts/${LOAN}`)
    await user.click(await screen.findByRole('button', { name: /^Remove payment from/ }))
    const review = await screen.findByRole('region', { name: 'Review removal' })
    await within(review).findByText('Principal')
    await user.click(within(review).getByRole('button', { name: 'Confirm removal' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Removed the $500.00 payment from Everyday Checking to Car Loan.',
    )
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Activity' })).toHaveFocus())
    await user.click(screen.getByRole('button', { name: 'Show history' }))
    await user.click(await screen.findByRole('button', { name: /^Undo payment from/ }))
    const undo = await screen.findByRole('region', { name: 'Review Undo' })
    await within(undo).findByText('Principal')
    await user.click(within(undo).getByRole('button', { name: 'Confirm Undo' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Restored the $500.00 payment from Everyday Checking to Car Loan.',
    )
  })
})
