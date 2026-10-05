import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

// Q-034 (owner answer, 2026-10-05): "Pay a card" on checking and savings, reusing the card-payment path.
// Runs after 11e-batch.spec.ts and before 12-members.spec.ts. Today is fixed to 2026-10-03.
test.describe.serial('pay a card from a bank account', () => {
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

  async function open(request: APIRequestContext, data: Record<string, unknown>) {
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
    for (const type of ['checking', 'savings'] as const) {
      test(`Q-034 pays a card from ${type} at ${width}px: review, cancel, then confirm moves both Balances`, async ({
        page,
        request,
      }) => {
        await page.setViewportSize({ width, height: 900 })
        const bankName = `Pay ${type} ${width}`
        const cardName = `Pay Card ${type} ${width}`
        const bank = await open(request, {
          type,
          name: bankName,
          openingBalance: '5000.00',
        })
        await open(request, {
          type: 'credit_card',
          name: cardName,
          institution: 'Harbor Cards',
          openingBalance: '1000.00',
          balanceSide: 'owed',
        })
        await page.goto(`/accounts/${bank}`)
        await page.getByLabel('Entering as').selectOption({ label: OWNER })
        const opener = page.getByRole('button', { name: 'Pay a card' })
        await opener.click()

        const form = page.getByRole('region', { name: 'Pay a card' })
        await expect(form).toBeInViewport()
        await expect(form.locator('xpath=..')).toBeFocused()
        await expect(form).toContainText(bankName)
        await form.getByRole('button', { name: 'Review' }).click()
        const missing = form.getByText('Choose the card to pay')
        await expect(missing).toBeVisible()
        await expect(missing).toBeInViewport()
        await expect(form.getByLabel('Card to pay')).toBeFocused()

        await form.getByLabel('Card to pay').selectOption({ label: `${cardName} (Credit card)` })
        await form.getByLabel('Amount', { exact: true }).fill('500.00')
        await form.getByLabel('Date', { exact: true }).fill('2026-09-20')
        await form.getByRole('button', { name: 'Review' }).click()
        const review = page.getByRole('region', { name: 'Effect of this payment' })
        await expect(review).toContainText(`${cardName} Balance$500.00 owed`)
        await expect(page.getByRole('heading', { name: 'Review payment' })).toBeFocused()
        expect(await sideways(page)).toBeLessThanOrEqual(0)

        await page.getByRole('button', { name: 'Cancel' }).click()
        await expect(page.getByRole('region', { name: 'Review payment' })).toHaveCount(0)
        await expect(opener).toBeFocused()
        await expect(page.getByRole('main')).toContainText('$5,000.00')

        await opener.click()
        await page.getByLabel('Card to pay').selectOption({ label: `${cardName} (Credit card)` })
        await page.getByLabel('Amount', { exact: true }).fill('500.00')
        await page.getByLabel('Date', { exact: true }).fill('2026-09-20')
        await page.getByRole('button', { name: 'Review' }).click()
        await page.getByRole('button', { name: 'Confirm payment' }).click()
        await expect(page.getByRole('main')).toContainText('$4,500.00')
        const row = page.getByRole('row').filter({ hasText: 'Payment to' })
        await expect(row).toContainText(cardName)
        await expect(row).toBeInViewport()
        expect(await sideways(page)).toBeLessThanOrEqual(0)

        await page.getByRole('link', { name: 'Accounts', exact: true }).click()
        await expect(
          page
            .getByRole('row')
            .filter({ has: page.getByRole('link', { name: cardName, exact: true }) }),
        ).toContainText('$500.00 owed')
      })
    }
  }

  test('Q-034 with a credit card in the household the button is enabled and the empty-state note is absent', async ({
    page,
    request,
  }) => {
    // The disabled state (no card) is covered in PayCard.test.tsx: earlier specs leave cards behind.
    const bank = await open(request, {
      type: 'checking',
      name: 'Has Cards Checking',
      openingBalance: '10.00',
    })
    await page.goto(`/accounts/${bank}`)
    await expect(page.getByRole('button', { name: 'Pay a card' })).toBeEnabled()
    await expect(page.getByText('Add a credit card to pay it from here.')).toHaveCount(0)
  })
})
