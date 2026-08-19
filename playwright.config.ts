import { defineConfig } from '@playwright/test'

// v0.21: Playwright E2E 配置
// E2E 端口/主机唯一常量（E5 收口）：默认 3999 避开发发服务器 3000，可用 E2E_HOST/E2E_PORT 环境变量覆盖；
// e2e/ 下所有硬编码一律引用此处。独立测试数据库 e2e/test.db（globalSetup 创建，globalTeardown 删除）
export const E2E_HOST: string = process.env.E2E_HOST || 'localhost'
export const E2E_PORT: number = Number(process.env.E2E_PORT || 3999)
export const E2E_BASE_URL: string = `http://${E2E_HOST}:${E2E_PORT}`

export default defineConfig({
  testDir: './e2e/tests',
  timeout: 30_000,
  retries: 1,
  // 共享单服务器 + 单数据库，禁止并行
  workers: 1,
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: E2E_BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } }
  ],
  globalSetup: './e2e/global-setup',
  globalTeardown: './e2e/global-teardown'
})
