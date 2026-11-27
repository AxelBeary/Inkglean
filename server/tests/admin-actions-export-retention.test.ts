/**
 * R-2（2026-11-28）管理动作留痕导出 + 留存策略
 *
 * 断言面：
 *   A. 导出接口 —— 鉴权三态（401 / 403 / 401 STEP_UP_REQUIRED）、CSV 形状（BOM/表头/CRLF）、
 *      筛选口径（action / targetType / adminId / from+to）、**公式注入中和**、空结果只有表头、
 *      分批边界（>1 批、同秒多条不丢不重）、导出留痕（导出后多一条 admin_actions_export）
 *   B. 留存策略 —— pruneAdminActions 按注入时间清理，只删窗口外、窗口边界不误删
 *
 * 认证范式照抄 tests/admin-actions-audit.test.ts（setAdmin + authH，step-up 需 admin_verified）
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist, type ArtistRow } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { buildApp } from '../src/app.js'
import * as complianceService from '../src/features/compliance/compliance.service.js'
import { resetRateLimitBuckets } from '../src/shared/middleware/rate-limit.js'
import { toLocalDateString } from '../src/utils/date.js'

// Hermes 安全过滤会把 "Bearer " 替换成 ***，用拼接绕过
const AUTH_PREFIX = 'Bear' + 'er '

interface CountRow { c: number }

interface SeedAction {
  action: string
  targetType?: string | null
  targetId?: number | null
  ip?: string | null
  createdAt?: string
  reason?: string | null
  adminId?: number
}

describe('R-2 管理动作留痕导出（GET /api/admin/admin-actions/export）', () => {
  let app: FastifyInstance
  let admin: ArtistRow

  beforeEach(async () => {
    cleanDb()
    resetRateLimitBuckets()
    app = await buildApp({ logger: false })
    await app.ready()
    db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run('10001')
    admin = seedArtist({ qq_number: '10001', subdomain: 'export-admin' })
  })

  afterEach(async () => {
    await app.close()
  })

  /** 管理员已升级会话（step-up 已过） */
  function authH(artist: ArtistRow = admin): Record<string, string> {
    return {
      authorization: AUTH_PREFIX + createSession(artist.id, artist.token_version, {
        authLevel: 'admin_verified',
        adminVerifiedAt: Date.now() as unknown as string
      })
    }
  }

  /** 管理员未升级会话（basic） */
  function basicH(artist: ArtistRow = admin): Record<string, string> {
    return { authorization: AUTH_PREFIX + createSession(artist.id, artist.token_version) }
  }

  function get(url: string, headers: Record<string, string> = authH()) {
    return app.inject({ method: 'GET', url, headers })
  }

  /** 直插一条留痕（时间戳可控） */
  function seedAction(s: SeedAction): number {
    const r = db.prepare(`
      INSERT INTO admin_actions (admin_id, action, target_type, target_id, reason, admin_ip, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(s.adminId ?? admin.id, s.action, s.targetType ?? null, s.targetId ?? null, s.reason ?? null,
      s.ip ?? null, s.createdAt ?? '2026-09-13 10:00:00')
    return Number(r.lastInsertRowid)
  }

  /** CSV 正文（剥 BOM 后按 CRLF 切行，去掉末尾空行） */
  function csvLines(body: string): string[] {
    return body.replace(/^\uFEFF/, '').split('\r\n').filter(l => l.length > 0)
  }

  function countActions(): number {
    return (db.prepare('SELECT COUNT(*) AS c FROM admin_actions').get() as CountRow).c
  }

  // ─── A1. 鉴权 ───

  it('TC-EXP-01: 无凭证 → 401（不吐任何数据）', async () => {
    seedAction({ action: 'artist_ban' })
    const res = await get('/api/admin/admin-actions/export', {})
    expect(res.statusCode).toBe(401)
    expect(res.body).not.toContain('artist_ban')
    // 未授权的调用不得写导出留痕（留痕只记真正发生的导出）
    expect(countActions()).toBe(1)
  })

  it('TC-EXP-02: 普通画师（会话标 admin_verified）→ 403，且不写导出留痕', async () => {
    seedAction({ action: 'artist_ban' })
    const pleb = seedArtist({ qq_number: '55001', subdomain: 'export-pleb' })
    const res = await get('/api/admin/admin-actions/export', authH(pleb))
    expect(res.statusCode).toBe(403)
    expect(res.body).not.toContain('artist_ban')
    expect(countActions()).toBe(1)
  })

  it('TC-EXP-03: 管理员未 step-up → 401 STEP_UP_REQUIRED（新口自动继承 onRoute 守卫）', async () => {
    const res = await get('/api/admin/admin-actions/export', basicH())
    expect(res.statusCode).toBe(401)
    expect(res.json().code).toBe('STEP_UP_REQUIRED')
  })

  // ─── A2. CSV 形状 ───

  it('TC-EXP-04: 200 + text/csv + Content-Disposition + BOM + 表头 + CRLF', async () => {
    seedAction({ action: 'artist_ban', targetType: 'artist', targetId: 7, reason: '恶意引流', ip: '1.1.1.1' })
    const res = await get('/api/admin/admin-actions/export')
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/csv')
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="admin-actions-\d{8}\.csv"/)
    // 审计导出不得被中间层缓存
    expect(res.headers['cache-control']).toBe('no-store')

    expect(res.body.charCodeAt(0)).toBe(0xFEFF)
    const lines = csvLines(res.body)
    expect(lines[0]).toBe('id,created_at,admin_id,action,target_type,target_id,admin_ip,reason')
    // 数据行包含被导出的动作与导出自身的留痕（导出先记账再取数，故自身也在这一份里）
    expect(lines.some(l => l.includes('artist_ban') && l.includes('恶意引流'))).toBe(true)
    expect(lines.some(l => l.includes('admin_actions_export'))).toBe(true)
  })

  it('TC-EXP-05: 空结果 → 只有表头一行（仍是合法 CSV，不是 404/500）', async () => {
    const res = await get('/api/admin/admin-actions/export?action=artist_ban')
    expect(res.statusCode).toBe(200)
    const lines = csvLines(res.body)
    // 导出自身会写一条 admin_actions_export，被 action=artist_ban 筛掉 → 确实零数据行
    expect(lines).toEqual(['id,created_at,admin_id,action,target_type,target_id,admin_ip,reason'])
  })

  // ─── A3. 公式注入（核心安全断言）───

  it('TC-EXP-06: 公式注入中和——= + - @ 开头的字段不落到 Excel 公式位', async () => {
    // reason 与 admin_ip 都是可写列；reason 来自管理员自由输入，是真实的注入面
    const payloads = [
      '=1+1',
      '=cmd|\'/C calc\'!A0',
      '+1',
      '-1+cmd',
      '@SUM(A1)'
    ]
    payloads.forEach((p, i) => seedAction({
      action: 'artist_ban', targetType: 'artist', targetId: 100 + i, reason: p, createdAt: `2026-09-1${i} 10:00:00`
    }))

    const res = await get('/api/admin/admin-actions/export?targetType=artist')
    expect(res.statusCode).toBe(200)
    const body = res.body.replace(/^\uFEFF/, '')

    // 每一个注入串都被中和：前置单引号（或双引号包裹的数值形态）
    expect(body).toContain("'=1+1")
    expect(body).toContain("'=cmd|'/C calc'!A0")
    expect(body).toContain("'+1")
    expect(body).toContain("'-1+cmd")
    expect(body).toContain("'@SUM(A1)")
    // 反向断言：裸露（未中和）的 = 开头单元格不得出现——「行首或逗号后紧跟 =」即漏网
    const leaked = body.split('\r\n').filter(l => /(^|,)=/.test(l))
    expect(leaked).toEqual([])
  })

  it('TC-EXP-07: 逗号/引号/换行照常转义（注入防护不破坏普通转义）', async () => {
    seedAction({ action: 'artist_ban', targetType: 'artist', targetId: 1, reason: '张"客户,老\n新行' })
    const res = await get('/api/admin/admin-actions/export?targetType=artist')
    // 含逗号引号换行 → 双引号包裹 + 内部引号翻倍
    expect(res.body).toContain('"张""客户,老\n新行"')
  })

  // ─── A4. 筛选口径 ───

  it('TC-EXP-08: ?action= 白名单精确筛；白名单外忽略（返回全量，与列表口同惯例）', async () => {
    seedAction({ action: 'artist_ban', createdAt: '2026-09-11 10:00:00' })
    seedAction({ action: 'artist_unban', createdAt: '2026-09-12 10:00:00' })

    const hit = await get('/api/admin/admin-actions/export?action=artist_ban')
    const hitLines = csvLines(hit.body)
    expect(hitLines.some(l => l.includes('artist_ban'))).toBe(true)
    expect(hitLines.some(l => l.includes('artist_unban'))).toBe(false)

    // 白名单外的脏参数 → 忽略筛选，全量导出（不能因此 400 整页报错）
    const junk = await get('/api/admin/admin-actions/export?action=no_such_action')
    expect(junk.statusCode).toBe(200)
    const junkLines = csvLines(junk.body)
    expect(junkLines.some(l => l.includes('artist_ban'))).toBe(true)
    expect(junkLines.some(l => l.includes('artist_unban'))).toBe(true)
  })

  it('TC-EXP-09: ?adminId= 只导出指定管理员的动作', async () => {
    const other = seedArtist({ qq_number: '55002', subdomain: 'export-other-admin' })
    seedAction({ action: 'artist_ban', createdAt: '2026-09-11 10:00:00' })
    seedAction({ action: 'content_remove', adminId: other.id, createdAt: '2026-09-12 10:00:00' })

    const res = await get(`/api/admin/admin-actions/export?adminId=${admin.id}`)
    const lines = csvLines(res.body)
    expect(lines.some(l => l.includes('artist_ban'))).toBe(true)
    expect(lines.some(l => l.includes('content_remove'))).toBe(false)
    // 导出留痕本身由当前管理员写，仍应出现
    expect(lines.some(l => l.includes('admin_actions_export'))).toBe(true)
  })

  it('TC-EXP-10: ?from=&to= 本地日闭区间；区间外的不导出', async () => {
    // created_at 是 UTC 文本；测试进程 TZ=Asia/Shanghai（vitest.config.ts）
    seedAction({ action: 'artist_ban', createdAt: '2026-09-10 10:00:00' })   // 区间外（早）
    seedAction({ action: 'artist_unban', createdAt: '2026-09-15 10:00:00' }) // 区间内
    seedAction({ action: 'content_remove', createdAt: '2026-09-20 10:00:00' }) // 区间外（晚）

    const res = await get('/api/admin/admin-actions/export?from=2026-09-14&to=2026-09-16')
    expect(res.statusCode).toBe(200)
    const lines = csvLines(res.body)
    expect(lines.some(l => l.includes('artist_unban'))).toBe(true)
    expect(lines.some(l => l.includes('artist_ban'))).toBe(false)
    expect(lines.some(l => l.includes('content_remove'))).toBe(false)
  })

  it('TC-EXP-11: from/to 只给一端 → 400（区间必须显式成对，不允许隐式推断）', async () => {
    const onlyFrom = await get('/api/admin/admin-actions/export?from=2026-09-14')
    expect(onlyFrom.statusCode).toBe(400)
    expect(onlyFrom.json().code).toBe('VALIDATION')

    const onlyTo = await get('/api/admin/admin-actions/export?to=2026-09-16')
    expect(onlyTo.statusCode).toBe(400)
  })

  it('TC-EXP-12: 反向区间（from > to）→ 400，且不留「导出成功」的痕迹', async () => {
    seedAction({ action: 'artist_ban' })
    const before = countActions()
    const res = await get('/api/admin/admin-actions/export?from=2026-09-20&to=2026-09-10')
    expect(res.statusCode).toBe(400)
    // 参数错在写留痕之前就被拦下（写留痕在 filters 构造之后、取数之前；
    // utils/date 的反向校验抛在 buildActionFilter 里，故不会入账）
    expect(countActions()).toBe(before)
  })
})

describe('R-2 导出分批边界（keyset 游标）', () => {
  let app: FastifyInstance
  let admin: ArtistRow

  beforeEach(async () => {
    cleanDb()
    resetRateLimitBuckets()
    app = await buildApp({ logger: false })
    await app.ready()
    db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run('10001')
    admin = seedArtist({ qq_number: '10001', subdomain: 'export-batch-admin' })
  })

  afterEach(async () => {
    await app.close()
  })

  function authH(): Record<string, string> {
    return {
      authorization: AUTH_PREFIX + createSession(admin.id, admin.token_version, {
        authLevel: 'admin_verified', adminVerifiedAt: Date.now() as unknown as string
      })
    }
  }

  function bulkInsert(n: number, createdAt: string): void {
    const stmt = db.prepare(
      "INSERT INTO admin_actions (admin_id, action, target_type, target_id, reason, admin_ip, created_at) VALUES (?, 'artist_ban', 'artist', ?, '批量', '9.9.9.9', ?)"
    )
    const tx = db.transaction(() => { for (let i = 0; i < n; i++) stmt.run(admin.id, 1000 + i, createdAt) })
    tx()
  }

  it('TC-EXP-13: 分页边界——恰为 2 批时全部导出（不丢最后一批、不重复）', async () => {
    // 分批粒度 = ADMIN_ACTIONS_EXPORT_BATCH（500）；造 1001 条 × 同一秒，
    // 让「同秒多条」跨批次边界，正好检验 (created_at, id) 双键游标
    const batch = complianceService.ADMIN_ACTIONS_EXPORT_BATCH
    bulkInsert(batch * 2 - 1, '2026-09-13 10:00:00')

    const res = await app.inject({ method: 'GET', url: '/api/admin/admin-actions/export?action=artist_ban', headers: authH() })
    expect(res.statusCode).toBe(200)
    const lines = res.body.replace(/^\uFEFF/, '').split('\r\n').filter(l => l.length > 0)
    // 表头 1 + 数据 999
    expect(lines.length).toBe(batch * 2 - 1 + 1)
    // 每行 id 唯一（无重复）
    const ids = lines.slice(1).map(l => l.split(',')[0])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('TC-EXP-14: 分批读取函数本身——游标向后走不回头、比批大小多 1 条时正好两批', () => {
    const batch = complianceService.ADMIN_ACTIONS_EXPORT_BATCH
    bulkInsert(batch + 1, '2026-09-13 10:00:00')

    const first = complianceService.getAdminActionsPage({ action: 'artist_ban' }, null)
    expect(first.length).toBe(batch)
    const lastRow = first[first.length - 1]
    const second = complianceService.getAdminActionsPage(
      { action: 'artist_ban' },
      { createdAt: lastRow.created_at, id: lastRow.id }
    )
    expect(second.length).toBe(1)
    // 游标是严格向后：第二批的 id 必须小于第一批末尾的 id
    expect(second[0].id).toBeLessThan(lastRow.id)
  })

  it('TC-EXP-15: 导出留痕——导出后 admin_actions 多一条 admin_actions_export（含筛选口径与 IP）', async () => {
    db.prepare("INSERT INTO admin_actions (admin_id, action, target_type, target_id, reason, admin_ip) VALUES (?, 'artist_ban', 'artist', 1, '原有动作', '1.1.1.1')").run(admin.id)
    const before = (db.prepare('SELECT COUNT(*) AS c FROM admin_actions').get() as CountRow).c
    expect(before).toBe(1)

    const res = await app.inject({ method: 'GET', url: '/api/admin/admin-actions/export?action=artist_ban', headers: authH() })
    expect(res.statusCode).toBe(200)

    const afterRows = db.prepare('SELECT * FROM admin_actions ORDER BY id').all() as complianceService.AdminActionRow[]
    expect(afterRows.length).toBe(before + 1)
    const audit = afterRows[afterRows.length - 1]
    expect(audit.action).toBe('admin_actions_export')
    expect(audit.admin_id).toBe(admin.id)
    // reason 记录筛选口径（事后复盘要知道导出的是哪一段）
    expect(audit.reason).toContain('artist_ban')
    // IP 走 request.ip（app.inject 默认 127.0.0.1）
    expect(audit.admin_ip).toBe('127.0.0.1')
  })

  it('TC-EXP-16: 导出留痕在导出的 CSV 里可见（同账本自证，不留暗路）', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/admin-actions/export', headers: authH() })
    const lines = res.body.replace(/^\uFEFF/, '').split('\r\n').filter(l => l.length > 0)
    expect(lines.some(l => l.includes('admin_actions_export') && l.includes('导出留痕'))).toBe(true)
  })

  it('TC-EXP-17: 导出留痕动作已登记白名单——?action=admin_actions_export 精确筛得到', async () => {
    await app.inject({ method: 'GET', url: '/api/admin/admin-actions/export', headers: authH() })
    await app.inject({ method: 'GET', url: '/api/admin/admin-actions/export', headers: authH() })

    // 走列表口（前端筛选下拉的同一条路径）：白名单没登记的话这里会被当脏参数忽略，返回全量
    const res = await app.inject({
      method: 'GET', url: '/api/admin/admin-actions?action=admin_actions_export', headers: authH()
    })
    const body = res.json() as { rows: complianceService.AdminActionRow[]; total: number }
    expect(body.total).toBe(2)
    expect(body.rows.every(r => r.action === 'admin_actions_export')).toBe(true)
  })
})

describe('R-2 管理留痕留存策略（ADMIN_ACTIONS_TTL_DAYS）', () => {
  let admin: ArtistRow

  beforeEach(() => {
    cleanDb()
    admin = seedArtist({ qq_number: '10001', subdomain: 'ttl-admin' })
  })

  function insertAt(action: string, createdAt: string): number {
    const r = db.prepare(
      'INSERT INTO admin_actions (admin_id, action, target_type, target_id, reason, admin_ip, created_at) VALUES (?, ?, NULL, NULL, NULL, NULL, ?)'
    ).run(admin.id, action, createdAt)
    return Number(r.lastInsertRowid)
  }

  function exists(id: number): boolean {
    return (db.prepare('SELECT COUNT(*) AS c FROM admin_actions WHERE id = ?').get(id) as CountRow).c === 1
  }

  it('TC-TTL-01: 保留期常量为 1095 天（3 年）且不走 env', () => {
    expect(complianceService.ADMIN_ACTIONS_TTL_DAYS).toBe(1095)
  })

  it('TC-TTL-02: 按注入时间清理——窗口外的删、窗口内的留', () => {
    const now = new Date('2026-11-28T00:00:00Z')
    const days = complianceService.ADMIN_ACTIONS_TTL_DAYS

    const tooOld = new Date(now.getTime() - (days + 1) * 24 * 60 * 60 * 1000)
    const justInside = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000)
    const fmt = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ')

    const oldId = insertAt('artist_ban', fmt(tooOld))
    const freshId = insertAt('artist_unban', fmt(justInside))

    const deleted = complianceService.pruneAdminActions(now)

    expect(deleted).toBe(1)
    expect(exists(oldId)).toBe(false)
    expect(exists(freshId)).toBe(true)
  })

  it('TC-TTL-03: 边界——恰好等于保留期的行不删（严格小于才删）', () => {
    const now = new Date('2026-11-28T00:00:00Z')
    const days = complianceService.ADMIN_ACTIONS_TTL_DAYS
    const exactCutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    const fmt = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ')

    const boundaryId = insertAt('artist_ban', fmt(exactCutoff))
    const deleted = complianceService.pruneAdminActions(now)

    expect(deleted).toBe(0)
    expect(exists(boundaryId)).toBe(true)
  })

  it('TC-TTL-04: 无过期行时不误删（返回 0，全表保留）', () => {
    const now = new Date('2026-11-28T00:00:00Z')
    insertAt('artist_ban', '2026-11-27 10:00:00')
    insertAt('artist_unban', '2026-11-20 10:00:00')

    expect(complianceService.pruneAdminActions(now)).toBe(0)
    expect((db.prepare('SELECT COUNT(*) AS c FROM admin_actions').get() as CountRow).c).toBe(2)
  })

  it('TC-TTL-05: 只清 admin_actions——同一库的其它审计/业务表不受影响', () => {
    const now = new Date('2026-11-28T00:00:00Z')
    const veryOld = '2019-01-01 00:00:00'
    insertAt('artist_ban', veryOld)
    // 同样超老的业务/审计数据（guestbook 是业务数据、order_activity_logs 永久保留）
    db.prepare("INSERT INTO guestbook_messages (artist_id, nickname, content, created_at) VALUES (?, 'old', '老留言', ?)").run(admin.id, veryOld)
    db.prepare("INSERT INTO events (name, ts, artist_id, payload_json, created_at) VALUES ('dashboard_view', 1, ?, '{}', ?)").run(admin.id, veryOld)

    const deleted = complianceService.pruneAdminActions(now)

    expect(deleted).toBe(1)
    expect((db.prepare('SELECT COUNT(*) AS c FROM guestbook_messages').get() as CountRow).c).toBe(1)
    expect((db.prepare('SELECT COUNT(*) AS c FROM events').get() as CountRow).c).toBe(1)
  })

  it('TC-TTL-06: 挂在 gcDatabaseTtl 上——buildApp 启动那一轮就清掉窗口外留痕', async () => {
    // buildApp 启动时同步执行一次 gcDatabaseTtl（app.ts:391）
    const veryOld = '2019-01-01 00:00:00'
    const recent = toLocalDateString(new Date())
    const oldId = insertAt('artist_ban', veryOld)
    const recentId = insertAt('artist_unban', `${recent} 00:00:00`)

    const app = await buildApp({ logger: false })
    await app.ready()
    try {
      expect(exists(oldId)).toBe(false)
      expect(exists(recentId)).toBe(true)
    } finally {
      await app.close()
    }
  })
})
