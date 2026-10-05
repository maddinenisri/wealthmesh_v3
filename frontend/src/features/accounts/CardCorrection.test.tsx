import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  CATEGORIES,
  mockApi,
  type MockAccount,
  type MockActivity,
  type MockStatement,
} from '../../test/mockApi'
import { renderRoute } from '../../test/render'

const household = { id: '11111111-1111-4111-8111-111111111111', name: 'Maya and Sam' }
const maya = {
  id: '22222222-2222-4222-8222-222222222222',
  householdId: household.id,
  name: 'Maya',
  label: null,
}
const groceries = CATEGORIES.find((category) => category.name === 'Groceries')!

const checking: MockAccount = {
  id: '44444444-4444-4444-8444-444444444444',
  type: 'checking',
  name: 'Everyday Checking',
  institution: 'Harbor Bank',
  ownerMemberIds: [maya.id],
  openedOn: '2026-09-01',
  openingAmount: '5000.00',
  balance: { amount: '4500.00', asOf: '2026-09-20' },
  status: 'active',
}
const card = (balance: string, asOf: string): MockAccount => ({
  id: '55555555-5555-4555-8555-555555555555',
  type: 'credit_card',
  name: 'Everyday Credit Card',
  institution: 'Harbor Cards',
  ownerMemberIds: [maya.id],
  openedOn: '2026-09-01',
  openingAmount: '-1000.00',
  balance: { amount: balance, asOf },
  status: 'active',
})

const base = {
  categoryId: groceries.id,
  enteredByMemberId: maya.id,
  createdAt: '2026-09-20T09:00:00Z',
  description: null,
}
/** $100.00 purchase, $20.00 refund and a $500.00 checking payment: $580.00 owed. */
const activity = (): MockActivity[] => [
  {
    ...base,
    id: 'a1',
    accountId: card('0', '').id,
    kind: 'expense',
    amount: '100.00',
    occurredOn: '2026-09-10',
  },
  {
    ...base,
    id: 'a2',
    accountId: card('0', '').id,
    kind: 'refund',
    amount: '20.00',
    occurredOn: '2026-09-12',
  },
  {
    ...base,
    id: 'a3',
    accountId: card('0', '').id,
    kind: 'card_payment_in',
    amount: '500.00',
    occurredOn: '2026-09-20',
    categoryId: '',
    movementId: '99999999-9999-4999-8999-999999999999',
  },
  {
    ...base,
    id: 'a4',
    accountId: checking.id,
    kind: 'card_payment',
    amount: '500.00',
    occurredOn: '2026-09-20',
    categoryId: '',
    movementId: '99999999-9999-4999-8999-999999999999',
  },
]

const september = (accountId: string, balance: string): MockStatement => ({
  id: '66666666-6666-4666-8666-666666666666',
  accountId,
  statementOn: '2026-09-30',
  balance,
  note: 'September statement',
  enteredByMemberId: maya.id,
})

beforeEach(() => window.localStorage.clear())

