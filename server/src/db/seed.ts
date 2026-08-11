/* eslint-disable no-console -- 种子脚本按约定豁免（CLI 输出是脚本本职，源头防屎门禁豁免项） */
import db from './connection.js'
import { initDatabase } from './init.js'

// ============================================
// 种子数据 - 用于开发测试
// ============================================

const seed = async () => {
  // 确保表结构存在（seed 可独立运行，无需先手动 db:init）
  initDatabase(db)

  console.log('🌱 开始插入种子数据...')

  // 插入测试画师（含身份码）— REQ-038：管理员自举退役后，管理员账号改由 seed 创建（仅开发/测试用途；生产首装走 /setup 向导）
  const artistStmt = db.prepare(`
    INSERT OR IGNORE INTO artists (qq_number, name, subdomain, artist_code, bio, status, contact_qq)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)

  artistStmt.run('10000', 'System', 'system', 'SYS', '系统保留', 'open', '10000')
  artistStmt.run('10001', 'Alice', 'alice', 'ALICE', '擅长日系头像和半身像', 'open', '10001')
  artistStmt.run('10002', 'Bob', 'bob', 'BOB', '专注全身插画和场景', 'full', '10002')

  // REQ-038：管理员画师账号（管理员判定 = qq_number == platform_config.admin_qq，无独立列；
  // status 用 hidden（CHECK 约束仅 open/full/break/hidden），不上客户端目录）
  const adminQq = process.env.ADMIN_QQ || '10003'
  artistStmt.run(adminQq, 'Admin', 'admin', 'ADMIN', '平台管理员', 'hidden', adminQq)

  const alice = db.prepare('SELECT id FROM artists WHERE subdomain = ?').get('alice') as { id: number }
  const bob = db.prepare('SELECT id FROM artists WHERE subdomain = ?').get('bob') as { id: number }

  // SPEC-PRICE-2（v50）：旧 price_tiers 种子已退役，演示价格改走画风/尺寸模型
  // 幂等：先清空本 seed 画师已有画风（连同尺寸/增项级联）
  db.prepare('DELETE FROM art_styles WHERE artist_id IN (?, ?)').run(alice.id, bob.id)

  const insertStyle = db.prepare(
    "INSERT INTO art_styles (artist_id, name, sort_order, is_active) VALUES (?, '默认', 0, 1)"
  )
  const insertSize = db.prepare(
    'INSERT INTO style_sizes (art_style_id, name, base_price, description, work_days, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
  )

  const aliceStyle = Number(insertStyle.run(alice.id).lastInsertRowid)
  insertSize.run(aliceStyle, '头像', 50, '正方形头像，含简单背景', 3, 1)
  insertSize.run(aliceStyle, '半身像', 120, '胸部以上，可加简单手势', 5, 2)
  insertSize.run(aliceStyle, '全身像', 200, '全身立绘，含简单背景', 7, 3)

  const bobStyle = Number(insertStyle.run(bob.id).lastInsertRowid)
  insertSize.run(bobStyle, '全身插画', 350, '全身 + 场景背景', 10, 1)
  insertSize.run(bobStyle, '双人插画', 500, '两个角色互动场景', 14, 2)

  // 插入约稿须知
  const rulesStmt = db.prepare(`
    INSERT OR IGNORE INTO commission_rules (artist_id, content)
    VALUES (?, ?)
  `)

  rulesStmt.run(alice.id, `
<h3>约稿须知</h3>
<ul>
  <li>不接 NSFW、机甲、真人肖像</li>
  <li>免费修改 2 次，之后每次 +20 元</li>
  <li>工期从确认需求后开始计算</li>
  <li>成品可用于个人头像、社交媒体展示</li>
  <li>商用需额外授权，请联系画师</li>
</ul>
  `.trim())

  // M-3 修复：为种子画师初始化工作流（从默认模板复制）
  const { seedArtistStages } = await import('../features/artist/workflow.service.js')
  for (const a of [alice, bob]) {
    const wfCount = db.prepare('SELECT COUNT(*) AS c FROM artist_workflow_stages WHERE artist_id = ?').get(a.id) as { c: number }
    if (wfCount.c === 0) seedArtistStages(a.id)
  }

  // M-4 修复：用 REPLACE 确保 seed 的 admin_qq 生效（init.js 的 INSERT OR IGNORE 会先插入空值）；REQ-038：跟随 ADMIN_QQ 变量
  db.prepare("INSERT OR REPLACE INTO platform_config (key, value) VALUES ('admin_qq', ?)").run(adminQq)

  console.log('✅ 种子数据插入完成')
}

seed()
