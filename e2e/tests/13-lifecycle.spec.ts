import { expect, test, type Locator, type Page } from '@playwright/test'

// Runs after 12-members.spec.ts. Archive, restore, close, reopen and delete an account (slice 12), at 710px and 1280px.
// Each account is made through the API with an active member as owner; later specs must not rely on these accounts.

type Wealth = { financialAssets: string; debts: string; netWorth: string }

async function ownerId(page: Page): Promise<string> {
  const households = (await (await page.request.get('/api/v1/household')).json()) as { id: string }
  const members = (await (
    await page.request.get(`/api/v1/household-members?householdId=${households.id}`)
  ).json()) as { id: string; active: boolean }[]
  return members.find((member) => member.active)!.id
}

async function createAccount(
  page: Page,
  name: string,
  type: 'checking' | 'savings',
  opening: string,
): Promise<string> {
  const response = await page.request.post('/api/v1/accounts', {
    data: {
      type,
      name,
      institution: 'Harbor Bank',
      ownerMemberIds: [await ownerId(page)],
      openedOn: '2026-09-01',
      openingBalance: opening,
    },
  })
  expect(response.ok()).toBeTruthy()
  return ((await response.json()) as { id: string }).id
}

const figures = ({ financialAssets, debts, netWorth }: Wealth) => ({
  financialAssets,
  debts,
  netWorth,
})

const wealth = async (page: Page): Promise<Wealth> =>
  (await (await page.request.get('/api/v1/wealth')).json()) as Wealth

/** Focus is on the panel or inside it (the panel wrapper takes focus when it opens). */
async function expectFocusInside(review: Locator) {
  await expect(review).toBeVisible()
  await expect(review).toBeInViewport({ ratio: 1 })
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

for (const width of [710, 1280]) {
  test.describe.serial(`account lifecycle at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })
    const name = `Lifecycle Savings ${width}`
    let id = ''

    test(`V2_ACCOUNT_LIFECYCLE_001 archive: review in view, Cancel returns focus, Confirm focuses the status line (${width}px)`, async ({
      page,
    }) => {
      id = await createAccount(page, name, 'savings', '10000.00')
      const before = await wealth(page)
      await page.goto(`/accounts/${id}`)
      const opener = page.getByRole('button', { name: 'Archive account' })
      await opener.click()
      const review = page.getByRole('region', { name: `Review archiving ${name}` })
      await expectFocusInside(review)
      await expect(review).toContainText('Its $10,000.00 will remain in wealth')
      await expectNoSidewaysScroll(page)

      await review.getByRole('button', { name: 'Cancel' }).click()
      await expect(review).toBeHidden()
      await expect(opener).toBeFocused()
      await expect(page.getByRole('main')).toContainText('Active')

      await opener.click()
      await page.getByRole('button', { name: `Archive ${name}` }).click()
      const status = page.getByRole('status')
      await expect(status).toContainText(`${name} is archived. Its $10,000.00 stays in wealth.`)
      await expect(status).toBeFocused()
      await expect(status).toBeInViewport({ ratio: 1 })
      await expect(page.getByRole('button', { name: 'Restore account' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Add money in' })).toBeDisabled()
      expect(figures(await wealth(page))).toEqual(figures(before))
    })

    test(`V2_CHECKING_012 archived accounts leave the active list and come back with "Show archived and closed" (${width}px)`, async ({
      page,
    }) => {
      await page.goto('/accounts')
      await expect(page.getByRole('row', { name: new RegExp(name) })).toHaveCount(0)
      await page.getByLabel(/Show archived and closed accounts/).check()
      const row = page.getByRole('row', { name: new RegExp(name) })
      await expect(row).toContainText('Archived')
      await expectNoSidewaysScroll(page)
    })

    test(`V2_ACCOUNT_LIFECYCLE_001 restore: Cancel returns focus, Confirm focuses the status line, the Balance is the same (${width}px)`, async ({
      page,
    }) => {
      await page.goto(`/accounts/${id}`)
      const opener = page.getByRole('button', { name: 'Restore account' })
      await opener.click()
      const review = page.getByRole('region', { name: `Review restoring ${name}` })
      await expectFocusInside(review)
      await review.getByRole('button', { name: 'Cancel' }).click()
      await expect(opener).toBeFocused()

      await opener.click()
      await page.getByRole('button', { name: `Restore ${name}` }).click()
      const status = page.getByRole('status')
      await expect(status).toContainText('is active again with its $10,000.00')
      await expect(status).toBeFocused()
      await expect(page.getByRole('button', { name: 'Add money in' })).toBeEnabled()
      await page.goto('/accounts')
      await expect(page.getByRole('row', { name: new RegExp(name) })).toContainText('$10,000.00')
    })
  })
}

for (const width of [710, 1280]) {
  test.describe.serial(`wealth groups at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })

    test(`V2_WEALTH_011 an overdrawn account is negative in Bank money, a debt once, and net worth counts it once (${width}px)`, async ({
      page,
    }) => {
      const name = `Group Overdraft ${width}`
      const before = await wealth(page)
      const id = await createAccount(page, name, 'checking', '0.00')
      const owner = await ownerId(page)
      const saved = await page.request.post(`/api/v1/accounts/${id}/expenses`, {
        headers: { 'Idempotency-Key': `e2e-overdraft-${width}` },
        data: {
          description: 'Utilities',
          amount: '100.00',
          occurredOn: '2026-09-05',
          category: 'Utilities',
          enteredByMemberId: owner,
        },
      })
      expect(saved.ok()).toBeTruthy()
      const after = await wealth(page)
      expect(Number(after.netWorth) - Number(before.netWorth)).toBe(-100)
      expect(Number(after.debts) - Number(before.debts)).toBe(100)
      expect(Number(after.financialAssets) - Number(before.financialAssets)).toBe(0)

      await page.goto('/')
      const bank = page.getByRole('region', { name: 'Bank money' })
      await expect(bank.getByRole('listitem').filter({ hasText: name })).toContainText('-$100.00')
      const debts = page.getByRole('region', { name: 'What makes up debts' })
      await expect(debts.getByRole('listitem').filter({ hasText: name })).toContainText('overdrawn')
      await expect(page.getByRole('region', { name: 'Accounts and wealth' })).toContainText(
        'Net worth',
      )
      await expectNoSidewaysScroll(page)
    })
  })
}

