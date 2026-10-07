import { screen, waitFor, within } from '@testing-library/react'
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
const sam = { ...maya, id: '33333333-3333-4333-8333-333333333333', name: 'Sam' }
const GROCERIES = 'c0000000-0000-4000-8000-000000000003'
const BANK_FEES = 'c0000000-0000-4000-8000-000000000006'

const checking = (opening: string, balance: string, asOf: string): MockAccount => ({
  id: '44444444-4444-4444-8444-444444444444',
  type: 'checking',
  name: 'Everyday Checking',
  institution: 'Harbor Bank',
  ownerMemberIds: [maya.id],
  openedOn: '2026-09-01',
  openingAmount: opening,
  balance: { amount: balance, asOf },
  status: 'active',
})

const row = (patch: Partial<MockActivity>): MockActivity => ({
  id: '55555555-5555-4555-8555-555555555555',
  accountId: '44444444-4444-4444-8444-444444444444',
  kind: 'expense',
  amount: '100.00',
  occurredOn: '2026-09-10',
  description: 'Groceries',
  categoryId: GROCERIES,
  enteredByMemberId: maya.id,
  ...patch,
})

beforeEach(() => window.localStorage.clear())

async function openAccount(user: ReturnType<typeof renderRoute>['user'], id: string, as = 'Maya') {
  await user.selectOptions(await screen.findByLabelText('Entering as'), as)
  return id
}

