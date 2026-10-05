import { fireEvent, screen, waitFor, within } from '@testing-library/react'
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
const sam = { ...maya, id: '33333333-3333-4333-8333-333333333333', name: 'Sam' }

const card = (owed: string): MockAccount => ({
  id: '44444444-4444-4444-8444-444444444444',
  type: 'credit_card',
  name: 'Everyday Credit Card',
  institution: 'Harbor Cards',
  ownerMemberIds: [maya.id],
  openedOn: '2026-09-01',
  openingAmount: owed === '0.00' ? '0.00' : `-${owed}`,
  balance: { amount: owed === '0.00' ? '0.00' : `-${owed}`, asOf: '2026-09-01' },
  status: 'active',
})

beforeEach(() => window.localStorage.clear())

type User = ReturnType<typeof renderRoute>['user']

async function fill(
  user: User,
  { amount, date, category, description = '' }: Record<string, string>,
) {
  const field = await screen.findByLabelText('Description')
  if (description) await user.type(field, description)
  await user.type(screen.getByLabelText('Amount'), amount)
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: date } })
  await user.selectOptions(screen.getByLabelText('Category'), category)
}

describe('card purchases and refunds', () => {
  it('V2_CARD_009 rejects a negative purchase, keeps the date and category, and adds nothing when cancelled', async () => {
    const api = mockApi({ household, members: [maya, sam], accounts: [card('1000.00')] })
    const { user } = renderRoute(`/accounts/${card('1000.00').id}`)
    await user.click(await screen.findByRole('button', { name: 'Record purchase' }))

    await fill(user, { amount: '-$100.00', date: '2026-09-10', category: 'Groceries' })
    await user.click(screen.getByRole('button', { name: 'Review' }))

    expect(await screen.findByText('Enter an amount greater than zero')).toBeInTheDocument()
    expect(screen.getByLabelText('Date')).toHaveValue('2026-09-10')
    expect(screen.getByLabelText('Category')).toHaveDisplayValue('Groceries')
    expect(screen.getByText('Everyday Credit Card', { selector: 'strong' })).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Amount'))
    await user.type(screen.getByLabelText('Amount'), '$100.00')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(await screen.findByRole('region', { name: 'Review purchase' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(api.activity).toHaveLength(0)
    expect(api.accounts[0].balance.amount).toBe('-1000.00')
    expect(await screen.findByRole('main')).toHaveTextContent('$1,000.00 owed')
  })

  it('V2_CARD_008 records a $20.00 refund as Card credit and Spending shows -$20.00, explained', async () => {
    const api = mockApi({ household, members: [maya, sam], accounts: [card('0.00')] })
    const { user } = renderRoute(`/accounts/${card('0.00').id}`)
    await user.selectOptions(await screen.findByLabelText('Entering as'), 'Maya')
    await user.click(await screen.findByRole('button', { name: 'Record refund' }))

    await fill(user, { amount: '$20.00', date: '2026-09-12', category: 'Groceries' })
    await user.click(screen.getByRole('button', { name: 'Review' }))
    const review = await screen.findByRole('region', { name: 'Review refund' })
    expect(within(review).getByText('Refunded to')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirm saving' }))

    expect(await screen.findByRole('main')).toHaveTextContent('$20.00 Card credit')
    expect(api.activity[0]).toMatchObject({ kind: 'refund', amount: '20.00' })
    expect(api.accounts[0].balance.amount).toBe('20.00')
  })

  it('V2_CARD_008 Spending and the Month review show -$20.00, with refunds exceeding purchases explained', async () => {
    const groceries = '2026-09-12'
    mockApi({
      household,
      members: [maya, sam],
      accounts: [{ ...card('0.00'), balance: { amount: '20.00', asOf: groceries } }],
      activity: [
        {
          id: 'r1',
          accountId: card('0.00').id,
          kind: 'refund',
          amount: '20.00',
          occurredOn: groceries,
          description: 'Groceries refund',
          categoryId: 'c0000000-0000-4000-8000-000000000003',
          enteredByMemberId: maya.id,
        },
      ],
    })
    const { user } = renderRoute('/spending')
    fireEvent.change(await screen.findByLabelText('Month'), { target: { value: '2026-09' } })

    const review = await screen.findByRole('region', { name: 'Month review' })
    await waitFor(() => expect(review).toHaveTextContent('Spending -$20.00'))
    expect(review).toHaveTextContent('Income minus spending $20.00')
    const month = await screen.findByRole('region', { name: /September 2026/ })
    // The month and its Groceries row both say why the figure is below zero.
    expect(await within(month).findAllByText('Refunds exceed purchases')).toHaveLength(2)
    await user.click(within(month).getByRole('button', { name: 'Groceries' }))
    const table = await within(month).findByRole('table', { name: 'Expenses in this category' })
    expect(table).toHaveTextContent('2026-09-12')
    expect(table).toHaveTextContent('Everyday Credit Card')
    expect(table).toHaveTextContent('-$20.00')
  })
  it('V2_CARD_009 explains a purchase dated before the card opened at the Date field, with nothing saved', async () => {
    const api = mockApi({ household, members: [maya, sam], accounts: [card('1000.00')] })
    const { user } = renderRoute(`/accounts/${card('1000.00').id}`)
    await user.click(await screen.findByRole('button', { name: 'Record purchase' }))

    await fill(user, { amount: '$100.00', date: '2026-08-15', category: 'Groceries' })
    await user.click(screen.getByRole('button', { name: 'Review' }))

    expect(await screen.findByText("This date is before the account's opening date")).toBeVisible()
    expect(screen.getByLabelText('Date')).toHaveFocus()
    expect(screen.getByLabelText('Amount')).toHaveValue('$100.00')
    expect(api.activity).toHaveLength(0)
  })

  it('V2_CARD_006 reviews the removal of a card purchase in owed terms, then restores the debt', async () => {
    const owed = card('1100.00')
    const api = mockApi({
      household,
      members: [maya, sam],
      accounts: [{ ...owed, balance: { amount: '-1100.00', asOf: '2026-09-10' } }],
      activity: [
        {
          id: 'p1',
          accountId: owed.id,
          kind: 'expense',
          amount: '100.00',
          occurredOn: '2026-09-10',
          description: 'Groceries run',
          categoryId: 'c0000000-0000-4000-8000-000000000003',
          enteredByMemberId: maya.id,
        },
      ],
    })
    const { user } = renderRoute(`/accounts/${owed.id}`)
    await user.selectOptions(await screen.findByLabelText('Entering as'), 'Maya')
    await user.click(await screen.findByRole('button', { name: 'Remove Groceries run' }))

    const review = await screen.findByRole('region', { name: 'Review removal' })
    expect(review).toHaveTextContent('Everyday Credit Card Balance after removal$1,000.00 owed')
    await user.click(screen.getByRole('button', { name: 'Confirm removal' }))
    await waitFor(() => expect(api.accounts[0].balance.amount).toBe('-1000.00'))
  })
})
