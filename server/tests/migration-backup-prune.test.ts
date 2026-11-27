import { describe, it, expect, afterAll } from 'vitest'
// 先拉起共享模块图（init → migrate → migrations/index），避免 v36/v38 等「迁移 → migrate」反向依赖的循环求值
import '../src/db/init.js'
import Database from 'better-sqlite3'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { backupDbBeforeMigration } from '../src/db/migrate.js'

/**
 * XVA-1 回归：迁移备份保留策略曾按「版本号降序保留 3 份」实现，于是**版本回退/恢复旧库后再升级**时，
 * 刚产出的低版本快照会被当成最旧删掉（实测：目录已有 .bak.v80/83/84 → backup(43) 产出的 .bak.v43 被删），
 * 与「没有可回滚快照就不许跑破坏性迁移」的 fail-fast 承诺相反。
 * 修法：本次快照无条件保留，其余按版本号补足到 BAK_KEEP_COUNT 份。
 *
 * 用真文件库 + 真 backupDbBeforeMigration（VACUUM INTO 只对文件库生效），env.DB_PATH 指向临时目录。
 */

const tempRoot = mkdtempSync(join(tmpdir(), 'commission-bak-prune-'))

/** 每个用例独立目录 + 独立库文件，避免用例间文件残留互相污染 */
function createCase(): { dbPath: string; database: Database.Database; hasBackup: (version: number) => boolean; seedBackupFiles: (versions: number[]) => void } {
  const dir = mkdtempSync(join(tempRoot, 'case-'))
  const dbPath = join(dir, 'commission.db')
  const database = new Database(dbPath)
  database.exec('CREATE TABLE probe (id INTEGER PRIMARY KEY, note TEXT)')
  database.prepare("INSERT INTO probe (note) VALUES ('snapshot-me')").run()
  return {
    dbPath,
    database,
    hasBackup: (version: number) => existsSync(`${dbPath}.bak.v${version}`),
    // 预置历史备份文件（内容无所谓，保留策略只看文件名版本号）
    seedBackupFiles: (versions: number[]) => versions.forEach((v: number) => writeFileSync(`${dbPath}.bak.v${v}`, `bak-v${v}`))
  }
}

/** 在单次调用范围内切换 DB_PATH（backupDbBeforeMigration 调用时按 env 取路径） */
function withDbPathEnv<T>(dbPath: string, fn: () => T): T {
  const original = process.env.DB_PATH
  process.env.DB_PATH = dbPath
  try {
    return fn()
  } finally {
    if (original === undefined) delete process.env.DB_PATH
    else process.env.DB_PATH = original
  }
}

afterAll(() => {
  rmSync(tempRoot, { recursive: true, force: true })
})

describe('XVA-1 迁移备份保留策略：本次快照必留', () => {
  it('TC-XVA1-01: 目录已有 v80/83/84（版本回退再升级）→ backup(43) 的 .bak.v43 必须存活', () => {
    const { dbPath, database, hasBackup, seedBackupFiles } = createCase()
    seedBackupFiles([80, 83, 84])
    try {
      withDbPathEnv(dbPath, () => backupDbBeforeMigration(43, database))
      // 本次快照是保留核心：旧实现会把它当「最旧」删掉
      expect(hasBackup(43)).toBe(true)
      // 其余按版本号补足到 BAK_KEEP_COUNT=3 份：最近的两个 + 当前
      expect(hasBackup(84)).toBe(true)
      expect(hasBackup(83)).toBe(true)
      expect(hasBackup(80)).toBe(false)
    } finally {
      database.close()
    }
  })

  it('TC-XVA1-02: 正常单调升级（本次版本最大）→ 仍保留当前 + 最近两份', () => {
    const { dbPath, database, hasBackup, seedBackupFiles } = createCase()
    seedBackupFiles([80, 83, 84])
    try {
      withDbPathEnv(dbPath, () => backupDbBeforeMigration(86, database))
      expect(hasBackup(86)).toBe(true)
      expect(hasBackup(84)).toBe(true)
      expect(hasBackup(83)).toBe(true)
      expect(hasBackup(80)).toBe(false)
    } finally {
      database.close()
    }
  })

  it('TC-XVA1-03: 同版本重复备份（正文改过再跑）→ 只留一份，幂等不报错', () => {
    const { dbPath, database, hasBackup, seedBackupFiles } = createCase()
    seedBackupFiles([80, 83, 84])
    try {
      withDbPathEnv(dbPath, () => {
        backupDbBeforeMigration(43, database)
        expect(hasBackup(43)).toBe(true)
        expect(() => backupDbBeforeMigration(43, database)).not.toThrow()
      })
      expect(hasBackup(43)).toBe(true)
      expect(hasBackup(84)).toBe(true)
      expect(hasBackup(83)).toBe(true)
      expect(hasBackup(80)).toBe(false)
    } finally {
      database.close()
    }
  })
})
