import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

// Runs after 11b-transfers.spec.ts and before 12-members.spec.ts, which renames Alex Doe and removes Samira.
// Each test makes its own cards through the page or the API so Balances are exact. Today is fixed to 2026-10-03.
test.describe.serial('credit cards', () => {
  const OWNER = 'Alex Doe (Parent)'

  async function sideways(page: Page) {
    return page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
  }

  const row = (page: Page, name: string) =>
    page.getByRole('row').filter({ has: page.getByRole('link', { name, exact: true }) })

  async function ownerId(request: APIRequestContext) {
    const household = (await (await request.get('/api/v1/household')).json()) as { id: string }
    const members = (await (
      await request.get(`/api/v1/household-members?householdId=${household.id}`)
    ).json()) as { id: string; name: string }[]
    return members.find((m) => m.name === 'Alex Doe')!.id
  }

  for (const width of [710, 1280]) {
    test(`V2_CARD_001 V2_CARD_005 V2_CARD_014 adds a card owed at ${width}px, explains each mistake, then follows it to the detail`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      const name = `Everyday Credit Card ${width}`
      await page.goto('/accounts/new')
      await page.getByLabel('Account type').selectOption('credit_card')
      await page.getByLabel('Issuer').fill('Harbor Cards')
      await page.getByRole('checkbox', { name: OWNER }).check()
      await page.getByLabel('Opened on').fill('2026-09-01')
      await page.getByLabel('Balance', { exact: true }).fill('$1,000.00')
      await page.getByRole('button', { name: 'Save account' }).click()

      // A missing name is explained, in view and focused, and everything else stays.
      const missing = page.getByText('Enter an account name')
      await expect(missing).toBeVisible()
      await expect(missing).toBeInViewport()
      await expect(page.getByLabel('Account name')).toBeFocused()
      await expect(page.getByLabel('Issuer')).toHaveValue('Harbor Cards')
      await expect(page.getByLabel('Balance', { exact: true })).toHaveValue('$1,000.00')
      await expect(page.getByLabel('Opened on')).toHaveValue('2026-09-01')

      await page.getByLabel('Account name').fill(name)
      await page.getByLabel('Balance', { exact: true }).fill('one thousand')
      await page.getByRole('button', { name: 'Save account' }).click()
      const invalid = page.getByText('Enter a valid amount')
      await expect(invalid).toBeVisible()
      await expect(invalid).toBeInViewport()
      await expect(page.getByLabel('Balance', { exact: true })).toBeFocused()

      await page.getByLabel('Balance', { exact: true }).fill('$1,000.00')
      await page.getByLabel('Balance means').selectOption('owed')
      await page.getByRole('button', { name: 'Save account' }).click()

      const listed = row(page, name)
      await expect(listed).toContainText('$1,000.00 owed')
      await expect(listed).toContainText('Harbor Cards')
      await expect(listed).toContainText('Alex Doe')
      await expect(listed).toContainText('2026-09-01')
      await expect(listed).not.toContainText('Overdrawn')
      expect(await sideways(page)).toBeLessThanOrEqual(0)

      await page.getByRole('link', { name, exact: true }).click()
      const main = page.getByRole('main')
      await expect(main).toContainText('Credit card account')
      await expect(main).toContainText('Initial Balance$1,000.00 owed on 2026-09-01')
      await expect(main).toContainText('No money activity has been recorded yet.')
      for (const action of ['Record purchase', 'Record refund', 'Record payment']) {
        await expect(page.getByRole('button', { name: action })).toBeVisible()
      }
      await expect(page.getByRole('button', { name: 'Add money in' })).toHaveCount(0)
      expect(await sideways(page)).toBeLessThanOrEqual(0)
    })
  }

  test('V2_CARD_003 shows Card credit in the list and the Household card, apart from debt', async ({
    page,
  }) => {
    await page.goto('/accounts/new')
    await page.getByLabel('Account type').selectOption('credit_card')
    await page.getByLabel('Account name').fill('Rewards Credit Card')
    await page.getByLabel('Issuer').fill('Harbor Cards')
    await page.getByRole('checkbox', { name: OWNER }).check()
    await page.getByLabel('Opened on').fill('2026-09-01')
    await page.getByLabel('Balance', { exact: true }).fill('$50.00')
    await page.getByLabel('Balance means').selectOption('credit')
    await page.getByRole('button', { name: 'Save account' }).click()

    await expect(row(page, 'Rewards Credit Card')).toContainText('$50.00 Card credit')
    await page.goto('/')
    const card = page.getByRole('listitem').filter({ hasText: 'Rewards Credit Card' })
    await expect(card).toContainText('$50.00 Card credit')
    await expect(card).not.toContainText('owed')
  })

  test('V2_CARD_004 edits name, issuer and owner and keeps the Balance', async ({
    page,
    request,
  }) => {
    const response = await request.post('/api/v1/accounts', {
      data: {
        type: 'credit_card',
        name: 'Travel Card',
        institution: 'Harbor Cards',
        ownerMemberIds: [await ownerId(request)],
        openedOn: '2026-09-01',
        openingBalance: '300.00',
        balanceSide: 'owed',
      },
    })
    expect(response.status()).toBe(201)
    const id = ((await response.json()) as { id: string }).id
    await page.goto(`/accounts/${id}/edit`)
    await expect(page.getByLabel('Balance', { exact: true })).toHaveCount(0)
    await page.getByLabel('Account name').fill('Household Card')
    await page.getByLabel('Issuer').fill('Harbor Credit Union')
    await page.getByRole('button', { name: 'Save details' }).click()
    const main = page.getByRole('main')
    await expect(main.getByRole('heading', { name: 'Household Card' })).toBeVisible()
    await expect(main).toContainText('Harbor Credit Union')
    await expect(main).toContainText('$300.00 owed')
  })
  async function fillEntry(
    page: Page,
    fields: { description?: string; amount: string; date: string; category: string },
  ) {
    if (fields.description)
      await page.getByLabel('Description', { exact: true }).fill(fields.description)
    await page.getByLabel('Amount', { exact: true }).fill(fields.amount)
    await page.getByLabel('Date', { exact: true }).fill(fields.date)
    await page.getByLabel('Category', { exact: true }).selectOption({ label: fields.category })
  }

  async function saveReviewed(page: Page, review: string) {
    await page.getByRole('button', { name: 'Review' }).click()
    const panel = page.getByRole('region', { name: review })
    await expect(panel).toBeVisible()
    await expect(panel).toBeInViewport()
    await page.getByRole('button', { name: 'Confirm saving' }).click()
  }

  for (const width of [710, 1280]) {
    test(`V2_CARD_002 V2_CARD_008 V2_CARD_009 V2_CARD_011 records a purchase, refund, interest and a fee at ${width}px and every screen agrees`, async ({
      page,
      request,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      const name = `Spending Card ${width}`
      const response = await request.post('/api/v1/accounts', {
        data: {
          type: 'credit_card',
          name,
          institution: 'Harbor Cards',
          ownerMemberIds: [await ownerId(request)],
          openedOn: '2026-09-01',
          openingBalance: '1000.00',
          balanceSide: 'owed',
        },
      })
      expect(response.status()).toBe(201)
      const id = ((await response.json()) as { id: string }).id
      await page.goto(`/accounts/${id}`)
      await page.getByLabel('Entering as').selectOption({ label: OWNER })

      // V2_CARD_009: a negative purchase is explained in view and everything stays selected.
      await page.getByRole('button', { name: 'Record purchase' }).click()
      await fillEntry(page, { amount: '-$100.00', date: '2026-09-10', category: 'Groceries' })
      await page.getByRole('button', { name: 'Review' }).click()
      const message = page.getByText('Enter an amount greater than zero')
      await expect(message).toBeVisible()
      await expect(message).toBeInViewport()
      await expect(page.getByLabel('Amount', { exact: true })).toBeFocused()
      await expect(page.getByLabel('Date', { exact: true })).toHaveValue('2026-09-10')
      await expect(page.getByLabel('Category', { exact: true })).toHaveValue(/.+/)
      await page.getByLabel('Amount', { exact: true }).fill('$100.00')
      await saveReviewed(page, 'Review purchase')
      await expect(page.getByRole('main')).toContainText('$1,100.00 owed')

      await page.getByRole('button', { name: 'Record refund' }).click()
      await fillEntry(page, { amount: '$20.00', date: '2026-09-12', category: 'Groceries' })
      await saveReviewed(page, 'Review refund')
      await expect(page.getByRole('main')).toContainText('$1,080.00 owed')

      await page.getByRole('button', { name: 'Record purchase' }).click()
      await fillEntry(page, {
        description: 'Interest charged',
        amount: '$15.00',
        date: '2026-09-25',
        category: 'Interest charged',
      })
      await saveReviewed(page, 'Review purchase')
      await page.getByRole('button', { name: 'Record purchase' }).click()
      await fillEntry(page, {
        description: 'Annual fee',
        amount: '$25.00',
        date: '2026-09-26',
        category: 'Annual fee',
      })
      await saveReviewed(page, 'Review purchase')
      await expect(page.getByRole('main')).toContainText('$1,120.00 owed')
      expect(await sideways(page)).toBeLessThanOrEqual(0)

      // The same figures on every screen: Spending, the Month review, the account list and the Household card.
      await page.getByRole('link', { name: 'Spending' }).click()
      await page.getByLabel('Month', { exact: true }).fill('2026-09')
      await page.getByLabel('Account', { exact: true }).selectOption({ label: name })
      await expect(page.getByRole('region', { name: 'Month review' })).toContainText(
        'Spending $120.00',
      )
      const month = page.getByRole('region', { name: /September 2026/ })
      await expect(month).toContainText('Spending $120.00')
      await expect(month.getByRole('list', { name: 'Spending by category' })).toContainText(
        'Groceries $80.00',
      )
      await expect(month.getByRole('list', { name: 'Spending by category' })).toContainText(
        'Interest charged $15.00',
      )
      await expect(month.getByRole('list', { name: 'Spending by category' })).toContainText(
        'Annual fee $25.00',
      )
      await page.getByRole('link', { name: 'Accounts', exact: true }).click()
      await expect(row(page, name)).toContainText('$1,120.00 owed')
      await page.goto('/')
      await expect(page.getByRole('listitem').filter({ hasText: name })).toContainText(
        '$1,120.00 owed',
      )
    })
  }
  async function makeAccount(
    request: APIRequestContext,
    data: Record<string, string>,
  ): Promise<string> {
    const response = await request.post('/api/v1/accounts', {
      data: {
        institution: 'Harbor Bank',
        ownerMemberIds: [await ownerId(request)],
        openedOn: '2026-09-01',
        ...data,
      },
    })
    expect(response.status()).toBe(201)
    return ((await response.json()) as { id: string }).id
  }

  for (const width of [710, 1280]) {
    test(`V2_CARD_006 V2_CARD_007 V2_CARD_012 V2_CARD_013 pays a card at ${width}px: review, cancel, overpay, correct, remove and restore`, async ({
      page,
      request,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      const bank = `Paying Checking ${width}`
      const name = `Paid Card ${width}`
      await makeAccount(request, {
        type: 'checking',
        name: bank,
        openingBalance: '5000.00',
      })
      const cardId = await makeAccount(request, {
        type: 'credit_card',
        name,
        institution: 'Harbor Cards',
        openingBalance: '100.00',
        balanceSide: 'owed',
      })
      // Long history first, so a page left scrolled down would hide the new row.
      for (let n = 0; n < 12; n++) {
        const response = await request.post(`/api/v1/accounts/${cardId}/expenses`, {
          headers: { 'Idempotency-Key': `e2e-pay-${width}-${n}` },
          data: {
            description: `Purchase ${n}`,
            amount: '0.01',
            occurredOn: '2026-09-02',
            category: 'Groceries',
            enteredByMemberId: await ownerId(request),
          },
        })
        expect(response.status()).toBe(201)
      }
      await page.goto(`/accounts/${cardId}`)
      await page.getByLabel('Entering as').selectOption({ label: OWNER })
      await expect(page.getByRole('main')).toContainText('$100.12 owed')

      // V2_CARD_007: the card is the destination, the bank is chosen, the review shows both, Cancel saves nothing.
      await page.getByRole('button', { name: 'Record payment' }).click()
      await expect(page.getByText('Paid to')).toBeVisible()
      await page.getByLabel('Paid from').selectOption({ label: `${bank} (Checking)` })
      await page.getByLabel('Amount', { exact: true }).fill('150.00')
      await page.getByLabel('Date', { exact: true }).fill('2026-09-20')
      await page.getByRole('button', { name: 'Review' }).click()
      const review = page.getByRole('region', { name: 'Review payment' })
      await expect(review).toBeVisible()
      await expect(review).toBeInViewport()
      const effect = page.getByRole('region', { name: 'Effect of this payment' })
      await expect(effect).toContainText(`${bank} Balance$4,850.00`)
      // V2_CARD_012: paying more than is owed is explained as Card credit.
      await expect(effect).toContainText(`${name} Balance$49.88 Card credit`)
      await expect(effect).toContainText('left with a $49.88 Card credit')
      expect(await sideways(page)).toBeLessThanOrEqual(0)
      await page.getByRole('button', { name: 'Cancel' }).click()
      await expect(page.getByRole('main')).toContainText('$100.12 owed')
      await expect(page.getByRole('button', { name: 'Record payment' })).toBeFocused()

      // Confirm it: the new row is in view and the card is in credit.
      await page.getByRole('button', { name: 'Record payment' }).click()
      await page.getByLabel('Paid from').selectOption({ label: `${bank} (Checking)` })
      await page.getByLabel('Amount', { exact: true }).fill('150.00')
      await page.getByLabel('Date', { exact: true }).fill('2026-09-20')
      await page.getByRole('button', { name: 'Review' }).click()
      await page.getByRole('button', { name: 'Confirm payment' }).click()
      await expect(page.getByRole('main')).toContainText('$49.88 Card credit')
      await expect(page.getByRole('heading', { name: 'Activity' })).toBeInViewport()
      await expect(page.getByText(`Payment from ${bank}`)).toBeVisible()

      // V2_CARD_013: correct, remove and restore; the card and the bank always move together.
      await page.getByRole('button', { name: `Edit payment from ${bank}` }).click()
      await page.getByLabel('Amount', { exact: true }).fill('50.00')
      await page.getByRole('button', { name: 'Review' }).click()
      await page.getByRole('button', { name: 'Confirm payment' }).click()
      await expect(page.getByRole('main')).toContainText('$50.12 owed')
      await page.getByRole('button', { name: `Remove payment from ${bank}` }).click()
      await expect(page.getByRole('region', { name: 'Review removal' })).toBeInViewport()
      await page.getByRole('button', { name: 'Confirm removal' }).click()
      await expect(page.getByRole('main')).toContainText('$100.12 owed')
      await page.getByRole('button', { name: 'Show history' }).click()
      await page.getByRole('button', { name: `Undo payment from ${bank}` }).click()
      await page.getByRole('button', { name: 'Confirm Undo' }).click()
      await expect(page.getByRole('main')).toContainText('$50.12 owed')
      await page.getByRole('link', { name: 'Accounts', exact: true }).click()
      await expect(row(page, bank)).toContainText('$4,950.00')
      expect(await sideways(page)).toBeLessThanOrEqual(0)
    })
  }

  test('V2_MONTHLY_002 a card in Spending leaves out the repayment and the August purchase', async ({
    page,
    request,
  }) => {
    const bank = await makeAccount(request, {
      type: 'checking',
      name: 'Monthly Checking',
      openingBalance: '5000.00',
    })
    const cardId = await makeAccount(request, {
      type: 'credit_card',
      name: 'Monthly Card',
      institution: 'Harbor Cards',
      openedOn: '2026-08-01',
    })
    const member = await ownerId(request)
    const entry = (description: string, amount: string, occurredOn: string) => ({
      headers: { 'Idempotency-Key': `e2e-monthly-${description}` },
      data: { description, amount, occurredOn, category: 'Groceries', enteredByMemberId: member },
    })
    for (const [path, args] of [
      ['expenses', ['August', '90.00', '2026-08-31']],
      ['expenses', ['Big shop', '620.00', '2026-09-06']],
      ['refunds', ['Returned', '20.00', '2026-09-12']],
    ] as const) {
      const response = await request.post(
        `/api/v1/accounts/${cardId}/${path}`,
        entry(args[0], args[1], args[2]),
      )
      expect(response.status()).toBe(201)
    }
    const paid = await request.post('/api/v1/card-payments', {
      headers: { 'Idempotency-Key': 'e2e-monthly-payment' },
      data: {
        fromAccountId: bank,
        toAccountId: cardId,
        amount: '500.00',
        occurredOn: '2026-09-20',
        enteredByMemberId: member,
      },
    })
    expect(paid.status()).toBe(201)

    await page.goto('/spending')
    await page.getByLabel('Month', { exact: true }).fill('2026-09')
    await page.getByLabel('Account', { exact: true }).selectOption({ label: 'Monthly Card' })
    const month = page.getByRole('region', { name: /September 2026/ })
    await expect(month).toContainText('Spending $600.00')
    await month.getByRole('button', { name: 'Groceries' }).click()
    const table = month.getByRole('table', { name: 'Expenses in this category' })
    await expect(table.getByRole('row')).toHaveCount(3)
    await expect(table).toContainText('2026-09-06')
    await expect(table).toContainText('$620.00')
    await expect(table).toContainText('2026-09-12')
    await expect(table).toContainText('-$20.00')
    await expect(table).toContainText('Monthly Card')
    await expect(table).not.toContainText('2026-08-31')
    await expect(table).not.toContainText('2026-09-20')
  })
  for (const width of [710, 1280]) {
    test(`V2_CARD_010 V2_SUPPORTING_RECORD_001 reviews a card statement against its Balance and keeps both statement versions at ${width}px`, async ({
      page,
      request,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      const bank = `Statement Checking ${width}`
      const name = `Statement Card ${width}`
      const bankId = await makeAccount(request, {
        type: 'checking',
        name: bank,
        openingBalance: '5000.00',
      })
      const cardId = await makeAccount(request, {
        type: 'credit_card',
        name,
        institution: 'Harbor Cards',
        openingBalance: '1000.00',
        balanceSide: 'owed',
      })
      const member = await ownerId(request)
      const send = async (path: string, key: string, data: Record<string, unknown>) => {
        const response = await request.post(path, {
          headers: { 'Idempotency-Key': `e2e-stmt-${width}-${key}` },
          data: { enteredByMemberId: member, ...data },
        })
        expect(response.status()).toBe(201)
      }
      await send(`/api/v1/accounts/${cardId}/expenses`, 'buy', {
        description: 'Groceries',
        amount: '100.00',
        occurredOn: '2026-09-10',
        category: 'Groceries',
      })
      await send(`/api/v1/accounts/${cardId}/refunds`, 'refund', {
        description: 'Returned',
        amount: '20.00',
        occurredOn: '2026-09-12',
        category: 'Groceries',
      })
      await send('/api/v1/card-payments', 'pay', {
        fromAccountId: bankId,
        toAccountId: cardId,
        amount: '500.00',
        occurredOn: '2026-09-20',
      })
      await send(`/api/v1/accounts/${cardId}/statements`, 'statement', {
        statementOn: '2026-09-30',
        balance: '600.00',
        balanceSide: 'owed',
        note: 'September statement',
      })
      await page.goto(`/accounts/${cardId}`)
      await page.getByLabel('Entering as').selectOption({ label: OWNER })
      await expect(page.getByRole('main')).toContainText('$580.00 owed')
      const statements = page.getByRole('region', { name: 'Supporting statements' })
      await expect(statements).toContainText('September statement dated 2026-09-30, $600.00 owed')

      // V2_CARD_010: the statement is information; the review shows the difference as a change in debt.
      await page.getByRole('button', { name: 'Update balance' }).click()
      await page.getByLabel('Balance', { exact: true }).fill('600.00')
      await page.getByLabel('Balance means').selectOption('owed')
      await page.getByLabel('Date', { exact: true }).fill('2026-09-30')
      await page.getByRole('button', { name: 'Review' }).click()
      const review = page.getByRole('region', { name: 'Review balance update' })
      await expect(review).toBeVisible()
      await expect(review).toBeInViewport()
      await expect(review).toContainText('Current Balance on 2026-09-30$580.00 owed')
      await expect(review).toContainText('Requested Balance$600.00 owed')
      await expect(review).toContainText('Difference$20.00 increase in debt')
      expect(await sideways(page)).toBeLessThanOrEqual(0)
      await review.getByLabel('Reason').fill('Correct to reviewed amount')
      await review.getByRole('button', { name: 'Confirm correction' }).click()
      await expect(page.getByRole('main')).toContainText('$600.00 owed')
      await expect(page.getByText('Balance correction: Correct to reviewed amount')).toBeVisible()
      // Spending is still the $80.00 of purchases less the refund: the correction is no fee.
      const spending = await request.get(`/api/v1/spending?month=2026-09&accountId=${cardId}`)
      expect(((await spending.json()) as { total: string }).total).toBe('80.00')

      // V2_SUPPORTING_RECORD_001: a corrected statement is the latest; the original stays.
      await statements.getByRole('button', { name: 'Replace with corrected version' }).click()
      await expect(page.getByLabel('Statement balance')).toHaveValue('600.00')
      await page.getByLabel('Reason', { exact: true }).fill('Issuer supplied a corrected statement')
      await page.getByRole('button', { name: 'Review' }).click()
      const replacement = page.getByRole('region', { name: 'Review statement replacement' })
      await expect(replacement).toBeInViewport()
      await expect(replacement).toContainText('Your Balance stays $600.00 owed')
      await page.getByRole('button', { name: 'Confirm replacement' }).click()
      await expect(statements).toContainText('Active version')
      await expect(statements).toContainText('Replaced')
      await expect(statements).toContainText('Reason: Issuer supplied a corrected statement')
      await expect(page.getByRole('main')).toContainText('$600.00 owed')
      expect(await sideways(page)).toBeLessThanOrEqual(0)
    })
  }
})
