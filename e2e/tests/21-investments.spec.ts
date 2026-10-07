import { expect, test, type Locator, type Page } from '@playwright/test'

// Runs after 20-mortgages.spec.ts. Investment accounts (slice 17a, brokerage) at 710px and 1280px: empty setup,
// invalid components, the mismatch review, a draft with Finish setup and Cancel, the reviewed delete with Undo, and
// removing a supporting statement. The database is shared, so every width makes its own accounts. Today is the
// stack's fixed 2026-10-03.

async function ownerId(page: Page): Promise<string> {
  let household = await page.request.get('/api/v1/household')
  if (!household.ok()) {
    household = await page.request.post('/api/v1/household', { data: { name: 'Invest Household' } })
    expect(household.ok()).toBeTruthy()
  }
  const { id } = (await household.json()) as { id: string }
  let members = (await (
    await page.request.get(`/api/v1/household-members?householdId=${id}`)
  ).json()) as { id: string; active: boolean }[]
  if (!members.some((member) => member.active)) {
    const made = await page.request.post('/api/v1/household-members', {
      data: { householdId: id, name: 'Invest Owner' },
    })
    expect(made.ok()).toBeTruthy()
    members = [(await made.json()) as { id: string; active: boolean }]
  }
  return members.find((member) => member.active)!.id
}

test.beforeEach(async ({ page }) => {
  const id = await ownerId(page)
  await page.addInitScript(
    (member) => window.localStorage.setItem('wealthmesh.enteringAs', member),
    id,
  )
})

async function expectNoSidewaysScroll(page: Page) {
  const sideways = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(sideways).toBeLessThanOrEqual(0)
}

async function expectInView(page: Page, target: Locator) {
  await expect
    .poll(async () => {
      const box = await target.boundingBox()
      const height = page.viewportSize()?.height ?? 0
      return box !== null && box.y >= 0 && box.y + box.height <= height
    })
    .toBe(true)
}

async function financialAssets(page: Page): Promise<string> {
  const wealth = (await (await page.request.get('/api/v1/wealth')).json()) as {
    financialAssets: string
  }
  return wealth.financialAssets
}

async function balanceOf(page: Page, id: string): Promise<string> {
  const account = (await (await page.request.get(`/api/v1/accounts/${id}`)).json()) as {
    balance: { amount: string }
  }
  return account.balance.amount
}

/** Fills the setup form; `holdings` are [symbol, quantity, price, value date]. */
async function fillSetup(
  page: Page,
  name: string,
  fields: { total?: string; cash?: string; holdings?: string[][] } = {},
) {
  await page.goto('/accounts/new')
  await page.getByLabel('Account type').selectOption('brokerage')
  await page.getByLabel('Account name').fill(name)
  await page.getByLabel('Institution').fill('Harbor Benefits')
  await page.getByRole('group', { name: 'Owners' }).getByRole('checkbox').first().check()
  await page.getByLabel('Setup date').fill('2026-09-01')
  if (fields.total) await page.getByLabel('Opening total').fill(fields.total)
  if (fields.cash) await page.getByLabel('Cash').fill(fields.cash)
  for (const [index, [symbol, quantity, price, on]] of (fields.holdings ?? []).entries()) {
    const n = index + 1
    await page.getByRole('button', { name: 'Add a holding' }).click()
    await page.getByLabel(`Holding ${n} name or symbol`).fill(symbol)
    await page.getByLabel(`Holding ${n} quantity`).fill(quantity)
    await page.getByLabel(`Holding ${n} market price`).fill(price)
    if (on) await page.getByLabel(`Holding ${n} value date`).fill(on)
  }
}

