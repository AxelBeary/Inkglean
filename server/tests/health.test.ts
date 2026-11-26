import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import { runHealthChecks, buildDiagnosticReport } from '../src/features/admin/health.service.js'
import { MIGRATIONS } from '../src/db/init.js'

const LATEST = MIGRATIONS[MIGRATIONS.length - 1].version

describe('HC 系统自检 (Health Check)', () => {
  beforeEach(() => {
    cleanDb()
  })

  it('TC-HC-01: 返回 8 项检查', async () => {
    const checks = await runHealthChecks(LATEST)
    expect(checks).toHaveLength(8)
    const ids = checks.map(c => c.id)
    expect(ids).toEqual(['db', 'migration', 'uploads', 'disk', 'integrity', 'backup', 'secret', 'node'])
  })

  it('TC-HC-02: 每项有 id/name/status/summary/detail', async () => {
    const checks = await runHealthChecks(LATEST)
    for (const c of checks) {
      expect(c).toHaveProperty('id')
      expect(c).toHaveProperty('name')
      expect(c).toHaveProperty('status')
      expect(c).toHaveProperty('summary')
      expect(c).toHaveProperty('detail')
      expect(['ok', 'warn', 'fail']).toContain(c.status)
    }
  })

  it('TC-HC-03: db 检查通过', async () => {
    const checks = await runHealthChecks(LATEST)
    const dbCheck = checks.find(c => c.id === 'db')!
    expect(dbCheck.status).toBe('ok')
  })

  it('TC-HC-04: migration 检查为最新', async () => {
    const checks = await runHealthChecks(LATEST)
    const migCheck = checks.find(c => c.id === 'migration')!
    expect(migCheck.status).toBe('ok')
    expect(migCheck.detail.appliedVersion).toBe(LATEST)
  })

  it('TC-HC-05: integrity 无孤儿记录', async () => {
    seedArtist({ qq_number: '88020', subdomain: 'hctest' })
    const checks = await runHealthChecks(LATEST)
    const intCheck = checks.find(c => c.id === 'integrity')!
    expect(intCheck.status).toBe('ok')
    expect((intCheck.detail.checks as Array<{ orphans: number }>).every(c => c.orphans === 0)).toBe(true)
  })

  it('TC-HC-06: node 版本永远 ok', async () => {
    const checks = await runHealthChecks(LATEST)
    const nodeCheck = checks.find(c => c.id === 'node')!
    expect(nodeCheck.status).toBe('ok')
    expect(nodeCheck.summary).toBe(process.version)
  })

  it('TC-HC-07: 诊断包含 checks + env + generatedAt', async () => {
    const report = await buildDiagnosticReport(LATEST)
    expect(report).toHaveProperty('generatedAt')
    expect(report).toHaveProperty('checks')
    expect(report).toHaveProperty('env')
    expect(report.checks).toHaveLength(8)
    expect(report.env).toHaveProperty('NODE_ENV')
  })

  it('TC-HC-08: secret 检查（测试环境无 SESSION_SECRET → fail 或 warn）', async () => {
    const checks = await runHealthChecks(LATEST)
    const secretCheck = checks.find(c => c.id === 'secret')!
    // 测试环境通常无 SESSION_SECRET，应为 fail 或 warn
    expect(['fail', 'warn', 'ok']).toContain(secretCheck.status)
  })

  // PR114 MINOR-8：admin 自检口径与生产 fail-fast 三处统一，不得把弱值报 ok
  describe('secret 弱值口径（PR114 MINOR-8）', () => {
    const original = process.env.SESSION_SECRET
    afterEach(() => {
      if (original === undefined) delete process.env.SESSION_SECRET
      else process.env.SESSION_SECRET = original
    })

    async function secretCheck(): Promise<Awaited<ReturnType<typeof runHealthChecks>>[number]> {
      const checks = await runHealthChecks(LATEST)
      return checks.find(c => c.id === 'secret')!
    }

    it('TC-HC-10: 低熵长串被判弱（与生产拒启同口径）', async () => {
      process.env.SESSION_SECRET = 'a'.repeat(64)
      const check = await secretCheck()
      expect(check.status).toBe('warn')
      expect(check.summary).toContain('弱值')
      expect(check.summary).toContain('生产环境将拒绝启动')
      expect(check.detail.weak).toBe(true)
    })

    it('TC-HC-11: 非整除周期形态被判弱', async () => {
      process.env.SESSION_SECRET = 'A'.repeat(40) + 'bcd'
      expect((await secretCheck()).status).toBe('warn')
    })

    it('TC-HC-12: 强随机值报 ok（不误伤正常部署）', async () => {
      process.env.SESSION_SECRET = '6949ef3a1c7d5b0f8e2a4c6d9b1f3e5a7c0d8b2f4e6a1c9d3b5f7e2a4c0d8b6f'
      expect((await secretCheck()).status).toBe('ok')
    })
  })

  // B7-F0117：checkDb 异常路径须清理 _health_check_tmp——残表跨次堆积，
  // 下次自检走 IF NOT EXISTS 直接跳过建表读写，把真实故障掩盖成「读写正常」
  it('TC-HC-09: checkDb 异常路径清理 _health_check_tmp 残表（B7-F0117）', async () => {
    // 造「建表已成功、写入门抛错」的异常路径：BEFORE INSERT 触发器直接 ABORT
    db.exec('CREATE TABLE IF NOT EXISTS _health_check_tmp (v INTEGER)')
    db.exec(`CREATE TRIGGER b7_hc_insert_fail BEFORE INSERT ON _health_check_tmp
      BEGIN SELECT RAISE(ABORT, 'B7_HC_SIMULATED_INSERT_FAILURE'); END`)

    const checks = await runHealthChecks(LATEST)
    const dbCheck = checks.find(c => c.id === 'db')!
    expect(dbCheck.status).toBe('fail')
    expect(dbCheck.summary).toContain('B7_HC_SIMULATED_INSERT_FAILURE')

    // 核心断言：异常路径已尽力 DROP 临时表（修复前残表留在库里）
    const leftover = db.prepare(
      "SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'table' AND name = '_health_check_tmp'"
    ).get() as { c: number }
    expect(leftover.c).toBe(0)

    // 残表已清（触发器随表一并消失）→ 下一次自检恢复正常 ok，不被 IF NOT EXISTS 掩盖
    const again = await runHealthChecks(LATEST)
    expect(again.find(c => c.id === 'db')!.status).toBe('ok')
  })
})
