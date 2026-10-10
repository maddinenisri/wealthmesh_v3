import { expect, test, type Page } from '@playwright/test'

// Runs after 27-prices.spec.ts. Slice 19c: the whole investment group beside one account (V2_HOLDINGS_002, 003), the
// statement difference review (V2_HOLDINGS_005) and Undo of a removed statement (V2_SUPPORTING_RECORD_002). The database
// is shared with every earlier spec, so each width holds its own symbol (H2A710, H2A1280): its figures are asserted
// exactly, and the group total is judged by delta. Today is the stack's fixed 2026-10-03.

async function enteringMember(page: Page): Promise<string> {
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
  const id = await enteringMember(page)
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

type Group = { total: string; accounts: { accountId: string }[] }
const groupOf = async (page: Page) =>
  (await (await page.request.get('/api/v1/investments/holdings')).json()) as Group

async function make(
  page: Page,
  owner: string,
  type: string,
  name: string,
  cash: string,
  symbol: string,
  quantity: string,
  cost?: string,
) {
  const made = await page.request.post('/api/v1/accounts', {
    data: {
      type,
      name,
      institution: 'Harbor Benefits',
      ownerMemberIds: [owner],
      openedOn: '2026-09-01',
      enteredByMemberId: owner,
      opening: {
        cash,
        holdings: [
          { symbol, quantity, price: '100.00', valueOn: '2026-09-01', ...(cost ? { cost } : {}) },
        ],
      },
    },
  })
  expect(made.ok()).toBeTruthy()
  return ((await made.json()) as { id: string }).id
}

for (const width of [710, 1280]) {
  test.describe.serial(`investment groups at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })
    const symbol = `H2A${width}`
    let redwood = ''
    let redwoodName = ''
    let before = 0

    test(`V2_HOLDINGS_002 ${symbol} across three accounts: shares, value, known cost and gain, coverage, Balances and the share of the group (${width}px)`, async ({
      page,
    }) => {
      const owner = await enteringMember(page)
      before = Number((await groupOf(page)).total)
      redwoodName = `Group Redwood ${width}`
      redwood = await make(
        page,
        owner,
        'brokerage',
        redwoodName,
        '16000.00',
        symbol,
        '50',
        '4500.00',
      )
      await make(
        page,
        owner,
        '401k',
        `Group Harbor 401k ${width}`,
        '60000.00',
        symbol,
        '200',
        '15000.00',
      )
      await make(
        page,
        owner,
        'traditional_ira',
        `Group Willow IRA ${width}`,
        '20000.00',
        symbol,
        '100',
      )
      const priced = await page.request.post(`/api/v1/accounts/${redwood}/prices`, {
        headers: { 'Idempotency-Key': `grp-${width}` },
        data: { symbol, price: '110.00', valueOn: '2026-09-30', enteredByMemberId: owner },
      })
      expect(priced.ok()).toBeTruthy()

      await page.goto('/investments')
      await expect(
        page.getByRole('heading', { name: 'Investment holdings', level: 1 }),
      ).toBeVisible()
      const summary = page.getByRole('region', { name: 'All investment accounts summary' })
      const total = before + 131500
      await expect(summary).toContainText(
        `Investment Balance $${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      )
      const lines = summary.getByRole('list', { name: 'Investment accounts' })
      await expect(lines.getByRole('listitem').filter({ hasText: redwoodName })).toContainText(
        '$21,500.00',
      )
      await expect(
        lines.getByRole('listitem').filter({ hasText: `Group Harbor 401k ${width}` }),
      ).toContainText('$80,000.00')
      await expect(
        lines.getByRole('listitem').filter({ hasText: `Group Willow IRA ${width}` }),
      ).toContainText('$30,000.00')

      await page.getByLabel('Choose a security').selectOption(symbol)
      const detail = page.getByRole('region', { name: 'Selected security' })
      await expect(detail).toContainText(`350 shares valued at $35,500.00 across 3 accounts.`)
      await expect(detail).toContainText('Known purchase cost$19,500.00 for 250 shares')
      await expect(detail).toContainText('Known gain$6,000.00 for 250 shares')
      await expect(detail).toContainText('Full purchase costNot available')
      await expect(detail).toContainText('Full gainNot available')
      await expect(detail).toContainText('Known-cost share coverage71.43%')
      const share = ((35500 * 100) / total).toFixed(2)
      await expect(detail).toContainText(
        `${symbol} is ${share}% of the investment Balance of $${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      )
      const byAccount = detail.getByRole('list', { name: `${symbol} by account` })
      await expect(byAccount.getByRole('listitem').filter({ hasText: redwoodName })).toContainText(
        '50 shares at $110.00 on 2026-09-30',
      )
      await expect(
        byAccount.getByRole('listitem').filter({ hasText: `Group Harbor 401k ${width}` }),
      ).toContainText('200 shares at $100.00 on 2026-09-01')
      await expect(
        byAccount.getByRole('listitem').filter({ hasText: `Group Willow IRA ${width}` }),
      ).toContainText('Purchase cost unknown (0.00% of the shares). Full cost: Not available.')
      await expectNoSidewaysScroll(page)

      // Each account opens from the list.
      await byAccount.getByRole('link', { name: redwoodName }).click()
      await expect(page.getByRole('heading', { name: redwoodName, level: 1 })).toBeVisible()
    })

    test(`V2_HOLDINGS_003 the selected account has its own cash, holdings, Balance and ${symbol} share, and the whole group is a separate summary (${width}px)`, async ({
      page,
    }) => {
      await page.goto(`/accounts/${redwood}`)
      const holdings = page.getByRole('region', { name: 'Holdings', exact: true })
      await expect(holdings).toContainText('Cash$16,000.00')
      await expect(holdings).toContainText('Holdings$5,500.00')
      await expect(holdings).toContainText('Balance$21,500.00')
      await expect(holdings).toContainText(`${symbol} is 25.58% of this account's Balance`)
      await expect(holdings).not.toContainText('Group Harbor')
      await expect(holdings).not.toContainText('Willow')
      const group = page.getByRole('region', {
        name: 'Whole investment group, separate from this account',
      })
      await expect(group).toContainText('This is the whole group, not this account.')
      await expect(group).not.toContainText(symbol)
      await group.getByRole('link', { name: 'See the holdings by security' }).click()
      await expect(page).toHaveURL(/\/investments$/)
      await expectNoSidewaysScroll(page)
    })

    test(`V2_HOLDINGS_005 a statement is reviewed against the calculated Balance on its date, saves with a sentence, and a cash or quantity correction is refused by the server (${width}px)`, async ({
      page,
    }) => {
      const owner = await enteringMember(page)
      await page.goto(`/accounts/${redwood}`)
      await page.getByRole('button', { name: 'Attach statement' }).click()
      await page.getByLabel('Statement date').fill('2026-09-30')
      await page.getByLabel('Statement balance').fill('21400')
      await page.getByRole('button', { name: 'Review' }).click()
      const heading = page.getByRole('heading', { name: 'Review the statement' })
      await expect(heading).toBeVisible()
      const review = page.getByRole('region', { name: 'Review the statement' })
      await expect(review).toContainText(
        'The statement total is $21,400.00 and the calculated Balance on 2026-09-30 is $21,500.00: a difference of $100.00. Which cash, quantity or price needs correction? Cash and quantity corrections come in a later release. Only a price can be recorded now.',
      )
      await expectNoSidewaysScroll(page)
      // Back keeps the values and focuses the form heading; Cancel returns to the opener and saves nothing.
      await page.getByRole('button', { name: 'Back' }).click()
      await expect(page.getByRole('heading', { name: 'Attach statement' })).toBeFocused()
      await expect(page.getByLabel('Statement balance')).toHaveValue('21400')
      await page.getByRole('button', { name: 'Review' }).click()
      await page.getByRole('button', { name: 'Cancel' }).click()
      await expect(page.getByRole('button', { name: 'Attach statement' })).toBeFocused()
      expect(
        (
          (await (
            await page.request.get(`/api/v1/accounts/${redwood}/statements`)
          ).json()) as unknown[]
        ).length,
      ).toBe(0)

      await page.getByRole('button', { name: 'Attach statement' }).click()
      await page.getByLabel('Statement date').fill('2026-09-30')
      await page.getByLabel('Statement balance').fill('21400')
      await page.getByRole('button', { name: 'Review' }).click()
      await page.getByRole('button', { name: 'Save statement' }).click()
      const status = page
        .getByRole('status')
        .filter({ hasText: 'Statement saved. The statement total is $21,400.00' })
      await expect(status).toBeVisible()
      await expect(status).toContainText('a difference of $100.00')
      await expect(status).toContainText('The Balance stays $21,500.00')
      await expect(status).toContainText('To correct the difference, record a price.')
      await expect(page.getByRole('heading', { name: 'Supporting statements' })).toBeFocused()
      await expect(page.getByRole('region', { name: 'Holdings', exact: true })).toContainText(
        'Balance$21,500.00',
      )
      const detail = (await (await page.request.get(`/api/v1/accounts/${redwood}`)).json()) as {
        balance: { amount: string }
      }
      expect(detail.balance.amount).toBe('21500.00')

      // The server refuses a cash or quantity correction, in the review and at the save.
      const body = (proposed: string) => ({
        statementOn: '2026-09-30',
        balance: '21400.00',
        note: 'x',
        enteredByMemberId: owner,
        proposedCorrection: proposed,
      })
      const later =
        'Cash and quantity corrections come in a later release. Only a price can be recorded now.'
      for (const proposed of ['cash', 'quantity']) {
        const reviewed = await page.request.post(`/api/v1/accounts/${redwood}/statements/review`, {
          data: body(proposed),
        })
        expect(reviewed.status()).toBe(400)
        expect(((await reviewed.json()) as { message: string }).message).toBe(later)
        const saved = await page.request.post(`/api/v1/accounts/${redwood}/statements`, {
          headers: { 'Idempotency-Key': `grp-refuse-${width}-${proposed}` },
          data: body(proposed),
        })
        expect(saved.status()).toBe(400)
        expect(((await saved.json()) as { message: string }).message).toBe(later)
      }
      expect(
        (
          (await (
            await page.request.get(`/api/v1/accounts/${redwood}/statements`)
          ).json()) as unknown[]
        ).length,
      ).toBe(1)
    })

    test(`V2_SUPPORTING_RECORD_002 removing the statement that backs the opening, then Undo twice: one statement, the same link, the same Balance (${width}px)`, async ({
      page,
    }) => {
      const owner = await enteringMember(page)
      const name = `Undo Brokerage ${width}`
      const id = await make(page, owner, 'brokerage', name, '15000.00', symbol, '50')
      const attached = await page.request.post(`/api/v1/accounts/${id}/statements`, {
        headers: { 'Idempotency-Key': `undo-${width}` },
        data: {
          statementOn: '2026-09-01',
          balance: '20000.00',
          note: 'September 1 statement',
          enteredByMemberId: owner,
          supportsOpening: true,
        },
      })
      expect(attached.status()).toBe(201)
      const statementId = ((await attached.json()) as { id: string }).id

      await page.goto(`/accounts/${id}`)
      await page.getByRole('button', { name: 'Remove statement' }).click()
      await page
        .getByRole('region', { name: 'Review removing the statement' })
        .getByRole('button', { name: 'Remove statement' })
        .click()
      const removed = page
        .getByRole('status')
        .filter({ hasText: 'September 1 statement is removed.' })
      await expect(removed).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Supporting statements' })).toBeFocused()

      const undo = page.getByRole('button', { name: 'Undo removal' })
      await undo.click()
      const restored = page
        .getByRole('status')
        .filter({ hasText: 'September 1 statement is restored once.' })
      await expect(restored).toBeVisible()
      await expect(restored).toContainText('still linked to the opening review')
      await expect(restored).toContainText('The removal and the Undo are in history.')
      await expect(page.getByRole('heading', { name: 'Supporting statements' })).toBeFocused()
      await expect(page.getByRole('button', { name: 'Undo removal' })).toHaveCount(0)
      const history = page.getByRole('list', { name: 'Statement history' })
      await expect(history.getByRole('listitem')).toHaveCount(2)
      await expect(history).toContainText('Removed by')
      await expect(history).toContainText('Restored (Undo) by')
      await expect(page.getByText(/supports the opening/)).toBeVisible()
      await expect(page.getByRole('region', { name: 'Holdings', exact: true })).toContainText(
        'Balance$20,000.00',
      )
      await expectNoSidewaysScroll(page)

      // A second Undo (a stale tab, a double click) changes nothing: still one statement, still two events.
      for (let again = 0; again < 2; again += 1) {
        const second = await page.request.post(
          `/api/v1/accounts/${id}/statements/${statementId}/restore`,
          { data: { enteredByMemberId: owner } },
        )
        expect(second.status()).toBe(200)
        const body = (await second.json()) as { removedAt: string | null; events: unknown[] }
        expect(body.removedAt).toBeNull()
        expect(body.events).toHaveLength(2)
      }
      const listed = (await (
        await page.request.get(`/api/v1/accounts/${id}/statements`)
      ).json()) as unknown[]
      expect(listed).toHaveLength(1)
      const opening = (await (await page.request.get(`/api/v1/accounts/${id}/opening`)).json()) as {
        statementId: string
        statementRemoved: boolean
        holdings: unknown[]
      }
      expect(opening.statementId).toBe(statementId)
      expect(opening.statementRemoved).toBe(false)
      expect(opening.holdings).toHaveLength(1)
    })

    test(`V2_WEALTH_004 Wealth on a date shows Debts beside Financial assets (${width}px)`, async ({
      page,
    }) => {
      await page.goto('/')
      const card = page.getByRole('region', { name: 'Wealth on a date' })
      await card.getByLabel('Show wealth on').fill('2026-09-30')
      await expect(card.getByText(/^Debts/)).toBeVisible()
      await expect(card.getByText(/^Financial assets/)).toBeVisible()
      await expectNoSidewaysScroll(page)
    })
  })
}
