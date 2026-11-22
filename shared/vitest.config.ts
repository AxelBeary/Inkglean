import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

// 共享包测试配置：组件用 happy-dom 挂载验证，不依赖任何一端宿主
export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'happy-dom',
    // F0172: include 放宽到 src 下任意目录的 .test.ts / .spec.ts（原只认 __tests__/*.test.ts，
    // 放在组件旁或改名的用例会被静默跳过），与 web include 口径靠齐
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    // F0173: canvas stub 全局 setup，消除两份挂载测试里逐字复制的补丁
    setupFiles: ['src/test-setup.ts'],
    // F0174 返工(复核部PART1 FAIL): 同步 web/desktop 的并行上限（8）——高核数机器默认 worker 过多，
    // Windows 门禁偶发单 worker 启动即退的假红。Vitest 4.1.12 正确字段是 maxWorkers；
    // 之前写的 maxForks 在本版本零出现、静默失效（复核部实测），已改。
    maxWorkers: 8
  }
})
