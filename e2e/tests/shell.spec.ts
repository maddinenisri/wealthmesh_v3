import { expect, test } from '@playwright/test'

test('the jar serves the app shell with navigation and footer', async ({ page }) => {
  await page.goto('/design')

  await expect(page).toHaveTitle('Design system | WealthMesh')
  await expect(page.getByRole('heading', { name: 'WealthMesh design system' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Design system' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await expect(page.getByRole('contentinfo')).toContainText(
    `© ${new Date().getFullYear()} WealthMesh`,
  )
})

test('navigates between pages without a reload', async ({ page }) => {
  await page.goto('/design')
  await page.evaluate(() => {
    ;(window as unknown as { marker: string }).marker = 'same-document'
  })

  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Household' })
    .click()

  await expect(page).toHaveURL('/')
  await expect(page).toHaveTitle('Household | WealthMesh')
  expect(await page.evaluate(() => (window as unknown as { marker?: string }).marker)).toBe(
    'same-document',
  )
})

test('shows the not-found page inside the layout for unknown addresses', async ({ page }) => {
  const response = await page.goto('/nowhere/at/all')

  expect(response?.status()).toBe(200) // index.html fallback; the router renders the 404 view
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
  await page.getByRole('button', { name: 'Go to household' }).click()
  await expect(page).toHaveURL('/')
})

test('the API and health endpoints answer next to the app', async ({ request }) => {
  const health = await request.get('/actuator/health')
  expect(health.ok()).toBe(true)

  const missing = await request.get('/assets/does-not-exist.js')
  expect(missing.status()).toBe(404)

  const bad = await request.post('/api/v1/household-members', {
    data: { householdId: null, name: 'x' },
  })
  expect(bad.status()).toBe(400)
})