describe('updating the balance', () => {
  it('V2_CHECKING_009 reviews a dated correction, asks for a reason and never calls it income', async () => {
    const account = checking('5000.00', '4900.00', '2026-09-10')
    const api = mockApi({ household, members: [maya], accounts: [account], activity: [row({})] })
    const { user } = renderRoute(`/accounts/${account.id}`)
    await openAccount(user, account.id)

    await user.click(await screen.findByRole('button', { name: 'Update balance' }))
    await user.type(await screen.findByLabelText('Balance'), '5000.00')
    const date = screen.getByLabelText('Date')
    await user.clear(date)
    await user.type(date, '2026-09-30')
    await user.click(screen.getByRole('button', { name: 'Review' }))

    const review = await screen.findByRole('region', { name: 'Review balance update' })
    expect(
      await within(review).findByText(
        (_, element) =>
          element?.tagName === 'DT' && element.textContent === 'Current Balance on 2026-09-30',
      ),
    ).toBeInTheDocument()
    expect(review).toHaveTextContent('$4,900.00')
    expect(review).toHaveTextContent('$5,000.00')
    expect(review).toHaveTextContent('$100.00 increase')
    expect(review).toHaveTextContent('excluded from Income and spending')

    // The reason is required before anything is saved.
    await user.click(within(review).getByRole('button', { name: 'Confirm correction' }))
    expect(await within(review).findByText('Enter a reason')).toBeInTheDocument()
    expect(
      api.requests.some((r) => r.startsWith('POST') && r.endsWith('/balance-corrections')),
    ).toBe(false)

    await user.type(within(review).getByLabelText('Reason'), 'Correct tracking to reviewed amount')
    await user.click(within(review).getByRole('button', { name: 'Confirm correction' }))

    // One Balance, in the detail and in the list of accounts.
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Account details' })).toHaveTextContent(
        '$5,000.00',
      ),
    )
    expect(api.accounts[0].balance.amount).toBe('5000.00')
    expect(api.requests).toContain(`POST /api/v1/accounts/${account.id}/balance-corrections`)

    await user.click(screen.getByRole('button', { name: 'Show history' }))
    const history = await screen.findByRole('table', { name: 'History' })
    expect(history).toHaveTextContent('Initial Balance')
    expect(history).toHaveTextContent('Groceries')
    expect(history).toHaveTextContent('Balance correction')
    expect(history).toHaveTextContent('Correct tracking to reviewed amount')
    expect(history).toHaveTextContent('Maya')
    // September income and spending ignore the correction.
    expect(api.activity.filter((a) => a.kind === 'income')).toHaveLength(0)
  })

  it('V2_CHECKING_009 cancel leaves the Balance and records untouched', async () => {
    const account = checking('5000.00', '4900.00', '2026-09-10')
    const api = mockApi({ household, members: [maya], accounts: [account], activity: [row({})] })
    const { user } = renderRoute(`/accounts/${account.id}`)
    await openAccount(user, account.id)
    await user.click(await screen.findByRole('button', { name: 'Update balance' }))
    await user.type(await screen.findByLabelText('Balance'), '5000.00')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    await screen.findByRole('region', { name: 'Review balance update' })
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('region', { name: 'Review balance update' })).not.toBeInTheDocument()
    expect(api.accounts[0].balance.amount).toBe('4900.00')
    expect(api.activity).toHaveLength(1)
  })

  it('V2_CHECKING_009 the form says a later change to an earlier amount moves this figure (Q-031)', async () => {
    const account = checking('5000.00', '5000.00', '2026-09-01')
    mockApi({ household, members: [maya], accounts: [account] })
    const { user } = renderRoute(`/accounts/${account.id}`)
    await openAccount(user, account.id)
    await user.click(await screen.findByRole('button', { name: 'Update balance' }))
    expect(
      await screen.findByText(/A later change to an earlier amount moves this figure/),
    ).toBeInTheDocument()
  })

  it('shows what the form refuses without a request', async () => {
    const account = checking('5000.00', '5000.00', '2026-09-01')
    const api = mockApi({ household, members: [maya], accounts: [account] })
    const { user } = renderRoute(`/accounts/${account.id}`)
    await openAccount(user, account.id)
    await user.click(await screen.findByRole('button', { name: 'Update balance' }))
    await user.type(await screen.findByLabelText('Balance'), 'abc')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(await screen.findByText('Enter a valid amount')).toBeInTheDocument()
    const date = screen.getByLabelText('Date')
    await user.clear(date)
    await user.type(date, '2026-10-04')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(
      await screen.findByText('A correction cannot be dated in the future'),
    ).toBeInTheDocument()
    expect(api.requests.some((r) => r.includes('balance-corrections'))).toBe(false)
  })

  it('V2_CHECKING_018 previews a backdated correction and views September 30 without changing today', async () => {
    const account = checking('4900.00', '5900.00', '2026-10-02')
    const salary = row({
      kind: 'income',
      amount: '1000.00',
      occurredOn: '2026-10-02',
      description: 'Salary',
      categoryId: 'c0000000-0000-4000-8000-000000000004',
    })
    const api = mockApi({ household, members: [maya], accounts: [account], activity: [salary] })
    const { user } = renderRoute(`/accounts/${account.id}`)
    await openAccount(user, account.id)

    await user.click(await screen.findByRole('button', { name: 'Update balance' }))
    await user.type(await screen.findByLabelText('Balance'), '5000.00')
    const date = screen.getByLabelText('Date')
    await user.clear(date)
    await user.type(date, '2026-09-30')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    const review = await screen.findByRole('region', { name: 'Review balance update' })
    expect(
      await within(review).findByText(
        (_, element) =>
          element?.tagName === 'DT' && element.textContent === 'Current Balance on 2026-09-30',
      ),
    ).toBeInTheDocument()
    expect(review).toHaveTextContent('$4,900.00')
    expect(review).toHaveTextContent('$100.00 increase')
    expect(review).toHaveTextContent('Everyday Checking Balance after')
    expect(review).toHaveTextContent('$6,000.00')
    expect(review).toHaveTextContent('excluded from Income and spending')

    await user.type(
      within(review).getByLabelText('Reason'),
      'Correct the amount before October began',
    )
    await user.click(within(review).getByRole('button', { name: 'Confirm correction' }))
    await screen.findByRole('button', { name: 'Show history' })
    expect(api.accounts[0].balance.amount).toBe('6000.00')

    const viewer = await screen.findByRole('region', { name: 'Balance on a date' })
    await user.type(within(viewer).getByLabelText('View Balance on'), '2026-09-30')
    expect(await within(viewer).findByText('$5,000.00')).toBeInTheDocument()
    expect(viewer).toHaveTextContent('current Balance ($6,000.00) is unchanged')
    expect(api.accounts[0].balance.amount).toBe('6000.00')
  })

  it('V2_MEMBERS_003 history names the selected member and says it is not a sign-in', async () => {
    const account = checking('5000.00', '5000.00', '2026-09-01')
    mockApi({ household, members: [maya, sam], accounts: [account] })
    const { user } = renderRoute(`/accounts/${account.id}`)
    await openAccount(user, account.id, 'Sam')
    await user.click(await screen.findByRole('button', { name: 'Update balance' }))
    await user.type(await screen.findByLabelText('Balance'), '4950.00')
    const date = screen.getByLabelText('Date')
    await user.clear(date)
    await user.type(date, '2026-09-01')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    const review = await screen.findByRole('region', { name: 'Review balance update' })
    expect(await within(review).findByText('Entered by:')).toBeInTheDocument()
    expect(review).toHaveTextContent('Sam')
    await user.type(within(review).getByLabelText('Reason'), 'Opening amount copied incorrectly')
    await user.click(within(review).getByRole('button', { name: 'Confirm correction' }))

    await user.click(await screen.findByRole('button', { name: 'Show history' }))
    const history = await screen.findByRole('table', { name: 'History' })
    expect(history).toHaveTextContent('Opening amount copied incorrectly')
    expect(history).toHaveTextContent('Sam')
    expect(history).toHaveTextContent('-$50.00')
    expect(screen.getByText(/household member chosen as entering the record/)).toBeInTheDocument()
    expect(screen.getByText(/not proof that this person signed in/)).toBeInTheDocument()
  })
})