for (const width of [710, 1280]) {
  test.describe.serial(`close and reopen at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })
    const name = `Closing Savings ${width}`
    let id = ''
    let checking = ''

    test(`V2_ACCOUNT_LIFECYCLE_003 closing with money left explains the zero rule and keeps Confirm off (${width}px)`, async ({
      page,
    }) => {
      id = await createAccount(page, name, 'savings', '1000.00')
      checking = await createAccount(page, `Closing Checking ${width}`, 'checking', '5000.00')
      await page.goto(`/accounts/${id}`)
      const opener = page.getByRole('button', { name: 'Close account' })
      await opener.click()
      const review = page.getByRole('region', { name: `Review closing ${name}` })
      await expectFocusInside(review)
      await expect(review).toContainText('Closing needs a zero Balance')
      await expect(review).toContainText('$1,000.00')
      await expect(page.getByRole('button', { name: `Close ${name}` })).toBeDisabled()
      await expectNoSidewaysScroll(page)
      await review.getByRole('button', { name: 'Cancel' }).click()
      await expect(opener).toBeFocused()
    })

    test(`V2_ACCOUNT_LIFECYCLE_003 after moving the money the account closes, focus lands on the status line, entries are off until Reopen (${width}px)`, async ({
      page,
    }) => {
      const before = await wealth(page)
      const moved = await page.request.post('/api/v1/transfers', {
        headers: { 'Idempotency-Key': `e2e-close-move-${width}` },
        data: {
          fromAccountId: id,
          toAccountId: checking,
          amount: '1000.00',
          occurredOn: '2026-09-10',
          enteredByMemberId: await ownerId(page),
        },
      })
      expect(moved.ok()).toBeTruthy()
      await page.goto(`/accounts/${id}`)
      await page.getByRole('button', { name: 'Close account' }).click()
      await expect(page.getByRole('region', { name: `Review closing ${name}` })).toContainText(
        'closed with a $0.00 Balance',
      )
      await page.getByRole('button', { name: `Close ${name}` }).click()
      const status = page.getByRole('status')
      await expect(status).toContainText(`${name} is closed with a $0.00 Balance`)
      await expect(status).toBeFocused()
      await expect(status).toBeInViewport({ ratio: 1 })
      await expect(page.getByRole('button', { name: 'Add money in' })).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Add transfer' })).toBeDisabled()
      const after = await wealth(page)
      expect(after.netWorth).toBe(before.netWorth)

      await page.getByRole('button', { name: 'Reopen account' }).click()
      const reopen = page.getByRole('region', { name: `Review reopening ${name}` })
      await expectFocusInside(reopen)
      await page.getByRole('button', { name: `Reopen ${name}` }).click()
      await expect(page.getByRole('status')).toContainText(`${name} is open again`)
      await expect(page.getByRole('status')).toBeFocused()
      await expect(page.getByRole('button', { name: 'Add money in' })).toBeEnabled()
    })
  })
}

for (const width of [710, 1280]) {
  test.describe.serial(`delete and Undo at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })
    const name = `Unused Account ${width}`
    let id = ''

    test(`V2_ACCOUNT_LIFECYCLE_005 deleting an unused account: Cancel returns focus, Confirm lands on the list with a focused status line, Undo brings it back once (${width}px)`, async ({
      page,
    }) => {
      id = await createAccount(page, name, 'checking', '0.00')
      const before = await wealth(page)
      await page.goto(`/accounts/${id}`)
      const opener = page.getByRole('button', { name: 'Delete account' })
      await opener.click()
      const review = page.getByRole('region', { name: `Review deleting ${name}` })
      await expectFocusInside(review)
      await expect(review).toContainText('no saved history')
      await review.getByRole('button', { name: 'Cancel' }).click()
      await expect(opener).toBeFocused()

      await opener.click()
      await page.getByRole('button', { name: `Delete ${name}` }).click()
      await expect(page).toHaveURL(/\/accounts$/)
      const status = page.getByRole('status')
      await expect(status).toContainText(`${name} is deleted. Wealth does not change.`)
      await expect(status).toBeFocused()
      await expect(status).toBeInViewport({ ratio: 1 })
      await expect(page.getByRole('row', { name: new RegExp(name) })).toHaveCount(0)
      expect(figures(await wealth(page))).toEqual(figures(before))
      await expectNoSidewaysScroll(page)

      await status.getByRole('button', { name: 'Undo' }).click()
      await expect(page.getByRole('status')).toContainText(`${name} is back`)
      await expect(page.getByRole('status')).toBeFocused()
      await expect(page.getByRole('row', { name: new RegExp(name) })).toHaveCount(1)
      // A repeated Undo (a second request) changes nothing and is not an error (D-044).
      const again = await page.request.post(`/api/v1/accounts/${id}/undo-delete`)
      expect(again.ok()).toBeTruthy()
      await page.goto('/accounts')
      await expect(page.getByRole('row', { name: new RegExp(name) })).toHaveCount(1)
    })

    test(`V2_ACCOUNT_LIFECYCLE_006 an account with saved history cannot be deleted; Archive is offered and Cancel changes nothing (${width}px)`, async ({
      page,
    }) => {
      const used = await createAccount(page, `Used Savings ${width}`, 'savings', '300.00')
      const other = await createAccount(page, `Used Checking ${width}`, 'checking', '0.00')
      const moved = await page.request.post('/api/v1/transfers', {
        headers: { 'Idempotency-Key': `e2e-delete-move-${width}` },
        data: {
          fromAccountId: used,
          toAccountId: other,
          amount: '300.00',
          occurredOn: '2026-09-10',
          enteredByMemberId: await ownerId(page),
        },
      })
      expect(moved.ok()).toBeTruthy()
      await page.goto(`/accounts/${used}`)
      const opener = page.getByRole('button', { name: 'Delete account' })
      await opener.click()
      const review = page.getByRole('region', { name: `Review deleting Used Savings ${width}` })
      await expectFocusInside(review)
      await expect(review).toContainText('Saved history must be retained')
      await expect(review).toContainText('1 saved entry')
      await expect(review.getByRole('button', { name: /^Delete / })).toHaveCount(0)
      await review.getByRole('button', { name: 'Review archiving instead' }).click()
      await expect(
        page.getByRole('region', { name: `Review archiving Used Savings ${width}` }),
      ).toBeVisible()
      await page.getByRole('button', { name: 'Cancel' }).click()
      await expect(opener).toBeFocused()
      await expect(page.getByRole('main')).toContainText('Active')
    })
  })
}
