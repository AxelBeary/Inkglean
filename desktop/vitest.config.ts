import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

// 桌面端前端测试配置（与 web 隔离；native 能力测试用逃生门降级路径，不依赖 Tauri 运行时）
export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/__tests__/**/*.test.ts'],
    // 同 web/shared：高核数机器默认 worker 过多，Windows 下偶发单 worker 启动即退。
    // Vitest 4 已移除 test.poolOptions（旧写法静默不生效＝等于没封顶），顶层 maxWorkers 才是等价口径。
    maxWorkers: 8
  }
})
