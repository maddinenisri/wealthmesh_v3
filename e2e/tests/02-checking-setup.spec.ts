import { expect, test, type Page } from '@playwright/test'

// Runs after 01-household.spec.ts, which leaves a household with the members Alex Doe and Samira Rivera.
// The stack starts with today fixed to 2026-10-03 (WEALTHMESH_CLOCK_FIXED_TODAY in start-stack.sh).
test.describe.serial('checking account setup journey', () => {
  const row = (page: Page, name: string) =>
    page.getByRole('row').filter({ has: page.getByRole('link', { name, exact: true }) })

  async function fill(page: Page, fields: { name?: string; balance?: string; opened?: string }) {
    if (fields.name) await page.getByLabel('Account name').fill(fields.name)
    await page.getByLabel('Bank').fill('Harbor Bank')
    await page.getByLabel('Owner').selectOption({ label: 'Alex Doe (Parent)' })
    await page.getByLabel('Opened on').fill(fields.opened ?? '2026-09-01')
    if (fields.balance) await page.getByLabel('Balance').fill(fields.balance)
  }

  test('V2_CHECKING_001 creates checking with a known initial Balance and finds it again', async ({
    page,
  }) => {
    await page.goto('/accounts')
    await expect(page.getByText('No accounts yet')).toBeVisible()

    await page.getByRole('link', { name: 'Add checking account' }).click()
    await expect(page.getByLabel('Opened on')).toHaveValue('2026-10-03')
    await fill(page, { name: 'Everyday Checking', balance: '$5,000.00' })
    await page.getByRole('button', { name: 'Save account' }).click()

    const listed = row(page, 'Everyday Checking')
    await expect(listed).toContainText('Alex Doe')
    await expect(listed).toContainText('Harbor Bank')
    await expect(listed).toContainText('$5,000.00')
    await expect(listed).toContainText('2026-09-01')

    await page.getByRole('link', { name: 'Everyday Checking', exact: true }).click()
    const main = page.getByRole('main')
    await expect(page.getByRole('heading', { name: 'Everyday Checking' })).toBeVisible()
    await expect(main).toContainText('Alex Doe')
    await expect(main).toContainText('Harbor Bank')
    await expect(main).toContainText('Initial Balance$5,000.00 on 2026-09-01')
    await expect(main).toContainText('No money activity has been recorded yet.')
    for (const action of ['Add money in', 'Add money out', 'Add transfer']) {
      await expect(page.getByRole('button', { name: action })).toBeVisible()
    }
  })

  test('V2_CHECKING_005 explains an incomplete setup and allows cancelling', async ({ page }) => {
    await page.goto('/accounts/new')
    await fill(page, { balance: '$5,000.00' })
    await page.getByRole('button', { name: 'Save account' }).click()

    await expect(page.getByText('Enter an account name')).toBeVisible()
    await expect(page.getByLabel('Bank')).toHaveValue('Harbor Bank')
    await expect(page.getByLabel('Balance')).toHaveValue('$5,000.00')
    await expect(page.getByLabel('Opened on')).toHaveValue('2026-09-01')

    await page.getByLabel('Account name').fill('Everyday Checking')
    await page.getByRole('link', { name: 'Cancel' }).click()
    await expect(page.getByRole('link', { name: 'Everyday Checking', exact: true })).toHaveCount(1)
    await expect(page.getByRole('row')).toHaveCount(2) // header + Everyday Checking
  })

  test('V2_CHECKING_017 keeps an invalid initial Balance as an unsaved form', async ({ page }) => {
    await page.goto('/accounts/new')
    await fill(page, { name: 'Bills Checking', balance: 'five thousand' })
    await page.getByRole('button', { name: 'Save account' }).click()

    await expect(page.getByText('Enter a valid amount')).toBeVisible()
    await expect(page.getByLabel('Account name')).toHaveValue('Bills Checking')
    await expect(page.getByLabel('Bank')).toHaveValue('Harbor Bank')
    await expect(page.getByLabel('Opened on')).toHaveValue('2026-09-01')

    await page.getByLabel('Balance').fill('$1,250.50')
    await page.getByRole('button', { name: 'Save account' }).click()
    await expect(row(page, 'Bills Checking')).toContainText('$1,250.50')
    await expect(row(page, 'Bills Checking')).toContainText('2026-09-01')
    await page.getByRole('link', { name: 'Bills Checking', exact: true }).click()
    await expect(page.getByRole('main')).toContainText('Initial Balance$1,250.50 on 2026-09-01')
  })

  for (const [name, balance] of [
    ['Zero Checking', ''],
    ['Zero Dollar Checking', '$0.00'],
  ]) {
    test(`starts at zero on the setup date for ${name}`, async ({ page }) => {
      await page.goto('/accounts/new')
      await fill(page, { name, balance })
      await page.getByRole('button', { name: 'Save account' }).click()

      await expect(row(page, name)).toContainText('$0.00')
      await expect(row(page, name)).toContainText('2026-09-01')
      await page.getByRole('link', { name, exact: true }).click()
      await expect(page.getByRole('main')).toContainText('Initial Balance$0.00 on 2026-09-01')
      await expect(page.getByRole('main')).toContainText('No money activity has been recorded yet.')
    })
  }

  test('V2_CHECKING_004 leaves everything as it was when changes are cancelled', async ({
    page,
  }) => {
    await page.goto('/accounts')
    await page.getByRole('link', { name: 'Everyday Checking', exact: true }).click()
    await page.getByRole('link', { name: 'Edit account' }).click()
    await page.getByLabel('Account name').fill('Household Checking')
    await page.getByLabel('Owner').selectOption({ label: 'Samira Rivera (Child)' })
    await page.getByRole('link', { name: 'Cancel' }).click()

    await expect(page.getByRole('heading', { name: 'Everyday Checking' })).toBeVisible()
    await expect(page.getByRole('main')).toContainText('Alex Doe')
    await expect(page.getByRole('main')).toContainText('Harbor Bank')
    await page.getByRole('link', { name: 'Accounts' }).click()
    await expect(row(page, 'Everyday Checking')).toContainText('Alex Doe')
    await expect(row(page, 'Everyday Checking')).toContainText('Harbor Bank')
    await expect(row(page, 'Everyday Checking')).toContainText('$5,000.00')
    await expect(row(page, 'Everyday Checking')).toContainText('2026-09-01')
    await expect(page.getByRole('link', { name: 'Household Checking' })).toHaveCount(0)
  })

  test('V2_CHECKING_003 edits details without changing money', async ({ page }) => {
    await page.goto('/accounts')
    await page.getByRole('link', { name: 'Everyday Checking', exact: true }).click()
    await page.getByRole('link', { name: 'Edit account' }).click()

    await expect(page.getByLabel('Balance')).toHaveCount(0)
    await page.getByLabel('Account name').fill('Household Checking')
    await page.getByLabel('Owner').selectOption({ label: 'Samira Rivera (Child)' })
    await page.getByLabel('Bank').fill('Harbor Credit Union')
    await page.getByRole('button', { name: 'Save details' }).click()

    const main = page.getByRole('main')
    await expect(page.getByRole('heading', { name: 'Household Checking' })).toBeVisible()
    await expect(main).toContainText('Samira Rivera')
    await expect(main).toContainText('Harbor Credit Union')
    await expect(main).toContainText('Initial Balance$5,000.00 on 2026-09-01')

    await page.getByRole('button', { name: 'Update balance' }).click()
    await expect(page.getByLabel('Amount')).toBeVisible()
    await expect(page.getByLabel('Date', { exact: true })).toHaveValue('2026-10-03')
    await expect(page.getByRole('button', { name: 'Save balance' })).toBeDisabled()

    await page.getByRole('link', { name: 'Accounts' }).click()
    await expect(row(page, 'Household Checking')).toContainText('Samira Rivera')
  })

  test('keeps the accounts after a reload', async ({ page }) => {
    await page.goto('/accounts')
    await page.reload()
    await expect(row(page, 'Household Checking')).toContainText('$5,000.00')
    await expect(row(page, 'Bills Checking')).toContainText('$1,250.50')
  })
})
