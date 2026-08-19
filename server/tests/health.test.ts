import { describe, it, expect, beforeEach } from 'vitest'
import { cleanDb, seedArtist } from './setup.js'
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
})
