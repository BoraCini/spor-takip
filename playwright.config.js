import { defineConfig, devices } from '@playwright/test';

// Uçtan uca testler: yerel Worker (wrangler dev) üzerinde gerçek tarayıcıyla.
// WebKit (Safari motoru) CI'da çalışır; yerelde E2E_WEBKIT=1 ile açılır.
const projects = [{ name: 'chromium', use: { ...devices['iPhone 13'], browserName: 'chromium', isMobile: false } }];
if (process.env.CI || process.env.E2E_WEBKIT) projects.push({ name: 'webkit', use: { ...devices['iPhone 13'] } });

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://127.0.0.1:8788', trace: 'retain-on-failure' },
  projects,
  webServer: {
    command: 'npx wrangler dev --port 8788 --ip 127.0.0.1 --persist-to test-results/wrangler-state',
    url: 'http://127.0.0.1:8788/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