describe('Update balance on a card', () => {
  it('V2_CARD_010 reviews $580.00 owed against $600.00 owed, a $20.00 increase in debt, then saves one correction', async () => {
    const owed = card('-580.00', '2026-09-20')
    const api = mockApi({
      household,
      members: [maya],
      accounts: [checking, owed],
      activity: activity(),
      statements: [september(owed.id, '-600.00')],
    })
    const { user } = renderRoute(`/accounts/${owed.id}`)
    await user.selectOptions(await screen.findByLabelText('Entering as'), 'Maya')
    const statements = await screen.findByRole('region', { name: 'Supporting statements' })
    expect(await within(statements).findByText(/\$600\.00 owed/)).toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: 'Update balance' }))
    // A card has no starting-balance option: its Balance is updated on a date.
    expect(screen.queryByText('Correct the starting balance')).not.toBeInTheDocument()
    await user.type(await screen.findByLabelText('Balance'), '600.00')
    await user.selectOptions(screen.getByLabelText('Balance means'), 'Owed')
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-09-30' } })
    await user.click(screen.getByRole('button', { name: 'Review' }))

    const review = await screen.findByRole('region', { name: 'Review balance update' })
    expect(await within(review).findByText('Current Balance on 2026-09-30')).toBeInTheDocument()
    expect(review).toHaveTextContent('Current Balance on 2026-09-30$580.00 owed')
    expect(review).toHaveTextContent('Requested Balance$600.00 owed')
    expect(review).toHaveTextContent('Difference$20.00 increase in debt')
    expect(review).not.toHaveTextContent('overdrawn')

    await user.type(within(review).getByLabelText('Reason'), 'Correct to reviewed amount')
    await user.click(within(review).getByRole('button', { name: 'Confirm correction' }))

    await waitFor(() => expect(api.accounts[1].balance.amount).toBe('-600.00'))
    expect(api.accounts[0].balance.amount).toBe('4500.00')
    expect(api.activity.filter((row) => row.kind === 'correction')).toHaveLength(1)
    expect(await screen.findByRole('main')).toHaveTextContent('$600.00 owed')
  })

  it('V2_CARD_010 a typed amount without a side, or a negative one, is explained and nothing is saved', async () => {
    const owed = card('-580.00', '2026-09-20')
    const api = mockApi({ household, members: [maya], accounts: [checking, owed] })
    const { user } = renderRoute(`/accounts/${owed.id}`)
    await user.click(await screen.findByRole('button', { name: 'Update balance' }))
    await user.type(await screen.findByLabelText('Balance'), '-$600.00')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(await screen.findByText('Enter a valid amount')).toBeInTheDocument()
    expect(api.requests.some((line) => line.startsWith('POST'))).toBe(false)
  })
})

describe('supporting statements on a card', () => {
  it('V2_SUPPORTING_RECORD_001 adds a corrected statement, keeps the original, and the Balance stays $1,000.00 owed', async () => {
    const owed = card('-1000.00', '2026-09-30')
    const api = mockApi({
      household,
      members: [maya],
      accounts: [owed],
      statements: [september(owed.id, '-1000.00')],
    })
    const { user } = renderRoute(`/accounts/${owed.id}`)
    await user.selectOptions(await screen.findByLabelText('Entering as'), 'Maya')
    const statements = await screen.findByRole('region', { name: 'Supporting statements' })
    expect(await within(statements).findByText(/\$1,000\.00 owed/)).toBeInTheDocument()

    await user.click(
      await within(statements).findByRole('button', { name: 'Replace with corrected version' }),
    )
    // The form starts from the original: $1,000.00, and what it means.
    expect(await screen.findByLabelText('Statement balance')).toHaveValue('1000.00')
    expect(screen.getByLabelText('Statement shows')).toHaveDisplayValue('Owed')
    await user.type(screen.getByLabelText('Reason'), 'Issuer supplied a corrected statement')
    await user.click(screen.getByRole('button', { name: 'Review' }))

    const review = await screen.findByRole('region', { name: 'Review statement replacement' })
    expect(review).toHaveTextContent(
      'Original statementSeptember statement dated 2026-09-30, $1,000.00 owed',
    )
    expect(review).toHaveTextContent(
      'Corrected statementSeptember statement dated 2026-09-30, $1,000.00 owed',
    )
    expect(review).toHaveTextContent('Your Balance stays $1,000.00 owed')
    await user.click(screen.getByRole('button', { name: 'Confirm replacement' }))

    await waitFor(() => expect(api.statements).toHaveLength(2))
    expect(await within(statements).findByText('Active version')).toBeInTheDocument()
    expect(within(statements).getByText('Replaced')).toBeInTheDocument()
    expect(
      within(statements).getByText(/Reason: Issuer supplied a corrected statement/),
    ).toBeInTheDocument()
    expect(api.statements[1]).toMatchObject({
      balance: '-1000.00',
      replacesId: september(owed.id, '').id,
    })
    expect(api.accounts[0].balance.amount).toBe('-1000.00')
    expect(api.activity).toHaveLength(0)
  })
})
