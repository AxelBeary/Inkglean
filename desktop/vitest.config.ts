import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

// 桌面端前端测试配置（与 web 隔离；native 能力测试用逃生门降级路径，不依赖 Tauri 运行时）
export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/__tests__/**/*.test.ts']
  }
})