for (const width of [710, 1280] as const) {
  test.describe.serial(`Investment accounts at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })
    const empty = `Empty Brokerage ${width}`
    const draft = `Draft Brokerage ${width}`
    const cancelled = `Cancelled Brokerage ${width}`
    const backed = `Backed Brokerage ${width}`
    let draftId = ''

    test(`V2_BROKERAGE_002 an empty setup is reviewed at $0.00, saved by Confirm, says so and takes focus (${width}px)`, async ({
      page,
    }) => {
      await fillSetup(page, empty)
      await page.getByRole('button', { name: 'Review' }).click()
      const review = page.getByRole('heading', { name: 'Review new brokerage' })
      await expect(review).toBeVisible()
      await expect(page.getByText(`${empty} will start at $0.00 on 2026-09-01.`)).toBeVisible()
      await expect(page.getByText(/starting amount was left blank/)).toBeVisible()
      await expectNoSidewaysScroll(page)
      await page.getByRole('button', { name: 'Confirm' }).click()

      const status = page
        .getByRole('status')
        .filter({ hasText: `${empty} is set up with a Balance of $0.00 as of 2026-09-01.` })
      await expect(status).toBeVisible()
      await expect(status).toBeFocused()
      await expect(page.getByText(/No starting amount was entered/)).toBeVisible()
      await expect(page.getByLabel('Account details')).toContainText('Institution')
      await expectNoSidewaysScroll(page)
    })

    for (const [input, fields, label, message] of [
      ['cash -$1.00', { cash: '-1.00' }, 'Cash', 'Cash must be zero or greater'],
      [
        'quantity 0',
        { cash: '1', holdings: [['HOME', '0', '100', '']] },
        'Holding 1 quantity',
        'Enter more than zero shares',
      ],
      [
        'price -$1.00',
        { cash: '1', holdings: [['HOME', '1', '-1.00', '']] },
        'Holding 1 market price',
        'Holding market price must be zero or greater',
      ],
      [
        'value date 2026-10-04',
        { cash: '1', holdings: [['HOME', '1', '100', '2026-10-04']] },
        'Holding 1 value date',
        'Future values are not completed account history',
      ],
      [
        'value date 2026-08-31',
        { cash: '1', holdings: [['HOME', '1', '100', '2026-08-31']] },
        'Holding 1 value date',
        'Review the earlier tracking start before saving',
      ],
    ] as const) {
      test(`V2_BROKERAGE_005 ${input}: the field explains, is in view and focused, nothing is added (${width}px)`, async ({
        page,
      }) => {
        const before = await financialAssets(page)
        const accounts = (await (await page.request.get('/api/v1/accounts')).json()) as unknown[]
        await fillSetup(page, `Invalid ${width}`, fields as never)
        await page.getByRole('button', { name: 'Review' }).click()
        await expect(page.getByText(message)).toBeVisible()
        await expect(page.getByLabel(label)).toBeFocused()
        await expectInView(page, page.getByLabel(label))
        await expectNoSidewaysScroll(page)
        const after = (await (await page.request.get('/api/v1/accounts')).json()) as unknown[]
        expect(after).toHaveLength(accounts.length)
        expect(await financialAssets(page)).toBe(before)
      })
    }

    test(`V2_BROKERAGE_006 a mismatch is shown, cannot be confirmed, and Back returns to the name (${width}px)`, async ({
      page,
    }) => {
      const before = await financialAssets(page)
      await fillSetup(page, `Mismatch ${width}`, {
        total: '80000',
        cash: '100',
        holdings: [['HOME', '1', '100', '']],
      })
      await page.getByRole('button', { name: 'Review' }).click()
      await expect(page.getByRole('alert')).toContainText(
        'The opening total $80,000.00 does not match cash plus holdings $200.00',
      )
      await expect(page.getByRole('button', { name: 'Confirm' })).toBeDisabled()
      await expectNoSidewaysScroll(page)
      await page.getByRole('button', { name: 'Back' }).click()
      await expect(page.getByLabel('Account name')).toBeFocused()
      expect(await financialAssets(page)).toBe(before)
    })

    test(`V2_BROKERAGE_003 Review with the cash unanswered keeps a draft that is listed and adds nothing to wealth (${width}px)`, async ({
      page,
    }) => {
      const before = await financialAssets(page)
      await fillSetup(page, draft, { total: '80000', holdings: [['HOME', '200', '100', '']] })
      await page.getByRole('button', { name: 'Review' }).click()
      // Review states what a draft is before anything is saved.
      await expect(page.getByText(`${draft} will be saved as a draft.`)).toBeVisible()
      await expect(page.getByText(/will start at/)).toHaveCount(0)
      expect(
        ((await (await page.request.get('/api/v1/accounts')).json()) as { name: string }[]).some(
          (account) => account.name === draft,
        ),
      ).toBe(false)
      await page.getByRole('button', { name: 'Save draft' }).click()
      const status = page.getByRole('status').filter({ hasText: `${draft} is saved as a draft.` })
      await expect(status).toBeVisible()
      await expect(status).toBeFocused()
      await expect(page.getByRole('button', { name: 'Finish setup' })).toBeVisible()
      await expectNoSidewaysScroll(page)
      draftId = page.url().split('/').pop()!
      expect(await financialAssets(page)).toBe(before)

      await page.goto('/accounts')
      const row = page.getByRole('row').filter({ hasText: draft })
      await expect(row).toContainText('Draft')
      await expect(row).toContainText('No Balance yet')
      await expectNoSidewaysScroll(page)
    })

    test(`V2_BROKERAGE_003 Cancel on a draft discards it at once, with a sentence and no Undo (${width}px)`, async ({
      page,
    }) => {
      await fillSetup(page, cancelled, { total: '500', holdings: [['HOME', '5', '100', '']] })
      await page.getByRole('button', { name: 'Review' }).click()
      await page.getByRole('button', { name: 'Save draft' }).click()
      await page.getByRole('button', { name: 'Cancel draft' }).click()
      const ask = page.getByRole('region', { name: 'Cancel this draft?' })
      await expect(ask).toBeVisible()
      await expectInView(page, ask)
      await ask.getByRole('button', { name: 'Keep draft' }).click()
      await expect(page.getByRole('button', { name: 'Cancel draft' })).toBeFocused()
      await page.getByRole('button', { name: 'Cancel draft' }).click()
      await page.getByRole('button', { name: 'Discard draft' }).click()
      const status = page.getByRole('status').filter({ hasText: `${cancelled} draft is cancelled` })
      await expect(status).toBeVisible()
      await expect(status).toBeFocused()
      await expect(page.getByRole('link', { name: cancelled })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0)
    })

    test(`V2_BROKERAGE_003 Finish setup: Cancel returns focus to its button, Back keeps the form, Confirm activates and says so (${width}px)`, async ({
      page,
    }) => {
      await page.goto(`/accounts/${draftId}`)
      await page.getByRole('button', { name: 'Finish setup' }).click()
      const heading = page.getByRole('heading', { name: `Finish setup of ${draft}` })
      await expect(heading).toBeVisible()
      await expectInView(page, heading)
      await expect(page.getByLabel('Opening total')).toHaveValue('80000.00')
      await page.getByRole('button', { name: 'Cancel', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Finish setup' })).toBeFocused()

      await page.getByRole('button', { name: 'Finish setup' }).click()
      await page.getByLabel('Cash').fill('1')
      await page.getByRole('button', { name: 'Review' }).click()
      await expect(page.getByRole('alert')).toContainText('does not match cash plus holdings')
      await expect(page.getByRole('button', { name: 'Confirm' })).toBeDisabled()
      await page.getByRole('button', { name: 'Back' }).click()
      await expect(page.getByLabel('Opening total')).toBeFocused()
      await expect(page.getByLabel('Cash')).toHaveValue('1')

      const before = Number(await financialAssets(page))
      await page.getByLabel('Cash').fill('60000')
      await page.getByRole('button', { name: 'Review' }).click()
      await expect(page.getByText(`${draft} will start at $80,000.00 on 2026-09-01.`)).toBeVisible()
      await page.getByRole('button', { name: 'Confirm' }).click()
      const status = page
        .getByRole('status')
        .filter({ hasText: `${draft} is set up with a Balance of $80,000.00` })
      await expect(status).toBeVisible()
      await expect(status).toBeFocused()
      await expectNoSidewaysScroll(page)
      expect(Number(await financialAssets(page))).toBe(before + 80000)
      expect(await balanceOf(page, draftId)).toBe('80000.00')
      await page.goto('/')
      const group = page.getByRole('region', { name: 'Investments' })
      await expect(group.getByText(draft)).toBeVisible()
      await expectNoSidewaysScroll(page)
    })

    test(`V2_ACCOUNT_LIFECYCLE_007 a draft is deleted after a review, wealth is unchanged, and Undo brings back the same draft (${width}px)`, async ({
      page,
    }) => {
      const name = `Deleted Draft ${width}`
      await fillSetup(page, name, { total: '20000', holdings: [['HOME', '50', '100', '']] })
      await page.getByRole('button', { name: 'Review' }).click()
      await page.getByRole('button', { name: 'Save draft' }).click()
      await expect(page.getByRole('button', { name: 'Finish setup' })).toBeVisible()
      const before = await financialAssets(page)
      await page.getByRole('button', { name: 'Delete account' }).click()
      await expect(page.getByText(/has no saved history, so it can be deleted/)).toBeVisible()
      await page.getByRole('button', { name: `Delete ${name}` }).click()
      const status = page
        .getByRole('status')
        .filter({ hasText: `${name} is deleted. Wealth does not change.` })
      await expect(status).toBeVisible()
      await expect(status).toBeFocused()
      expect(await financialAssets(page)).toBe(before)
      await page.getByRole('button', { name: 'Undo' }).click()
      const back = page.getByRole('status').filter({ hasText: `${name} is back as a draft.` })
      await expect(back).toBeVisible()
      await expect(back).toBeFocused()
      await expect(page.getByRole('row').filter({ hasText: name })).toContainText('Draft')
      expect(await financialAssets(page)).toBe(before)
    })

    test(`V2_INV_CORRECTION_005 removing the statement keeps the Balance and the opening breakdown, says so and takes focus (${width}px)`, async ({
      page,
    }) => {
      const owner = await ownerId(page)
      const made = await page.request.post('/api/v1/accounts', {
        data: {
          type: 'brokerage',
          name: backed,
          institution: 'Harbor Benefits',
          ownerMemberIds: [owner],
          openedOn: '2026-09-01',
          opening: {
            total: '20000.00',
            cash: '15000.00',
            holdings: [{ symbol: 'HOME', quantity: '50', price: '100.00', valueOn: '2026-09-01' }],
          },
        },
      })
      expect(made.ok()).toBeTruthy()
      const id = ((await made.json()) as { id: string }).id
      const attached = await page.request.post(`/api/v1/accounts/${id}/statements`, {
        headers: { 'Idempotency-Key': `inv-e2e-${width}` },
        data: {
          statementOn: '2026-09-01',
          balance: '20000.00',
          note: 'September 1 statement',
          enteredByMemberId: owner,
          supportsOpening: true,
        },
      })
      expect(attached.ok()).toBeTruthy()

      await page.goto(`/accounts/${id}`)
      await expect(page.getByRole('cell', { name: 'HOME' })).toBeVisible()
      await page.getByRole('button', { name: 'Remove statement' }).click()
      const review = page.getByRole('region', { name: 'Review removing the statement' })
      await expect(review).toContainText('1 opening breakdown uses this statement')
      await expectInView(page, review)
      await review.getByRole('button', { name: 'Remove statement' }).click()

      const sentence = page
        .getByRole('status')
        .filter({ hasText: 'September 1 statement is removed.' })
      await expect(sentence).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Supporting statements' })).toBeFocused()
      await expect(page.getByText(/Removed by/)).toBeVisible()
      await expect(page.getByRole('cell', { name: 'HOME' })).toBeVisible()
      await expect(page.getByText('$15,000.00', { exact: true }).first()).toBeVisible()
      expect(await balanceOf(page, id)).toBe('20000.00')
      await expectNoSidewaysScroll(page)
    })
  })
}
