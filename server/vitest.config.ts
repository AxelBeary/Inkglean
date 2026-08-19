import { defineConfig } from 'vitest/config'
import { join } from 'path'
import { tmpdir } from 'os'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // TS 收尾迁移完成（2026-08-19）：测试全量 .test.ts，与 tsconfig.tests.json strict 检查对齐
    include: ['tests/**/*.test.ts'],
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
