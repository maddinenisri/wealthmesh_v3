import { expect, test, type Locator, type Page } from '@playwright/test'

// Runs after 12-members.spec.ts. Archive, restore, close, reopen and delete an account (slice 12), at 710px and 1280px.
// Each account is made through the API with an active member as owner; later specs must not rely on these accounts.

type Wealth = { financialAssets: string; debts: string }

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
      expect(await wealth(page)).toEqual(before)
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
