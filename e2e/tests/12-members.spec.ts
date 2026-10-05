import { expect, test, type Page } from '@playwright/test'

// Runs after 11-slice04-layout.spec.ts. The household has Alex Doe (Parent) and Samira Rivera (Child).
// Joint owners, renaming a member and removing a member (slice 05). Later specs must not rely on the old names.
test.describe.serial('members: joint owners, rename, remove', () => {
  let accountId = ''

  const wealth = async (page: Page) =>
    Number(
      ((await (await page.request.get('/api/v1/wealth')).json()) as { financialAssets: string })
        .financialAssets,
    )

  async function expectInView(page: Page, name: string) {
    const panel = page.getByRole('region', { name })
    await expect(panel).toBeVisible()
    await expect(panel).toBeInViewport({ ratio: 1 })
    await expect(panel).toBeFocused()
    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(sideways).toBeLessThanOrEqual(0)
  }

  test('V2_HOUSEHOLD_SETUP_001 sets up an account owned by both members, counted once, kept after a household rename', async ({
    page,
  }) => {
    const before = await wealth(page)
    await page.goto('/accounts/new')
    await page.getByLabel('Account name').fill('Joint Checking')
    await page.getByLabel('Opened on').fill('2026-09-01')
    await page.getByLabel('Balance').fill('$5,000.00')

    // No owner chosen: the first error is in view and the first owner choice has focus.
    await page.getByRole('button', { name: 'Save account' }).click()
    await expect(page.getByText('Choose an owner')).toBeInViewport()
    await expect(
      page.getByRole('group', { name: 'Owners' }).getByRole('checkbox').first(),
    ).toBeFocused()

    await page.getByRole('checkbox', { name: 'Alex Doe (Parent)' }).check()
    await page.getByRole('checkbox', { name: 'Samira Rivera (Child)' }).check()
    await page.getByRole('button', { name: 'Save account' }).click()

    const row = page.getByRole('row', { name: /Joint Checking/ })
    await expect(row).toContainText('Alex Doe (Parent), Samira Rivera (Child)')
    await expect(row).toContainText('$5,000.00')
    await expect(page.getByRole('row', { name: /Joint Checking/ })).toHaveCount(1)
    expect((await wealth(page)) - before).toBe(5000)

    await row.getByRole('link', { name: 'Joint Checking' }).click()
    accountId = page.url().split('/').pop()!
    await expect(page.getByRole('main')).toContainText('Owners')
    await expect(page.getByRole('main')).toContainText('Alex Doe (Parent), Samira Rivera (Child)')

    await page.goto('/')
    await page.getByRole('button', { name: 'Rename household' }).click()
    await page.getByLabel('Household name').fill('Our Household')
    await page.getByRole('button', { name: 'Save household name' }).click()
    await expect(page.getByRole('heading', { name: 'Our Household' })).toBeVisible()
    const listed = page.getByRole('region', { name: 'Accounts and wealth' })
    await expect(listed).toContainText('Joint Checking')
    await expect(listed).toContainText('Alex Doe (Parent), Samira Rivera (Child)')
    await expect(listed).toContainText('$5,000.00')
  })

  test('V2_MEMBERS_005 renaming a member keeps the Balance, owners and entered-by and keeps the earlier name', async ({
    page,
  }) => {
    const members = (await (
      await page.request.get('/api/v1/household-members?householdId=' + (await householdId(page)))
    ).json()) as { id: string; name: string }[]
    const alex = members.find((m) => m.name === 'Alex Doe')!
    const saved = await page.request.post(`/api/v1/accounts/${accountId}/expenses`, {
      headers: { 'Idempotency-Key': 'e2e-members-005' },
      data: {
        description: 'Groceries',
        amount: '100.00',
        occurredOn: '2026-09-05',
        category: 'Groceries',
        enteredByMemberId: alex.id,
      },
    })
    expect(saved.status()).toBe(201)

    await page.goto('/')
    await page.getByRole('button', { name: 'Edit member Alex Doe Parent' }).click()
    await page.getByLabel('Member name').first().fill('Alex Patel')
    await page.getByRole('button', { name: 'Review rename' }).click()
    await expectInView(page, 'Review rename')
    await expect(page.getByRole('region', { name: 'Review rename' })).toContainText(
      'Accounts, balances and entries stay the same',
    )
    await page.getByRole('button', { name: 'Confirm rename' }).click()

    const list = page.getByRole('region', { name: 'Members' })
    await expect(list).toContainText('Alex Patel')
    await expect(list).toContainText('Earlier name: Alex Doe (Parent)')
    const accounts = page.getByRole('region', { name: 'Accounts and wealth' })
    await expect(accounts).toContainText('Alex Patel (Parent), Samira Rivera (Child)')
    await expect(accounts).toContainText('$4,900.00')

    const activity = (await (
      await page.request.get(`/api/v1/accounts/${accountId}/activity`)
    ).json()) as {
      enteredByMemberId: string
    }[]
    expect(activity).toHaveLength(1)
    expect(activity[0].enteredByMemberId).toBe(alex.id)
  })

  test('V2_MEMBERS_006 cancelling a member removal leaves both active and the account jointly owned', async ({
    page,
  }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Remove member Samira Rivera Child' }).click()
    await expectInView(page, 'Review removing Samira Rivera')
    await page
      .getByRole('region', { name: 'Review removing Samira Rivera' })
      .getByRole('button', { name: 'Cancel' })
      .click()

    await expect(page.getByRole('region', { name: 'Review removing Samira Rivera' })).toHaveCount(0)
    await expect(
      page.getByRole('region', { name: 'Members' }).getByText('Inactive', { exact: true }),
    ).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Accounts and wealth' })).toContainText(
      'Alex Patel (Parent), Samira Rivera (Child)',
    )
    await expect(page.getByRole('region', { name: 'Accounts and wealth' })).toContainText(
      '$4,900.00',
    )
  })

  test('V2_MEMBERS_006 removing a member keeps the account and ownership, hides them from new choices, and restores', async ({
    page,
  }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Remove member Samira Rivera Child' }).click()
    await page.getByRole('button', { name: 'Remove Samira Rivera' }).click()
    await expect(
      page.getByRole('region', { name: 'Members' }).getByText('Inactive', { exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('region', { name: 'Accounts and wealth' })).toContainText(
      'Samira Rivera (Child) (inactive)',
    )

    await page.goto('/accounts/new')
    await expect(page.getByRole('group', { name: 'Owners' }).getByRole('checkbox')).toHaveCount(1)
    await page.goto(`/accounts/${accountId}/edit`)
    await expect(
      page.getByRole('checkbox', { name: 'Samira Rivera (Child) (inactive)' }),
    ).toBeChecked()

    await page.goto('/')
    await page.getByRole('button', { name: 'Restore member Samira Rivera Child' }).click()
    await expect(
      page.getByRole('region', { name: 'Members' }).getByText('Inactive', { exact: true }),
    ).toHaveCount(0)
    await page.goto('/accounts/new')
    await expect(page.getByRole('group', { name: 'Owners' }).getByRole('checkbox')).toHaveCount(2)
  })

  for (const width of [710, 1280]) {
    test(`the member panels and owner form fit at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      // A removed member with a long name and label keeps a readable row (the name does not collapse).
      const long = await page.request.post('/api/v1/household-members', {
        data: {
          householdId: await householdId(page),
          name: 'Alexander Bartholomew Montgomery-Fitzgerald',
          label: 'Grandparent on the maternal side',
        },
      })
      if (long.status() === 201) {
        const { id } = (await long.json()) as { id: string }
        await page.request.post(`/api/v1/household-members/${id}/deactivate`)
      }
      await page.goto('/')
      const longRow = page
        .getByRole('region', { name: 'Members' })
        .getByRole('listitem')
        .filter({ hasText: 'Alexander Bartholomew' })
      await expect(longRow.getByText('Inactive', { exact: true })).toBeVisible()
      const nameBox = await longRow
        .getByText('Alexander Bartholomew Montgomery-Fitzgerald')
        .boundingBox()
      expect(nameBox!.width).toBeGreaterThan(180)
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(0)

      await page.getByRole('button', { name: 'Remove member Samira Rivera Child' }).click()
      await expectInView(page, 'Review removing Samira Rivera')
      await page
        .getByRole('region', { name: 'Review removing Samira Rivera' })
        .getByRole('button', { name: 'Cancel' })
        .click()

      await page.getByRole('button', { name: 'Edit member Alex Patel Parent' }).click()
      await page.getByLabel('Member name').first().fill('Alex Patel-Smith')
      await page.getByRole('button', { name: 'Review rename' }).click()
      await expectInView(page, 'Review rename')
      await page
        .getByRole('region', { name: 'Review rename' })
        .getByRole('button', { name: 'Cancel' })
        .click()

      await page.goto(`/accounts/${accountId}/edit`)
      await expect(page.getByRole('group', { name: 'Owners' })).toBeInViewport()
      const sideways = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(sideways).toBeLessThanOrEqual(0)
    })
  }
})

async function householdId(page: Page) {
  return ((await (await page.request.get('/api/v1/household')).json()) as { id: string }).id
}