describe('correcting a correction', () => {
  const correction = (): MockActivity =>
    row({
      id: '66666666-6666-4666-8666-666666666666',
      kind: 'correction',
      amount: '100.00',
      occurredOn: '2026-09-30',
      description: null,
      categoryId: '',
      reason: 'First review',
    })

  it('V2_CHECKING_013 shows original and corrected, cancel keeps Balance, confirm keeps both versions', async () => {
    const account = checking('5000.00', '5000.00', '2026-09-30')
    const api = mockApi({
      household,
      members: [maya],
      accounts: [account],
      activity: [row({}), correction()],
    })
    const { user } = renderRoute(`/accounts/${account.id}`)
    await openAccount(user, account.id)

    await user.click(await screen.findByRole('button', { name: 'Edit correction of 2026-09-30' }))
    const balance = await screen.findByLabelText('Balance')
    // The form starts from the Balance the correction made, not from an empty field.
    await waitFor(() => expect(balance).toHaveValue('5000.00'))
    await user.clear(balance)
    await user.type(balance, '4900.00')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    const review = await screen.findByRole('region', { name: 'Review correction change' })
    expect(await within(review).findByText('Original Balance')).toBeInTheDocument()
    expect(review).toHaveTextContent('$5,000.00')
    expect(review).toHaveTextContent('Corrected Balance')
    expect(review).toHaveTextContent('$4,900.00')
    expect(review).toHaveTextContent('2026-09-30')
    expect(review).toHaveTextContent('Original reason')
    expect(review).toHaveTextContent('First review')
    expect(review).toHaveTextContent('A reason is required')

    await user.click(within(review).getByRole('button', { name: 'Cancel' }))
    expect(api.accounts[0].balance.amount).toBe('5000.00')
    expect(api.activity).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'Edit correction of 2026-09-30' }))
    const again = await screen.findByLabelText('Balance')
    await waitFor(() => expect(again).toHaveValue('5000.00'))
    await user.clear(again)
    await user.type(again, '4900.00')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    const second = await screen.findByRole('region', { name: 'Review correction change' })
    await within(second).findByText('Original Balance')
    await user.type(
      within(second).getByLabelText('Reason'),
      'Original reviewed amount was mistyped',
    )
    await user.click(within(second).getByRole('button', { name: 'Confirm correction' }))

    await screen.findByRole('button', { name: 'Show history' })
    expect(api.accounts[0].balance.amount).toBe('4900.00')
    await user.click(screen.getByRole('button', { name: 'Show history' }))
    const history = await screen.findByRole('table', { name: 'History' })
    expect(history).toHaveTextContent('Replaced')
    expect(history).toHaveTextContent('Original reviewed amount was mistyped')
    expect(history).toHaveTextContent('First review')
    // the expense still appears once in activity
    const list = screen.getAllByRole('table')[0]
    // description and category of the one Groceries row
    expect(within(list).getAllByText('Groceries', { selector: 'td' })).toHaveLength(2)
  })
})

describe('replacing a correction with the actual fee', () => {
  it('V2_CHECKING_014 offers the replacement, shows the Balance and spending, and marks the history', async () => {
    const account = checking('6000.00', '5960.00', '2026-09-30')
    const lowered = row({
      id: '66666666-6666-4666-8666-666666666666',
      kind: 'correction',
      amount: '-40.00',
      occurredOn: '2026-09-30',
      description: null,
      categoryId: '',
      reason: 'Reviewed account amount is lower',
    })
    const api = mockApi({ household, members: [maya], accounts: [account], activity: [lowered] })
    const { user } = renderRoute(`/accounts/${account.id}`)
    await openAccount(user, account.id)

    await user.click(await screen.findByRole('button', { name: 'Add money out' }))
    await user.type(await screen.findByLabelText('Description'), 'Monthly fee')
    await user.type(screen.getByLabelText('Amount'), '40.00')
    const date = screen.getByLabelText('Date')
    await user.clear(date)
    await user.type(date, '2026-09-30')
    await user.selectOptions(screen.getByLabelText('Category'), 'Bank fees')
    await user.click(screen.getByRole('button', { name: 'Review' }))

    const review = await screen.findByRole('region', { name: 'Review money out' })
    expect(await within(review).findByText(/replace that correction/)).toBeInTheDocument()
    expect(review).toHaveTextContent('Balance will remain $5,960.00')
    expect(review).toHaveTextContent('September spending will become $40.00')
    expect(review).not.toHaveTextContent('overdrawn')
    await user.click(within(review).getByRole('button', { name: 'Confirm replacement' }))

    await screen.findByRole('button', { name: 'Show history' })
    expect(api.requests).toContain(
      `POST /api/v1/accounts/${account.id}/activity/${lowered.id}/replacement`,
    )
    expect(api.accounts[0].balance.amount).toBe('5960.00')
    await user.click(screen.getByRole('button', { name: 'Show history' }))
    const history = await screen.findByRole('table', { name: 'History' })
    expect(history).toHaveTextContent('Replaced by the Bank fees expense')
    expect(api.activity.filter((a) => !a.removedAt && a.kind === 'expense')).toHaveLength(1)
    expect(BANK_FEES).toBeTruthy()
  })
})
