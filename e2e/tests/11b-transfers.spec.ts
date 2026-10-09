import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

// Runs after 11a-savings.spec.ts and before 12-members.spec.ts, which renames Alex Doe and removes Samira.
// Each test makes its own accounts through the API so Balances are exact. Today is fixed to 2026-10-03 by
// start-stack.sh; dates here are in September, like the scenarios.
test.describe.serial('linked transfers between accounts', () => {
  const OWNER = 'Alex Doe (Parent)'
  let n = 0

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

  async function transfer(
    request: APIRequestContext,
    from: string,
    to: string,
    amount: string,
    date: string,
  ) {
    const response = await request.post('/api/v1/transfers', {
      headers: { 'Idempotency-Key': `e2e-transfer-${++n}` },
      data: {
        fromAccountId: from,
        toAccountId: to,
        amount,
        occurredOn: date,
        enteredByMemberId: await owner(request),
      },
    })
    expect(response.status()).toBe(201)
    return ((await response.json()) as { movementId: string }).movementId
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

  /** The top of the panel is in view and focus is inside it (the review once opened with its top cut off). */
  async function expectTopInViewWithFocus(page: Page, heading: string) {
    const title = page.getByRole('heading', { name: heading })
    await expect(title).toBeInViewport({ ratio: 1 })
    await expect(title).toBeFocused()
  }

  for (const width of [710, 1280]) {
    test(`V2_CHECKING_010 V2_SAVINGS_010 V2_SAVINGS_002 adds a transfer at ${width}px: review, same-account error, cancel, confirm`, async ({
      page,
      request,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      const checking = await createAccount(
        request,
        'checking',
        `Transfer Checking ${width}`,
        '5000.00',
      )
      const savings = await createAccount(
        request,
        'savings',
        `Transfer Savings With A Rather Long Name ${width}`,
        '10000.00',
      )
      // A long activity table puts the buttons far below its first row, as in a real household.
      for (let day = 10; day < 22; day++) {
        await transfer(request, checking, savings, '1.00', `2026-09-${day}`)
      }
      await open(page, `/accounts/${checking}`)

      await page.getByRole('button', { name: 'Add transfer' }).click()
      await expectInView(page, 'Add transfer')
      const form = page.getByRole('region', { name: 'Add transfer' })
      await expect(page.getByRole('button', { name: 'Review' })).toBeInViewport()
      // Same account: the message is in view, the field has focus and what was typed stays.
      await form.getByLabel('To').selectOption(checking)
      await form.getByLabel('Amount').fill('2000.00')
      await form.getByLabel('Date').fill('2026-09-04')
      await form.getByRole('button', { name: 'Review' }).click()
      const message = page.getByText('Choose a different account')
      await expect(message).toBeVisible()
      await expect(message).toBeInViewport()
      await expect(form.getByLabel('To')).toBeFocused()
      await expect(form.getByLabel('Amount')).toHaveValue('2000.00')
      await expect(form.getByLabel('Date')).toHaveValue('2026-09-04')

      await form.getByLabel('To').selectOption(savings)
      await form.getByRole('button', { name: 'Review' }).click()
      await expectInView(page, 'Review transfer')
      await expectTopInViewWithFocus(page, 'Review transfer')
      const effect = page.getByRole('region', { name: 'Effect of this transfer' })
      await expect(effect).toContainText(`Transfer Checking ${width} Balance$2,988.00`)
      await expect(effect).toContainText(
        `Transfer Savings With A Rather Long Name ${width} Balance$12,012.00`,
      )
      await page.getByRole('button', { name: 'Cancel' }).click()
      await expect(page.getByLabel('Account details')).toContainText('$4,988.00')
      await expect(page.getByRole('region', { name: 'Activity' })).not.toContainText('-$2,000.00')
      await expect(page.getByRole('button', { name: 'Add transfer' })).toBeFocused()

      await page.getByRole('button', { name: 'Add transfer' }).click()
      await form.getByLabel('To').selectOption(savings)
      await form.getByLabel('Amount').fill('2000.00')
      await form.getByLabel('Date').fill('2026-09-04')
      await form.getByRole('button', { name: 'Review' }).click()
      await page.getByRole('button', { name: 'Confirm transfer' }).click()
      // Wait for the save to finish before leaving the page.
      const activity = page.getByRole('region', { name: 'Activity' })
      await expect(activity).toContainText('-$2,000.00')
      // The new row is in view: the page does not stay scrolled down at the button that opened the panel.
      await expect(page.getByRole('heading', { name: 'Activity' })).toBeInViewport({ ratio: 1 })
      await expect(page.getByLabel('Account details')).toContainText('$2,988.00')

      // Both sides are one click apart (V2_SAVINGS_007).
      await activity
        .getByRole('link', {
          name: new RegExp(`Transfer Savings With A Rather Long Name ${width}`),
        })
        .first()
        .click()
      await expect(page.getByLabel('Account details')).toContainText('$12,012.00')
      await expect(page.getByRole('region', { name: 'Activity' })).toContainText(
        `Transfer from Transfer Checking ${width}`,
      )
      const sideways = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(sideways).toBeLessThanOrEqual(0)
    })
  }

  for (const width of [710, 1280]) {
    test(`V2_TRANSFER_001 V2_TRANSFER_003 changes a transfer's amount, date and destination at ${width}px`, async ({
      page,
      request,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      const checking = await createAccount(
        request,
        'checking',
        `Change Checking ${width}`,
        '5000.00',
      )
      const emergency = await createAccount(
        request,
        'savings',
        `Change Emergency ${width}`,
        '10000.00',
      )
      const holiday = await createAccount(request, 'savings', `Change Holiday ${width}`, '500.00')
      await transfer(request, checking, emergency, '2000.00', '2026-09-04')
      await open(page, `/accounts/${checking}`)
      await expect(page.getByLabel('Account details')).toContainText('$3,000.00')

      await page.getByRole('button', { name: `Edit transfer to Change Emergency ${width}` }).click()
      await expectInView(page, 'Edit transfer')
      const form = page.getByRole('region', { name: 'Edit transfer' })
      // Destination set to the account itself: refused, both Balances unchanged.
      await form.getByLabel('To').selectOption(checking)
      await form.getByRole('button', { name: 'Review' }).click()
      await expect(page.getByText('Choose a different account')).toBeInViewport()
      await expect(form.getByLabel('To')).toBeFocused()
      await expect(page.getByLabel('Account details')).toContainText('$3,000.00')

      await form.getByLabel('To').selectOption(holiday)
      await form.getByLabel('Amount').fill('1500.00')
      await form.getByLabel('Date').fill('2026-09-05')
      await form.getByLabel('Reason').fill('Wrong savings account')
      await form.getByRole('button', { name: 'Review' }).click()
      await expectInView(page, 'Review change')
      await expectTopInViewWithFocus(page, 'Review change')
      const effect = page.getByRole('region', { name: 'Effect of this transfer' })
      await expect(effect).toContainText(`Change Checking ${width} Balance$3,500.00`)
      await expect(effect).toContainText(`Change Emergency ${width} Balance$10,000.00`)
      await expect(effect).toContainText(`Change Holiday ${width} Balance$2,000.00`)
      await page.getByRole('button', { name: 'Cancel' }).click()
      await expect(page.getByLabel('Account details')).toContainText('$3,000.00')
      await expect(page.getByRole('button', { name: /^Edit transfer to/ })).toBeFocused()

      await page.getByRole('button', { name: `Edit transfer to Change Emergency ${width}` }).click()
      await form.getByLabel('To').selectOption(holiday)
      await form.getByLabel('Amount').fill('1500.00')
      await form.getByLabel('Date').fill('2026-09-05')
      await form.getByLabel('Reason').fill('Wrong savings account')
      await form.getByRole('button', { name: 'Review' }).click()
      await page.getByRole('button', { name: 'Confirm transfer' }).click()
      await expect(page.getByRole('region', { name: 'Activity' })).toContainText('-$1,500.00')
      await expect(page.getByLabel('Account details')).toContainText('$3,500.00')

      // History keeps the original on the account it left, with who changed it.
      await open(page, `/accounts/${emergency}`)
      await expect(page.getByLabel('Account details')).toContainText('$10,000.00')
      await page.getByRole('button', { name: 'Show history' }).click()
      const history = page.getByRole('table', { name: 'History' })
      await expect(history).toContainText('Replaced')
      await expect(history).toContainText(`Moved to Change Holiday ${width}`)
      await expect(history).toContainText('Replaced by Alex Doe')
      const sideways = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(sideways).toBeLessThanOrEqual(0)
    })
  }

  test('V2_TRANSFER_002 removes a transfer from both accounts and Undo brings it back', async ({
    page,
    request,
  }) => {
    const checking = await createAccount(request, 'checking', 'Remove Checking', '5000.00')
    const savings = await createAccount(request, 'savings', 'Remove Savings', '10000.00')
    await transfer(request, checking, savings, '2000.00', '2026-09-04')
    await open(page, `/accounts/${checking}`)
    await expect(page.getByLabel('Account details')).toContainText('$3,000.00')

    await page.getByRole('button', { name: 'Remove transfer to Remove Savings' }).click()
    await expectInView(page, 'Review removal')
    const review = page.getByRole('region', { name: 'Review removal' })
    await expect(review).toContainText('Remove Checking Balance after removal$5,000.00')
    await expect(review).toContainText('Remove Savings Balance after removal$10,000.00')
    await page.getByRole('button', { name: 'Confirm removal' }).click()
    await expect(page.getByRole('main')).toContainText('No money activity has been recorded yet.')
    await expect(page.getByLabel('Account details')).toContainText('$5,000.00')

    await page.getByRole('button', { name: 'Show history' }).click()
    const history = page.getByRole('table', { name: 'History' })
    await expect(history).toContainText('Removed by Alex Doe')
    await history.getByRole('button', { name: 'Undo transfer to Remove Savings' }).click()
    await expectInView(page, 'Review Undo')
    await page.getByRole('button', { name: 'Confirm Undo' }).click()
    await expect(page.getByRole('region', { name: 'Activity' })).toContainText('-$2,000.00')
    await expect(page.getByLabel('Account details')).toContainText('$3,000.00')
    await open(page, `/accounts/${savings}`)
    await expect(page.getByLabel('Account details')).toContainText('$12,000.00')
    await expect(page.getByRole('region', { name: 'Activity' })).toContainText('2026-09-04')
  })

  for (const width of [710, 1280]) {
    test(`V2_EXPENSE_008 changes an expense to a transfer at ${width}px`, async ({
      page,
      request,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      const checking = await createAccount(
        request,
        'checking',
        `Mistake Checking ${width}`,
        '5000.00',
      )
      const savings = await createAccount(
        request,
        'savings',
        `Mistake Savings ${width}`,
        '10000.00',
      )
      const expense = await request.post(`/api/v1/accounts/${checking}/expenses`, {
        headers: { 'Idempotency-Key': `e2e-mistake-${width}` },
        data: {
          description: 'Other spending',
          amount: '2000.00',
          occurredOn: '2026-09-04',
          category: 'Dining',
          enteredByMemberId: await owner(request),
        },
      })
      expect(expense.status()).toBe(201)
      await open(page, `/accounts/${checking}`)
      await expect(page.getByLabel('Account details')).toContainText('$3,000.00')

      await page.getByRole('button', { name: 'Edit Other spending' }).click()
      await page.getByRole('button', { name: 'Change to transfer' }).click()
      await expectInView(page, 'Change to transfer')
      await page.getByLabel('Destination').selectOption(savings)
      await page.getByRole('button', { name: 'Review' }).click()
      await expectInView(page, 'Review change to transfer')
      await expectTopInViewWithFocus(page, 'Review change to transfer')
      const effect = page.getByRole('region', { name: 'Effect of this transfer' })
      await expect(effect).toContainText(`Mistake Checking ${width} Balance$3,000.00`)
      await expect(effect).toContainText(`Mistake Savings ${width} Balance$12,000.00`)
      await expect(effect).toContainText('September spending')
      // The reason is required; its message is in view next to the field.
      await page.getByRole('button', { name: 'Confirm transfer' }).click()
      const message = page.getByText('Give a reason for the change')
      await expect(message).toBeVisible()
      await expect(message).toBeInViewport()
      await expect(page.getByLabel('Reason')).toBeFocused()
      await page.getByLabel('Reason').fill('This money moved to our savings')
      await page.getByRole('button', { name: 'Confirm transfer' }).click()

      const activity = page.getByRole('region', { name: 'Activity' })
      await expect(activity).toContainText(`Transfer to Mistake Savings ${width}`)
      await expect(page.getByLabel('Account details')).toContainText('$3,000.00')
      await page.getByRole('button', { name: 'Show history' }).click()
      const history = page.getByRole('table', { name: 'History' })
      await expect(history).toContainText('Changed to a transfer')
      await expect(history).toContainText('This money moved to our savings')
      await open(page, `/accounts/${savings}`)
      await expect(page.getByLabel('Account details')).toContainText('$12,000.00')
      const sideways = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(sideways).toBeLessThanOrEqual(0)
    })
  }

  test('V2_SAVINGS_007 V2_CHECKING_007 keeps transfers out of income and spending, also for one account', async ({
    page,
    request,
  }) => {
    const checking = await createAccount(request, 'checking', 'Month Checking', '5000.00')
    const savings = await createAccount(request, 'savings', 'Month Savings', '10000.00')
    await transfer(request, checking, savings, '500.00', '2026-09-20')
    await open(page, '/spending')
    await page.getByLabel('Month', { exact: true }).fill('2026-09')
    await page.getByLabel('Account', { exact: true }).selectOption(savings)
    const review = page.getByRole('region', { name: 'Month review' })
    await expect(review).toContainText('Income $0.00')
    await expect(review).toContainText('Spending $0.00')
    await expect(review).toContainText('Income minus spending $0.00')
    await page.getByLabel('Account', { exact: true }).selectOption(checking)
    await expect(review).toContainText('Spending $0.00')
    await expect(review).toContainText('Income $0.00')
  })

  test('V2_SAVINGS_001 shows each account type in the Accounts list and the Household card', async ({
    page,
  }) => {
    await page.goto('/accounts')
    const list = page.getByRole('row').filter({ hasText: 'Month Savings' })
    await expect(list).toContainText('Savings')
    await expect(page.getByRole('row').filter({ hasText: 'Month Checking' })).toContainText(
      'Checking',
    )
    await page.goto('/')
    const wealth = page.getByRole('region', { name: 'Accounts and wealth' })
    await expect(wealth).toContainText('Month Savings')
    // The Bank money group lists the type beside the name (the flat list of the view does not).
    await expect(
      wealth
        .getByRole('region', { name: 'Bank money' })
        .getByRole('listitem')
        .filter({ hasText: 'Month Savings' }),
    ).toContainText('Savings')
  })
})
