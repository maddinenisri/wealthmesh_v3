import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { mockApi, type MockAccount } from '../../test/mockApi'
import type { MockValue } from '../../test/mockValues'
import { renderRoute } from '../../test/render'

const household = { id: '11111111-1111-4111-8111-111111111111', name: 'Maya and Sam' }
const maya = {
  id: '22222222-2222-4222-8222-222222222222',
  householdId: household.id,
  name: 'Maya',
  label: null,
}
const sam = { ...maya, id: '33333333-3333-4333-8333-333333333333', name: 'Sam' }
const PLAN_ID = '44444444-4444-4444-8444-444444444444'
const PLAN = `/accounts/${PLAN_ID}`

const plan = (amount = '40000.00', status = 'active'): MockAccount => ({
  id: PLAN_ID,
  type: 'defined_benefit',
  name: 'Harbor Cash Balance',
  institution: 'Harbor Benefits',
  ownerMemberIds: [sam.id],
  openedOn: '2026-09-01',
  openingAmount: amount,
  balance: { amount, asOf: '2026-09-01' },
  status,
})

const statement = (patch: Partial<MockValue> = {}): MockValue => ({
  id: '55555555-5555-4555-8555-555555555555',
  accountId: PLAN_ID,
  valueOn: '2026-09-30',
  amount: '41200.00',
  reason: null,
  planned: false,
  enteredBy: sam.id,
  replacesId: null,
  replaced: false,
  removedAt: null,
  removedBy: null,
  createdAt: '2026-09-30T10:00:00Z',
  payCredit: '1000.00',
  interestCredit: '200.00',
  ...patch,
})

const seed = (accounts: MockAccount[] = [], values: MockValue[] = []) => ({
  household,
  members: [maya, sam],
  accounts,
  values,
  today: '2026-10-03',
})
const withStatement = () => {
  const account = plan('41200.00')
  account.openingAmount = '40000.00'
  account.balance = { amount: '41200.00', asOf: '2026-09-30' }
  return seed([account], [statement()])
}

beforeEach(() => window.localStorage.setItem('wealthmesh.enteringAs', maya.id))

type User = ReturnType<typeof renderRoute>['user']

async function fillSetup(user: User, value: string, participant = 'Sam') {
  await user.selectOptions(await screen.findByLabelText('Account type'), 'defined_benefit')
  await user.type(screen.getByLabelText('Account name'), 'Harbor Cash Balance')
  await user.type(screen.getByLabelText('Institution'), 'Harbor Benefits')
  await user.click(screen.getByRole('radio', { name: participant }))
  fireEvent.change(screen.getByLabelText('As of'), { target: { value: '2026-09-01' } })
  if (value) await user.type(screen.getByLabelText('Plan-reported value'), value)
}

