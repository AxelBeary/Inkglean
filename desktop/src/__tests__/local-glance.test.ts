// 本地核心环波6 测试：本地概览句组装与日差纯函数（首页本地变体的口径哨兵）。
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { buildLocalDeadlineAlerts, buildLocalGlance, buildLocalDeadlineRows, localDaysLeft } from '../components/home/localGlance'
import type { LocalOrder } from '../stores/localLedger'

function order(p: Partial<LocalOrder>): LocalOrder {
  return {
    id: p.id ?? 1,
    client_name: p.client_name ?? '张三',
    title: p.title ?? '头像',
    price: p.price ?? 100,
    deadline: p.deadline ?? null,
    status: p.status ?? 'draft',
    created_at: '',
    updated_at: p.updated_at ?? ''
  }
}

function isoDaysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${dd}`
}

describe('localDaysLeft', () => {
  it('今天截稿返 0，无效/空返 null', () => {
    expect(localDaysLeft(isoDaysFromNow(0))).toBe(0)
    expect(localDaysLeft(isoDaysFromNow(3))).toBe(3)
    expect(localDaysLeft(isoDaysFromNow(-2))).toBe(-2)
    expect(localDaysLeft(null)).toBeNull()
    expect(localDaysLeft('不是日期')).toBeNull()
  })
})

describe('buildLocalGlance（本地概览句口径）', () => {
  it('0 笔在账退回一句本地口径（不打扰）', () => {
    const parts = buildLocalGlance([], 0)
    expect(parts).toEqual([{ text: '本地模式 · 数据仅存本机', tone: '' }])
  })

  it('在账/进行中/本月已收按序组句', () => {
    const parts = buildLocalGlance(
      [order({ status: 'in_progress' }), order({ id: 2, status: 'paid' })],
      300
    )
    expect(parts[0].text).toBe('2 笔在账')
    expect(parts.some(p => p.text === '1 笔进行中')).toBe(true)
    expect(parts.some(p => p.text === '本月已收 ¥300')).toBe(true)
  })

  it('今天截稿进加重段（od）', () => {
    const parts = buildLocalGlance(
      [order({ client_name: '李四', deadline: isoDaysFromNow(0), status: 'in_progress' })],
      0
    )
    const urgent = parts.find(p => p.tone === 'od')
    expect(urgent?.text).toBe('李四今天截稿')
  })

  it('逾期置顶口径：最急的是逾期单', () => {
    const parts = buildLocalGlance(
      [
        order({ id: 1, client_name: '远期', deadline: isoDaysFromNow(10), status: 'in_progress' }),
        order({ id: 2, client_name: '急单', deadline: isoDaysFromNow(-1), status: 'draft' })
      ],
      0
    )
    expect(parts.find(p => p.tone === 'od')?.text).toBe('急单已逾期 1 天')
  })

  it('已交付/已收款不进截稿提醒', () => {
    const parts = buildLocalGlance(
      [order({ deadline: isoDaysFromNow(0), status: 'paid' })],
      0
    )
    expect(parts.some(p => p.tone === 'od')).toBe(false)
  })
})

describe('buildLocalDeadlineRows（悬浮截稿窗本地数据源，巡检收尾波）', () => {
  it('未完成+有截稿+窗口内；逾期最前；超 limit 截断', () => {
    const rows = buildLocalDeadlineRows(
      [
        order({ id: 1, deadline: isoDaysFromNow(5) }),
        order({ id: 2, client_name: '急单', deadline: isoDaysFromNow(-2) }),
        order({ id: 3, deadline: null }),
        order({ id: 4, deadline: isoDaysFromNow(30) }),
        order({ id: 5, deadline: isoDaysFromNow(0), status: 'paid' }),
        order({ id: 6, deadline: isoDaysFromNow(1) }),
        order({ id: 7, deadline: isoDaysFromNow(2) })
      ],
      14, 3
    )
    // id5 已收款被滤；剩 -2/1/2/5，取前 3 且逾期最前
    expect(rows.map(r => r.daysLeft)).toEqual([-2, 1, 2])
    expect(rows[0].clientName).toBe('急单')
  })

  it('无截稿单返空（悬浮窗走诚实空态）', () => {
    expect(buildLocalDeadlineRows([order({ deadline: null }), order({ deadline: isoDaysFromNow(60) })], 14, 6)).toEqual([])
  })

  it('客户名缺失落内容', () => {
    const rows = buildLocalDeadlineRows([order({ client_name: '', deadline: isoDaysFromNow(1) })], 14, 6)
    expect(rows[0].clientName).toBe('头像') // 落 title
    expect(rows[0].orderNo).toBe('头像')
  })
})

describe('buildLocalDeadlineAlerts（本地截稿提醒条目）', () => {
  it('只收未完成+有截稿+逾期/今天/明天；id 前缀与客户名兜底', () => {
    const alerts = buildLocalDeadlineAlerts([
      order({ id: 1, client_name: '急单', deadline: isoDaysFromNow(-1), status: 'in_progress' }),
      order({ id: 2, client_name: '', deadline: isoDaysFromNow(0), status: 'draft' }),
      order({ id: 3, deadline: isoDaysFromNow(1) }),
      order({ id: 4, deadline: isoDaysFromNow(2) }),
      order({ id: 5, deadline: isoDaysFromNow(0), status: 'paid' }),
      order({ id: 6, deadline: null }),
      order({ id: 7, deadline: '坏日期' })
    ])
    expect(alerts).toEqual([
      { id: 'local-1', who: '急单', daysLeft: -1 },
      { id: 'local-2', who: '有一单', daysLeft: 0 },
      { id: 'local-3', who: '张三', daysLeft: 1 }
    ])
  })
})

// ─── 审计 #23 条目 2：纯日期串按 UTC 零点解析 ⇒ 负时区整体差一天 ───
//
// 这组判别力靠**子进程**：目标时区必须在 node 启动前就设进 env（见 local-glance-tz-harness.ts）。
// 原写法在测试里就地 `process.env.TZ = tz`，而桌面端门禁跑在 windows-latest——运行期改 TZ 能不能
// 改变 Date 的行为不是被承诺的口径（本机 Node 24 实测生效，不能据此替 CI 的 Node 22 背书）。
// 一旦不生效，用例就变成「修没修都绿」的假绿，正好放过要防的那一天差。
// 进程级 TZ 全平台支持，且子进程只回传观察值、断言全在父进程做：被测代码无权给自己发绿卡。
describe('localDaysLeft 跨时区稳定（#23-2 · 进程级 TZ）', () => {
  /** 矩阵含两个负偏移区：老口径只在 UTC-x 下掉回前一天，正偏移与 UTC 下修没修都算 0 */
  const ZONES = ['UTC', 'America/New_York', 'Pacific/Midway', 'Pacific/Kiritimati', 'Asia/Shanghai']

  interface TzObservation {
    offset: number
    today: number | null
    tomorrow: number | null
    dayBeforeYesterday: number | null
    isoNow: number | null
  }

  // 走字符串 URL 而不是 new URL(...)：happy-dom 环境会替换全局 URL，Node 的 fileURLToPath 不认它
  const harnessPath = join(dirname(fileURLToPath(import.meta.url)), 'local-glance-tz-harness.ts')
  /** 参照瞬间整组共用：偏移裁判与子进程观察值要逐位对齐（跨 DST 边界也不飘） */
  const refMs = Date.now()

  /** 具名时区在给定瞬间的 UTC 偏移（分钟，东为正）。用 Intl 显式 timeZone 当裁判，不读本进程时区
   *  ——「子进程是否真的落到了目标时区」必须由外部独立核验，而不是听子进程自报 */
  function zoneOffsetMinutes(tz: string, at: Date): number {
    // 分量精度只到秒：先把参照瞬间抹掉毫秒再相减，否则 UTC 下会剩下一撮负毫秒、
    // Math.round 得出 -0，与被测侧经 JSON 往返归一成 +0 的偏移值用 Object.is 比就不等
    const atSec = Math.floor(at.getTime() / 1000) * 1000
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).formatToParts(at)
    const num = (type: Intl.DateTimeFormatPartTypes): number => {
      const p = parts.find(x => x.type === type)
      if (!p) throw new Error(`Intl 拿不到 ${tz} 的 ${type} 分量`)
      return Number(p.value)
    }
    const asUtc = Date.UTC(num('year'), num('month') - 1, num('day'), num('hour') % 24, num('minute'), num('second'))
    return Math.round((asUtc - atSec) / 60000)
  }

  /** 只在本机 Node 不肯直接跑 .ts 时才补 flag 重试；断言失败一律直接红，不吞真失败 */
  const stripTypeHint = /ERR_UNKNOWN_FILE_EXTENSION|Unknown file extension|experimental-strip-types|bad option/i

  function runHarness(tz: string): TzObservation {
    // Windows 上环境变量名大小写不敏感：先把任何 tz/_TZ 变体摘掉，避免新旧值同时进子进程 env 块
    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (value === undefined) continue
      const upper = key.toUpperCase()
      if (upper === 'TZ' || upper === '_TZ') continue
      env[key] = value
    }
    env.TZ = tz

    let lastError = '未发起子进程'
    for (const execArgv of [[], ['--experimental-strip-types']] as string[][]) {
      const r = spawnSync(process.execPath, [...execArgv, harnessPath, tz, String(refMs)], {
        encoding: 'utf8',
        env
      })
      const line = (r.stdout ?? '').split('\n').find(l => l.startsWith('TZ_OBSERVED '))
      if (r.status === 0 && line) return JSON.parse(line.slice(line.indexOf('{'))) as TzObservation
      lastError = `exit=${r.status ?? 'null'} ${(r.stderr ?? '').trim().slice(0, 500)}`
      if (!stripTypeHint.test(lastError)) break
    }
    throw new Error(`TZ=${tz} 的子进程没跑出观察值（这一步红掉＝用例失去判别力或修复没生效，不是可跳过噪音）：${lastError}`)
  }

  for (const tz of ZONES) {
    it(`${tz} 下今天/明天/前天分别算 0 / +1 / -2`, () => {
      const o = runHarness(tz)
      // 哨兵先行：先证明子进程真跑在 tz 上，否则后面三条在什么时区都是绿的
      expect(o.offset, `TZ=${tz} 没落到子进程`).toBe(zoneOffsetMinutes(tz, new Date(refMs)))
      expect(o.today).toBe(0)
      expect(o.tomorrow).toBe(1)
      expect(o.dayBeforeYesterday).toBe(-2)
      // 带时间的串维持原解析：按那个瞬间所属的本地日
      expect(o.isoNow).toBe(0)
    }, 20_000)
  }

  it('矩阵里得有负偏移区，否则这组没有判别力', () => {
    const ref = new Date(refMs)
    const negatives = ZONES.filter(z => zoneOffsetMinutes(z, ref) < 0)
    expect(negatives.length, `矩阵 ${ZONES.join(' / ')} 里没有负偏移区`).toBeGreaterThan(0)
    // 并钉住至少一个负偏移区真的被子进程跑到了（跑偏成 UTC 时哨兵会先在上面炸）
    expect(runHarness('Pacific/Midway').offset, 'Pacific/Midway 应实测为负偏移').toBeLessThan(0)
  }, 20_000)

  it('带时间的串仍按该瞬间所属的本地日参与计算（不改既有行为）', () => {
    expect(localDaysLeft(new Date().toISOString())).toBe(0)
    const base = new Date()
    const tomorrowNoon = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1, 12, 0, 0)
    expect(localDaysLeft(tomorrowNoon.toISOString())).toBe(1)
  })
})
