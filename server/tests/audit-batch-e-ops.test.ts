import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, existsSync, readFileSync, copyFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { gunzipSync } from 'zlib'
import Database from 'better-sqlite3'
import { backupUploads } from '../scripts/backup-uploads.js'
import { restoreDb, pickLatestBackup } from '../scripts/restore-db.js'
import { checkDbIntegrity } from '../scripts/check-db.js'

// ============================================
// 审计批E（R-6）运维脚本测试：
// uploads 备份（产物 + 7 份轮转）/ DB 恢复（成功留证 + 校验失败回滚）/ DB 健康探测三态
// ============================================

/** tar 条目：名称、大小、数据区偏移 */
interface TarEntry {
  name: string
  size: number
  offset: number
}

/** 解包 tar.gz 并列出 { name, size, offset }（offset 指向文件数据区，供内容断言） */
function listTarEntries(gzBuf: Buffer): TarEntry[] {
  const buf = gunzipSync(gzBuf)
  const entries: TarEntry[] = []
  let offset = 0
  while (offset + 512 <= buf.length) {
    const block = buf.subarray(offset, offset + 512)
    if (block.every(b => b === 0)) break
    const name = block.subarray(0, 100).toString('utf8').replace(/\0.*$/, '')
    const prefix = block.subarray(345, 500).toString('utf8').replace(/\0.*$/, '')
    const size = parseInt(block.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim(), 8)
    const full = prefix ? `${prefix}/${name}` : name
    entries.push({ name: full, size, offset: offset + 512 })
    offset += 512 + Math.ceil(size / 512) * 512
  }
  return entries
}

function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

