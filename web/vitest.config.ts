import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

// 前端测试配置（与后端 server/vitest.config.ts 完全隔离）
export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'happy-dom',
    // TS 收尾迁移完成（2026-08-19）：单测全量 .test.ts
    // scripts/ 收单测：门禁脚本自身有判别力断言（check-i18n），放脚本旁边避免 node 脚本被拖进 web 的类型域
    include: ['src/**/__tests__/**/*.test.ts', 'scripts/**/__tests__/**/*.test.ts'],
    setupFiles: ['src/test-setup.ts']
  }
})
