// 0818 用户拍板方案 A：系统更新检查（只读面板）
// 覆盖：当前版本读部署标记文件（缺失降级 unknown）；GitHub 拉取成功/失败/异常三态；
//       缓存（TTL 内不重拉 + force 绕过）；路由结构 + upToDate 三态（一致/落后/无法对比）；非管理员 403
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { writeFileSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { db, cleanDb, seedArtist } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import * as versionService from '../src/features/admin/version.service.js'
import { buildApp } from '../src/app.js'

const GITHUB_OK = {
  sha: 'abcdef1234567890abcdef1234567890abcdef12',
  commit: { committer: { date: '2026-08-18T10:00:00Z' } }
}

function setAdmin(qqNumber) {
  db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run(qqNumber)
  return seedArtist({ qq_number: qqNumber, subdomain: `admin-${qqNumber.slice(-4)}` })
}

describe('version.service 更新检查（0818 方案 A）', () => {
  let tmpDir
  const realFetch = global.fetch

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'version-test-'))
    versionService._resetLatestCache()
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => GITHUB_OK })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    delete process.env.VERSION_FILE
    delete process.env.APP_COMMIT
    versionService._resetLatestCache()
    global.fetch = realFetch
  })

  it('TC-VER-01: 部署标记文件存在 → 读出 commit/deployedAt，version 来自 package.json', () => {
    const marker = join(tmpDir, 'version.json')
    writeFileSync(marker, JSON.stringify({ commit: 'abc1234', deployedAt: '2026-08-18T10:00:00Z' }))
    process.env.VERSION_FILE = marker

    const cur = versionService.getCurrentVersion()
    expect(cur.commit).toBe('abc1234')
    expect(cur.deployedAt).toBe('2026-08-18T10:00:00Z')
    expect(cur.version).toMatch(/^\d+\.\d+\.\d+/) // server/package.json 真实版本
  })

  it('TC-VER-02: 标记文件缺失/损坏 → commit 降级 unknown（env APP_COMMIT 次兜底）', () => {
    process.env.VERSION_FILE = join(tmpDir, 'not-exist.json')
    expect(versionService.getCurrentVersion().commit).toBe('unknown')

    process.env.APP_COMMIT = 'envcommit'
    expect(versionService.getCurrentVersion().commit).toBe('envcommit')

    const broken = join(tmpDir, 'broken.json')
    writeFileSync(broken, '{不是JSON')
    process.env.VERSION_FILE = broken
    delete process.env.APP_COMMIT
    expect(versionService.getCurrentVersion().commit).toBe('unknown')
  })

  it('TC-VER-03: GitHub 拉取成功 → ok:true 带 sha/date', async () => {
    const latest = await versionService.getLatestCommit()
    expect(latest).toEqual({ ok: true, sha: GITHUB_OK.sha, date: '2026-08-18T10:00:00Z' })
  })

  it('TC-VER-04: 非 200 / 网络异常 → ok:false 不抛错', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) })
    versionService._resetLatestCache()
    expect((await versionService.getLatestCommit()).ok).toBe(false)

    global.fetch = vi.fn().mockRejectedValue(new Error('network down'))
    versionService._resetLatestCache()
    expect((await versionService.getLatestCommit()).ok).toBe(false)
  })

  it('TC-VER-05: TTL 内走缓存不重拉；force=1 绕过缓存', async () => {
    await versionService.getLatestCommit()
    await versionService.getLatestCommit()
    expect(global.fetch).toHaveBeenCalledTimes(1)

    await versionService.getLatestCommit(true)
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })
})

describe('GET /api/admin/system/version 路由', () => {
  let app
  let admin
  let tmpDir
  const realFetch = global.fetch

  beforeAll(async () => {
    app = await buildApp({ logger: false })
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    cleanDb()
    tmpDir = mkdtempSync(join(tmpdir(), 'version-route-'))
    admin = setAdmin('10003')
    versionService._resetLatestCache()
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => GITHUB_OK })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    delete process.env.VERSION_FILE
    versionService._resetLatestCache()
    global.fetch = realFetch
  })

  function headers() {
    return { Authorization: `Bearer ${createSession(admin.id, admin.token_version, { authLevel: 'admin_verified', adminVerifiedAt: Date.now() })}` }
  }

  it('TC-VER-06: commit 与 GitHub 一致 → upToDate=true', async () => {
    const marker = join(tmpDir, 'version.json')
    writeFileSync(marker, JSON.stringify({ commit: GITHUB_OK.sha, deployedAt: '2026-08-18T10:00:00Z' }))
    process.env.VERSION_FILE = marker

    const res = await app.inject({ method: 'GET', url: '/api/admin/system/version', headers: headers() })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.upToDate).toBe(true)
    expect(body.current.commit).toBe(GITHUB_OK.sha)
    expect(body.latest.ok).toBe(true)
    expect(body.repoUrl).toBe('https://github.com/AxelBeary/Inkglean')
  })

  it('TC-VER-07: commit 落后 → upToDate=false；本地 commit 未知 → upToDate=null', async () => {
    const marker = join(tmpDir, 'version.json')
    writeFileSync(marker, JSON.stringify({ commit: 'old-commit-sha' }))
    process.env.VERSION_FILE = marker

    const behind = await app.inject({ method: 'GET', url: '/api/admin/system/version', headers: headers() })
    expect(behind.json().upToDate).toBe(false)

    // 换无标记文件环境：commit=unknown → 无法对比
    versionService._resetLatestCache()
    process.env.VERSION_FILE = join(tmpDir, 'not-exist.json')
    const unknown = await app.inject({ method: 'GET', url: '/api/admin/system/version?force=1', headers: headers() })
    expect(unknown.json().upToDate).toBe(null)
  })

  it('TC-VER-08: 非管理员访问 → 403', async () => {
    const plain = seedArtist({ qq_number: '88070', subdomain: 'ver-plain' })
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/system/version',
      headers: { Authorization: `Bearer ${createSession(plain.id, plain.token_version)}` }
    })
    expect(res.statusCode).toBe(403)
  })
})
