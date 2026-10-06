import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { CATEGORIES, mockApi, type MockAccount, type MockSchedule } from '../../test/mockApi'
import { renderRoute } from '../../test/render'

const household = { id: '11111111-1111-4111-8111-111111111111', name: 'Maya and Sam' }
const maya = {
  id: '22222222-2222-4222-8222-222222222222',
  householdId: household.id,
  name: 'Maya',
  label: null,
}
const sam = {
  id: '33333333-3333-4333-8333-333333333333',
  householdId: household.id,
  name: 'Sam',
  label: null,
}
const checking: MockAccount = {
  id: '44444444-4444-4444-8444-444444444444',
  type: 'checking',
  name: 'Everyday Checking',
  institution: 'Harbor Bank',
  ownerMemberIds: [maya.id],
  openedOn: '2026-09-01',
  openingAmount: '5000.00',
  balance: { amount: '5000.00', asOf: '2026-09-01' },
  status: 'active',
}
const seed = () => ({
  household,
  members: [maya, sam],
  accounts: [{ ...checking }],
  today: '2026-09-30',
})

beforeEach(() => window.localStorage.clear())

type User = ReturnType<typeof renderRoute>['user']

async function fill(
  user: User,
  fields: { name: string; amount: string; frequency: string; due: string },
) {
  await user.click(await screen.findByRole('button', { name: 'Add recurring bill' }))
  await user.type(await screen.findByLabelText('Name'), fields.name)
  await user.type(screen.getByLabelText('Expected amount'), fields.amount)
  await user.selectOptions(screen.getByLabelText('Frequency'), fields.frequency)
  fireEvent.change(screen.getByLabelText('First due date'), { target: { value: fields.due } })
  await user.selectOptions(screen.getByLabelText('Paid from'), 'Everyday Checking')
  await user.selectOptions(screen.getByLabelText('Category'), 'Utilities')
}

describe('recurring bills: create', () => {
  it.each([
    ['45.00', 'Weekly', '2026-10-09', '2026-10-16'],
    ['180.00', 'Monthly', '2026-10-05', '2026-11-05'],
    ['120.00', 'Yearly', '2026-10-20', '2027-10-20'],
  ])(
    'V2_RECURRING_006 reviews and saves a %s %s Gym membership due %s, following %s, with no money change',
    async (amount, frequency, due, following) => {
      const api = mockApi(seed())
      const { user } = renderRoute('/recurring')
      await user.selectOptions(await screen.findByLabelText('Entering as'), 'Maya')
      await fill(user, { name: 'Gym membership', amount, frequency, due })
      await user.click(screen.getByRole('button', { name: 'Review' }))

      const review = await screen.findByRole('region', { name: /Review: Gym membership/ })
      expect(review).toHaveTextContent(frequency)
      expect(review).toHaveTextContent(due)
      expect(review).toHaveTextContent(following)
      expect(review).toHaveTextContent('Estimate, not a recorded expense')
      expect(api.schedules).toHaveLength(0)

      await user.click(within(review).getByRole('button', { name: 'Confirm saving the schedule' }))
      const status = await screen.findByRole('status')
      expect(status).toHaveTextContent(`next due ${due}, then ${following}`)
      expect(status).toHaveTextContent('Balance and spending are unchanged')
      expect(status).toHaveFocus()
      const list = await screen.findByRole('region', { name: 'Schedules' })
      expect(list).toHaveTextContent(`Next due ${due}. Following ${following}.`)
      expect(list).toHaveTextContent('Active')
      expect(api.schedules).toHaveLength(1)
      expect(api.activity).toHaveLength(0)
      expect(api.accounts[0].balance.amount).toBe('5000.00')
      expect(api.requests).not.toContain(`POST /api/v1/accounts/${checking.id}/expenses`)
    },
  )

  it('V2_RECURRING_005 an estimate of zero or less is refused in the form and saved nowhere', async () => {
    const api = mockApi(seed())
    const { user } = renderRoute('/recurring')
    await user.selectOptions(await screen.findByLabelText('Entering as'), 'Sam')
    await fill(user, {
      name: 'Electricity',
      amount: '-180.00',
      frequency: 'Monthly',
      due: '2026-10-05',
    })
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(await screen.findByText('Enter an amount greater than zero')).toBeInTheDocument()
    expect(api.schedules).toHaveLength(0)
  })

  it('V2_RECURRING_006 Cancel and Back from the review save nothing and Back keeps the values', async () => {
    const api = mockApi(seed())
    const { user } = renderRoute('/recurring')
    await user.selectOptions(await screen.findByLabelText('Entering as'), 'Maya')
    await fill(user, {
      name: 'Gym membership',
      amount: '45.00',
      frequency: 'Weekly',
      due: '2026-10-09',
    })
    await user.click(screen.getByRole('button', { name: 'Review' }))
    await user.click(await screen.findByRole('button', { name: 'Back' }))
    expect(await screen.findByLabelText('Name')).toHaveValue('Gym membership')
    expect(screen.getByLabelText('Expected amount')).toHaveValue('45.00')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add recurring bill' })).toHaveFocus()
    expect(api.schedules).toHaveLength(0)
  })
})

