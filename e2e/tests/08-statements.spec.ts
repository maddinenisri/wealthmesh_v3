import { expect, test, type Page } from '@playwright/test'

// Runs after 07-corrections.spec.ts. Today is fixed to 2026-10-03 in this stack. The account is made through the
// API; the statement is attached and the revision cancelled and confirmed on screen.
test.describe.serial('supporting statements journey', () => {
  let accountId = ''

  async function open(page: Page) {
    await page.goto(`/accounts/${accountId}`)
    await page.getByLabel('Entering as').selectOption({ label: 'Alex Doe (Parent)' })
  }

  async function startRevision(page: Page) {
    const card = page.getByRole('region', { name: 'Supporting statements' })
    await card.getByRole('button', { name: 'Replace with corrected version' }).click()
    const form = page.getByRole('region', { name: 'Replace with corrected version' })
    await form.getByLabel('Statement balance').fill('5000.00')
    await form.getByLabel('Reason').fill('Issuer supplied a corrected statement')
    await form.getByRole('button', { name: 'Review' }).click()
    return page.getByRole('region', { name: 'Review statement replacement' })
  }

  test('set up checking with 5000.00 and attach a September statement', async ({
    page,
    request,
  }) => {
    const household = (await (await request.get('/api/v1/household')).json()) as { id: string }
    const members = (await (
      await request.get(`/api/v1/household-members?householdId=${household.id}`)
    ).json()) as { id: string; name: string }[]
    const response = await request.post('/api/v1/accounts', {
      data: {
        type: 'checking',
        name: 'Statement Checking',
        ownerMemberIds: [members.find((m) => m.name === 'Alex Doe')!.id],
        openedOn: '2026-09-01',
        openingBalance: '5000.00',
      },
    })
    expect(response.status()).toBe(201)
    accountId = ((await response.json()) as { id: string }).id

    await open(page)
    const card = page.getByRole('region', { name: 'Supporting statements' })
    await expect(card.getByText('No statements are attached.')).toBeVisible()
    await card.getByRole('button', { name: 'Attach statement' }).click()
    const form = page.getByRole('region', { name: 'Attach statement' })
    await form.getByLabel('Statement date').fill('2026-09-30')
    await form.getByLabel('Statement balance').fill('5000.00')
    await form.getByLabel('Note').fill('September statement')
    await form.getByRole('button', { name: 'Save statement' }).click()
    await expect(card.getByText('Active version')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Account details' })).toContainText('$5,000.00')
  })

  test('V2_SUPPORTING_RECORD_003 cancelling a revision keeps the original active', async ({
    page,
  }) => {
    await open(page)
    const review = await startRevision(page)
    await expect(review).toContainText('Your Balance stays $5,000.00')
    await review.getByRole('button', { name: 'Cancel' }).click()

    const card = page.getByRole('region', { name: 'Supporting statements' })
    await expect(card.getByText('Active version')).toHaveCount(1)
    await expect(card.getByText('Replaced')).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Account details' })).toContainText('$5,000.00')
    await page.reload()
    await expect(
      page.getByRole('region', { name: 'Supporting statements' }).getByText('Active version'),
    ).toHaveCount(1)
    // No entry, correction or second statement was saved.
    const activity = await page.request.get(`/api/v1/accounts/${accountId}/activity`)
    expect(await activity.json()).toEqual([])
  })

  test('confirming a revision keeps both versions and leaves the Balance alone', async ({
    page,
  }) => {
    await open(page)
    const review = await startRevision(page)
    await review.getByRole('button', { name: 'Confirm replacement' }).click()
    const card = page.getByRole('region', { name: 'Supporting statements' })
    await expect(card.getByText('Replaced')).toHaveCount(1)
    await expect(card.getByText('Active version')).toHaveCount(1)
    await expect(card).toContainText('Issuer supplied a corrected statement')
    await expect(page.getByRole('region', { name: 'Account details' })).toContainText('$5,000.00')
  })
})
