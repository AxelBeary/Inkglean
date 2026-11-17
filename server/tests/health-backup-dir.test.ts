/**
 * U044 备份健康检查盲区回归
 *
 * 缺陷：checkBackup() 扫的是 DATA_DIR（由 DB_PATH 推出、readdirSync 非递归），而正式备份写在
 * BACKUP_DIR（默认 <数据目录>/backups）。修复前本文件用例必红：子目录里的备份扫不到 →
 * 「未找到备份文件」；且返回结构没有 state 字段，区分不了「从未备份」与「备份失败」。
 *
 * 全部用例用 os 临时目录，不碰真实 data/。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { cleanDb } from './setup.js'
import { runHealthChecks } from '../src/features/admin/health.service.js'
import { isDbBackupFile, resolveBackupDir } from '../src/shared/backup-paths.js'
import { MIGRATIONS } from '../src/db/init.js'

const LATEST = MIGRATIONS[MIGRATIONS.length - 1].version
const ORIGINAL_BACKUP_DIR = process.env.BACKUP_DIR

/** 正式每日档命名（backup-db.ts:56 的 officialBackupRe 形状） */
const DAILY_BACKUP = 'commission.db.bak-2026-09-01T03-30-00-000Z'

let tmpRoot: string

beforeEach(() => {
  cleanDb()
  tmpRoot = mkdtempSync(join(tmpdir(), 'commission-test-backup-'))
})

afterEach(() => {
  if (ORIGINAL_BACKUP_DIR === undefined) delete process.env.BACKUP_DIR
  else process.env.BACKUP_DIR = ORIGINAL_BACKUP_DIR
  rmSync(tmpRoot, { recursive: true, force: true })
})

async function backupCheck() {
  const checks = await runHealthChecks(LATEST)
  const check = checks.find(c => c.id === 'backup')
  expect(check).toBeDefined()
  return check!
}

describe('U044 备份健康检查扫真实备份目录', () => {
  it('TC-U044-01: BACKUP_DIR 下的新备份被识别为最新备份', async () => {
    const dir = join(tmpRoot, 'backups')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, DAILY_BACKUP), 'fake-snapshot')
    process.env.BACKUP_DIR = dir

    const check = await backupCheck()
    // 修复前：只扫 DATA_DIR（测试里是 server/），子目录这份永远看不到
    expect(check.detail.latestFile).toBe(DAILY_BACKUP)
    expect(check.detail.latestPath).toBe(join(dir, DAILY_BACKUP))
    expect(check.detail.state).toBe('ok')
    expect(check.status).toBe('ok')
  })

  it('TC-U044-02: 未设 BACKUP_DIR 时健康检查取 <数据目录>/backups（与 backup-db.ts 同一口径）', async () => {
    delete process.env.BACKUP_DIR

    const check = await backupCheck()
    // 修复前这里根本不会出现 backupDir 字段，也就无从证明「写」与「看」同源
    expect(check.detail.backupDir).toBe(join(check.detail.path as string, 'backups'))
  })

  it('TC-U044-03: 备份目录不存在不抛错，报「从未备份」', async () => {
    process.env.BACKUP_DIR = join(tmpRoot, 'never-created')

    const check = await backupCheck()
    expect(check.status).toBe('warn')
    expect(check.detail.state).toBe('never')
    expect(check.detail.backupDirExists).toBe(false)
    expect(check.detail.backupDir).toBe(join(tmpRoot, 'never-created'))
    expect(check.summary).toContain('从未')
  })

  it('TC-U044-04: 备份目录在但没有产物 → 「备份失败」，与「从未备份」可区分', async () => {
    const dir = join(tmpRoot, 'empty-backups')
    mkdirSync(dir, { recursive: true }) // backup-db.ts 先 mkdirSync 再 VACUUM INTO，失败就只剩空目录
    process.env.BACKUP_DIR = dir

    const check = await backupCheck()
    expect(check.status).toBe('warn')
    expect(check.detail.state).toBe('failed')
    expect(check.detail.backupDirExists).toBe(true)
    expect(check.summary).not.toContain('从未')
  })

  it('TC-U044-05: 备份目录里的日志/上传包不算备份产物', async () => {
    const dir = join(tmpRoot, 'logs-only')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'daily-backup.log'), 'log')
    writeFileSync(join(dir, 'deploy.log'), 'log')
    writeFileSync(join(dir, 'uploads-2026-09-01T03-30-00-000Z.tar.gz'), 'tgz')
    process.env.BACKUP_DIR = dir

    const check = await backupCheck()
    expect(check.detail.state).toBe('failed')
  })

  it('TC-U044-06: 超过 7 天的备份报 stale（仍指出是哪一份）', async () => {
    const dir = join(tmpRoot, 'stale')
    mkdirSync(dir, { recursive: true })
    const file = join(dir, DAILY_BACKUP)
    writeFileSync(file, 'fake-snapshot')
    const old = new Date(Date.now() - 8 * 86400000)
    utimesSync(file, old, old)
    process.env.BACKUP_DIR = dir

    const check = await backupCheck()
    expect(check.status).toBe('warn')
    expect(check.detail.state).toBe('stale')
    expect(check.detail.latestFile).toBe(DAILY_BACKUP)
  })

  it('TC-U044-07: resolveBackupDir 口径——BACKUP_DIR 优先，默认 <数据目录>/backups', () => {
    const dataDir = join(tmpRoot, 'data')
    delete process.env.BACKUP_DIR
    expect(resolveBackupDir(dataDir)).toBe(join(dataDir, 'backups'))
    process.env.BACKUP_DIR = join(tmpRoot, 'custom')
    expect(resolveBackupDir(dataDir)).toBe(join(tmpRoot, 'custom'))
    process.env.BACKUP_DIR = ''
    expect(resolveBackupDir(dataDir)).toBe(join(dataDir, 'backups')) // 空串按未设置
  })

  it('TC-U044-08: 正式档位命名（.bak-）与迁移备份（.bak.vN）都认，日志类不认', () => {
    // 旧口径 f.includes('.bak.') 认不出正式备份 .bak-<ISO>——这正是盲区的第二半
    expect(isDbBackupFile(DAILY_BACKUP)).toBe(true)
    expect(isDbBackupFile('commission.db.bak-deploy-2026-09-01T03-30-00-000Z')).toBe(true)
    expect(isDbBackupFile('commission.db.bak-weekly-2026-09-01T03-30-00-000Z')).toBe(true)
    expect(isDbBackupFile('commission.db.bak.v64')).toBe(true)
    expect(isDbBackupFile('commission.db')).toBe(false)
    expect(isDbBackupFile('daily-backup.log')).toBe(false)
    expect(isDbBackupFile('uploads-2026-09-01T03-30-00-000Z.tar.gz')).toBe(false)
  })
})
