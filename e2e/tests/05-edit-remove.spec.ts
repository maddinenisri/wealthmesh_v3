import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

// Runs after 04-income.spec.ts. Each test makes its own account through the API so its Balance is exact; household-wide
// figures are asserted in the API tests. Today is fixed to 2026-10-03.
test.describe.serial('edit, remove and undo journey', () => {
  async function createAccount(request: APIRequestContext, name: string, opening: string) {
    const household = (await (await request.get('/api/v1/household')).json()) as { id: string }
    const members = (await (
      await request.get(`/api/v1/household-members?householdId=${household.id}`)
    ).json()) as { id: string; name: string }[]
    const alex = members.find((m) => m.name === 'Alex Doe')!.id
    const response = await request.post('/api/v1/accounts', {
      data: {
        type: 'checking',
        name,
        ownerMemberIds: [alex],
        openedOn: '2026-09-01',
        openingBalance: opening,
      },
    })
    expect(response.status()).toBe(201)
    return { id: ((await response.json()) as { id: string }).id, alex }
  }

  async function addEntry(
    request: APIRequestContext,
    account: { id: string; alex: string },
    kind: 'expenses' | 'income',
    entry: { description: string; amount: string; date: string; category: string },
  ) {
    const response = await request.post(`/api/v1/accounts/${account.id}/${kind}`, {
      headers: { 'Idempotency-Key': `e2e-${account.id}-${entry.description}` },
      data: {
        description: entry.description,
        amount: entry.amount,
        occurredOn: entry.date,
        category: entry.category,
        enteredByMemberId: account.alex,
      },
    })
    expect(response.status()).toBe(201)
  }

  async function openAccount(page: Page, name: string) {
    await page.goto('/accounts')
    // Each test gets a fresh browser, so the "Entering as" choice is made again here (D-025).
    await page.getByLabel('Entering as').selectOption({ label: 'Alex Doe (Parent)' })
    await page.getByRole('link', { name, exact: true }).click()
  }

  test('V2_CHECKING_008 corrects an expense amount and keeps the old amount in history', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'Rent Checking', '5000.00')
    await addEntry(request, account, 'expenses', {
      description: 'Rent',
      amount: '1600.00',
      date: '2026-09-03',
      category: 'Rent',
    })
    await openAccount(page, 'Rent Checking')
    await expect(page.getByLabel('Account details')).toContainText('$3,400.00')

    await page.getByRole('button', { name: 'Edit Rent' }).click()
    const form = page.getByRole('region', { name: 'Edit money out' })
    await form.getByLabel('Amount').fill('1500.00')
    await form.getByLabel('Reason').fill('Correct the rent amount')
    await page.getByRole('button', { name: 'Review' }).click()
    await expect(page.getByRole('region', { name: 'Review change' })).toContainText(
      '$1,600.00 changed to $1,500.00',
    )
    await page.getByRole('button', { name: 'Confirm saving' }).click()

    await expect(page.getByLabel('Account details')).toContainText('$3,500.00')
    await expect(page.getByRole('row', { name: /Rent/ })).toHaveCount(1)
    await page.getByRole('button', { name: 'Show history' }).click()
    const history = page.getByRole('table', { name: 'History' })
    await expect(history).toContainText('$1,600.00')
    await expect(history).toContainText('Replaced')
    await expect(history).toContainText('$1,500.00')
    await expect(history).toContainText('Alex Doe')
    await expect(history).toContainText('Correct the rent amount')
  })

  test('V2_EXPENSE_006 corrects a category and keeps the account, amount and date', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'Category Checking', '5000.00')
    await addEntry(request, account, 'expenses', {
      description: 'Supermarket',
      amount: '125.00',
      date: '2026-09-10',
      category: 'Dining',
    })
    await openAccount(page, 'Category Checking')

    await page.getByRole('button', { name: 'Edit Supermarket' }).click()
    await page.getByLabel('Category').selectOption({ label: 'Groceries' })
    await page.getByRole('button', { name: 'Review' }).click()
    const review = page.getByRole('region', { name: 'Review change' })
    await expect(review).toContainText('Category Checking')
    await expect(review).toContainText('$125.00')
    await expect(review).toContainText('2026-09-10')
    await expect(review).toContainText('Dining changed to Groceries')
    await page.getByRole('button', { name: 'Confirm saving' }).click()

    await expect(page.getByLabel('Account details')).toContainText('$4,875.00')
    const row = page.getByRole('row', { name: /Supermarket/ })
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('Groceries')
    await expect(row).not.toContainText('Dining')
  })

  test('V2_EXPENSE_009 removes an incorrect expense and restores it with Undo', async ({
    page,
    request,
  }) => {
    const account = await createAccount(request, 'Removal Checking', '5000.00')
    await addEntry(request, account, 'expenses', {
      description: 'Groceries',
      amount: '125.00',
      date: '2026-09-10',
      category: 'Groceries',
    })
    await openAccount(page, 'Removal Checking')
    const details = page.getByLabel('Account details')
    await expect(details).toContainText('$4,875.00')

    await page.getByRole('button', { name: 'Remove Groceries' }).click()
    const review = page.getByRole('region', { name: 'Review removal' })
    await expect(review).toContainText('$5,000.00')
    await expect(review).toContainText('September spending')
    await expect(review).toContainText('does not obtain a merchant refund')
    await review.getByRole('button', { name: 'Cancel' }).click()
    await expect(details).toContainText('$4,875.00')

    await page.getByRole('button', { name: 'Remove Groceries' }).click()
    await page.getByRole('button', { name: 'Confirm removal' }).click()
    await expect(details).toContainText('$5,000.00')
    await expect(page.getByRole('main')).toContainText('No money activity has been recorded yet.')

    await page.getByRole('button', { name: 'Show history' }).click()
    const history = page.getByRole('table', { name: 'History' })
    await expect(history).toContainText('Removed')
    await history.getByRole('button', { name: 'Undo Groceries' }).click()
    await page.getByRole('button', { name: 'Confirm Undo' }).click()
    await expect(details).toContainText('$4,875.00')
    await expect(page.getByRole('row', { name: /Groceries/ }).first()).toContainText('2026-09-10')
  })

  test('V2_INCOME_004 removes an incorrect salary and undoes it', async ({ page, request }) => {
    const account = await createAccount(request, 'Salary Removal Checking', '5000.00')
    await addEntry(request, account, 'income', {
      description: 'Salary',
      amount: '6000.00',
      date: '2026-09-02',
      category: 'Salary',
    })
    await openAccount(page, 'Salary Removal Checking')
    const details = page.getByLabel('Account details')
    await expect(details).toContainText('$11,000.00')

    await page.getByRole('button', { name: 'Remove Salary' }).click()
    const review = page.getByRole('region', { name: 'Review removal' })
    await expect(review).toContainText('September Income')
    await expect(review).toContainText('$5,000.00')
    await expect(review).toContainText('does not reverse a bank deposit')
    await page.getByRole('button', { name: 'Confirm removal' }).click()
    await expect(details).toContainText('$5,000.00')

    await page.getByRole('button', { name: 'Show history' }).click()
    await page
      .getByRole('table', { name: 'History' })
      .getByRole('button', { name: 'Undo Salary' })
      .click()
    await page.getByRole('button', { name: 'Confirm Undo' }).click()
    await expect(details).toContainText('$11,000.00')
    await expect(page.getByRole('row', { name: /Salary/ }).first()).toContainText('2026-09-02')
  })
})
