import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

// 前端测试配置（与后端 server/vitest.config.ts 完全隔离）
export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'happy-dom',
    // TS 收尾迁移完成（2026-08-19）：单测全量 .test.ts
    include: ['src/**/__tests__/**/*.test.ts'],
    setupFiles: ['src/test-setup.ts']
  }
})