describe('recurring bills: suggestions', () => {
  const electricity = () =>
    ['2026-07-05', '2026-08-05', '2026-09-05'].map((date, index) => ({
      id: `55555555-5555-4555-8555-00000000000${index}`,
      accountId: checking.id,
      kind: 'expense',
      amount: '180.00',
      occurredOn: date,
      description: 'Electricity',
      categoryId: CATEGORIES.find((c) => c.name === 'Utilities')!.id,
      enteredByMemberId: maya.id,
    }))
  const withBills = () => {
    const base = seed()
    return {
      ...base,
      accounts: [{ ...checking, balance: { amount: '4820.00', asOf: '2026-09-05' } }],
      activity: electricity(),
      suggestions: [
        {
          accountId: checking.id,
          categoryId: CATEGORIES.find((c) => c.name === 'Utilities')!.id,
          description: 'Electricity',
        },
      ],
    }
  }

  it('V2_RECURRING_001 shows the monthly suggestion with its three supporting bills and says it is an estimate', async () => {
    const api = mockApi(withBills())
    renderRoute('/recurring')
    const card = await screen.findByRole('region', { name: 'Suggestions' })
    expect(card).toHaveTextContent('Electricity')
    expect(card).toHaveTextContent('Expected $180.00, Monthly')
    expect(card).toHaveTextContent('Last recorded bill 2026-09-05')
    expect(card).toHaveTextContent('Next expected bill 2026-10-05')
    expect(card).toHaveTextContent('Estimate, not a recorded expense')
    expect(card).toHaveTextContent('cannot always be detected')
    const bills = within(card).getByText('Supporting bills (3)')
    expect(bills).toBeInTheDocument()
    expect(within(card).getAllByRole('link')).toHaveLength(3)
    expect(api.activity).toHaveLength(3)
    expect(api.schedules).toHaveLength(0)
  })

  it('V2_RECURRING_002 confirming the suggestion saves the schedule with its bills and changes no money', async () => {
    const api = mockApi(withBills())
    const { user } = renderRoute('/recurring')
    await user.selectOptions(await screen.findByLabelText('Entering as'), 'Maya')
    await user.click(await screen.findByRole('button', { name: 'Review and confirm' }))
    expect(await screen.findByLabelText('Expected amount')).toHaveValue('180.00')
    expect(screen.getByLabelText('First due date')).toHaveValue('2026-10-05')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    const review = await screen.findByRole('region', { name: /Review: Electricity/ })
    expect(review).toHaveTextContent('2026-10-05')
    await user.click(within(review).getByRole('button', { name: 'Confirm saving the schedule' }))

    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('next due 2026-10-05')
    const list = await screen.findByRole('region', { name: 'Schedules' })
    expect(list).toHaveTextContent('Expected $180.00')
    expect(list).toHaveTextContent('Next due 2026-10-05')
    expect(within(list).getByText('Supporting bills (3)')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Suggestions' })).not.toBeInTheDocument()
    expect(api.accounts[0].balance.amount).toBe('4820.00')
    expect(api.activity).toHaveLength(3)
  })

  it('V2_RECURRING_009 dismissing needs a review; Cancel keeps the suggestion; Confirm removes it and keeps the bills', async () => {
    const api = mockApi(withBills())
    const { user } = renderRoute('/recurring')
    await user.selectOptions(await screen.findByLabelText('Entering as'), 'Sam')
    const opener = await screen.findByRole('button', { name: 'Dismiss suggestion' })
    await user.click(opener)
    const review = await screen.findByRole('region', { name: /Review dismissing/ })
    await user.click(within(review).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('region', { name: /Review dismissing/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dismiss suggestion' })).toHaveFocus()
    expect(screen.getByRole('region', { name: 'Suggestions' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Dismiss suggestion' }))
    await user.click(
      await screen.findByRole('button', { name: 'Confirm dismissing the suggestion' }),
    )
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('All 3 recorded bills are unchanged')
    expect(status).toHaveFocus()
    expect(screen.queryByRole('region', { name: 'Suggestions' })).not.toBeInTheDocument()
    expect(api.activity).toHaveLength(3)
  })
})

describe('recurring bills: change, pause, resume, delete', () => {
  const utilities = () => CATEGORIES.find((c) => c.name === 'Utilities')!.id
  const bill = () => ({
    id: '55555555-5555-4555-8555-000000000001',
    accountId: checking.id,
    kind: 'expense',
    amount: '180.00',
    occurredOn: '2026-09-05',
    description: 'Electricity',
    categoryId: utilities(),
    enteredByMemberId: maya.id,
  })
  const electricity = (): MockSchedule => ({
    id: '66666666-6666-4666-8666-000000000001',
    accountId: checking.id,
    description: 'Electricity',
    categoryId: utilities(),
    amount: '180.00',
    frequency: 'monthly',
    status: 'active',
    nextDueOn: '2026-10-05',
    anchorDay: 5,
    occurrences: [],
    events: [],
  })
  const withSchedule = () => ({
    ...seed(),
    accounts: [{ ...checking, balance: { amount: '4820.00', asOf: '2026-09-05' } }],
    activity: [bill()],
    schedules: [electricity()],
  })

  it('V2_RECURRING_007 changing the estimate is reviewed against what it was and leaves the paid bill alone', async () => {
    const api = mockApi(withSchedule())
    const { user } = renderRoute('/recurring')
    await user.selectOptions(await screen.findByLabelText('Entering as'), 'Maya')
    await user.click(await screen.findByRole('button', { name: 'Change' }))
    expect(await screen.findByLabelText('Expected amount')).toHaveValue('180.00')
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    await user.clear(screen.getByLabelText('Expected amount'))
    await user.type(screen.getByLabelText('Expected amount'), '200.00')
    await user.selectOptions(screen.getByLabelText('Frequency'), 'Weekly')
    fireEvent.change(screen.getByLabelText('Next due date'), { target: { value: '2026-10-09' } })
    await user.click(screen.getByRole('button', { name: 'Review' }))
    const review = await screen.findByRole('region', { name: /Review: Electricity/ })
    expect(review).toHaveTextContent('Was $180.00 Monthly, next due 2026-10-05')
    expect(review).toHaveTextContent('Following occurrence2026-10-16')
    expect(api.schedules[0].amount).toBe('180.00')
    await user.click(within(review).getByRole('button', { name: 'Confirm the change' }))
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent(
      'now expected $200.00 weekly, next due 2026-10-09, then 2026-10-16',
    )
    expect(status).toHaveTextContent('Bills already paid are unchanged')
    expect(status).toHaveFocus()
    expect(api.activity).toHaveLength(1)
    expect(api.activity[0].amount).toBe('180.00')
    expect(api.accounts[0].balance.amount).toBe('4820.00')
  })

  it('V2_RECURRING_005 a corrected 200.00 that is cancelled leaves the expected amount 180.00 and no expense', async () => {
    const api = mockApi(withSchedule())
    const { user } = renderRoute('/recurring')
    await user.selectOptions(await screen.findByLabelText('Entering as'), 'Sam')
    const opener = await screen.findByRole('button', { name: 'Change' })
    await user.click(opener)
    await user.clear(await screen.findByLabelText('Expected amount'))
    await user.type(screen.getByLabelText('Expected amount'), '200.00')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    await screen.findByRole('region', { name: /Review: Electricity/ })
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('region', { name: /Review: Electricity/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Change' })).toHaveFocus()
    expect(screen.getByRole('region', { name: 'Schedules' })).toHaveTextContent('Expected $180.00')
    expect(api.schedules[0].amount).toBe('180.00')
    expect(api.activity).toHaveLength(1)
  })

  it('V2_RECURRING_008 pausing is reviewed and labels the bill Paused; resuming asks for the next due date', async () => {
    const api = mockApi(withSchedule())
    const { user } = renderRoute('/recurring')
    await user.selectOptions(await screen.findByLabelText('Entering as'), 'Sam')
    await user.click(await screen.findByRole('button', { name: 'Pause' }))
    const review = await screen.findByRole('region', { name: /Review pausing Electricity/ })
    expect(review).toHaveTextContent('never overdue')
    await user.click(within(review).getByRole('button', { name: 'Confirm pausing' }))
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('Electricity is paused. No expense or reminder is created')
    const list = screen.getByRole('region', { name: 'Schedules' })
    expect(list).toHaveTextContent('Paused')
    expect(list).toHaveTextContent('no payment is expected until it resumes')
    expect(api.activity).toHaveLength(1)

    await user.click(await screen.findByRole('button', { name: 'Resume' }))
    const resume = await screen.findByRole('region', { name: /Review resuming Electricity/ })
    expect(within(resume).getByRole('button', { name: 'Confirm resuming' })).toBeDisabled()
    fireEvent.change(within(resume).getByLabelText('Next due date'), {
      target: { value: '2026-11-05' },
    })
    expect(resume).toHaveTextContent('Nothing is recorded for the months it was paused')
    await user.click(within(resume).getByRole('button', { name: 'Confirm resuming' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Electricity is Active again: expected $180.00, next due 2026-11-05',
    )
    expect(screen.getByRole('region', { name: 'Schedules' })).toHaveTextContent('Active')
    expect(api.activity).toHaveLength(1)
  })

  it('V2_RECURRING_009 deleting an estimate is reviewed, says no reminder is created and keeps the bill', async () => {
    const api = mockApi(withSchedule())
    const { user } = renderRoute('/recurring')
    await user.selectOptions(await screen.findByLabelText('Entering as'), 'Maya')
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    const review = await screen.findByRole('region', { name: /Review deleting the Electricity/ })
    expect(review).toHaveTextContent('no reminder is created from it')
    await user.click(within(review).getByRole('button', { name: 'Confirm deleting the estimate' }))
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('The Electricity estimate is deleted')
    expect(status).toHaveTextContent('1 recorded bill stays')
    expect(status).toHaveFocus()
    expect(screen.getByRole('region', { name: 'Schedules' })).toHaveTextContent(
      'No recurring bills have been saved.',
    )
    expect(api.activity).toHaveLength(1)
    expect(api.reminders).toHaveLength(0)
  })

  it('V2_RECURRING_008 a schedule on an archived account stays visible and offers only Pause and Delete', async () => {
    const seeded = withSchedule()
    seeded.accounts = [{ ...seeded.accounts[0], status: 'archived' }]
    mockApi(seeded)
    renderRoute('/recurring')
    const list = await screen.findByRole('region', { name: 'Schedules' })
    expect(await within(list).findByText(/archived account/)).toBeInTheDocument()
    expect(within(list).queryByRole('button', { name: 'Change' })).not.toBeInTheDocument()
    expect(within(list).getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    expect(within(list).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })
})

describe('recurring bills: record the actual expense', () => {
  const utilities = () => CATEGORIES.find((c) => c.name === 'Utilities')!.id
  const withSchedule = () => ({
    ...seed(),
    accounts: [{ ...checking, balance: { amount: '4820.00', asOf: '2026-09-05' } }],
    activity: [
      {
        id: '55555555-5555-4555-8555-000000000001',
        accountId: checking.id,
        kind: 'expense',
        amount: '180.00',
        occurredOn: '2026-09-05',
        description: 'Electricity',
        categoryId: utilities(),
        enteredByMemberId: maya.id,
      },
    ],
    schedules: [
      {
        id: '66666666-6666-4666-8666-000000000001',
        accountId: checking.id,
        description: 'Electricity',
        categoryId: utilities(),
        amount: '180.00',
        frequency: 'monthly' as const,
        status: 'active' as const,
        nextDueOn: '2026-10-05',
        anchorDay: 5,
        occurrences: [],
        events: [],
      },
    ],
  })

  async function openRecord(user: User, paidOn: string) {
    await user.selectOptions(await screen.findByLabelText('Entering as'), 'Sam')
    await user.click(await screen.findByRole('button', { name: 'Record actual expense' }))
    expect(await screen.findByLabelText('Actual amount')).toHaveValue('180.00')
    expect(screen.getByLabelText('Category')).toHaveValue(utilities())
    fireEvent.change(screen.getByLabelText('Payment date'), { target: { value: paidOn } })
    await user.click(screen.getByRole('button', { name: 'Review' }))
    return screen.findByRole('region', { name: /Review recording Electricity/ })
  }

  it('V2_RECURRING_003 reviews an early payment, changes nothing until Confirm, then marks the occurrence paid early', async () => {
    const api = mockApi(withSchedule())
    const { user } = renderRoute('/recurring')
    const review = await openRecord(user, '2026-09-30')
    expect(review).toHaveTextContent('Everyday Checking')
    expect(review).toHaveTextContent('Utilities')
    expect(review).toHaveTextContent('$180.00')
    expect(review).toHaveTextContent('Early payment date2026-09-30')
    expect(review).toHaveTextContent('Next scheduled occurrence2026-11-05')
    expect(review).toHaveTextContent('Nothing changes until you confirm')
    expect(api.activity).toHaveLength(1)
    expect(api.accounts[0].balance.amount).toBe('4820.00')

    await user.click(within(review).getByRole('button', { name: 'Confirm saving the expense' }))
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('paid early on 2026-09-30')
    expect(status).toHaveTextContent('The next occurrence is 2026-11-05')
    expect(status).toHaveFocus()
    const list = screen.getByRole('region', { name: 'Schedules' })
    expect(
      await within(list).findByText(/2026-10-05 occurrence: paid early on 2026-09-30/),
    ).toBeInTheDocument()
    expect(list).toHaveTextContent('Next due 2026-11-05')
    expect(api.activity).toHaveLength(2)
    expect(api.accounts[0].balance.amount).toBe('4640.00')
  })

  it('V2_RECURRING_004 Cancel and Back from the review save no expense and leave the occurrence unpaid', async () => {
    const api = mockApi(withSchedule())
    const { user } = renderRoute('/recurring')
    const review = await openRecord(user, '2026-09-30')
    await user.click(within(review).getByRole('button', { name: 'Back' }))
    expect(await screen.findByLabelText('Payment date')).toHaveValue('2026-09-30')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    await user.click(
      within(await screen.findByRole('region', { name: /Review recording/ })).getByRole('button', {
        name: 'Cancel',
      }),
    )
    expect(screen.queryByRole('region', { name: /Review recording/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Record actual expense' })).toHaveFocus()
    expect(screen.getByRole('region', { name: 'Schedules' })).toHaveTextContent(
      'Next due 2026-10-05',
    )
    expect(api.activity).toHaveLength(1)
    expect(api.accounts[0].balance.amount).toBe('4820.00')
    expect(api.requests).not.toContain(`POST /api/v1/recurring/${api.schedules[0].id}/record`)
  })

  it('V2_RECURRING_003 a payment date after today is refused in the form', async () => {
    const api = mockApi(withSchedule())
    const { user } = renderRoute('/recurring')
    await user.selectOptions(await screen.findByLabelText('Entering as'), 'Sam')
    await user.click(await screen.findByRole('button', { name: 'Record actual expense' }))
    fireEvent.change(await screen.findByLabelText('Payment date'), {
      target: { value: '2026-10-05' },
    })
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(await screen.findByText('A payment date cannot be after today')).toBeInTheDocument()
    expect(api.activity).toHaveLength(1)
  })
})

describe('recurring bills: overdue', () => {
  const overdue = () => ({
    ...seed(),
    today: '2026-10-07',
    schedules: [
      {
        id: '66666666-6666-4666-8666-000000000001',
        accountId: checking.id,
        description: 'Electricity',
        categoryId: CATEGORIES.find((c) => c.name === 'Utilities')!.id,
        amount: '180.00',
        frequency: 'monthly' as const,
        status: 'active' as const,
        nextDueOn: '2026-10-05',
        anchorDay: 5,
        occurrences: [],
        events: [],
      },
    ],
  })

  it('V2_RECURRING_010 shows Overdue by 2 days with Record, Reschedule and Dismiss, and posts no expense', async () => {
    const api = mockApi(overdue())
    renderRoute('/recurring')
    const list = await screen.findByRole('region', { name: 'Schedules' })
    expect(await within(list).findByText('Overdue by 2 days')).toBeInTheDocument()
    expect(within(list).getByRole('button', { name: 'Record actual expense' })).toBeInTheDocument()
    expect(within(list).getByRole('button', { name: 'Reschedule' })).toBeInTheDocument()
    expect(
      within(list).getByRole('button', { name: 'Dismiss this occurrence' }),
    ).toBeInTheDocument()
    expect(api.activity).toHaveLength(0)
    expect(api.accounts[0].balance.amount).toBe('5000.00')
  })

  it('V2_RECURRING_010 says Overdue by 1 day in the singular and nothing when not overdue', async () => {
    const seeded = overdue()
    seeded.today = '2026-10-06'
    mockApi(seeded)
    renderRoute('/recurring')
    expect(await screen.findByText('Overdue by 1 day')).toBeInTheDocument()
  })

  it('V2_RECURRING_010 dismissing just this occurrence creates no expense and the next one is 2026-11-05', async () => {
    const api = mockApi(overdue())
    const { user } = renderRoute('/recurring')
    await user.selectOptions(await screen.findByLabelText('Entering as'), 'Sam')
    const opener = await screen.findByRole('button', { name: 'Dismiss this occurrence' })
    await user.click(opener)
    const review = await screen.findByRole('region', { name: /Review dismissing the 2026-10-05/ })
    await user.click(within(review).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Dismiss this occurrence' })).toHaveFocus()
    expect(api.schedules[0].occurrences).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Dismiss this occurrence' }))
    await user.click(
      await screen.findByRole('button', { name: 'Confirm dismissing this occurrence' }),
    )
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('The 2026-10-05 occurrence of Electricity is dismissed')
    expect(status).toHaveTextContent('No expense is created')
    expect(status).toHaveTextContent('The next occurrence is 2026-11-05')
    expect(status).toHaveFocus()
    const list = screen.getByRole('region', { name: 'Schedules' })
    expect(list).toHaveTextContent('Next due 2026-11-05')
    expect(list).toHaveTextContent('2026-10-05 occurrence: dismissed, no expense recorded')
    expect(screen.queryByText(/Overdue by/)).not.toBeInTheDocument()
    expect(api.activity).toHaveLength(0)
    expect(api.accounts[0].balance.amount).toBe('5000.00')
  })

  it('V2_RECURRING_010 rescheduling an overdue occurrence is reviewed and records nothing', async () => {
    const api = mockApi(overdue())
    const { user } = renderRoute('/recurring')
    await user.selectOptions(await screen.findByLabelText('Entering as'), 'Maya')
    await user.click(await screen.findByRole('button', { name: 'Reschedule' }))
    const review = await screen.findByRole('region', { name: /Review rescheduling Electricity/ })
    expect(within(review).getByRole('button', { name: 'Confirm rescheduling' })).toBeDisabled()
    fireEvent.change(within(review).getByLabelText('New due date'), {
      target: { value: '2026-10-12' },
    })
    await user.click(within(review).getByRole('button', { name: 'Confirm rescheduling' }))
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('rescheduled from 2026-10-05 to 2026-10-12')
    expect(screen.getByRole('region', { name: 'Schedules' })).toHaveTextContent(
      'Next due 2026-10-12',
    )
    expect(api.activity).toHaveLength(0)
  })
})

describe('recurring bills: switching rows', () => {
  const utilities = () => CATEGORIES.find((c) => c.name === 'Utilities')!.id
  const make = (id: string, description: string, amount: string) => ({
    id,
    accountId: checking.id,
    description,
    categoryId: utilities(),
    amount,
    frequency: 'monthly' as const,
    status: 'active' as const,
    nextDueOn: '2026-10-05',
    anchorDay: 5,
    occurrences: [],
    events: [],
  })

  it("V2_RECURRING_007 opening Change on another bill starts that bill's form, never the first bill's values", async () => {
    const api = mockApi({
      ...seed(),
      schedules: [
        make('66666666-6666-4666-8666-000000000001', 'Electricity', '180.00'),
        make('66666666-6666-4666-8666-000000000002', 'Water', '40.00'),
      ],
    })
    const { user } = renderRoute('/recurring')
    await user.selectOptions(await screen.findByLabelText('Entering as'), 'Maya')
    const changes = await screen.findAllByRole('button', { name: 'Change' })
    await user.click(changes[0])
    await user.clear(await screen.findByLabelText('Expected amount'))
    await user.type(screen.getByLabelText('Expected amount'), '250.00')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    await screen.findByRole('region', { name: /Review: Electricity/ })

    await user.click(screen.getAllByRole('button', { name: 'Change' })[1])
    expect(await screen.findByLabelText('Expected amount')).toHaveValue('40.00')
    expect(screen.getByRole('region', { name: /Change the Water estimate/ })).toBeInTheDocument()
    expect(api.schedules.map((s) => s.amount)).toEqual(['180.00', '40.00'])
  })
})
