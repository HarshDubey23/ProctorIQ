import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html', { outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env.CI ? 'http://localhost:4173' : 'http://localhost:5173',
    trace: 'on-first-retry',
    extraHTTPHeaders: {
      'Content-Type': 'application/json',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
            '--allow-http-screen-capture',
          ],
        },
      },
    },
  ],
  webServer: [
    {
      command: process.env.CI
        ? 'npm run build && npx vite preview --port 4173'
        : 'npm run dev -- --port 5173',
      url: process.env.CI ? 'http://localhost:4173' : 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      cwd: '.',
    },
  ],
});
