import { describe, it, expect } from 'vitest'
import { assertSeedAllowed } from '../src/db/seed.js'

// L-6（审计 四#3）: seed 无环境守卫——误跑生产会删除价格数据并覆盖管理员配置
describe('seed 环境守卫 (L-6)', () => {
  it('TC-SEED-G1: NODE_ENV=production 默认拒绝，--force-production 显式放行', () => {
    // 生产 + 无显式参数 → 拒绝（不会触碰数据库）
    expect(() => assertSeedAllowed({ NODE_ENV: 'production' }, [])).toThrow('SEED_BLOCKED_IN_PRODUCTION')
    // 生产 + --force-production → 放行（console.warn 已在实现内说明后果）
    expect(() => assertSeedAllowed({ NODE_ENV: 'production' }, ['node', 'seed.ts', '--force-production'])).not.toThrow()
    // 开发环境不受影响
    expect(() => assertSeedAllowed({ NODE_ENV: 'development' }, [])).not.toThrow()
    expect(() => assertSeedAllowed({}, [])).not.toThrow()
  })
})
