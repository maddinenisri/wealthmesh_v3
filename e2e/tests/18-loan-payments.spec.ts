import { expect, test, type Locator, type Page } from '@playwright/test'

// Runs after 17-loans.spec.ts. Loan payments (slice 16a) at 710px and 1280px. The database is shared, so every width
// makes its own accounts and names. Today is the stack's fixed 2026-10-03.

async function ownerId(page: Page): Promise<string> {
  let household = await page.request.get('/api/v1/household')
  if (!household.ok()) {
    household = await page.request.post('/api/v1/household', { data: { name: 'Loan Household' } })
    expect(household.ok()).toBeTruthy()
  }
  const { id } = (await household.json()) as { id: string }
  let members = (await (
    await page.request.get(`/api/v1/household-members?householdId=${id}`)
  ).json()) as { id: string; active: boolean }[]
  if (!members.some((member) => member.active)) {
    const made = await page.request.post('/api/v1/household-members', {
      data: { householdId: id, name: 'Loan Owner' },
    })
    expect(made.ok()).toBeTruthy()
    members = [(await made.json()) as { id: string; active: boolean }]
  }
  return members.find((member) => member.active)!.id
}

async function makeAccount(
  page: Page,
  owner: string,
  type: string,
  name: string,
  amount: string,
): Promise<string> {
  const made = await page.request.post('/api/v1/accounts', {
    data: {
      type,
      name,
      institution: type === 'loan' ? 'Maple Credit' : 'Harbor Bank',
      ownerMemberIds: [owner],
      openedOn: '2026-09-01',
      openingBalance: amount,
    },
  })
  expect(made.ok()).toBeTruthy()
  return ((await made.json()) as { id: string }).id
}

test.beforeEach(async ({ page }) => {
  const id = await ownerId(page)
  await page.addInitScript(
    (member) => window.localStorage.setItem('wealthmesh.enteringAs', member),
    id,
  )
})

async function expectFocusInside(review: Locator) {
  await expect(review).toBeVisible()
  await expect(review.getByRole('heading').first()).toBeInViewport({ ratio: 1 })
  await expect
    .poll(() =>
      review.evaluate(
        (el) =>
          !!el.parentElement?.contains(document.activeElement) ||
          el.contains(document.activeElement),
      ),
    )
    .toBe(true)
}

async function expectNoSidewaysScroll(page: Page) {
  const sideways = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(sideways).toBeLessThanOrEqual(0)
}

async function balanceOf(page: Page, id: string): Promise<string> {
  const account = (await (await page.request.get(`/api/v1/accounts/${id}`)).json()) as {
    balance: { amount: string }
  }
  return account.balance.amount
}

