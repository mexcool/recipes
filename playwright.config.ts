import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// The build container ships Chromium at /opt/pw-browsers; CI installs it with `playwright install chromium`.
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';

/** Phone-sized end-to-end journeys against the production build (vite preview). */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: process.env.APP_URL ?? 'http://localhost:4173/',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 14'], browserName: 'chromium', deviceScaleFactor: 1 } },
    { name: 'android-small', use: { browserName: 'chromium', viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
  ],
  webServer: process.env.APP_URL
    ? undefined
    : { command: 'pnpm exec vite preview --port 4173 --strictPort', url: 'http://localhost:4173/', reuseExistingServer: true, timeout: 30_000 },
});
