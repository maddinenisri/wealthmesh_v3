import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

// Runs after 11c-cards.spec.ts and before 12-members.spec.ts, which renames Alex Doe and removes Samira.
// Seeded categories are ordinary (D-041): a test that changes a seeded row puts it back in a finally. Created
// categories get the width in their name so the two widths never collide. Today is fixed to 2026-10-03.
test.describe.serial('categories and classes', () => {
  const OWNER = 'Alex Doe (Parent)'

  async function sideways(page: Page) {
    return page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
  }

  async function ownerId(request: APIRequestContext) {
    const household = (await (await request.get('/api/v1/household')).json()) as { id: string }
    const members = (await (
      await request.get(`/api/v1/household-members?householdId=${household.id}`)
    ).json()) as { id: string; name: string }[]
    return members.find((m) => m.name === 'Alex Doe')!.id
  }

  async function checking(request: APIRequestContext, name: string) {
    const response = await request.post('/api/v1/accounts', {
      data: {
        type: 'checking',
        name,
        institution: 'Harbor Bank',
        ownerMemberIds: [await ownerId(request)],
        openedOn: '2026-09-01',
        openingBalance: '5000.00',
      },
    })
    expect(response.status()).toBe(201)
    return ((await response.json()) as { id: string }).id
  }

  async function openAdd(page: Page) {
    const opener = page.getByRole('button', { name: 'Add category' })
    await opener.click()
    const panel = page.getByRole('region', { name: 'Add category' })
    await expect(panel).toBeVisible()
    await expect(panel).toBeInViewport()
    // The panel's wrapper takes focus when it opens, so a keyboard user starts inside it.
    await expect(panel.locator('xpath=..')).toBeFocused()
    return { opener, panel }
  }

  async function save(page: Page, name: string, kind: 'Spending' | 'Income', cls?: string) {
    const { panel } = await openAdd(page)
    await panel.getByLabel('Name').fill(name)
    await panel.getByLabel('Kind').selectOption({ label: kind })
    if (cls) await panel.getByLabel('Default class').selectOption({ label: cls })
    // Once a member has been chosen the browser remembers them (D-025) and the chooser is not shown.
    const chooser = panel.getByLabel('Entered by')
    if (await chooser.count()) await chooser.selectOption({ label: OWNER })
    await panel.getByRole('button', { name: 'Save category' }).click()
    await expect(page.getByRole('region', { name: 'Add category' })).toHaveCount(0)
  }

  for (const width of [710, 1280]) {
    test(`V2_CATEGORIES_008 refuses a blank and a duplicate name at ${width}px, explains each in view, and Cancel returns focus`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/categories')
      const { opener, panel } = await openAdd(page)

      await panel.getByLabel('Entered by').selectOption({ label: OWNER })
      await panel.getByRole('button', { name: 'Save category' }).click()
      const blank = panel.getByText('Enter a category name')
      await expect(blank).toBeVisible()
      await expect(blank).toBeInViewport()
      await expect(panel.getByLabel('Name')).toBeFocused()

      await panel.getByLabel('Name').fill('groceries')
      await panel.getByRole('button', { name: 'Save category' }).click()
      await expect(panel.getByRole('alert')).toContainText(
        '"Groceries" already exists. Use that category instead.',
      )
      await panel.getByRole('button', { name: 'Go to Groceries' }).click()
      await expect(page.locator(':focus')).toContainText('Groceries')
      await expect(page.locator(':focus')).toBeInViewport()
      expect(await sideways(page)).toBeLessThanOrEqual(0)

      await panel.getByRole('button', { name: 'Cancel' }).click()
      await expect(page.getByRole('region', { name: 'Add category' })).toHaveCount(0)
      await expect(opener).toBeFocused()
      await expect(page.getByRole('list', { name: 'Spending categories' })).toContainText(
        /Groceries\s*Default: Essential/,
      )
      expect(await sideways(page)).toBeLessThanOrEqual(0)
    })

    test(`V2_CATEGORIES_001 V2_CATEGORIES_007 creates spending and income categories at ${width}px and an expense takes the default class`, async ({
      page,
      request,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/categories')
      await save(page, `Pets ${width}`, 'Spending', 'Essential')
      await save(page, `Side work ${width}`, 'Income')
      await expect(page.getByRole('list', { name: 'Spending categories' })).toContainText(
        new RegExp(`Pets ${width}\\s*Default: Essential`),
      )
      await expect(page.getByRole('list', { name: 'Income categories' })).toContainText(
        `Side work ${width}`,
      )
      expect(await sideways(page)).toBeLessThanOrEqual(0)

      const id = await checking(request, `Class Checking ${width}`)
      await page.goto(`/accounts/${id}`)
      await page.getByLabel('Entering as').selectOption({ label: OWNER })
      await page.getByRole('button', { name: 'Add money out' }).click()
      await page.getByLabel('Description', { exact: true }).fill('Vet')
      await page.getByLabel('Amount', { exact: true }).fill('40.00')
      await page.getByLabel('Date', { exact: true }).fill('2026-09-07')
      await page.getByLabel('Category', { exact: true }).selectOption({ label: `Pets ${width}` })
      await expect(page.getByLabel('Class', { exact: true })).toHaveText(
        /Category default \(Essential\)/,
      )
      await page.getByRole('button', { name: 'Review' }).click()
      await expect(page.getByRole('region', { name: 'Review money out' })).toContainText(
        'ClassEssential',
      )
      await page.getByRole('button', { name: 'Confirm saving' }).click()
      const row = page.getByRole('row').filter({ hasText: 'Vet' })
      await expect(row).toContainText(`Pets ${width}`)
      await expect(row).toContainText('Essential')
      expect(await sideways(page)).toBeLessThanOrEqual(0)

      // Income has no class choice.
      await page.getByRole('button', { name: 'Add money in' }).click()
      await expect(page.getByLabel('Class', { exact: true })).toHaveCount(0)
    })

    test(`V2_CATEGORIES_006 saves an expense with no category at ${width}px, shows it flagged and unclassified, then assigns Groceries and Essential`, async ({
      page,
      request,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      const name = `Review Checking ${width}`
      const id = await checking(request, name)
      await page.goto(`/accounts/${id}`)
      await page.getByLabel('Entering as').selectOption({ label: OWNER })
      await page.getByRole('button', { name: 'Add money out' }).click()
      await page.getByLabel('Description', { exact: true }).fill('Mystery')
      await page.getByLabel('Amount', { exact: true }).fill('125.00')
      await page.getByLabel('Date', { exact: true }).fill('2026-09-08')
      await page.getByRole('button', { name: 'Review' }).click()
      await page.getByRole('button', { name: 'Confirm saving' }).click()

      const row = page.getByRole('row').filter({ hasText: 'Mystery' })
      await expect(row).toContainText('Uncategorized')
      await expect(row).toContainText('Needs a category')
      await expect(row).toContainText('Unclassified')
      await expect(page.getByRole('main')).toContainText('$4,875.00')
      expect(await sideways(page)).toBeLessThanOrEqual(0)

      await page.getByRole('link', { name: 'Spending' }).click()
      await page.getByLabel('Month', { exact: true }).fill('2026-09')
      await page
        .getByLabel('Account', { exact: true })
        .selectOption({ label: `${name} (Checking)` })
      const month = page.getByRole('region', { name: /September 2026/ })
      await expect(month.getByRole('list', { name: 'Spending by class' })).toContainText(
        'Unclassified $125.00',
      )
      await expect(month.getByRole('list', { name: 'Spending by category' })).toContainText(
        'Uncategorized $125.00',
      )
      await month.getByRole('button', { name: 'Uncategorized' }).click()
      await expect(month.getByRole('button', { name: 'Mystery' })).toBeVisible()

      await page.getByRole('link', { name: 'Accounts', exact: true }).click()
      await page.getByRole('link', { name, exact: true }).click()
      await page.getByRole('button', { name: 'Edit Mystery' }).click()
      await page.getByLabel('Category', { exact: true }).selectOption({ label: 'Groceries' })
      await page.getByLabel('Class', { exact: true }).selectOption({ label: 'Essential' })
      await page.getByRole('button', { name: 'Review' }).click()
      const review = page.getByRole('region', { name: 'Review change' })
      await expect(review).toContainText('No category changed to Groceries')
      await expect(review).toContainText('Unclassified changed to Essential')
      await page.getByRole('button', { name: 'Confirm saving' }).click()
      const fixed = page.getByRole('row').filter({ hasText: 'Mystery' })
      await expect(fixed).toContainText('Groceries')
      await expect(fixed).not.toContainText('Needs a category')
      await expect(page.getByRole('main')).toContainText('$4,875.00')
    })
  }
})
