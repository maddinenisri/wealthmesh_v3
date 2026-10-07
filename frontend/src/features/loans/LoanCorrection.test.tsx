import { fireEvent, screen, within } from '@testing-library/react'
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
const LOAN = '55555555-5555-4555-8555-555555555555'

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
/** A saved September 30 correction that lowered the debt by $200.00: a signed row, stored like the server's. */
const correction: MockActivity = {
  id: '77777777-7777-4777-8777-777777777771',
  accountId: LOAN,
  kind: 'correction',
  amount: '200.00',
  occurredOn: '2026-09-30',
  description: null,
  categoryId: '',
  enteredByMemberId: maya.id,
  createdAt: '2026-09-30T10:00:00Z',
  reason: 'Lender statement',
}

beforeEach(() => window.localStorage.setItem('wealthmesh.enteringAs', maya.id))

const posts = (requests: string[]) => requests.filter((line) => line.startsWith('POST '))

describe('correcting the initial amount owed', () => {
  it('V2_LOAN_004 the form speaks of the initial amount owed; the review shows the original and corrected figures as owed and what the Balance owed becomes; Confirm saves one correction and creates no entry', async () => {
    const api = mockApi({ household, members: [maya], accounts: [carLoan()] })
    const { user } = renderRoute(`/accounts/${LOAN}`)
    await user.click(await screen.findByRole('button', { name: 'Update balance owed' }))
    await user.click(await screen.findByRole('radio', { name: 'Correct the initial amount owed' }))

    const form = await screen.findByRole('region', { name: 'Correct the initial amount owed' })
    expect(within(form).queryByLabelText('Starting balance')).not.toBeInTheDocument()
    await user.type(within(form).getByLabelText('Initial amount owed'), '19800.00')
    await user.click(within(form).getByRole('button', { name: 'Review' }))

    const review = await screen.findByRole('region', {
      name: 'Review initial amount owed correction',
    })
    expect(await within(review).findByText(/Balance owed will change/)).toHaveTextContent(
      'Balance owed will change from $20,000.00 owed to $19,800.00 owed.',
    )
    expect(review).toHaveTextContent('Original initial amount owed$20,000.00 owed on 2026-09-01')
    expect(review).toHaveTextContent('Corrected initial amount owed$19,800.00 owed on 2026-09-01')
    expect(review).toHaveTextContent('not income or spending')
    expect(review).not.toHaveTextContent('overdrawn')
    expect(posts(api.requests)).toHaveLength(0)

    await user.type(within(review).getByLabelText('Reason'), 'Copied the lender amount incorrectly')
    await user.click(within(review).getByRole('button', { name: 'Confirm correction' }))
    expect(await screen.findByLabelText('Account details')).toHaveTextContent('$19,800.00 owed')
    expect(posts(api.requests)).toEqual([
      `POST /api/v1/accounts/${LOAN}/starting-balance-corrections`,
    ])
    expect(api.accounts[0]).toMatchObject({ openingAmount: '-19800.00' })
    expect(api.activity).toHaveLength(0)
  })

  it('V2_LOAN_004 a negative amount owed is explained in a debt’s words and nothing is reviewed', async () => {
    const api = mockApi({ household, members: [maya], accounts: [carLoan()] })
    const { user } = renderRoute(`/accounts/${LOAN}`)
    await user.click(await screen.findByRole('button', { name: 'Update balance owed' }))
    await user.click(await screen.findByRole('radio', { name: 'Correct the initial amount owed' }))
    const form = await screen.findByRole('region', { name: 'Correct the initial amount owed' })
    await user.type(within(form).getByLabelText('Initial amount owed'), '-1.00')
    await user.click(within(form).getByRole('button', { name: 'Review' }))
    expect(
      await within(form).findByText('Enter zero or a positive amount owed'),
    ).toBeInTheDocument()
    expect(posts(api.requests)).toHaveLength(0)
  })
})

