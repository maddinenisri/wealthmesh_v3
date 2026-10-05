import { expect, test, type Page } from '@playwright/test'

// Runs after 08-statements.spec.ts. Today is fixed to 2026-10-03 in this stack. The account and its two entries are
// set up through the API; the starting balance is corrected on screen.
test.describe.serial('starting balance journey', () => {
  let accountId = ''
  let memberId = ''

  async function open(page: Page) {
    await page.goto(`/accounts/${accountId}`)
    await page.getByLabel('Entering as').selectOption({ label: 'Alex Doe (Parent)' })
  }

  test('set up a blank start with 6000.00 salary and 1500.00 rent', async ({ request }) => {
    const household = (await (await request.get('/api/v1/household')).json()) as { id: string }
    const members = (await (
      await request.get(`/api/v1/household-members?householdId=${household.id}`)
    ).json()) as { id: string; name: string }[]
    memberId = members.find((m) => m.name === 'Alex Doe')!.id
    const created = await request.post('/api/v1/accounts', {
      data: {
        type: 'checking',
        name: 'Omitted Start Checking',
        ownerMemberIds: [memberId],
        openedOn: '2026-09-01',
      },
    })
    expect(created.status()).toBe(201)
    accountId = ((await created.json()) as { id: string }).id
    for (const [path, key, amount, date, category] of [
      ['income', 'e2e-sb-salary', '6000.00', '2026-09-05', 'Salary'],
      ['expenses', 'e2e-sb-rent', '1500.00', '2026-09-06', 'Rent'],
    ]) {
      const response = await request.post(`/api/v1/accounts/${accountId}/${path}`, {
        headers: { 'Idempotency-Key': key },
        data: {
          description: category,
          amount,
          occurredOn: date,
          category,
          enteredByMemberId: memberId,
        },
      })
      expect(response.status()).toBe(201)
    }
  })

  test('V2_JOURNEY_004 corrects the omitted starting balance without adding income', async ({
    page,
    request,
  }) => {
    await open(page)
    const details = page.getByRole('region', { name: 'Account details' })
    await expect(details).toContainText('$4,500.00')

    await page.getByRole('button', { name: 'Update balance' }).click()
    await page.getByLabel('Correct the starting balance').check()
    const form = page.getByRole('region', { name: 'Correct the starting balance' })
    await form.getByLabel('Starting balance').fill('5000.00')
    await form.getByLabel('Date').fill('2026-09-01')
    await form.getByRole('button', { name: 'Review' }).click()

    const review = page.getByRole('region', { name: 'Review starting balance correction' })
    await expect(review).toContainText('$0.00')
    await expect(review).toContainText('$5,000.00')
    await expect(review).toContainText('Balance will change from $4,500.00 to $9,500.00')
    await review.getByLabel('Reason').fill('Starting amount was omitted during setup')
    await review.getByRole('button', { name: 'Confirm correction' }).click()

    await expect(details).toContainText('$9,500.00')
    await page.goto('/accounts')
    const listed = page
      .getByRole('row')
      .filter({ has: page.getByRole('link', { name: 'Omitted Start Checking', exact: true }) })
    await expect(listed).toContainText('$9,500.00')
    await open(page)
    await page.getByRole('button', { name: 'Show history' }).click()
    const history = page.getByRole('table', { name: 'History' })
    await expect(history).toContainText('Initial Balance')
    await expect(history).toContainText('Starting balance correction')
    await expect(history).toContainText('Starting amount was omitted during setup')
    await expect(history).toContainText('Salary')
    await expect(history).toContainText('Rent')

    // The correction added no entry: salary and rent are the only two.
    const activity = (await (
      await request.get(`/api/v1/accounts/${accountId}/activity`)
    ).json()) as {
      kind: string
    }[]
    expect(activity.map((a) => a.kind).sort()).toEqual(['expense', 'income'])
  })
})
