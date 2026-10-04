import { defineConfig } from '@playwright/test'

const port = process.env.WM_E2E_APP_PORT ?? '8095'
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests',
  // The household is a singleton, so specs share one database and run in order.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'block',
  },
  webServer: {
    command: './start-stack.sh',
    url: `${baseURL}/actuator/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 20_000 },
  },
})
