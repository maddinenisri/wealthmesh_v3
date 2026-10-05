import { expect, test, type Page } from '@playwright/test'

// Runs after 02-checking-setup.spec.ts: the household has Alex Doe and Samira Rivera, and
// "Household Checking" starts at $5,000.00 on 2026-09-01 with no activity. Today is fixed to 2026-10-03.
test.describe.serial('money out and monthly spending journey', () => {
  async function openMoneyOut(page: Page) {
    await page.goto('/accounts')
    // Each test gets a fresh browser, so the "Entering as" choice is made again here (D-025).
    await page.getByLabel('Entering as').selectOption({ label: 'Alex Doe (Parent)' })
    await page.getByRole('link', { name: 'Household Checking', exact: true }).click()
    await page.getByRole('button', { name: 'Add money out' }).click()
  }

  async function fill(
    page: Page,
    fields: { description?: string; amount: string; date: string; category: string },
  ) {
    const form = page.getByRole('region', { name: 'Add money out' })
    await form.getByLabel('Description').fill(fields.description ?? '')
    await form.getByLabel('Amount').fill(fields.amount)
    await form.getByLabel('Date').fill(fields.date)
    await form.getByLabel('Category').selectOption({ label: fields.category })
  }

  test('V2_MEMBERS_001 offers both names for owner choice and for who entered a record, with no sign-in', async ({
    page,
  }) => {
    await page.goto('/accounts/new')
    await expect(page.getByRole('group', { name: 'Owners' }).getByRole('checkbox')).toHaveCount(2)
    await expect(page.getByRole('group', { name: 'Owners' }).locator('label')).toHaveText([
      'Alex Doe (Parent)',
      'Samira Rivera (Child)',
    ])
    const enteringAs = page.getByLabel('Entering as')
    await expect(enteringAs.locator('option')).toHaveText([
      'Choose a name',
      'Alex Doe (Parent)',
      'Samira Rivera (Child)',
    ])
    await expect(page.getByLabel(/password/i)).toHaveCount(0)
    await enteringAs.selectOption({ label: 'Alex Doe (Parent)' })
    await page.reload()
    await expect(page.getByLabel('Entering as')).toHaveValue(/.+/) // remembered in this browser
  })

  test('V2_EXPENSE_010 rejects a zero purchase and leaves the Balance alone', async ({ page }) => {
    await openMoneyOut(page)
    const form = page.getByRole('region', { name: 'Add money out' })
    await fill(page, { amount: '0.00', date: '2026-09-10', category: 'Groceries' })
    await page.getByRole('button', { name: 'Review' }).click()

    await expect(page.getByText('Enter an amount greater than zero')).toBeVisible()
    await expect(form.getByLabel('Date')).toHaveValue('2026-09-10')
    await expect(form.getByLabel('Category')).toHaveValue(/.+/)
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('main')).toContainText('No money activity has been recorded yet.')
    await expect(page.getByRole('main')).toContainText('$5,000.00')
  })

  test('V2_CHECKING_011 corrects a negative purchase and saves it once when the first answer is lost and the save is repeated', async ({
    page,
  }) => {
    await openMoneyOut(page)
    const form = page.getByRole('region', { name: 'Add money out' })
    await fill(page, { amount: '-$100.00', date: '2026-09-10', category: 'Groceries' })
    await page.getByRole('button', { name: 'Review' }).click()
    await expect(page.getByText('Enter an amount greater than zero')).toBeVisible()
    await expect(form.getByLabel('Category')).toHaveValue(/.+/)

    await form.getByLabel('Amount').fill('$100.00')
    await page.getByRole('button', { name: 'Review' }).click()
    await expect(page.getByText('Entered by: Alex Doe (Parent)')).toBeVisible()

    const saves: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/expenses')) {
        saves.push(request.headers()['idempotency-key'] ?? '')
      }
    })
    // The first answer is lost (the save landed but the response did not), so the person confirms again.
    let first = true
    await page.route('**/api/v1/accounts/*/expenses', async (route) => {
      if (first) {
        first = false
        await route.fetch()
        await route.fulfill({
          status: 503,
          json: { message: 'The server took too long to answer' },
        })
      } else {
        await route.continue()
      }
    })
    await page.getByRole('button', { name: 'Confirm saving' }).click()
    await expect(page.getByRole('alert')).toContainText('took too long')
    await page.getByRole('button', { name: 'Confirm saving' }).click()

    const main = page.getByRole('main')
    await expect(main.getByRole('row', { name: /2026-09-10/ })).toHaveCount(1)
    await expect(main).toContainText('$4,900.00')
    expect(saves).toHaveLength(2)
    expect(new Set(saves).size).toBe(1)
  })

  test('V2_EXPENSE_001 records a bill and follows it from September spending', async ({ page }) => {
    await openMoneyOut(page)
    await fill(page, {
      description: 'Electricity',
      amount: '180.00',
      date: '2026-09-05',
      category: 'Utilities',
    })
    await page.getByRole('button', { name: 'Review' }).click()
    await page.getByRole('button', { name: 'Confirm saving' }).click()
    await expect(page.getByRole('main')).toContainText('$4,720.00')

    await page.getByRole('link', { name: 'Spending' }).click()
    await page.getByLabel('Month', { exact: true }).fill('2026-09')
    await page
      .getByRole('list', { name: 'Spending by category' })
      .getByRole('button', { name: 'Utilities' })
      .click()
    const row = page.getByRole('row', { name: /Electricity/ })
    await expect(row).toContainText('$180.00')
    await expect(row).toContainText('2026-09-05')
    await expect(row).toContainText('Household Checking')

    await row.getByRole('button', { name: 'Electricity' }).click()
    const details = page.getByLabel('Expense details')
    await expect(details).toContainText('Household Checking')
    await expect(details).toContainText('2026-09-05')
    await expect(details).toContainText('$180.00')
    await expect(details).toContainText('Utilities')
  })

  test('V2_MONTHLY_005 labels an annual estimate from one recorded month and keeps October empty', async ({
    page,
  }) => {
    // Given: September's checking expenses total $3,660.00 (set up through the API).
    const accounts = (await (await page.request.get('/api/v1/accounts')).json()) as {
      id: string
      name: string
    }[]
    const account = accounts.find((a) => a.name === 'Household Checking')!
    const categories = (await (
      await page.request.get('/api/v1/categories?kind=spending')
    ).json()) as {
      name: string
    }[]
    expect(categories.length).toBeGreaterThan(0)
    const household = (await (await page.request.get('/api/v1/household')).json()) as { id: string }
    const members = (await (
      await page.request.get(`/api/v1/household-members?householdId=${household.id}`)
    ).json()) as { id: string }[]
    const rows: [string, string, string, string][] = [
      ['Rent', '1500.00', '2026-09-03', 'Rent'],
      ['Insurance', '700.00', '2026-09-08', 'Insurance'],
      ['Groceries', '500.00', '2026-09-12', 'Groceries'],
      ['Dining', '380.00', '2026-09-11', 'Dining'],
      ['Travel', '300.00', '2026-09-22', 'Travel'],
    ]
    for (const [description, amount, occurredOn, category] of rows) {
      const response = await page.request.post(`/api/v1/accounts/${account.id}/expenses`, {
        headers: { 'Idempotency-Key': `e2e-${description}` },
        data: { description, amount, occurredOn, category, enteredByMemberId: members[0].id },
      })
      expect(response.status()).toBe(201)
    }

    await page.goto('/spending')
    const history = page.getByRole('region', { name: 'Spending history' })
    await expect(history.getByText(/Average recorded month/)).toContainText('$3,660.00')
    await expect(history.getByText(/Average recorded month/)).toContainText(
      'based on 1 recorded month',
    )
    await expect(history.getByText(/Annual spending estimate/)).toContainText('$43,920.00')
    await expect(history.getByText(/Annual spending estimate/)).toContainText(
      'based on that one month',
    )
    await expect(history).toContainText('not twelve months of actual spending')

    await history.getByRole('button', { name: 'October 2026' }).click()
    await expect(page.getByText('No expenses recorded for October')).toBeVisible()
    await expect(page.getByRole('region', { name: 'October 2026' })).not.toContainText('$')
  })
})
