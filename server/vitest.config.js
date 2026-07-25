import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.js'],
    testTimeout: 10000,
    // 每个测试文件串行（共享内存数据库）
    fileParallelism: false,
    env: {
      DB_PATH: ':memory:',
      SESSION_SECRET: 'test-secret-key-for-vitest',
      NODE_ENV: 'test'
    }
  }
})
