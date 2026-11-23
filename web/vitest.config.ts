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
    // 28 核机器默认起 ~27 个 fork，Windows 下偶发单 worker 启动即退（3 次门禁假红，日志留痕）；
    // 上限 8 保留并行度，也贴近 CI 4 核的实际行为。
    // 2026-11-23 修：Vitest 4 已移除 test.poolOptions（启动时打 DEPRECATED，且**静默不生效**），
    // 旧写法等于没封顶 → 回到 ~27 fork，28 核 Windows 上门禁必红（实测 186/188 文件、1303/1308 用例，
    // 单个 worker 进程被系统回收）。顶层 maxWorkers 是 Vitest 4 的等价口径。
    maxWorkers: 8,
    setupFiles: ['src/test-setup.ts']
  }
})
