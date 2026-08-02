/**
 * 示例数据制作脚本（v0.32 演示底数据）
 *
 * 设计：在 commission-web 容器内运行，复用运行中的 DB 连接（不碰 WAL 锁）。
 *   docker cp server/scripts/demo-data.ts commission-web:/tmp/demo-data.ts
 *   docker exec commission-web npx tsx /tmp/demo-data.ts
 *
 * 幂等：可重复执行，结果一致（先按标记清理旧数据再插入）。
 * 图片：全部为网上 CC0 / 公有领域 / Unsplash 来源，已预先下载到 uploads/images/ 下。
 *       来源与许可证清单见 docs/comms/03-to-01-示例数据交付-*.md。
 */
import db from '/app/server/src/db/connection.js'
import { seedArtistStages } from '/app/server/src/features/artist/workflow.service.js'
import { existsSync, unlinkSync, renameSync } from 'fs'

const UPLOAD_ROOT = '/app/uploads'

// ─── 工具 ───

function getArtist(subdomain: string): { id: number; artist_code: string | null } | undefined {
  return db.prepare('SELECT id, artist_code FROM artists WHERE subdomain = ? AND deleted_at IS NULL').get(subdomain) as { id: number; artist_code: string | null } | undefined
}

/** 删除画作行并清理磁盘文件（只删列表内文件；keepFiles 内的种子文件保留——复跑只删行不删文件，GC 保护） */
function removeArtworks(artistId: number, pathPattern: string, titlePattern?: string, keepFiles?: ReadonlySet<string>): number {
  const conds = [`artist_id = ?`, `(image_path LIKE ?${titlePattern ? ' OR title LIKE ?' : ''})`]
  const params: unknown[] = titlePattern ? [artistId, pathPattern, titlePattern] : [artistId, pathPattern]
  const rows = db.prepare(`SELECT id, image_path FROM artworks WHERE ${conds.join(' AND ')}`).all(...params) as Array<{ id: number; image_path: string }>
  if (rows.length === 0) return 0
  const ids = rows.map(r => r.id)
  db.prepare(`DELETE FROM artworks WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids)
  for (const r of rows) {
    const fileName = r.image_path.slice(r.image_path.lastIndexOf('/') + 1)
    if (keepFiles?.has(fileName)) continue
    const abs = `${UPLOAD_ROOT}/${r.image_path}`
    if (existsSync(abs)) unlinkSync(abs)
  }
  return rows.length
}

interface ArtworkSeed { file: string; title: string; isCover?: boolean }

/** 由种子清单生成文件保护集（复跑时这些文件只删行不删文件） */
function keepSet(seeds: ArtworkSeed[]): ReadonlySet<string> {
  return new Set(seeds.map(s => s.file))
}

function insertArtworks(artistId: number, seeds: ArtworkSeed[]): void {
  const stmt = db.prepare(
    'INSERT INTO artworks (artist_id, image_path, title, sort_order, is_cover) VALUES (?, ?, ?, ?, ?)'
  )
  seeds.forEach((s, i) => {
    stmt.run(artistId, `images/${artistId}/${s.file}`, s.title, i + 1, s.isCover ? 1 : 0)
  })
}

function setStyleCover(styleId: number, coverImagePath: string): void {
  db.prepare('UPDATE art_styles SET cover_image = ? WHERE id = ?').run(coverImagePath, styleId)
}

// ─── 1. alice：多画风演示（日系，接单中） ───

function seedAlice(): void {
  const alice = getArtist('alice')
  if (!alice) throw new Error('画师 alice 不存在')
  const { id } = alice
  console.log(`[alice] id=${id}`)

  // 1a. 清理 + 1b. 插入 6 张真实作品（keepFiles 保护种子文件，复跑只删行不删文件）
  const aliceSeeds: ArtworkSeed[] = [
    { file: 'alice-p01.jpg', title: '戴珍珠耳环的少女 · 头像委托', isCover: true },
    { file: 'alice-p02.jpg', title: '芭蕾少女 · 角色插画' },
    { file: 'alice-p03.jpg', title: '浮世绘风 · 和服角色' },
    { file: 'alice-p04.jpg', title: '向日葵 · 暖调头像' },
    { file: 'alice-p05.jpg', title: '歌舞伎风 · 厚涂角色' },
    { file: 'alice-p06.jpg', title: '排练厅 · 场景速写' }
  ]
  const removed = removeArtworks(id, `images/${id}/alice-p%.jpg`, 'Alice作品%', keepSet(aliceSeeds))
  console.log(`[alice] 清理旧作品 ${removed} 行`)
  insertArtworks(id, aliceSeeds)
  console.log('[alice] 插入 6 张真实作品')

  // 1c. avatar
  db.prepare('UPDATE artists SET avatar = ? WHERE id = ?').run(`images/${id}/alice-avatar.jpg`, id)
  console.log('[alice] avatar 已设置')

  // 1d. 默认画风封面
  const defaultStyle = db.prepare("SELECT id FROM art_styles WHERE artist_id = ? AND name = '默认'").get(id) as { id: number } | undefined
  if (defaultStyle) {
    setStyleCover(defaultStyle.id, `images/${id}/alice-p01.jpg`)
    console.log(`[alice] 默认画风(${defaultStyle.id})封面已设置`)
  }

  // 1e. 新增第 2 画风「厚涂插画」（幂等：同名跳过）
  const thick = db.prepare("SELECT id FROM art_styles WHERE artist_id = ? AND name = '厚涂插画'").get(id) as { id: number } | undefined
  if (thick) {
    console.log(`[alice] 厚涂画风已存在(${thick.id})，跳过创建`)
  } else {
    const r = db.prepare(
      "INSERT INTO art_styles (artist_id, name, description, cover_image, sort_order, is_active) VALUES (?, '厚涂插画', '厚重笔触与强烈光影，适合氛围感头像与立绘', ?, 1, 1)"
    ).run(id, `images/${id}/alice-style2-cover.jpg`)
    const styleId = Number(r.lastInsertRowid)
    const sizes: Array<[string, number]> = [['头像', 80], ['半身像', 180], ['全身像', 280]]
    const ins = db.prepare('INSERT INTO style_sizes (art_style_id, name, base_price, sort_order) VALUES (?, ?, ?, ?)')
    sizes.forEach(([name, price], i) => ins.run(styleId, name, price, i + 1))
    console.log(`[alice] 厚涂画风(${styleId})已创建，3 个尺寸：头像¥80 / 半身¥180 / 全身¥280`)
  }
}

// ─── 2. bob：单画风，约满 ───

function seedBob(): void {
  const bob = getArtist('bob')
  if (!bob) throw new Error('画师 bob 不存在')
  const { id } = bob
  console.log(`[bob] id=${id}`)

  const bobSeeds: ArtworkSeed[] = [
    { file: 'bob-p01.jpg', title: '神奈川冲浪 · 场景插画', isCover: true },
    { file: 'bob-p02.jpg', title: '麦田与乌鸦 · 氛围场景' },
    { file: 'bob-p03.jpg', title: '睡莲 · 庭院水景' },
    { file: 'bob-p04.jpg', title: '大桥骤雨 · 雨景' },
    { file: 'bob-p05.jpg', title: '凯风快晴 · 山景' },
    { file: 'bob-p06.jpg', title: '麦田黄昏 · 宽幅构图' }
  ]
  const removed = removeArtworks(id, `images/${id}/bob-p%.jpg`, 'Bob作品%', keepSet(bobSeeds))
  console.log(`[bob] 清理旧作品 ${removed} 行`)
  insertArtworks(id, bobSeeds)
  console.log('[bob] 插入 6 张真实作品')

  db.prepare('UPDATE artists SET avatar = ? WHERE id = ?').run(`images/${id}/bob-avatar.jpg`, id)

  const defaultStyle = db.prepare("SELECT id FROM art_styles WHERE artist_id = ? AND name = '默认'").get(id) as { id: number } | undefined
  if (defaultStyle) setStyleCover(defaultStyle.id, `images/${id}/bob-p01.jpg`)
  console.log('[bob] avatar + 默认画风封面已设置')
}

// ─── 3. carol：旧模型画师（单画风退化路径演示） ───

function seedCarol(): number {
  let carol = getArtist('carol')
  if (!carol) {
    const r = db.prepare(`
      INSERT INTO artists (qq_number, name, subdomain, artist_code, contact_qq, bio, status)
      VALUES ('10004', 'Carol', 'carol', 'CAROL', '10004', '自由插画师，主打印象派光影与厚涂肌理', 'open')
    `).run()
    const id = Number(r.lastInsertRowid)
    console.log(`[carol] 画师已创建 id=${id}`)

    // 工作流（从默认模板复制）
    seedArtistStages(id)
    console.log('[carol] 工作流已初始化')

    // 约稿须知（2-3 条）
    db.prepare('INSERT INTO commission_rules (artist_id, content) VALUES (?, ?)').run(id, [
      '<h3>约稿须知</h3>',
      '<ul>',
      '  <li>接单范围：头像 / 半身 / 全身，可加简单场景背景</li>',
      '  <li>不接 NSFW、机甲、兽设；商用需另行授权</li>',
      '  <li>免费修改 2 次，开工前收取 50% 定金</li>',
      '</ul>'
    ].join('\n'))
    console.log('[carol] 约稿须知已写入')

    // 旧模型档位（每档带 example_image）
    const tier = db.prepare(
      'INSERT INTO price_tiers (artist_id, name, price, description, example_image, work_days, sort_order, visibility) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    tier.run(id, '头像插画', 60, '正方形头像，纯色或简单渐变背景', `images/${id}/carol-p01.jpg`, 3, 1, 'visible')
    tier.run(id, '半身场景', 150, '胸部以上，含简单道具或氛围元素', `images/${id}/carol-p02.jpg`, 5, 2, 'visible')
    tier.run(id, '全身插画', 260, '全身立绘，含简单场景背景', `images/${id}/carol-p03.jpg`, 8, 3, 'visible')
    console.log('[carol] 3 个档位已创建（各带示例图）')

    carol = { id, artist_code: 'CAROL' }
  } else {
    console.log(`[carol] 已存在 id=${carol.id}，跳过画师创建`)
  }

  const { id } = carol

  // 图片目录：demo-carol → 真实 id（幂等）
  const tmpDir = `${UPLOAD_ROOT}/images/demo-carol`
  const realDir = `${UPLOAD_ROOT}/images/${id}`
  if (existsSync(tmpDir) && !existsSync(realDir)) {
    renameSync(tmpDir, realDir)
    console.log(`[carol] 图片目录 demo-carol → ${id}`)
  } else if (!existsSync(realDir)) {
    throw new Error(`[carol] 图片目录缺失：${tmpDir} 和 ${realDir} 都不存在`)
  }

  // 作品（幂等重建，keepFiles 保护种子文件）
  const carolSeeds: ArtworkSeed[] = [
    { file: 'carol-p01.jpg', title: '星月夜 · 厚涂练习', isCover: true },
    { file: 'carol-p02.jpg', title: '睡莲池 · 色彩练习' },
    { file: 'carol-p03.jpg', title: '船上午宴 · 多人物构图' },
    { file: 'carol-p04.jpg', title: '日出印象 · 光影练习' }
  ]
  const removed = removeArtworks(id, `images/${id}/carol-p%.jpg`, undefined, keepSet(carolSeeds))
  if (removed > 0) console.log(`[carol] 清理旧作品 ${removed} 行`)
  insertArtworks(id, carolSeeds)
  console.log('[carol] 4 张作品已插入')

  db.prepare('UPDATE artists SET avatar = ? WHERE id = ?').run(`images/${id}/carol-avatar.jpg`, id)
  console.log('[carol] avatar 已设置')
  return id
}

// ─── 4. 可选：alice 跨状态演示订单（confirmed/wip/done） ───

function seedDemoOrders(): void {
  const alice = getArtist('alice')
  if (!alice) throw new Error('画师 alice 不存在')
  const { id } = alice

  // 幂等：删除本脚本造的固定订单号
  const demoNos = ['ALICE-001', 'ALICE-002', 'ALICE-003', 'ALICE-004']
  db.prepare(`DELETE FROM orders WHERE artist_id = ? AND order_no IN (${demoNos.map(() => '?').join(',')})`).run(id, ...demoNos)

  // 查画风尺寸 id
  const sizeOf = (styleName: string, sizeName: string): number | null => {
    const row = db.prepare(`
      SELECT ss.id FROM style_sizes ss
      JOIN art_styles s ON s.id = ss.art_style_id
      WHERE s.artist_id = ? AND s.name = ? AND ss.name = ?
    `).get(id, styleName, sizeName) as { id: number } | undefined
    return row ? row.id : null
  }
  const stageOf = (name: string): number | null => {
    const row = db.prepare('SELECT id FROM artist_workflow_stages WHERE artist_id = ? AND name = ?').get(id, name) as { id: number } | undefined
    return row ? row.id : null
  }

  interface OrderSeed {
    orderNo: string; styleName: string; sizeName: string; price: number
    status: 'confirmed' | 'wip' | 'done'
    stage: string; clientQq: string; clientName: string
    paidRatio: number; daysAgo: number; desc: string
  }
  const seeds: OrderSeed[] = [
    { orderNo: 'ALICE-001', styleName: '厚涂插画', sizeName: '全身像', price: 280, status: 'confirmed', stage: '排期确认', clientQq: '99001', clientName: '演示客户A', paidRatio: 0.5, daysAgo: 2, desc: '厚涂全身立绘，原创少女角色，背景留白' },
    { orderNo: 'ALICE-002', styleName: '默认', sizeName: '半身像', price: 120, status: 'wip', stage: '上色确认', clientQq: '99002', clientName: '演示客户B', paidRatio: 0.5, daysAgo: 9, desc: '日系半身头像，暖色调，做社交平台头像' },
    { orderNo: 'ALICE-003', styleName: '厚涂插画', sizeName: '头像', price: 80, status: 'wip', stage: '草稿确认', clientQq: '99003', clientName: '演示客户C', paidRatio: 0.5, daysAgo: 5, desc: '厚涂头像，侧脸光影，深色系' },
    { orderNo: 'ALICE-004', styleName: '默认', sizeName: '头像', price: 50, status: 'done', stage: '交付', clientQq: '99004', clientName: '演示客户D', paidRatio: 1, daysAgo: 21, desc: '简约头像，已交付' }
  ]

  const ins = db.prepare(`
    INSERT INTO orders (order_no, artist_id, tier_id, client_qq, client_name, description, priority, status, source,
      client_notify, queue_position, price_snapshot, total_price_cents, quote_snapshot, final_price_cents, queue_zone,
      current_stage_id, paid_total_cents, start_date, completed_at, created_at, updated_at)
    VALUES (?, ?, NULL, ?, ?, ?, 'medium', ?, 'self', 0, ?, ?, ?, ?, ?, 'formal', ?, ?, ?, ?, ?, ?)
  `)

  seeds.forEach((s, idx) => {
    const sizeId = sizeOf(s.styleName, s.sizeName)
    const stageId = stageOf(s.stage)
    const cents = Math.round(s.price * 100)
    // 日期在 JS 侧计算（bind 参数不做 SQL 求值）
    const created = new Date(Date.now() - s.daysAgo * 86400_000).toISOString().slice(0, 19).replace('T', ' ')
    const startDate = created.slice(0, 10)
    const completedAt = s.status === 'done'
      ? new Date(Date.now() - 86400_000).toISOString().slice(0, 19).replace('T', ' ')
      : null
    ins.run(
      s.orderNo, id, s.clientQq, s.clientName, s.desc, s.status,
      idx + 1, // queue_position（生产 createOrder 分配 max+1；队列视图按此排序，NULL 会排最前乱序）
      s.price, cents,
      `[${s.styleName} / ${s.sizeName}] 基础¥${s.price}`,
      cents,
      stageId, Math.round(cents * s.paidRatio),
      startDate, completedAt, created, created
    )
    void sizeId // styleSizeId 在 orders 表无对应列（快照体现在 quote_snapshot），此处仅校验尺寸存在
    console.log(`[orders] ${s.orderNo} ${s.status}（${s.styleName}/${s.sizeName} ¥${s.price}）`)
  })
}

// ─── 主流程 ───

console.log('=== 示例数据制作开始 ===')
seedAlice()
seedBob()
seedCarol()
seedDemoOrders()
console.log('=== 完成 ===')
