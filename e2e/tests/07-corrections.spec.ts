import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

// Runs after 06-reminders.spec.ts. Today is fixed to 2026-10-03 in this stack. Each journey uses its own account so
// its figures are exact; the entries are set up through the API and the corrections are made on screen.
test.describe.serial('balance corrections journey', () => {
  let memberId = ''

  async function createAccount(request: APIRequestContext, name: string, opening: string) {
    const household = (await (await request.get('/api/v1/household')).json()) as { id: string }
    const members = (await (
      await request.get(`/api/v1/household-members?householdId=${household.id}`)
    ).json()) as { id: string; name: string }[]
    memberId = members.find((m) => m.name === 'Alex Doe')!.id
    const response = await request.post('/api/v1/accounts', {
      data: {
        type: 'checking',
        name,
        ownerMemberIds: [memberId],
        openedOn: '2026-09-01',
        openingBalance: opening,
      },
    })
    expect(response.status()).toBe(201)
    return ((await response.json()) as { id: string }).id
  }

  async function addEntry(
    request: APIRequestContext,
    accountId: string,
    path: 'expenses' | 'income',
    key: string,
    amount: string,
    date: string,
    category: string,
  ) {
    const response = await request.post(`/api/v1/accounts/${accountId}/${path}`, {
      headers: { 'Idempotency-Key': key },
      data: {
        description: category,
        amount,
        occurredOn: date,
        category,
        enteredByMemberId: memberId,
      },
    })
    expect(response.status()).toBe(201)
  }

  async function open(page: Page, accountId: string) {
    await page.goto(`/accounts/${accountId}`)
    await page.getByLabel('Entering as').selectOption({ label: 'Alex Doe (Parent)' })
  }

  async function review(page: Page, balance: string, date: string) {
    await page.getByRole('button', { name: 'Update balance' }).click()
    const form = page.getByRole('region', { name: 'Update balance' })
    await form.getByLabel('Balance').fill(balance)
    await form.getByLabel('Date').fill(date)
    await form.getByRole('button', { name: 'Review' }).click()
  }

  test('V2_CHECKING_009 V2_MEMBERS_003 reviews and saves a dated correction without inventing income', async ({
    page,
    request,
  }) => {
    const id = await createAccount(request, 'Correction Checking', '5000.00')
    await addEntry(request, id, 'expenses', 'e2e-c9-groceries', '100.00', '2026-09-10', 'Groceries')
    await open(page, id)

    await review(page, '5000.00', '2026-09-30')
    const panel = page.getByRole('region', { name: 'Review balance update' })
    await expect(panel).toContainText('Current Balance on 2026-09-30')
    await expect(panel).toContainText('$4,900.00')
    await expect(panel).toContainText('$100.00 increase')
    await expect(panel).toContainText('excluded from Income and spending')
    await panel.getByLabel('Reason').fill('Correct tracking to reviewed amount')
    await panel.getByRole('button', { name: 'Confirm correction' }).click()

    await expect(page.getByLabel('Account details')).toContainText('$5,000.00')
    await page.getByRole('button', { name: 'Show history' }).click()
    const history = page.getByRole('table', { name: 'History' })
    await expect(history).toContainText('Initial Balance')
    await expect(history).toContainText('Balance correction')
    await expect(history).toContainText('Correct tracking to reviewed amount')
    await expect(history).toContainText('Alex Doe')
    await expect(page.getByText('not proof that this person signed in')).toBeVisible()
  })

  test('V2_CHECKING_018 previews a backdated correction and views September 30 without changing today', async ({
    page,
    request,
  }) => {
    const id = await createAccount(request, 'Backdated Checking', '4900.00')
    await addEntry(request, id, 'income', 'e2e-c18-salary', '1000.00', '2026-10-02', 'Salary')
    await open(page, id)

    await review(page, '5000.00', '2026-09-30')
    const panel = page.getByRole('region', { name: 'Review balance update' })
    await expect(panel).toContainText('$4,900.00')
    await expect(panel).toContainText('Backdated Checking Balance after')
    await expect(panel).toContainText('$6,000.00')
    await panel.getByLabel('Reason').fill('Correct the amount before October began')
    await panel.getByRole('button', { name: 'Confirm correction' }).click()
    await expect(page.getByLabel('Account details')).toContainText('$6,000.00')

    const viewer = page.getByRole('region', { name: 'Balance on a date' })
    await viewer.getByLabel('View Balance on').fill('2026-09-30')
    await expect(viewer).toContainText('$5,000.00')
    await expect(viewer).toContainText('current Balance ($6,000.00) is unchanged')
  })

  test('V2_CHECKING_013 corrects a correction and keeps both versions', async ({
    page,
    request,
  }) => {
    const id = await createAccount(request, 'Fix Correction Checking', '5000.00')
    await addEntry(
      request,
      id,
      'expenses',
      'e2e-c13-groceries',
      '100.00',
      '2026-09-10',
      'Groceries',
    )
    const first = await request.post(`/api/v1/accounts/${id}/balance-corrections`, {
      headers: { 'Idempotency-Key': 'e2e-c13-first' },
      data: {
        requestedBalance: '5000.00',
        asOn: '2026-09-30',
        reason: 'First review',
        enteredByMemberId: memberId,
      },
    })
    expect(first.status()).toBe(201)
    await open(page, id)

    await page.getByRole('button', { name: 'Edit correction of 2026-09-30' }).click()
    const form = page.getByRole('region', { name: 'Edit balance correction' })
    await form.getByLabel('Balance').fill('4900.00')
    await form.getByRole('button', { name: 'Review' }).click()
    const panel = page.getByRole('region', { name: 'Review correction change' })
    await expect(panel).toContainText('Original Balance')
    await expect(panel).toContainText('$5,000.00')
    await expect(panel).toContainText('$4,900.00')
    await panel.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByLabel('Account details')).toContainText('$5,000.00')

    await page.getByRole('button', { name: 'Edit correction of 2026-09-30' }).click()
    await form.getByLabel('Balance').fill('4900.00')
    await form.getByRole('button', { name: 'Review' }).click()
    await panel.getByLabel('Reason').fill('Original reviewed amount was mistyped')
    await panel.getByRole('button', { name: 'Confirm correction' }).click()
    await expect(page.getByLabel('Account details')).toContainText('$4,900.00')

    await page.getByRole('button', { name: 'Show history' }).click()
    const history = page.getByRole('table', { name: 'History' })
    await expect(history).toContainText('Replaced')
    await expect(history).toContainText('First review')
    await expect(history).toContainText('Original reviewed amount was mistyped')
  })

  test('V2_CHECKING_014 replaces an unexplained correction with the bank fee', async ({
    page,
    request,
  }) => {
    const id = await createAccount(request, 'Fee Found Checking', '6000.00')
    const lowered = await request.post(`/api/v1/accounts/${id}/balance-corrections`, {
      headers: { 'Idempotency-Key': 'e2e-c14-low' },
      data: {
        requestedBalance: '5960.00',
        asOn: '2026-09-30',
        reason: 'Reviewed account amount is lower',
        enteredByMemberId: memberId,
      },
    })
    expect(lowered.status()).toBe(201)
    await open(page, id)

    await page.getByRole('button', { name: 'Add money out' }).click()
    const form = page.getByRole('region', { name: 'Add money out' })
    await form.getByLabel('Amount').fill('40.00')
    await form.getByLabel('Date').fill('2026-09-30')
    await form.getByLabel('Category').selectOption({ label: 'Bank fees' })
    await form.getByRole('button', { name: 'Review' }).click()
    const panel = page.getByRole('region', { name: 'Review money out' })
    await expect(panel).toContainText('replace that correction')
    await expect(panel).toContainText('Balance will remain $5,960.00')
    await expect(panel).toContainText('spending will become')
    await panel.getByRole('button', { name: 'Confirm replacement' }).click()

    await expect(page.getByLabel('Account details')).toContainText('$5,960.00')
    await page.getByRole('button', { name: 'Show history' }).click()
    await expect(page.getByRole('table', { name: 'History' })).toContainText(
      'Replaced by the Bank fees expense',
    )
  })
})
