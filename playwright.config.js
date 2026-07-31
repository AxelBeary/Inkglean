import { defineConfig } from '@playwright/test'

// v0.21: Playwright E2E 配置
// 端口 3999 避开发发服务器 3000；独立测试数据库 e2e/test.db（globalSetup 创建，globalTeardown 删除）
export default defineConfig({
  testDir: './e2e/tests',
  timeout: 30_000,
  retries: 1,
  // 共享单服务器 + 单数据库，禁止并行
  workers: 1,
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3999',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } }
  ],
  globalSetup: './e2e/global-setup.js',
  globalTeardown: './e2e/global-teardown.js'
})