describe('审计批E 运维脚本 (R-6)', () => {
  it('TC-OPS-01: backup-uploads 产出 tar.gz，包含全部文件（含回收站）且内容可读回', async () => {
    const uploadDir = tempDir('bkupload-')
    const backupDir = tempDir('bkbackup-')
    try {
      mkdirSync(join(uploadDir, 'images', '1'), { recursive: true })
      mkdirSync(join(uploadDir, 'deliverables', '2'), { recursive: true })
      mkdirSync(join(uploadDir, '.recycle-bin', '2026-08-01'), { recursive: true })
      writeFileSync(join(uploadDir, 'images', '1', 'a.png'), 'img-a')
      writeFileSync(join(uploadDir, 'deliverables', '2', 'b.psd'), 'deliv-b')
      writeFileSync(join(uploadDir, '.recycle-bin', '2026-08-01', 'old.png'), 'old')

      const result = await backupUploads({ uploadDir, backupDir })

      expect(result.path).toMatch(/uploads-\d{4}-.*\.tar\.gz$/)
      expect(existsSync(result.path)).toBe(true)
      expect(result.size).toBeGreaterThan(0)
      expect(result.files).toBe(3)

      const entries = listTarEntries(readFileSync(result.path))
      const names = entries.map(e => e.name).sort()
      expect(names).toEqual(['.recycle-bin/2026-08-01/old.png', 'deliverables/2/b.psd', 'images/1/a.png'].sort())
      const png = entries.find(e => e.name === 'images/1/a.png') as TarEntry
      const buf = gunzipSync(readFileSync(result.path))
      expect(buf.subarray(png.offset, png.offset + png.size).toString('utf8')).toBe('img-a')
    } finally {
      rmSync(uploadDir, { recursive: true, force: true })
      rmSync(backupDir, { recursive: true, force: true })
    }
  })

  it('TC-OPS-02: uploads 备份轮转——只保留最近 2 份，删最旧（2026-08-11 拍板）', async () => {
    const uploadDir = tempDir('bkupload-')
    const backupDir = tempDir('bkbackup-')
    try {
      mkdirSync(join(uploadDir, 'images'), { recursive: true })
      writeFileSync(join(uploadDir, 'images', 'x.png'), 'x')
      // 预置 8 份更旧的假归档（2020 年，字典序早于本次真实时间戳）
      for (let i = 1; i <= 8; i++) {
        const stamp = `2020-01-0${i}T00-00-00-000Z`
        writeFileSync(join(backupDir, `uploads-${stamp}.tar.gz`), 'fake')
      }

      await backupUploads({ uploadDir, backupDir })

      const baks = readdirSync(backupDir).filter(f => f.startsWith('uploads-')).sort()
      expect(baks).toHaveLength(2) // keep=2：仅留最新两份（本次真实归档 + 最新假归档）
      expect(baks[0]).toBe('uploads-2020-01-08T00-00-00-000Z.tar.gz')
      expect(baks[1].startsWith('uploads-2026-')).toBe(true) // 最新一份是本次真实归档
    } finally {
      rmSync(uploadDir, { recursive: true, force: true })
      rmSync(backupDir, { recursive: true, force: true })
    }
  })

  it('TC-OPS-03: restore-db 损坏目标库恢复成功，损坏原库留证', () => {
    const dir = tempDir('restore-')
    try {
      const backupPath = join(dir, 'good.bak')
      const dbPath = join(dir, 'commission.db')
      const good = new Database(backupPath)
      good.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)')
      good.prepare('INSERT INTO t (v) VALUES (?)').run('hello')
      good.close()
      writeFileSync(dbPath, 'this is not a sqlite database') // 损坏目标

      const result = restoreDb({ dbPath, backupDir: dir, backupFile: backupPath })

      expect(result.restoredFrom).toBe(backupPath)
      expect(result.preRestorePath).toBeTruthy()
      expect(existsSync(result.preRestorePath as string)).toBe(true)
      const check = new Database(dbPath, { readonly: true })
      expect((check.prepare('SELECT v FROM t').get() as { v: string }).v).toBe('hello')
      check.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('TC-OPS-04: restore-db 校验失败回滚——原库不变、无留证/复制残留', () => {
    const dir = tempDir('restore-')
    try {
      const dbPath = join(dir, 'commission.db')
      const good = new Database(dbPath)
      good.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)')
      good.prepare('INSERT INTO t (v) VALUES (?)').run('original')
      good.close()
      // 造「可打开但 integrity_check 失败」的坏备份：翻转文件中段字节（页面校验和失效），
      // 覆盖校验失败回滚路径（打开即抛的垃圾文件属另一边界，Linux 容器无 Windows 句柄语义）
      const badBackup = join(dir, 'bad.bak')
      copyFileSync(dbPath, badBackup)
      const buf = readFileSync(badBackup)
      buf[Math.floor(buf.length / 2)] ^= 0xff
      writeFileSync(badBackup, buf)

      expect(() => restoreDb({ dbPath, backupDir: dir, backupFile: badBackup })).toThrow(/integrity_check/)

      const check = new Database(dbPath, { readonly: true })
      expect((check.prepare('SELECT v FROM t').get() as { v: string }).v).toBe('original')
      check.close()
      expect(readdirSync(dir).filter(f => f.includes('bak-pre-restore'))).toHaveLength(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('TC-OPS-05: pickLatestBackup 取最新 commission.db.bak-*（忽略 uploads 归档）', () => {
    const dir = tempDir('backup-pick-')
    try {
      writeFileSync(join(dir, 'commission.db.bak-2026-08-01T00-00-00-000Z'), 'a')
      writeFileSync(join(dir, 'commission.db.bak-2026-08-10T00-00-00-000Z'), 'b')
      writeFileSync(join(dir, 'uploads-2026-08-10T00-00-00-000Z.tar.gz'), 'c')

      expect(pickLatestBackup(dir)).toBe(join(dir, 'commission.db.bak-2026-08-10T00-00-00-000Z'))
      expect(pickLatestBackup(join(dir, 'nope'))).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('TC-OPS-06: check-db 三态——健康 ok / 损坏非 ok / 缺失非 ok', () => {
    const dir = tempDir('checkdb-')
    try {
      const goodPath = join(dir, 'good.db')
      const good = new Database(goodPath)
      good.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)')
      good.close()
      expect(checkDbIntegrity(goodPath)).toEqual({ ok: true, reason: 'ok' })

      const badPath = join(dir, 'bad.db')
      writeFileSync(badPath, 'garbage')
      const bad = checkDbIntegrity(badPath)
      expect(bad.ok).toBe(false)
      expect(bad.reason).toBeTruthy()

      const missing = checkDbIntegrity(join(dir, 'missing.db'))
      expect(missing.ok).toBe(false)
      expect(missing.reason).toContain('不存在')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('TC-OPS-07: 最新备份损坏时自动降级到更早一份（815-P2 部署#4 自愈多候选）', () => {
    const dir = tempDir('restore-fallback-')
    try {
      // 旧备份（有效 sqlite）+ 新备份（垃圾字节），字典序新 > 旧
      const olderPath = join(dir, 'commission.db.bak-2026-08-15T00-00-00-000Z')
      const good = new Database(olderPath)
      good.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)')
      good.prepare('INSERT INTO t (v) VALUES (?)').run('older-backup')
      good.close()
      const newerPath = join(dir, 'commission.db.bak-2026-08-16T00-00-00-000Z')
      writeFileSync(newerPath, 'garbage newest backup')
      const dbPath = join(dir, 'commission.db')
      writeFileSync(dbPath, 'corrupted target')

      const result = restoreDb({ dbPath, backupDir: dir })

      expect(result.restoredFrom).toBe(olderPath)
      const check = new Database(dbPath, { readonly: true })
      expect((check.prepare('SELECT v FROM t').get() as { v: string }).v).toBe('older-backup')
      check.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('TC-OPS-08: 全部候选备份均损坏 → 报错退出（不隐式降级到异名备份）', () => {
    const dir = tempDir('restore-allbad-')
    try {
      writeFileSync(join(dir, 'commission.db.bak-2026-08-15T00-00-00-000Z'), 'garbage-a')
      writeFileSync(join(dir, 'commission.db.bak-2026-08-16T00-00-00-000Z'), 'garbage-b')
      const dbPath = join(dir, 'commission.db')
      writeFileSync(dbPath, 'corrupted target')

      expect(() => restoreDb({ dbPath, backupDir: dir })).toThrow(/全部候选备份均不可用/)
      // 原库保持不动（未被坏备份覆盖）
      expect(readFileSync(dbPath, 'utf8')).toBe('corrupted target')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
