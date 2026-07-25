import db from './connection.js'

// ============================================
// 种子数据 - 用于开发测试
// ============================================

const seed = () => {
  console.log('🌱 开始插入种子数据...')

  // 插入测试画师（含身份码）
  const artistStmt = db.prepare(`
    INSERT OR IGNORE INTO artists (qq_number, name, subdomain, artist_code, bio, status, contact_qq)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)

  artistStmt.run('10000', 'Admin', 'admin', 'ADMIN', '平台管理员', 'open', '10000')
  artistStmt.run('10001', 'Alice', 'alice', 'ALICE', '擅长日系头像和半身像', 'open', '10001')
  artistStmt.run('10002', 'Bob', 'bob', 'BOB', '专注全身插画和场景', 'full', '10002')

  const alice = db.prepare('SELECT id FROM artists WHERE subdomain = ?').get('alice')
  const bob = db.prepare('SELECT id FROM artists WHERE subdomain = ?').get('bob')

  // 插入价格档位
  const tierStmt = db.prepare(`
    INSERT OR IGNORE INTO price_tiers (artist_id, name, price, description, work_days, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `)

  tierStmt.run(alice.id, '头像', 50, '正方形头像，含简单背景', 3, 1)
  tierStmt.run(alice.id, '半身像', 120, '胸部以上，可加简单手势', 5, 2)
  tierStmt.run(alice.id, '全身像', 200, '全身立绘，含简单背景', 7, 3)

  tierStmt.run(bob.id, '全身插画', 350, '全身 + 场景背景', 10, 1)
  tierStmt.run(bob.id, '双人插画', 500, '两个角色互动场景', 14, 2)

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

  // 插入平台配置
  const configStmt = db.prepare(`
    INSERT OR IGNORE INTO platform_config (key, value) VALUES (?, ?)
  `)
  configStmt.run('admin_qq', '10000')

  console.log('✅ 种子数据插入完成')
}

seed()
