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

const checking = (): MockAccount => ({
  id: '44444444-4444-4444-8444-444444444444',
  type: 'checking',
  name: 'Everyday Checking',
  institution: 'Harbor Bank',
  ownerMemberIds: [maya.id],
  openedOn: '2026-09-01',
  openingAmount: '5000.00',
  balance: { amount: '5000.00', asOf: '2026-09-01' },
  status: 'active',
})
const card = (owed: string): MockAccount => ({
  id: '55555555-5555-4555-8555-555555555555',
  type: 'credit_card',
  name: 'Everyday Credit Card',
  institution: 'Harbor Cards',
  ownerMemberIds: [maya.id],
  openedOn: '2026-09-01',
  openingAmount: `-${owed}`,
  balance: { amount: `-${owed}`, asOf: '2026-09-01' },
  status: 'active',
})

beforeEach(() => window.localStorage.clear())

type User = ReturnType<typeof renderRoute>['user']
const posts = (requests: string[]) => requests.filter((line) => line.startsWith('POST '))

async function openPayment(user: User) {
  await user.selectOptions(await screen.findByLabelText('Entering as'), 'Maya')
  await user.click(await screen.findByRole('button', { name: 'Record payment' }))
  await screen.findByRole('heading', { name: 'Record payment' })
}

async function fillPayment(user: User, amount: string, date: string) {
  await user.selectOptions(screen.getByLabelText('Paid from'), 'Everyday Checking (Checking)')
  await user.type(screen.getByLabelText('Amount'), amount)
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: date } })
  await user.click(screen.getByRole('button', { name: 'Review' }))
}

describe('paying a card', () => {
  it('V2_CARD_007 names the card as the destination, lets the bank be chosen, reviews both Balances and cancels', async () => {
    const api = mockApi({
      household,
      members: [maya, sam],
      accounts: [checking(), card('1000.00')],
    })
    const { user } = renderRoute(`/accounts/${card('1000.00').id}`)
    await openPayment(user)

    expect(screen.getByText('Paid to')).toBeInTheDocument()
    expect(screen.getByText('Everyday Credit Card', { selector: 'p' })).toBeInTheDocument()
    // Only a bank account can have paid: the card itself is not offered.
    const from = screen.getByLabelText('Paid from')
    expect(within(from).getByRole('option', { name: 'Everyday Checking (Checking)' })).toBeVisible()
    expect(within(from).queryByRole('option', { name: /Credit card/ })).not.toBeInTheDocument()

    await fillPayment(user, '500.00', '2026-09-20')
    const heading = await screen.findByRole('heading', { name: 'Review payment' })
    expect(heading).toHaveFocus()
    const effect = await screen.findByRole('region', { name: 'Effect of this payment' })
    expect(await within(effect).findByText('Everyday Checking Balance')).toBeInTheDocument()
    expect(effect).toHaveTextContent('Everyday Checking Balance$4,500.00')
    expect(effect).toHaveTextContent('Everyday Credit Card Balance$500.00 owed')
    expect(effect).toHaveTextContent('not income or spending')

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(posts(api.requests)).toHaveLength(0)
    expect(api.accounts[0].balance.amount).toBe('5000.00')
    expect(api.accounts[1].balance.amount).toBe('-1000.00')
    expect(await screen.findByRole('main')).toHaveTextContent('$1,000.00 owed')
    expect(await screen.findByRole('button', { name: 'Record payment' })).toHaveFocus()
  })

  it('V2_CARD_012 explains an overpayment as Card credit and shows the new Balances once confirmed', async () => {
    const api = mockApi({
      household,
      members: [maya, sam],
      accounts: [checking(), card('100.00')],
    })
    const { user } = renderRoute(`/accounts/${card('100.00').id}`)
    await openPayment(user)

    await fillPayment(user, '150.00', '2026-09-20')
    const effect = await screen.findByRole('region', { name: 'Effect of this payment' })
    expect(await within(effect).findByText('Everyday Checking Balance')).toBeInTheDocument()
    expect(effect).toHaveTextContent('Everyday Credit Card Balance$50.00 Card credit')
    expect(effect).toHaveTextContent('Everyday Checking Balance$4,850.00')
    expect(effect).toHaveTextContent('left with a $50.00 Card credit')

    await user.click(screen.getByRole('button', { name: 'Confirm payment' }))
    expect(await screen.findByRole('main')).toHaveTextContent('$50.00 Card credit')
    expect(api.accounts[0].balance.amount).toBe('4850.00')
    expect(api.accounts[1].balance.amount).toBe('50.00')
    expect(posts(api.requests)).toContain('POST /api/v1/card-payments')
  })

  it('V2_CARD_013 corrects, removes and restores a payment with both accounts kept together', async () => {
    const api = mockApi({
      household,
      members: [maya, sam],
      accounts: [checking(), card('1000.00')],
    })
    const { user } = renderRoute(`/accounts/${card('1000.00').id}`)
    await openPayment(user)
    await fillPayment(user, '500.00', '2026-09-20')
    await user.click(await screen.findByRole('button', { name: 'Confirm payment' }))
    await screen.findByRole('cell', { name: '2026-09-20' })
    expect(api.accounts[1].balance.amount).toBe('-500.00')

    // Correct it to $400.00 on September 21: the card and checking move together.
    await user.click(screen.getByRole('button', { name: 'Edit payment from Everyday Checking' }))
    const amount = await screen.findByLabelText('Amount')
    await user.clear(amount)
    await user.type(amount, '400.00')
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-09-21' } })
    await user.click(screen.getByRole('button', { name: 'Review' }))
    await user.click(await screen.findByRole('button', { name: 'Confirm payment' }))
    await screen.findByRole('cell', { name: '2026-09-21' })
    expect(api.accounts[1].balance.amount).toBe('-600.00')
    expect(api.accounts[0].balance.amount).toBe('4600.00')

    // Remove: both go back, and the review names both sides.
    await user.click(screen.getByRole('button', { name: 'Remove payment from Everyday Checking' }))
    const review = await screen.findByRole('region', { name: 'Review removal' })
    expect(review).toHaveTextContent('Everyday Credit Card Balance after removal$1,000.00 owed')
    expect(review).toHaveTextContent('Everyday Checking Balance after removal$5,000.00')
    await user.click(screen.getByRole('button', { name: 'Confirm removal' }))
    expect(await screen.findByText('No money activity has been recorded yet.')).toBeInTheDocument()
    expect(api.accounts[1].balance.amount).toBe('-1000.00')
    expect(api.accounts[0].balance.amount).toBe('5000.00')

    // Undo from history brings back the one corrected $400.00 payment.
    await user.click(screen.getByRole('button', { name: 'Show history' }))
    await user.click(
      await screen.findByRole('button', { name: 'Undo payment from Everyday Checking' }),
    )
    await user.click(await screen.findByRole('button', { name: 'Confirm Undo' }))
    await waitFor(() => expect(api.accounts[1].balance.amount).toBe('-600.00'))
    expect(api.accounts[0].balance.amount).toBe('4600.00')
  })
})
