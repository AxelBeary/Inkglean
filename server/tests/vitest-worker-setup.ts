import { join } from 'path'

const root = process.env.UPLOAD_DIR_ROOT
const workerId = process.env.VITEST_POOL_ID || process.env.VITEST_WORKER_ID || String(process.pid)
// 当前 fileParallelism:false 时实际只有一个 worker 目录；这层隔离是为并行化后仍成立而保留的。
if (root) process.env.UPLOAD_DIR = join(root, `worker-${workerId}`)
if (process.env.UPLOAD_DIR && !process.env.UPLOAD_DIR.includes('commission-test-uploads-')) {
  throw new Error('测试上传目录必须落在临时目录内，禁止指向真实 uploads/')
}
