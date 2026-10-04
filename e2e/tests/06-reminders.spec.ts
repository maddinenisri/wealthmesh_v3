import { expect, test, type APIRequestContext } from '@playwright/test'

// Runs after 05-edit-remove.spec.ts. Today is fixed to 2026-10-03 in this stack, so the "future" dates here are after
// that day (the scenarios' own 2026-09-30 is in the past for this clock). The API tests use the scenario dates.
test.describe.serial('reminders journey', () => {
  async function createAccount(request: APIRequestContext, name: string) {
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
        openingBalance: '5000.00',
      },
    })
    expect(response.status()).toBe(201)
  }

  async function startEntry(
    page: import('@playwright/test').Page,
    account: string,
    button: string,
    category: string,
    amount: string,
  ) {
    await page.goto('/accounts')
    await page.getByLabel('Entering as').selectOption({ label: 'Alex Doe (Parent)' })
    await page.getByRole('link', { name: account, exact: true }).click()
    await page.getByRole('button', { name: button }).click()
    const form = page.getByRole('region', { name: button })
    await form.getByLabel('Amount').fill(amount)
    await form.getByLabel('Date').fill('2026-10-30')
    await form.getByLabel('Category').selectOption({ label: category })
    return form
  }

  test('V2_EXPENSE_011 keeps a future bill as a reminder, not as spending', async ({
    page,
    request,
  }) => {
    await createAccount(request, 'Reminder Bills Checking')
    const form = await startEntry(
      page,
      'Reminder Bills Checking',
      'Add money out',
      'Utilities',
      '180.00',
    )
    await expect(form).toContainText('plan or reminder')
    await page.getByRole('button', { name: 'Save reminder' }).click()
    await page.getByRole('button', { name: 'Confirm reminder' }).click()

    const reminders = page.getByRole('region', { name: 'Reminders' })
    await expect(reminders).toContainText('Utilities')
    await expect(reminders).toContainText('$180.00')
    await expect(reminders).toContainText('2026-10-30')
    await expect(page.getByLabel('Account details')).toContainText('$5,000.00')
    await expect(page.getByRole('main')).toContainText('No money activity has been recorded yet.')

    await page.getByRole('link', { name: 'Spending' }).click()
    await page.getByLabel('Month', { exact: true }).fill('2026-10')
    await expect(page.getByRole('region', { name: 'Month review' })).toContainText(
      /Spending\s*\$0\.00/,
    )
  })

  test('V2_INCOME_006 keeps expected salary as a reminder until it is received', async ({
    page,
    request,
  }) => {
    await createAccount(request, 'Reminder Pay Checking')
    const form = await startEntry(
      page,
      'Reminder Pay Checking',
      'Add money in',
      'Salary',
      '6000.00',
    )
    await expect(form).toContainText('cannot be recorded as completed income')
    await page.getByRole('button', { name: 'Save reminder' }).click()
    await page.getByRole('button', { name: 'Confirm reminder' }).click()

    const reminders = page.getByRole('region', { name: 'Reminders' })
    await expect(reminders).toContainText('expected')
    await expect(reminders).toContainText('$6,000.00')
    await expect(reminders).toContainText('2026-10-30')
    await expect(page.getByLabel('Account details')).toContainText('$5,000.00')

    await page.getByRole('link', { name: 'Spending' }).click()
    await page.getByLabel('Month', { exact: true }).fill('2026-10')
    await expect(page.getByRole('region', { name: 'Month review' })).toContainText(
      /Income\s*\$0\.00/,
    )
  })
})
