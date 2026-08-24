import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

// 共享包测试配置：组件用 happy-dom 挂载验证，不依赖任何一端宿主
export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/__tests__/**/*.test.ts']
  }
})