for (const width of [710, 1280] as const) {
  test.describe.serial(`Loan payments at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })
    const bank = `Pay Checking ${width}`
    const loan = `Pay Loan ${width}`
    let bankId = ''
    let loanId = ''

    test(`V2_LOAN_003 pay a loan from checking: the review names the portions and both Balances, Confirm saves one payment (${width}px)`, async ({
      page,
    }) => {
      const owner = await ownerId(page)
      bankId = await makeAccount(page, owner, 'checking', bank, '5000.00')
      loanId = await makeAccount(page, owner, 'loan', loan, '20000.00')
      await page.goto(`/accounts/${bankId}`)
      await page.getByRole('button', { name: 'Pay a loan' }).click()
      const form = page.getByRole('region', { name: 'Record payment' })
      await expectFocusInside(form)
      await form.getByLabel('Loan to pay').selectOption({ label: `${loan} (Loan)` })
      await form.getByLabel('Payment amount').fill('500.00')
      await form.getByLabel('Principal').fill('450.00')
      await expect(form.getByRole('status')).toContainText('$50.00 still to assign')
      await form.getByLabel('Interest').fill('50.00')
      await form.getByLabel('Date').fill('2026-09-15')
      await form.getByRole('button', { name: 'Review' }).click()

      const review = page.getByRole('region', { name: 'Review payment' })
      await expectFocusInside(review)
      await expect(review).toContainText('Counts as spending: Loan interest')
      const effect = page.getByRole('region', { name: 'Effect of this payment' })
      await expect(effect).toContainText(`${bank} Balance$4,500.00`)
      await expect(effect).toContainText(`${loan} Balance owed$19,550.00 owed`)
      await expectNoSidewaysScroll(page)
      expect(await balanceOf(page, loanId)).toBe('-20000.00')

      await review.getByRole('button', { name: 'Back' }).click()
      await expect(page.getByLabel('Principal')).toHaveValue('450.00')
      await page.getByRole('button', { name: 'Review' }).click()
      await page.getByRole('button', { name: 'Confirm payment' }).click()
      const row = page.getByRole('row').filter({ hasText: `Payment to ${loan}` })
      await expect(row).toBeVisible()
      await expect(row).toContainText('-$500.00')
      await expect(page.getByRole('heading', { name: 'Activity' })).toBeInViewport()
      expect(await balanceOf(page, bankId)).toBe('4500.00')
      expect(await balanceOf(page, loanId)).toBe('-19550.00')
      await expectNoSidewaysScroll(page)
    })

    test(`V2_LOAN_003 the interest is spending on its own, in Loan interest (${width}px)`, async ({
      page,
    }) => {
      await page.goto('/spending')
      await page.getByRole('textbox', { name: 'Month' }).fill('2026-09')
      await page.getByLabel('Account').selectOption({ label: `${bank} (Checking)` })
      const line = page.getByRole('listitem').filter({ hasText: 'Loan interest' })
      await expect(line).toContainText('$50.00 (1 entry)')
      await expect(page.getByRole('listitem').filter({ hasText: 'Essential' })).toContainText(
        '$50.00',
      )
      await expect(page.getByRole('main')).toContainText('Spending $50.00')
      await line.getByRole('button', { name: 'Loan interest' }).click()
      const entries = page.getByRole('table', { name: 'Expenses in this category' })
      await expect(entries).toContainText(`Interest on payment to ${loan}`)
      await expect(entries).toContainText('Interest part of a payment')
      await expect(entries).not.toContainText('Split expense')
    })

    test(`V2_LOAN_003 the loan lists the payment as its principal and opens it with both portions (${width}px)`, async ({
      page,
    }) => {
      await page.goto(`/accounts/${loanId}`)
      await expect(page.getByLabel('Account details')).toContainText('Balance owed$19,550.00')
      const row = page.getByRole('row').filter({ hasText: `Payment from ${bank}` })
      await expect(row).toContainText('$450.00 paid')
      await expect(row).toContainText('Principal')
      await row.getByRole('button', { name: /^Edit payment from/ }).click()
      const form = page.getByRole('region', { name: 'Edit payment' })
      await expectFocusInside(form)
      await expect(form.getByLabel('Payment amount')).toHaveValue('500.00')
      await expect(form.getByLabel('Principal')).toHaveValue('450.00')
      await expect(form.getByLabel('Interest')).toHaveValue('50.00')
      await form.getByRole('button', { name: 'Cancel' }).click()
      await expect(form).toHaveCount(0)
      expect(await balanceOf(page, loanId)).toBe('-19550.00')
    })

    test(`V2_LOAN_006 principal above the debt is explained in the review and cannot be confirmed (${width}px)`, async ({
      page,
    }) => {
      await page.goto(`/accounts/${loanId}`)
      await page.getByRole('button', { name: 'Record payment' }).click()
      const form = page.getByRole('region', { name: 'Record payment' })
      await form.getByLabel('Paid from').selectOption({ label: `${bank} (Checking)` })
      await form.getByLabel('Payment amount').fill('20000.00')
      await form.getByLabel('Principal').fill('19600.00')
      await form.getByLabel('Interest').fill('400.00')
      await form.getByLabel('Date').fill('2026-09-20')
      await form.getByRole('button', { name: 'Review' }).click()
      const review = page.getByRole('region', { name: 'Review payment' })
      await expect(review).toContainText(
        'Principal $19,600.00 is $50.00 more than the $19,550.00 owed',
      )
      await expect(review.getByRole('button', { name: 'Confirm payment' })).toBeDisabled()
      await review.getByRole('button', { name: 'Cancel' }).click()
      expect(await balanceOf(page, loanId)).toBe('-19550.00')
    })

    test(`V2_LOAN_003 remove the payment and bring it back with Undo: both Balances and the interest move together (${width}px)`, async ({
      page,
    }) => {
      await page.goto(`/accounts/${loanId}`)
      await page.getByRole('button', { name: /^Remove payment from/ }).click()
      const review = page.getByRole('region', { name: 'Review removal' })
      await expectFocusInside(review)
      await expect(review).toContainText(`${loan} Balance owed after removal$20,000.00 owed`)
      await review.getByRole('button', { name: 'Confirm removal' }).click()
      await expect(page.getByText('No payments have been recorded yet.')).toBeVisible()
      expect(await balanceOf(page, bankId)).toBe('5000.00')
      expect(await balanceOf(page, loanId)).toBe('-20000.00')

      await page.getByRole('button', { name: 'Show history' }).click()
      await page.getByRole('button', { name: /^Undo payment from/ }).click()
      const undo = page.getByRole('region', { name: 'Review Undo' })
      await expectFocusInside(undo)
      await undo.getByRole('button', { name: 'Confirm Undo' }).click()
      await expect(
        page
          .getByRole('row')
          .filter({ hasText: `Payment from ${bank}` })
          .first(),
      ).toBeVisible()
      await expect(undo).toHaveCount(0)
      await expect.poll(() => balanceOf(page, bankId)).toBe('4500.00')
      await expect.poll(() => balanceOf(page, loanId)).toBe('-19550.00')
      await expectNoSidewaysScroll(page)
    })
  })
}
