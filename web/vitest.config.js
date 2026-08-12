import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

// 前端测试配置（与后端 server/vitest.config.js 完全隔离）
export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'happy-dom',
    // 812-B5: 兼容 TS 迁移轨——webauthn.test.ts 等新单测走 .ts
    include: ['src/**/__tests__/**/*.test.{js,ts}'],
    setupFiles: ['src/test-setup.js']
  }
})