describe('adding a defined benefit', () => {
  it('V2_DB_001 asks for a participant, a plan-reported value and an as-of date, and no cash or holdings', async () => {
    mockApi(seed())
    const { user } = renderRoute('/accounts/new')
    await user.selectOptions(await screen.findByLabelText('Account type'), 'defined_benefit')

    expect(screen.getByRole('group', { name: 'Participant' })).toBeVisible()
    // The subtitle no longer names "the first date": each type has its own date word (Opened on, As of, ...).
    expect(screen.queryByText(/on the first date/)).not.toBeInTheDocument()
    expect(screen.getByText(/on the date you choose below/)).toBeVisible()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Institution')).toBeVisible()
    expect(screen.getByLabelText('As of')).toBeVisible()
    expect(screen.getByLabelText('Plan-reported value')).toBeVisible()
    expect(screen.getByText(/Entered by:/)).toBeVisible()
    for (const word of ['Opening total', 'Cash', 'Holdings', 'Bank', 'Owners', 'Balance'])
      expect(screen.queryByLabelText(word)).not.toBeInTheDocument()
    expect(screen.getByText('Choose the one member who participates in this plan.')).toBeVisible()
  })

  it('V2_DB_001 Review names the plan, then Confirm lands on its page with one sentence and focus on it', async () => {
    const api = mockApi(seed())
    const { user } = renderRoute('/accounts/new')
    await fillSetup(user, '40000.00')
    await user.click(screen.getByRole('button', { name: 'Review' }))

    expect(
      await screen.findByRole('heading', { name: 'Review new defined benefit plan' }),
    ).toBeVisible()
    expect(screen.getByText(/Harbor Cash Balance will start at/)).toHaveTextContent(
      'Harbor Cash Balance will start at $40,000.00 on 2026-09-01.',
    )
    expect(screen.getByText(/Institution: Harbor Benefits\./)).toHaveTextContent(
      'Institution: Harbor Benefits. Participant: Sam. Set up by: Maya.',
    )
    expect(api.requests.some((r) => r.startsWith('POST'))).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    const sentence = await screen.findByRole('status')
    expect(sentence).toHaveTextContent(
      'Harbor Cash Balance is set up with a plan-reported value of $40,000.00 as of 2026-09-01.',
    )
    expect(sentence).not.toHaveTextContent('No starting amount was entered')
    await waitFor(() => expect(sentence).toHaveFocus())
    const details = screen.getByRole('region', { name: 'Account details' })
    expect(within(details).getByText('Plan-reported benefit value')).toBeVisible()
    expect(within(details).getByText('Participant')).toBeVisible()
    expect(within(details).getByText('Sam')).toBeVisible()
    expect(api.accounts[0]).toMatchObject({ type: 'defined_benefit', ownerMemberIds: [sam.id] })
    expect(api.requests.filter((r) => r.startsWith('POST'))).toHaveLength(1)
  })

  it('V2_DB_002 a blank starting amount is reviewed and saved as $0.00 with a note that the promise is not recorded', async () => {
    const api = mockApi(seed())
    const { user } = renderRoute('/accounts/new')
    await fillSetup(user, '')
    await user.click(screen.getByRole('button', { name: 'Review' }))

    expect(
      await screen.findByText(
        /No starting amount was entered, so the plan-reported value starts at \$0\.00\./,
      ),
    ).toHaveTextContent('That zero does not say the pension promise is zero')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    const sentence = await screen.findByRole('status')
    expect(sentence).toHaveTextContent('No starting amount was entered.')
    expect(sentence).toHaveTextContent('does not say the pension promise is zero')
    expect(api.accounts[0]).toMatchObject({ openingAmount: '0.00' })
  })

  it('V2_DB_006 the participant is one member: choosing another replaces the first and none is explained', async () => {
    const api = mockApi(seed())
    const { user } = renderRoute('/accounts/new')
    await fillSetup(user, '40000.00', 'Sam')
    await user.click(screen.getByRole('radio', { name: 'Maya' }))
    expect(screen.getByRole('radio', { name: 'Maya' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Sam' })).not.toBeChecked()
    expect(screen.queryByText(/joint/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Maya' }))
    expect(api.requests.some((r) => r.startsWith('POST'))).toBe(false)
  })

  it('V2_DB_006 no participant chosen is explained and nothing is requested', async () => {
    const api = mockApi(seed())
    const { user } = renderRoute('/accounts/new')
    await user.selectOptions(await screen.findByLabelText('Account type'), 'defined_benefit')
    await user.type(screen.getByLabelText('Account name'), 'Harbor Cash Balance')
    await user.click(screen.getByRole('button', { name: 'Review' }))

    expect(await screen.findByText('Choose one participant')).toBeVisible()
    expect(api.requests.some((r) => r.startsWith('POST'))).toBe(false)
  })

  it('V2_DB_005 a negative plan value is explained in the plan’s words and nothing is created', async () => {
    const api = mockApi(seed())
    const { user } = renderRoute('/accounts/new')
    await fillSetup(user, '-100.00')
    await user.click(screen.getByRole('button', { name: 'Review' }))

    expect(await screen.findByText('Plan value must be zero or greater')).toBeVisible()
    expect(api.requests.some((r) => r.startsWith('POST'))).toBe(false)
  })

  it('V2_DB_001 Entered by is required: Review without one is explained and focus goes to it', async () => {
    window.localStorage.clear()
    const api = mockApi(seed())
    const { user } = renderRoute('/accounts/new')
    await fillSetup(user, '40000.00')
    await user.click(screen.getByRole('button', { name: 'Review' }))

    expect(await screen.findByText('Choose who is setting up this account')).toBeVisible()
    await waitFor(() => expect(screen.getByLabelText('Entered by')).toHaveFocus())
    expect(api.requests.some((r) => r.startsWith('POST'))).toBe(false)
  })
})

describe('editing a defined benefit', () => {
  it('V2_DB_001 edit keeps the Balance and shows the participant with a link to change it', async () => {
    const api = mockApi(seed([plan()]))
    const { user } = renderRoute(`${PLAN}/edit`)
    const name = await screen.findByLabelText('Account name')
    // The participant is shown with a link to the reviewed change, not edited here (slice 18c).
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.getByText('Sam', { selector: 'strong' })).toBeVisible()
    await user.clear(name)
    await user.type(name, 'Harbor Cash Balance Main')
    const institution = screen.getByLabelText('Institution')
    await user.clear(institution)
    await user.type(institution, 'Harbor Benefits Services')
    await user.click(screen.getByRole('button', { name: 'Save details' }))

    await waitFor(() => expect(api.accounts[0].name).toBe('Harbor Cash Balance Main'))
    expect(api.accounts[0]).toMatchObject({
      institution: 'Harbor Benefits Services',
      ownerMemberIds: [sam.id],
      balance: { amount: '40000.00' },
    })
    expect(await screen.findByText('$40,000.00', { selector: 'span' })).toBeVisible()
  })
})

describe('plan statements', () => {
  it('V2_DB_003 offers Record plan statement and no future plan', async () => {
    mockApi(seed([plan()]))
    renderRoute(PLAN)

    expect(await screen.findByRole('heading', { name: 'Plan statements' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Record plan statement' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Plan a future value' })).not.toBeInTheDocument()
    for (const action of ['Add money in', 'Add money out', 'Add transfer', 'Update balance'])
      expect(screen.queryByRole('button', { name: action })).not.toBeInTheDocument()
  })

  it('V2_DB_003 pay and interest credits are reviewed, saved with one sentence, and listed in the history', async () => {
    const api = mockApi(seed([plan()]))
    const { user } = renderRoute(PLAN)
    await user.click(await screen.findByRole('button', { name: 'Record plan statement' }))
    await user.type(await screen.findByLabelText('Pay credit'), '1000.00')
    await user.type(screen.getByLabelText('Benefit interest credit'), '200.00')
    fireEvent.change(screen.getByLabelText('Statement date'), { target: { value: '2026-09-30' } })
    await user.click(screen.getByRole('button', { name: 'Review' }))

    const review = await screen.findByRole('region', { name: 'Review plan statement' })
    expect(within(review).getByText('Pay credit').nextSibling).toHaveTextContent('$1,000.00')
    expect(within(review).getByText('Benefit interest credit').nextSibling).toHaveTextContent(
      '$200.00',
    )
    expect(within(review).getByText('Plan-reported value').nextSibling).toHaveTextContent(
      '$41,200.00',
    )
    expect(within(review).getByText('Household net worth').nextSibling).toHaveTextContent(
      '$40,000.00 now, $41,200.00 after',
    )
    expect(within(review).getByText('Retirement total').nextSibling).toHaveTextContent(
      '$40,000.00 now, $41,200.00 after',
    )
    expect(review).toHaveTextContent('no salary, cash or securities purchase is created')
    expect(api.requests.filter((r) => r.startsWith('POST') && !r.includes('review'))).toHaveLength(
      0,
    )

    await user.click(screen.getByRole('button', { name: 'Confirm statement' }))
    const sentence = await screen.findByRole('status')
    expect(sentence).toHaveTextContent(
      'Saved the statement as a plan value of $41,200.00 dated 2026-09-30 (pay credit $1,000.00, benefit interest $200.00).',
    )
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Plan statements' })).toHaveFocus(),
    )
    expect(
      await screen.findByText(/Pay credit \$1,000\.00, benefit interest \$200\.00/),
    ).toBeVisible()
    expect(api.accounts[0].balance.amount).toBe('41200.00')
  })

  it('V2_DB_003 a statement needs a credit, and the plan value can be entered instead', async () => {
    const api = mockApi(seed([plan()]))
    const { user } = renderRoute(PLAN)
    await user.click(await screen.findByRole('button', { name: 'Record plan statement' }))
    fireEvent.change(screen.getByLabelText('Statement date'), { target: { value: '2026-09-30' } })
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(await screen.findByText('Enter a pay credit or a benefit interest credit')).toBeVisible()
    expect(api.requests.some((r) => r.includes('review'))).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Enter the plan-reported value instead' }))
    expect(screen.getByLabelText('Plan-reported value')).toBeVisible()
    expect(screen.queryByLabelText('Pay credit')).not.toBeInTheDocument()
  })

  it('V2_DB_005 a future date is explained with no future plan, and a negative value in the plan’s words', async () => {
    const api = mockApi(seed([plan()]))
    const { user } = renderRoute(PLAN)
    await user.click(await screen.findByRole('button', { name: 'Record plan statement' }))
    await user.click(screen.getByRole('button', { name: 'Enter the plan-reported value instead' }))
    await user.type(screen.getByLabelText('Plan-reported value'), '40000.00')
    fireEvent.change(screen.getByLabelText('Statement date'), { target: { value: '2026-10-04' } })
    await user.click(screen.getByRole('button', { name: 'Review' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Future values are not completed account history.')
    expect(
      within(alert).queryByRole('button', { name: 'Save as a future plan' }),
    ).not.toBeInTheDocument()
    expect(api.requests.some((r) => r.includes('review'))).toBe(false)

    await user.click(within(alert).getByRole('button', { name: 'Choose another date' }))
    expect(screen.getByLabelText('Statement date')).toHaveFocus()
    const value = screen.getByLabelText('Plan-reported value')
    await user.clear(value)
    await user.type(value, '-100.00')
    fireEvent.change(screen.getByLabelText('Statement date'), { target: { value: '2026-09-30' } })
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(await screen.findByText('Plan value must be zero or greater')).toBeVisible()
    expect(api.accounts[0].balance.amount).toBe('40000.00')
  })

  it('V2_DB_005 a date before the tracking start asks for the earlier start to be reviewed first', async () => {
    const api = mockApi(seed([plan()]))
    const { user } = renderRoute(PLAN)
    await user.click(await screen.findByRole('button', { name: 'Record plan statement' }))
    await user.click(screen.getByRole('button', { name: 'Enter the plan-reported value instead' }))
    await user.type(screen.getByLabelText('Plan-reported value'), '40000.00')
    fireEvent.change(screen.getByLabelText('Statement date'), { target: { value: '2026-08-31' } })
    await user.click(screen.getByRole('button', { name: 'Review' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(
      'Review the earlier tracking start before saving. The start is 2026-09-01.',
    )
    expect(within(alert).getByRole('button', { name: 'Review the earlier start' })).toBeVisible()
    expect(api.requests.some((r) => r.includes('review'))).toBe(false)
    expect(api.accounts[0].balance.amount).toBe('40000.00')
  })

  it('V2_DB_004 correcting a statement shows the reduction and the totals; Cancel changes nothing; Confirm restates it', async () => {
    const api = mockApi(withStatement())
    const { user } = renderRoute(PLAN)
    await user.click(
      await screen.findByRole('button', { name: /^Correct \$41,200\.00 dated 2026-09-30$/ }),
    )
    const value = await screen.findByLabelText('Plan-reported value')
    expect(value).toHaveValue('41200.00')
    await user.clear(value)
    await user.type(value, '41100.00')
    await user.type(screen.getByLabelText('Reason'), 'Corrected statement')
    await user.click(screen.getByRole('button', { name: 'Review' }))

    const review = await screen.findByRole('region', { name: 'Review plan value correction' })
    expect(within(review).getByText('Replaces').nextSibling).toHaveTextContent(
      '$41,200.00 dated 2026-09-30',
    )
    expect(
      within(review).getByText('Change from the value it replaces').nextSibling,
    ).toHaveTextContent('$100.00 plan value decrease')
    expect(within(review).getByText('Household net worth').nextSibling).toHaveTextContent(
      '$41,200.00 now, $41,100.00 after',
    )
    expect(within(review).getByText('Retirement total').nextSibling).toHaveTextContent(
      '$41,200.00 now, $41,100.00 after',
    )

    await user.click(within(review).getByRole('button', { name: 'Cancel' }))
    expect(api.accounts[0].balance.amount).toBe('41200.00')
    expect(api.requests.filter((r) => r.startsWith('POST') && !r.includes('review'))).toHaveLength(
      0,
    )
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /^Correct \$41,200\.00 dated 2026-09-30$/ }),
      ).toHaveFocus(),
    )

    await user.click(
      screen.getByRole('button', { name: /^Correct \$41,200\.00 dated 2026-09-30$/ }),
    )
    const again = await screen.findByLabelText('Plan-reported value')
    await user.clear(again)
    await user.type(again, '41100.00')
    await user.type(screen.getByLabelText('Reason'), 'Corrected statement')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    await user.click(await screen.findByRole('button', { name: 'Confirm correction' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Corrected the statement to a plan value of $41,100.00 dated 2026-09-30.',
    )
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Plan statements' })).toHaveFocus(),
    )
    expect(api.accounts[0].balance.amount).toBe('41100.00')
    expect(screen.getByText('Replaced')).toBeVisible()
    expect(screen.getByText(/Corrected statement/)).toBeVisible()
  })

  it('V2_DB_006 an archived plan keeps its value, says it stays in Retirement, and records no new statement', async () => {
    mockApi(seed([plan('40000.00', 'archived')]))
    renderRoute(PLAN)

    expect(await screen.findByText(/Archived: hidden from the active list/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Record plan statement' })).not.toBeInTheDocument()
    expect(
      screen.getByText(/This account is archived\. Restore it to record a new statement/),
    ).toBeVisible()
  })

  it('V2_DB_006 the archive review names Retirement and the plan value that stays in wealth', async () => {
    mockApi(seed([plan()]))
    const { user } = renderRoute(PLAN)
    await user.click(await screen.findByRole('button', { name: 'Archive account' }))

    expect(
      await screen.findByText(/Its \$40,000\.00 will remain in wealth and in Retirement/),
    ).toBeVisible()
    expect(screen.getByText(/takes no new statements until you restore it/)).toBeVisible()
  })
})

describe('plan statement form states', () => {
  it('V2_DB_005 a refused date takes focus, and the alert goes when the date changes', async () => {
    mockApi(seed([plan()]))
    const { user } = renderRoute(PLAN)
    await user.click(await screen.findByRole('button', { name: 'Record plan statement' }))
    await user.type(await screen.findByLabelText('Pay credit'), '10.00')
    fireEvent.change(screen.getByLabelText('Statement date'), { target: { value: '2026-10-04' } })
    await user.click(screen.getByRole('button', { name: 'Review' }))

    const alert = await screen.findByRole('alert')
    await waitFor(() => expect(alert).toHaveFocus())
    fireEvent.change(screen.getByLabelText('Statement date'), { target: { value: '2026-09-30' } })
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('V2_DB_003 switching between credits and the plan value moves focus to the new first field', async () => {
    mockApi(seed([plan()]))
    const { user } = renderRoute(PLAN)
    await user.click(await screen.findByRole('button', { name: 'Record plan statement' }))
    await user.click(
      await screen.findByRole('button', { name: 'Enter the plan-reported value instead' }),
    )
    await waitFor(() => expect(screen.getByLabelText('Plan-reported value')).toHaveFocus())
    await user.click(screen.getByRole('button', { name: 'Enter pay and interest credits instead' }))
    await waitFor(() => expect(screen.getByLabelText('Pay credit')).toHaveFocus())
  })
})

describe('plan statement actions', () => {
  it('V2_DB_003 Back from the statement review returns to the form with the credits kept and focus on the heading', async () => {
    mockApi(seed([plan()]))
    const { user } = renderRoute(PLAN)
    await user.click(await screen.findByRole('button', { name: 'Record plan statement' }))
    await user.type(await screen.findByLabelText('Pay credit'), '1000.00')
    fireEvent.change(screen.getByLabelText('Statement date'), { target: { value: '2026-09-30' } })
    await user.click(screen.getByRole('button', { name: 'Review' }))
    await user.click(await screen.findByRole('button', { name: 'Back' }))

    expect(screen.getByLabelText('Pay credit')).toHaveValue('1000.00')
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Record plan statement' })).toHaveFocus(),
    )
  })

  it('V2_DB_004 removing a statement and bringing it back each end with a sentence and focus on the heading', async () => {
    const api = mockApi(withStatement())
    const { user } = renderRoute(PLAN)
    await user.click(
      await screen.findByRole('button', { name: /^Remove \$41,200\.00 dated 2026-09-30$/ }),
    )
    await user.click(await screen.findByRole('button', { name: /^Confirm/ }))

    expect(await screen.findByRole('status')).toHaveTextContent(/Removed|removed/)
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Plan statements' })).toHaveFocus(),
    )
    expect(api.accounts[0].balance.amount).toBe('40000.00')

    await user.click(
      await screen.findByRole('button', {
        name: /^Undo removal of \$41,200\.00 dated 2026-09-30$/,
      }),
    )
    await user.click(await screen.findByRole('button', { name: /^Confirm/ }))
    await waitFor(() => expect(api.accounts[0].balance.amount).toBe('41200.00'))
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Plan statements' })).toHaveFocus(),
    )
  })

  it('V2_DB_004 the correction panel opened on a second statement starts from that statement', async () => {
    const account = plan('42000.00')
    account.openingAmount = '40000.00'
    account.balance = { amount: '42000.00', asOf: '2026-09-30' }
    mockApi(
      seed(
        [account],
        [
          statement({ id: '55555555-5555-4555-8555-555555555551', amount: '41200.00' }),
          statement({
            id: '55555555-5555-4555-8555-555555555552',
            valueOn: '2026-09-30',
            amount: '42000.00',
            payCredit: null,
            interestCredit: null,
            createdAt: '2026-09-30T11:00:00Z',
          }),
        ],
      ),
    )
    const { user } = renderRoute(PLAN)
    await user.click(await screen.findByRole('button', { name: /^Correct \$41,200\.00 dated/ }))
    expect(await screen.findByLabelText('Plan-reported value')).toHaveValue('41200.00')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(await screen.findByRole('button', { name: /^Correct \$42,000\.00 dated/ }))
    expect(await screen.findByLabelText('Plan-reported value')).toHaveValue('42000.00')
  })
})

describe('Household: Retirement group and one count', () => {
  const home = (): MockAccount => ({
    ...plan(),
    id: '66666666-6666-4666-8666-666666666666',
    type: 'property',
    name: 'Family Home',
    institution: null,
    ownerMemberIds: [maya.id],
    openingAmount: '300000.00',
    balance: { amount: '300000.00', asOf: '2026-09-01' },
  })

  it('Q-055 the plan value is in Retirement, not in Investments or Property, and net worth counts it once', async () => {
    mockApi(seed([plan(), home()]))
    renderRoute('/')
    const card = await screen.findByRole('region', { name: 'Accounts and wealth' })

    const retirement = await within(card).findByRole('region', { name: 'Retirement' })
    expect(within(retirement).getByText('Harbor Cash Balance')).toBeVisible()
    expect(retirement).toHaveTextContent('$40,000.00')
    expect(retirement).toHaveTextContent('not personal investment cash or holdings')
    const property = within(card).getByRole('region', { name: 'Property and other assets' })
    expect(within(property).queryByText('Harbor Cash Balance')).not.toBeInTheDocument()
    expect(within(property).getByText('Family Home')).toBeVisible()
    expect(within(card).queryByRole('region', { name: 'Investments' })).not.toBeInTheDocument()
    expect(within(card).getByText(/Net worth/)).toHaveTextContent('$340,000.00')
    expect(within(card).getByText(/Financial assets/)).toHaveTextContent('$340,000.00')
  })

  it('V2_DB_003 the change explanation lists pay credits and benefit interest, never as income', async () => {
    mockApi(withStatement())
    const { user } = renderRoute('/')
    const region = await screen.findByRole('region', { name: 'Wealth on a date' })
    const from = within(region).getByLabelText('From')
    const to = within(region).getByLabelText('To')
    fireEvent.change(from, { target: { value: '2026-09-01' } })
    fireEvent.change(to, { target: { value: '2026-09-30' } })
    void user

    const change = await within(region).findByRole('region', { name: 'Wealth change' })
    expect(within(change).getByText('Pay credits').closest('li')).toHaveTextContent('$1,000.00')
    expect(within(change).getByText('Benefit interest').closest('li')).toHaveTextContent('$200.00')
    expect(within(change).getByText('Income').closest('li')).toHaveTextContent('$0.00')
    expect(within(change).getByText('Asset value change').closest('li')).toHaveTextContent('$0.00')
    expect(within(change).getByText(/not income, spending or a salary/)).toBeVisible()
  })
})

describe('Accounts list', () => {
  it('V2_HOUSEHOLD_SETUP_002 lists the seven accounts with their types, the plan among them', async () => {
    let n = 0
    const make = (type: string, name: string, amount: string): MockAccount => ({
      id: `77777777-7777-4777-8777-77777777777${++n}`,
      type,
      name,
      institution: 'Harbor',
      ownerMemberIds: [maya.id],
      openedOn: '2026-09-01',
      openingAmount: amount,
      balance: { amount, asOf: '2026-09-01' },
      status: 'active',
    })
    mockApi(
      seed([
        make('checking', 'Everyday Checking', '5000.00'),
        make('savings', 'Emergency Savings', '10000.00'),
        make('credit_card', 'Everyday Credit Card', '-1000.00'),
        make('brokerage', 'Redwood Brokerage', '20000.00'),
        make('401k', 'Harbor 401k', '80000.00'),
        make('traditional_ira', 'Willow Traditional IRA', '30000.00'),
        make('defined_benefit', 'Harbor Cash Balance', '40000.00'),
      ]),
    )
    renderRoute('/accounts')

    const row = (await screen.findByRole('link', { name: 'Harbor Cash Balance' })).closest('tr')!
    expect(row).toHaveTextContent('Defined benefit')
    expect(row).toHaveTextContent('$40,000.00')
    expect(
      screen.getAllByRole('link', { name: /Checking|Savings|Card|Brokerage|401k|IRA|Balance/ }),
    ).toHaveLength(7)
    expect(screen.getByRole('link', { name: 'Harbor 401k' }).closest('tr')).toHaveTextContent(
      '401(k)',
    )
  })
})
