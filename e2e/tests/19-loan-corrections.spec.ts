import { expect, test, type Locator, type Page } from '@playwright/test'

// Runs after 18-loan-payments.spec.ts. Corrections of a loan (slice 16a) at 710px and 1280px. The database is shared,
// so every width makes its own accounts and names. Today is the stack's fixed 2026-10-03.

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

async function makeLoan(page: Page, owner: string, name: string, owed: string): Promise<string> {
  const made = await page.request.post('/api/v1/accounts', {
    data: {
      type: 'loan',
      name,
      institution: 'Maple Credit',
      ownerMemberIds: [owner],
      openedOn: '2026-09-01',
      openingBalance: owed,
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
  test.describe.serial(`Loan corrections at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })
    const name = `Correct Loan ${width}`
    let loanId = ''

    test(`V2_LOAN_004 correct the initial amount owed: reviewed as owed, a reason is required, the original stays in history (${width}px)`, async ({
      page,
    }) => {
      loanId = await makeLoan(page, await ownerId(page), name, '20000.00')
      await page.goto(`/accounts/${loanId}`)
      await page.getByRole('button', { name: 'Update balance owed' }).click()
      await page.getByRole('radio', { name: 'Correct the initial amount owed' }).check()
      const form = page.getByRole('region', { name: 'Correct the initial amount owed' })
      await expectFocusInside(form)
      await form.getByLabel('Initial amount owed').fill('-1.00')
      await form.getByRole('button', { name: 'Review' }).click()
      await expect(form.getByText('Enter zero or a positive amount owed')).toBeVisible()
      await form.getByLabel('Initial amount owed').fill('19800.00')
      await form.getByRole('button', { name: 'Review' }).click()

      const review = page.getByRole('region', { name: 'Review initial amount owed correction' })
      await expectFocusInside(review)
      await expect(review).toContainText(
        'Balance owed will change from $20,000.00 owed to $19,800.00 owed.',
      )
      await expect(review).toContainText('not income or spending')
      await expectNoSidewaysScroll(page)
      await review.getByRole('button', { name: 'Confirm correction' }).click()
      await expect(review.getByText('Enter a reason')).toBeVisible()
      await review.getByLabel('Reason').fill('Copied the lender amount incorrectly')
      await review.getByRole('button', { name: 'Confirm correction' }).click()
      await expect(page.getByLabel('Account details')).toContainText('Balance owed$19,800.00')
      expect(await balanceOf(page, loanId)).toBe('-19800.00')
      await page.getByRole('button', { name: 'Show history' }).click()
      const history = page.getByRole('table', { name: 'History' })
      await expect(history).toContainText('Copied the lender amount incorrectly')
      await expectNoSidewaysScroll(page)
    })

    test(`V2_LOAN_004 the wealth explanation names the $200.00 debt correction (${width}px)`, async ({
      page,
    }) => {
      await page.goto('/')
      const card = page.getByRole('region', { name: 'Wealth on a date' })
      await card.getByLabel('From').fill('2026-09-01')
      await card.getByLabel('To').fill('2026-10-03')
      const corrections = card.getByRole('list', { name: 'Corrections' })
      await expect(corrections).toContainText(
        `${name}: the initial amount owed was corrected from $20,000.00 owed to $19,800.00 owed`,
      )
      await expect(corrections).toContainText('a $200.00 debt correction')
      await expectNoSidewaysScroll(page)
    })

    test(`V2_DATED_VALUE_003 a September 30 correction lowers the debt; remove it and bring it back with Undo (${width}px)`, async ({
      page,
    }) => {
      await page.goto(`/accounts/${loanId}`)
      await page.getByRole('button', { name: 'Update balance owed' }).click()
      const form = page.getByRole('region', { name: 'Update balance owed' })
      await expectFocusInside(form)
      await form.getByLabel('Balance owed').fill('19500.00')
      await form.getByLabel('Date').fill('2026-09-30')
      await form.getByRole('button', { name: 'Review' }).click()
      const review = page.getByRole('region', { name: 'Review balance update' })
      await expectFocusInside(review)
      await expect(review).toContainText('Difference$300.00 decrease in debt')
      await review.getByLabel('Reason').fill('Lender statement')
      await review.getByRole('button', { name: 'Confirm correction' }).click()
      const row = page.getByRole('row').filter({ hasText: 'Balance correction: Lender statement' })
      await expect(row).toBeVisible()
      await expect(row).toContainText('$300.00 less owed')
      expect(await balanceOf(page, loanId)).toBe('-19500.00')

      await row.getByRole('button', { name: /^Remove correction of/ }).click()
      const removal = page.getByRole('region', { name: 'Review removal' })
      await expectFocusInside(removal)
      await expect(removal).toContainText(`${name} Balance owed after removal$19,800.00 owed`)
      await removal.getByRole('button', { name: 'Confirm removal' }).click()
      await expect(removal).toHaveCount(0)
      await expect.poll(() => balanceOf(page, loanId)).toBe('-19800.00')

      await page.getByRole('button', { name: 'Show history' }).click()
      await page.getByRole('button', { name: /^Undo/ }).click()
      const undo = page.getByRole('region', { name: 'Review Undo' })
      await expectFocusInside(undo)
      await undo.getByRole('button', { name: 'Confirm Undo' }).click()
      await expect(undo).toHaveCount(0)
      await expect.poll(() => balanceOf(page, loanId)).toBe('-19500.00')
      await expectNoSidewaysScroll(page)
    })

    test(`V2_LOAN_006 the review of a new initial amount below what was paid refuses it up front, and a refused Confirm leaves no stale message (${width}px)`, async ({
      page,
    }) => {
      const owner = await ownerId(page)
      const own = await makeLoan(page, owner, `Credit Loan ${width}`, '1000.00')
      const bank = await page.request.post('/api/v1/accounts', {
        data: {
          type: 'checking',
          name: `Credit Checking ${width}`,
          ownerMemberIds: [owner],
          openedOn: '2026-09-01',
          openingBalance: '5000.00',
        },
      })
      const bankId = ((await bank.json()) as { id: string }).id
      const paid = await page.request.post('/api/v1/loan-payments', {
        headers: { 'Idempotency-Key': `e2e-credit-${width}` },
        data: {
          fromAccountId: bankId,
          toAccountId: own,
          amount: '600.00',
          principal: '600.00',
          interest: '0.00',
          occurredOn: '2026-09-20',
          enteredByMemberId: owner,
        },
      })
      expect(paid.ok()).toBeTruthy()
      await page.goto(`/accounts/${own}`)
      await page.getByRole('button', { name: 'Update balance owed' }).click()
      await page.getByRole('radio', { name: 'Correct the initial amount owed' }).check()
      const form = page.getByRole('region', { name: 'Correct the initial amount owed' })
      await form.getByLabel('Initial amount owed').fill('500.00')
      await form.getByRole('button', { name: 'Review' }).click()
      const review = page.getByRole('region', { name: 'Review initial amount owed correction' })
      await expect(review).toContainText('with a credit of $100.00')
      await expect(review.getByRole('button', { name: 'Confirm correction' })).toBeDisabled()
      await review.getByRole('button', { name: 'Back' }).click()
      await expect(
        page.getByRole('heading', { name: 'Correct the initial amount owed' }),
      ).toBeFocused()
      await form.getByLabel('Initial amount owed').fill('700.00')
      await form.getByRole('button', { name: 'Review' }).click()
      const again = page.getByRole('region', { name: 'Review initial amount owed correction' })
      await expect(again).not.toContainText('credit of')
      await expect(again.getByRole('button', { name: 'Confirm correction' })).toBeEnabled()
    })

    test(`V2_DATED_VALUE_003 a negative balance owed is refused in the form (${width}px)`, async ({
      page,
    }) => {
      await page.goto(`/accounts/${loanId}`)
      await page.getByRole('button', { name: 'Update balance owed' }).click()
      const form = page.getByRole('region', { name: 'Update balance owed' })
      await form.getByLabel('Balance owed').fill('-5.00')
      await form.getByRole('button', { name: 'Review' }).click()
      await expect(form.getByText('Enter zero or a positive amount owed')).toBeVisible()
      await form.getByRole('button', { name: 'Cancel' }).click()
      expect(await balanceOf(page, loanId)).toBe('-19500.00')
    })
  })
}
