import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

// Runs after 11-slice04-layout.spec.ts and before 12-members.spec.ts, which renames Alex Doe and removes Samira.
// Each test makes its own accounts through the API so Balances are exact; month totals are asserted in the API tests.
// Today comes from the server (GET /today), fixed to 2026-10-03 by start-stack.sh.
test.describe.serial('savings accounts and moving an entry', () => {
  const OWNER = 'Alex Doe (Parent)'

  async function owner(request: APIRequestContext) {
    const household = (await (await request.get('/api/v1/household')).json()) as { id: string }
    const members = (await (
      await request.get(`/api/v1/household-members?householdId=${household.id}`)
    ).json()) as { id: string; name: string }[]
    return members.find((m) => m.name === 'Alex Doe')!.id
  }

  async function createAccount(
    request: APIRequestContext,
    type: 'checking' | 'savings',
    name: string,
    opening: string,
  ) {
    const response = await request.post('/api/v1/accounts', {
      data: {
        type,
        name,
        institution: 'Harbor Bank',
        ownerMemberIds: [await owner(request)],
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
    kind: 'expenses' | 'income',
    entry: { description: string; amount: string; date: string; category: string },
  ) {
    const response = await request.post(`/api/v1/accounts/${accountId}/${kind}`, {
      headers: { 'Idempotency-Key': `e2e-${accountId}-${entry.description}` },
      data: {
        description: entry.description,
        amount: entry.amount,
        occurredOn: entry.date,
        category: entry.category,
        enteredByMemberId: await owner(request),
      },
    })
    expect(response.status()).toBe(201)
  }

  async function open(page: Page, path: string) {
    await page.goto(path)
    await page.getByLabel('Entering as').selectOption({ label: OWNER })
  }

  async function expectInView(page: Page, name: string) {
    const panel = page.getByRole('region', { name })
    await expect(panel).toBeVisible()
    await expect(panel).toBeInViewport()
    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(sideways).toBeLessThanOrEqual(0)
  }

  const row = (page: Page, name: string) =>
    page.getByRole('row').filter({ has: page.getByRole('link', { name, exact: true }) })

  test('V2_SAVINGS_001 V2_SAVINGS_011 V2_HOUSEHOLD_SETUP_004 adds savings, explains a bad Balance, then follows it to the detail', async ({
    page,
    request,
  }) => {
    const today = ((await (await request.get('/api/v1/today')).json()) as { today: string }).today
    await page.goto('/accounts/new')
    await page.getByLabel('Account type').selectOption('savings')
    // The date starts on the server's today, never a fixed one.
    await expect(page.getByLabel('Opened on')).toHaveValue(today)
    await page.getByLabel('Account name').fill('Emergency Savings')
    await page.getByLabel('Bank').fill('Harbor Bank')
    await page.getByRole('checkbox', { name: OWNER }).check()
    await page.getByLabel('Opened on').fill('2026-09-01')
    await page.getByLabel('Balance').fill('ten thousand')
    await page.getByRole('button', { name: 'Save account' }).click()

    const message = page.getByText('Enter a valid amount')
    await expect(message).toBeVisible()
    await expect(message).toBeInViewport()
    await expect(page.getByLabel('Balance')).toBeFocused()
    await expect(page.getByLabel('Account name')).toHaveValue('Emergency Savings')
    await expect(page.getByLabel('Bank')).toHaveValue('Harbor Bank')
    await expect(page.getByLabel('Opened on')).toHaveValue('2026-09-01')

    await page.getByLabel('Balance').fill('$10,000.00')
    await page.getByRole('link', { name: 'Cancel' }).click()
    await expect(page.getByRole('link', { name: 'Emergency Savings', exact: true })).toHaveCount(0)

    await page.goto('/accounts/new')
    await page.getByLabel('Account type').selectOption('savings')
    await page.getByLabel('Account name').fill('Emergency Savings')
    await page.getByLabel('Bank').fill('Harbor Bank')
    await page.getByRole('checkbox', { name: OWNER }).check()
    await page.getByLabel('Opened on').fill('2026-09-01')
    await page.getByLabel('Balance').fill('$10,000.00')
    await page.getByRole('button', { name: 'Save account' }).click()

    const listed = row(page, 'Emergency Savings')
    await expect(listed).toContainText('Alex Doe')
    await expect(listed).toContainText('Harbor Bank')
    await expect(listed).toContainText('$10,000.00')
    await expect(listed).toContainText('2026-09-01')
    await page.getByRole('link', { name: 'Emergency Savings', exact: true }).click()
    const main = page.getByRole('main')
    await expect(main).toContainText('Savings account')
    await expect(main).toContainText('Initial Balance$10,000.00 on 2026-09-01')
    await expect(main).toContainText('No money activity has been recorded yet.')
    for (const action of ['Add money in', 'Add money out', 'Add transfer', 'Update balance']) {
      await expect(page.getByRole('button', { name: action })).toBeVisible()
    }
    await expect(page.getByRole('link', { name: 'Edit account' })).toBeVisible()
  })

  test('V2_SAVINGS_003 V2_SAVINGS_004 V2_SAVINGS_008 edits and cancels, and cancels a Balance update', async ({
    page,
    request,
  }) => {
    const id = await createAccount(request, 'savings', 'Edit Savings', '10000.00')
    await open(page, `/accounts/${id}/edit`)
    await page.getByLabel('Account name').fill('Holiday Savings')
    await page.getByRole('link', { name: 'Cancel' }).click()
    await expect(page.getByRole('heading', { name: 'Edit Savings' })).toBeVisible()
    await expect(page.getByRole('main')).toContainText('Initial Balance$10,000.00 on 2026-09-01')

    await page.getByRole('link', { name: 'Edit account' }).click()
    await page.getByLabel('Account name').fill('Household Emergency Fund')
    await page.getByLabel('Bank').fill('Harbor Credit Union')
    await page.getByRole('button', { name: 'Save details' }).click()
    await expect(page.getByRole('heading', { name: 'Household Emergency Fund' })).toBeVisible()
    await expect(page.getByRole('main')).toContainText('Harbor Credit Union')
    await expect(page.getByRole('main')).toContainText('Initial Balance$10,000.00 on 2026-09-01')

    await page.getByRole('button', { name: 'Update balance' }).click()
    const form = page.getByRole('region', { name: 'Update balance' })
    await form.getByLabel('Balance').fill('12000.00')
    await form.getByLabel('Date').fill('2026-09-30')
    await form.getByRole('button', { name: 'Review' }).click()
    const review = page.getByRole('region', { name: 'Review balance update' })
    await expect(review).toContainText('$2,000.00 increase')
    await review.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByLabel('Account details')).toContainText('$10,000.00')
    await expect(page.getByRole('main')).toContainText('No money activity has been recorded yet.')
  })

  test('V2_INCOME_002 records savings interest as Interest income', async ({ page, request }) => {
    const id = await createAccount(request, 'savings', 'Interest Savings', '10000.00')
    await open(page, `/accounts/${id}`)
    await page.getByRole('button', { name: 'Add money in' }).click()
    const form = page.getByRole('region', { name: 'Add money in' })
    await form.getByLabel('Amount').fill('25.00')
    await form.getByLabel('Date').fill('2026-09-15')
    await form.getByLabel('Category').selectOption({ label: 'Interest' })
    await form.getByRole('button', { name: 'Review' }).click()
    await page.getByRole('button', { name: 'Confirm saving' }).click()

    await expect(page.getByLabel('Account details')).toContainText('$10,025.00')
    const activity = page.getByRole('region', { name: 'Activity' })
    await expect(activity).toContainText('Interest')
    await expect(activity).toContainText('2026-09-15')
    await expect(page.getByRole('main')).not.toContainText('Balance correction')
  })

  test('V2_INCOME_003 corrects Salary to Bonus in savings, cancel keeps it, confirm moves it', async ({
    page,
    request,
  }) => {
    const checking = await createAccount(request, 'checking', 'Pay Checking', '5000.00')
    const savings = await createAccount(request, 'savings', 'Pay Savings', '10000.00')
    await addEntry(request, checking, 'income', {
      description: 'Salary',
      amount: '6000.00',
      date: '2026-09-02',
      category: 'Salary',
    })
    await open(page, `/accounts/${checking}`)
    await expect(page.getByLabel('Account details')).toContainText('$11,000.00')

    const fill = async () => {
      const form = page.getByRole('region', { name: 'Edit money in' })
      await form.getByLabel('Amount').fill('6200.00')
      await form.getByLabel('Date').fill('2026-10-02')
      await form.getByLabel('Category').selectOption({ label: 'Bonus' })
      await form.getByLabel('Received into').selectOption(savings)
    }
    await page.getByRole('button', { name: 'Edit Salary' }).click()
    await fill()
    await page.getByRole('button', { name: 'Review' }).click()
    const effect = page.getByRole('region', { name: 'Effect of this change' })
    await expect(effect).toContainText('Pay Checking Balance$5,000.00')
    await expect(effect).toContainText('Pay Savings Balance$16,200.00')
    await expect(effect).toContainText('September Income')
    await expect(effect).toContainText('October Income')
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByLabel('Account details')).toContainText('$11,000.00')

    await page.getByRole('button', { name: 'Edit Salary' }).click()
    await fill()
    await page
      .getByRole('region', { name: 'Edit money in' })
      .getByLabel('Reason')
      .fill('Correct pay details')
    await page.getByRole('button', { name: 'Review' }).click()
    await page.getByRole('button', { name: 'Confirm saving' }).click()
    // Wait for the move to finish before leaving the page; the opening $5,000.00 also appears in the details.
    await expect(page.getByRole('main')).toContainText('No money activity has been recorded yet.')
    await open(page, `/accounts/${savings}`)
    await expect(page.getByLabel('Account details')).toContainText('$16,200.00')
    await expect(page.getByRole('region', { name: 'Activity' })).toContainText('Bonus')
  })

  for (const width of [710, 1280]) {
    test(`V2_EXPENSE_007 V2_INCOME_003 moves an entry to another account at ${width}px`, async ({
      page,
      request,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      const longName = `Long Name Everyday Checking ${width}`
      const checking = await createAccount(request, 'checking', longName, '5000.00')
      const savings = await createAccount(
        request,
        'savings',
        `Emergency Savings With A Rather Long Name ${width}`,
        '10000.00',
      )
      await addEntry(request, checking, 'expenses', {
        description: 'Rent',
        amount: '1500.00',
        date: '2026-09-03',
        category: 'Rent',
      })
      await open(page, `/accounts/${checking}`)
      await expect(page.getByLabel('Account details')).toContainText('$3,500.00')

      await page.getByRole('button', { name: 'Edit Rent' }).click()
      await expectInView(page, 'Edit money out')
      const edit = page.getByRole('region', { name: 'Edit money out' })
      await edit.getByLabel('Paid from').selectOption(savings)
      await edit.getByLabel('Date').fill('2026-10-02')
      await edit.getByLabel('Reason').fill('Correct payment account and date')
      await page.getByRole('button', { name: 'Review' }).click()
      await expectInView(page, 'Review change')
      // The whole heading is in view and has focus (the top of the review was once cut off at 710px).
      const panel = page.getByRole('region', { name: 'Review change' })
      const top = await panel.evaluate((el) => el.getBoundingClientRect().top)
      expect(top).toBeGreaterThanOrEqual(0)
      await expect(panel.locator(':focus')).toHaveCount(1)
      const heading = page.getByRole('heading', { name: 'Review change' })
      await expect(heading).toBeInViewport({ ratio: 1 })
      await expect(heading).toBeFocused()
      const effect = page.getByRole('region', { name: 'Effect of this change' })
      await expect(effect).toBeVisible()
      await expect(effect).toContainText('Balance$5,000.00')
      await expect(effect).toContainText('Balance$8,500.00')
      await expect(effect).toContainText('October spending')
      await page.getByRole('button', { name: 'Cancel' }).click()
      await expect(page.getByLabel('Account details')).toContainText('$3,500.00')
      // Cancel returns focus to the button that opened the edit.
      await expect(page.getByRole('button', { name: 'Edit Rent' })).toBeFocused()

      await page.getByRole('button', { name: 'Edit Rent' }).click()
      await edit.getByLabel('Paid from').selectOption(savings)
      await edit.getByLabel('Date').fill('2026-10-02')
      await edit.getByLabel('Reason').fill('Correct payment account and date')
      await page.getByRole('button', { name: 'Review' }).click()
      await page.getByRole('button', { name: 'Confirm saving' }).click()
      await expect(page.getByLabel('Account details')).toContainText('$5,000.00')
      await expect(page.getByRole('main')).toContainText('No money activity has been recorded yet.')

      await open(page, `/accounts/${savings}`)
      await expect(page.getByLabel('Account details')).toContainText('$8,500.00')
      await page.getByRole('button', { name: 'Show history' }).click()
      const history = page.getByRole('table', { name: 'History' })
      await expect(history).toContainText(`on ${longName}, dated 2026-09-03`)
      await expect(history).toContainText('Correct payment account and date')
      const sideways = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(sideways).toBeLessThanOrEqual(0)
    })
  }
})
