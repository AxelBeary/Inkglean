import { join } from 'path'

const root = process.env.UPLOAD_DIR_ROOT
const workerId = process.env.VITEST_POOL_ID || process.env.VITEST_WORKER_ID || String(process.pid)
if (root) process.env.UPLOAD_DIR = join(root, `worker-${workerId}`)
