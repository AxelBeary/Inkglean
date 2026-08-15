import { defineConfig } from 'vitest/config'
import { join } from 'path'
import { tmpdir } from 'os'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // F3: TS 增量迁移轨——.test.ts 与 .test.js 并列纳入，防新写 TS 测试被静默漏跑
    include: ['tests/**/*.test.js', 'tests/**/*.test.ts'],
    testTimeout: 10000,
    // 每个测试文件串行（共享内存数据库）
    fileParallelism: false,
    env: {
      DB_PATH: ':memory:',
      SESSION_SECRET: 'test-secret-key-for-vitest',
      NODE_ENV: 'test',
      TZ: 'Asia/Shanghai', // P1-4: 与生产容器时区一致
      // 事故修复：测试上传文件必须隔离到临时目录，禁止写入真实 uploads/
      UPLOAD_DIR: join(tmpdir(), `commission-test-uploads-${process.pid}`)
    }
  }
})
