import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'off',
    video: 'off',
    screenshot: 'only-on-failure',
    channel: 'msedge'
  },
  projects: [
    {
      name: 'Mobile-LIFF',
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.0.0'
      }
    },
    {
      name: 'Desktop',
      use: {
        viewport: { width: 1280, height: 720 }
      }
    }
  ],
  webServer: {
    command: 'node scripts/test-static-server.js',
    url: 'http://localhost:4173/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 10000
  }
});
