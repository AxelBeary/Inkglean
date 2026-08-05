// 安全加固批 F4: AUTH_DEV_MODE 生产环境 fail-fast
// 参照 init-failfast.test.js 模式（P1-4 ADMIN_QQ fail-fast）：
// vitest 注入 NODE_ENV=test，fail-fast 只对 production 生效，测试手动切 production 验证，afterEach 恢复。
import { describe, it, expect, afterEach, vi } from 'vitest'

const ORIGINAL_NODE_ENV = process.env.NODE_ENV
const ORIGINAL_DEV_MODE = process.env.AUTH_DEV_MODE

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV
  if (ORIGINAL_DEV_MODE === undefined) delete process.env.AUTH_DEV_MODE
  else process.env.AUTH_DEV_MODE = ORIGINAL_DEV_MODE
})

describe('安全加固批 F4: AUTH_DEV_MODE 生产 fail-fast', () => {
  // resetModules 清模块缓存后重新 import——auth.service 模块级执行 fail-fast 检查
  const loadAuthService = () => {
    vi.resetModules()
    return import('../src/features/auth/auth.service.js')
  }

  it('TC-FF4-01: 生产环境 AUTH_DEV_MODE=true → 模块加载即抛错', async () => {
    process.env.NODE_ENV = 'production'
    process.env.AUTH_DEV_MODE = 'true'
    await expect(loadAuthService()).rejects.toThrow(/AUTH_DEV_MODE=true 不允许在生产环境启用/)
  })

  it('TC-FF4-02: 生产环境 AUTH_DEV_MODE=false → 正常加载（不误伤）', async () => {
    process.env.NODE_ENV = 'production'
    process.env.AUTH_DEV_MODE = 'false'
    const mod = await loadAuthService()
    expect(mod.isDevAuth).toBe(false)
  })

  it('TC-FF4-03: 开发环境 AUTH_DEV_MODE=true → 正常加载（保持原行为）', async () => {
    process.env.NODE_ENV = 'development'
    process.env.AUTH_DEV_MODE = 'true'
    const mod = await loadAuthService()
    expect(mod.isDevAuth).toBe(true)
  })
})