describe('a dated correction of the balance owed', () => {
  it('V2_DATED_VALUE_003 Update balance owed on a date reviews the owed figures and the $200.00 decrease in debt, then saves a correction that is not a payment', async () => {
    const api = mockApi({ household, members: [maya], accounts: [carLoan()] })
    const { user } = renderRoute(`/accounts/${LOAN}`)
    await user.click(await screen.findByRole('button', { name: 'Update balance owed' }))
    const form = await screen.findByRole('region', { name: 'Update balance owed' })
    expect(within(form).getByLabelText('Balance owed')).toBeInTheDocument()
    expect(within(form).queryByLabelText('Balance')).not.toBeInTheDocument()
    expect(within(form).queryByLabelText('Balance means')).not.toBeInTheDocument()
    await user.type(within(form).getByLabelText('Balance owed'), '19800.00')
    fireEvent.change(within(form).getByLabelText('Date'), { target: { value: '2026-09-30' } })
    await user.click(within(form).getByRole('button', { name: 'Review' }))

    const review = await screen.findByRole('region', { name: 'Review balance update' })
    expect(await within(review).findByText('Requested balance owed')).toBeInTheDocument()
    expect(review).toHaveTextContent('Current balance owed on 2026-09-30$20,000.00 owed')
    expect(review).toHaveTextContent('Requested balance owed$19,800.00 owed')
    expect(review).toHaveTextContent('Difference$200.00 decrease in debt')
    expect(review).toHaveTextContent('Car Loan balance owed after$19,800.00 owed')
    expect(review).toHaveTextContent('excluded from Income and spending')
    expect(posts(api.requests)).toHaveLength(0)

    await user.type(within(review).getByLabelText('Reason'), 'Lender statement')
    await user.click(within(review).getByRole('button', { name: 'Confirm correction' }))
    const row = (await screen.findByText(/Balance correction: Lender statement/)).closest('tr')!
    expect(row).toHaveTextContent('2026-09-30')
    expect(posts(api.requests)).toEqual([`POST /api/v1/accounts/${LOAN}/balance-corrections`])
    expect(api.accounts[0].balance.amount).toBe('-19800.00')
    expect(await screen.findByLabelText('Account details')).toHaveTextContent('$19,800.00 owed')
  })

  it('V2_DATED_VALUE_003 a negative balance owed is refused in the form', async () => {
    mockApi({ household, members: [maya], accounts: [carLoan()] })
    const { user } = renderRoute(`/accounts/${LOAN}`)
    await user.click(await screen.findByRole('button', { name: 'Update balance owed' }))
    const form = await screen.findByRole('region', { name: 'Update balance owed' })
    await user.type(within(form).getByLabelText('Balance owed'), '-5.00')
    await user.click(within(form).getByRole('button', { name: 'Review' }))
    expect(
      await within(form).findByText('Enter zero or a positive amount owed'),
    ).toBeInTheDocument()
  })

  it('V2_DATED_VALUE_003 removing the correction shows the balance owed returning with no month figure; Undo brings it back', async () => {
    const api = mockApi({
      household,
      members: [maya],
      accounts: [carLoan('19800.00')],
      activity: [correction],
    })
    const { user } = renderRoute(`/accounts/${LOAN}`)
    const row = (await screen.findByText(/Balance correction: Lender statement/)).closest('tr')!
    expect(row).toHaveTextContent('-$200.00')
    await user.click(within(row).getByRole('button', { name: /^Remove correction of 2026-09-30/ }))
    const review = await screen.findByRole('region', { name: 'Review removal' })
    expect(review).toHaveTextContent('Car Loan Balance owed after removal$20,000.00 owed')
    expect(review).not.toHaveTextContent('spending after removal')
    expect(review).toHaveTextContent('changes only the Balance owed')
    expect(posts(api.requests)).toHaveLength(0)
    await user.click(within(review).getByRole('button', { name: 'Confirm removal' }))
    await screen.findByText('No payments have been recorded yet.')
    expect(api.accounts[0].balance.amount).toBe('-20000.00')

    await user.click(screen.getByRole('button', { name: 'Show history' }))
    await user.click(await screen.findByRole('button', { name: /^Undo/ }))
    const undo = await screen.findByRole('region', { name: 'Review Undo' })
    expect(undo).toHaveTextContent('Car Loan Balance owed after Undo$19,800.00 owed')
    await user.click(within(undo).getByRole('button', { name: 'Confirm Undo' }))
    expect(await screen.findAllByText(/Balance correction/)).not.toHaveLength(0)
    expect(api.accounts[0].balance.amount).toBe('-19800.00')
  })

  it('V2_DATED_VALUE_003 a ledger account keeps editing a correction and has no Remove for it', async () => {
    mockApi({
      household,
      members: [maya],
      accounts: [
        {
          ...carLoan(),
          id: '44444444-4444-4444-8444-444444444444',
          type: 'checking',
          name: 'Everyday Checking',
          openingAmount: '5000.00',
          balance: { amount: '4900.00', asOf: '2026-09-30' },
        },
      ],
      activity: [
        { ...correction, accountId: '44444444-4444-4444-8444-444444444444', amount: '-100.00' },
      ],
    })
    renderRoute('/accounts/44444444-4444-4444-8444-444444444444')
    const row = (await screen.findByText(/Balance correction: Lender statement/)).closest('tr')!
    expect(within(row).getByRole('button', { name: /^Edit correction/ })).toBeInTheDocument()
    expect(
      within(row).queryByRole('button', { name: /^Remove correction/ }),
    ).not.toBeInTheDocument()
  })
})
