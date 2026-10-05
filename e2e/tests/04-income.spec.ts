import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

// Runs after 03-expenses.spec.ts. The household already holds other accounts and September expenses from 02 and 03,
// so this spec creates its own account through the API (Alex Doe owns it). Exact household figures live in the API
// tests. Today is fixed to 2026-10-03.
test.describe.serial('money in journey', () => {
  async function createAccount(request: APIRequestContext, name: string, opening: string) {
    const household = (await (await request.get('/api/v1/household')).json()) as { id: string }
    const members = (await (
      await request.get(`/api/v1/household-members?householdId=${household.id}`)
    ).json()) as { id: string; name: string }[]
    const response = await request.post('/api/v1/accounts', {
      data: {
        type: 'checking',
        name,
        ownerMemberIds: [members.find((m) => m.name === 'Alex Doe')!.id],
        openedOn: '2026-09-01',
        openingBalance: opening,
      },
    })
    expect(response.status()).toBe(201)
  }

  async function openMoneyIn(page: Page, account: string) {
    await page.goto('/accounts')
    // Each test gets a fresh browser, so the "Entering as" choice is made again here (D-025).
    await page.getByLabel('Entering as').selectOption({ label: 'Alex Doe (Parent)' })
    await page.getByRole('link', { name: account, exact: true }).click()
    await page.getByRole('button', { name: 'Add money in' }).click()
  }

  async function saveSalary(page: Page, amount: string, date: string) {
    const form = page.getByRole('region', { name: 'Add money in' })
    await form.getByLabel('Amount').fill(amount)
    await form.getByLabel('Date').fill(date)
    await form.getByLabel('Category').selectOption({ label: 'Salary' })
    await page.getByRole('button', { name: 'Review' }).click()
    await page.getByRole('button', { name: 'Confirm saving' }).click()
  }

  async function openSalaryEntries(page: Page) {
    await page.getByRole('link', { name: 'Spending' }).click()
    await page.getByLabel('Month', { exact: true }).fill('2026-09')
    await page
      .getByRole('list', { name: 'Income by category' })
      .getByRole('button', { name: 'Salary' })
      .click()
  }

  test.beforeAll(async ({ request }) => {
    await createAccount(request, 'Salary Checking', '5000.00')
  })

  for (const amount of ['$0.00', '-$100.00']) {
    test(`V2_INCOME_005 rejects the Salary amount ${amount} without losing context`, async ({
      page,
    }) => {
      await openMoneyIn(page, 'Salary Checking')
      const form = page.getByRole('region', { name: 'Add money in' })
      await form.getByLabel('Amount').fill(amount)
      await form.getByLabel('Date').fill('2026-09-02')
      await form.getByLabel('Category').selectOption({ label: 'Salary' })
      await page.getByRole('button', { name: 'Review' }).click()

      await expect(page.getByText('Enter an amount greater than zero')).toBeVisible()
      await expect(form.getByLabel('Date')).toHaveValue('2026-09-02')
      await expect(form.getByLabel('Category').locator('option:checked')).toHaveText('Salary')
      await page.getByRole('button', { name: 'Cancel' }).click()
      await expect(page.getByRole('main')).toContainText('No money activity has been recorded yet.')
      await expect(page.getByRole('main')).toContainText('$5,000.00')
    })
  }

  // The tests below add salary in order, so September income grows 6,000, 12,000, 18,000, 24,000 (spending stays 3,660
  // from 03). Exact figures for a household of one account are in the API tests.
  test('V2_INCOME_001 records salary and finds it from September income and its entry', async ({
    page,
  }) => {
    await openMoneyIn(page, 'Salary Checking')
    await saveSalary(page, '6000.00', '2026-09-02')
    const main = page.getByRole('main')
    await expect(main).toContainText('$11,000.00')
    await page.getByRole('link', { name: 'Accounts' }).click()
    await expect(page.getByRole('row', { name: /Salary Checking/ })).toContainText('$11,000.00')

    await openSalaryEntries(page)
    const income = page.getByRole('region', { name: 'Income' })
    await expect(income).toContainText('$6,000.00')
    const table = income.getByRole('table', { name: 'Income entries' })
    await table
      .getByRole('row', { name: /Salary Checking/ })
      .getByRole('button')
      .click()
    const details = page.getByLabel('Income details')
    await expect(details).toContainText('$6,000.00')
    await expect(details).toContainText('2026-09-02')
    await expect(details).toContainText('Salary Checking')
    await expect(details).toContainText('Alex Doe')
    // The opening $5,000.00 is not an income entry: the only entry in this account is the salary.
    await expect(income.getByRole('row', { name: /Salary Checking/ })).toHaveCount(1)
  })

  test('V2_CHECKING_002 starts at zero, then salary becomes September income', async ({ page }) => {
    for (const [name, balance] of [
      ['Blank Start Checking', ''],
      ['Zero Start Checking', '$0.00'],
    ]) {
      await page.goto('/accounts/new')
      await page.getByLabel('Account name').fill(name)
      await page.getByRole('checkbox', { name: 'Alex Doe (Parent)' }).check()
      await page.getByLabel('Opened on').fill('2026-09-01')
      if (balance) await page.getByLabel('Balance').fill(balance)
      await page.getByRole('button', { name: 'Save account' }).click()

      await page.getByRole('link', { name: 'Accounts' }).click()
      const row = page.getByRole('row', { name: new RegExp(name) })
      await expect(row).toContainText('$0.00')
      await expect(row).toContainText('as of 2026-09-01')
      await row.getByRole('link', { name }).click()
      const main = page.getByRole('main')
      await expect(main).toContainText('No money activity has been recorded yet.')

      await page.getByLabel('Entering as').selectOption({ label: 'Alex Doe (Parent)' })
      await page.getByRole('button', { name: 'Add money in' }).click()
      await saveSalary(page, '6000.00', '2026-09-02')
      await expect(page.getByLabel('Account details')).toContainText('$6,000.00')
    }
    await openSalaryEntries(page)
    // Three salaries so far: Salary Checking, Blank Start Checking and Zero Start Checking (18,000).
    await expect(page.getByRole('region', { name: 'Income' })).toContainText('$18,000.00')
  })

  test('V2_MONTHLY_004 shows Income minus spending beside the checking Balance and its date', async ({
    page,
  }) => {
    // Household Checking holds $1,340.00 after 03; salary dated 2026-09-30 makes it $7,340.00 as of that date.
    await openMoneyIn(page, 'Household Checking')
    await saveSalary(page, '6000.00', '2026-09-30')
    const main = page.getByRole('main')
    await expect(main).toContainText('$7,340.00')
    await expect(main).toContainText('as of 2026-09-30')

    await page.getByRole('link', { name: 'Spending' }).click()
    await page.getByLabel('Month', { exact: true }).fill('2026-09')
    const review = page.getByRole('region', { name: 'Month review' })
    await expect(review).toContainText(/Income\s*\$24,000\.00/)
    await expect(review).toContainText(/Spending\s*\$3,660\.00/)
    await expect(review).toContainText(/Income minus spending\s*\$20,340\.00/)

    // Opening checking changes neither figure.
    await page.getByRole('link', { name: 'Accounts' }).click()
    await page.getByRole('link', { name: 'Household Checking', exact: true }).click()
    await page.getByRole('link', { name: 'Spending' }).click()
    await page.getByLabel('Month', { exact: true }).fill('2026-09')
    await expect(page.getByRole('region', { name: 'Month review' })).toContainText('$20,340.00')
  })

  test('V2_HOUSEHOLD_SETUP_003 adds the first account from the overview and opens it', async ({
    page,
  }) => {
    await page.goto('/')
    await page
      .getByRole('region', { name: 'Accounts and wealth' })
      .getByRole('link', { name: 'Add account' })
      .click()
    await expect(page.getByLabel('Account type')).toHaveValue('checking')
    await expect(page.getByRole('option', { name: /Credit card.*coming soon/ })).toBeDisabled()
    await page.getByLabel('Account name').fill('Overview Checking')
    await page.getByRole('checkbox', { name: 'Alex Doe (Parent)' }).check()
    await page.getByLabel('Opened on').fill('2026-09-01')
    await page.getByRole('button', { name: 'Save account' }).click()

    const row = page.getByRole('row', { name: /Overview Checking/ })
    await expect(row).toContainText('$0.00')
    await row.getByRole('link', { name: 'Overview Checking' }).click()
    await expect(page.getByRole('button', { name: 'Add money in' })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Add money out' })).toBeEnabled()
  })

  test('V2_CHECKING_015 records an actual overdraft without pretending money is available', async ({
    page,
  }) => {
    // The only overdrawn account in this database, so the household debt is exactly its overdraft.
    await createAccount(page.request, 'Tight Checking', '50.00')
    await page.goto('/accounts')
    await page.getByLabel('Entering as').selectOption({ label: 'Samira Rivera (Child)' })
    await page.getByRole('link', { name: 'Tight Checking', exact: true }).click()
    await page.getByRole('button', { name: 'Add money out' }).click()
    const form = page.getByRole('region', { name: 'Add money out' })
    await form.getByLabel('Amount').fill('80.00')
    await form.getByLabel('Date').fill('2026-09-05')
    await form.getByLabel('Category').selectOption({ label: 'Utilities' })
    await page.getByRole('button', { name: 'Review' }).click()
    await expect(page.getByRole('alert')).toContainText(
      'This will leave Tight Checking overdrawn by $30.00',
    )
    await page.getByRole('button', { name: 'Confirm saving' }).click()

    const details = page.getByLabel('Account details')
    await expect(details).toContainText('-$30.00')
    await expect(details).toContainText('Overdrawn by $30.00')
    await expect(details).toContainText('does not authorize a bank payment')

    await page.getByRole('link', { name: 'Household', exact: true }).click()
    const wealth = page.getByRole('region', { name: 'Accounts and wealth' })
    await expect(wealth.getByText(/Debts/)).toHaveText(/Debts\s*\$30\.00$/)
    await expect(wealth).toContainText('Overdrawn by $30.00')
  })
})
