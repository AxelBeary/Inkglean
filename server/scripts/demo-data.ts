/**
 * 示例数据制作脚本（v0.32 演示底数据）
 *
 * 设计：在 commission-web 容器内运行，复用运行中的 DB 连接（不碰 WAL 锁）。
 *   docker cp server/scripts/demo-data.ts commission-web:/app/server/scripts/demo-data.ts
 *   docker exec -w /app/server commission-web npx tsx scripts/demo-data.ts
 * （生产镜像 COPY server/ 已含脚本，重建后直接执行第二条即可）
 *
 * 幂等：可重复执行，结果一致（先按标记清理旧数据再插入）。
 * 图片：全部为网上 CC0 / 公有领域 / Unsplash 来源，已预先下载到 uploads/images/ 下。
 *       来源与许可证清单见 docs/comms/03-to-01-示例数据交付-*.md。
 */
import db from '../src/db/connection.js'
import { seedArtistStages } from '../src/features/artist/workflow.service.js'
import { generateInstallmentsForOrder, refreshInstallmentLocks, checkOrderConservation } from '../src/features/order/order.service.js'
import { existsSync, unlinkSync, renameSync } from 'fs'
import sharp from 'sharp'

const UPLOAD_ROOT = '/app/uploads'

/** 用 sharp 读取图片实际宽高（读失败返回 null，不阻塞插入——但会打警告） */
async function readDims(absPath: string): Promise<{ width: number; height: number } | null> {
  try {
    const meta = await sharp(absPath).metadata()
    if (meta.width && meta.height) return { width: meta.width, height: meta.height }
  } catch (err) {
    console.warn(`[dims] 读取失败：${absPath} — ${(err as Error).message}`)
  }
  return null
}

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

async function insertArtworks(artistId: number, seeds: ArtworkSeed[]): Promise<void> {
  const stmt = db.prepare(
    'INSERT INTO artworks (artist_id, image_path, title, sort_order, is_cover, width, height) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  for (let i = 0; i < seeds.length; i++) {
    const s = seeds[i]
    // 用 sharp 读实际尺寸写入（客户端画廊靠 width/height 生成 aspect-ratio 占位，缺失会布局跳动）
    const dims = await readDims(`${UPLOAD_ROOT}/images/${artistId}/${s.file}`)
    if (!dims) console.warn(`[artworks] ${s.file} 无尺寸信息，width/height 留 NULL（画廊占位会失效）`)
    stmt.run(artistId, `images/${artistId}/${s.file}`, s.title, i + 1, s.isCover ? 1 : 0, dims?.width ?? null, dims?.height ?? null)
  }
}

function setStyleCover(styleId: number, coverImagePath: string): void {
  db.prepare('UPDATE art_styles SET cover_image = ? WHERE id = ?').run(coverImagePath, styleId)
}

// ─── 1. alice：多画风演示（日系，接单中） ───

async function seedAlice(): Promise<void> {
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
  await insertArtworks(id, aliceSeeds)
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

async function seedBob(): Promise<void> {
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
  await insertArtworks(id, bobSeeds)
  console.log('[bob] 插入 6 张真实作品')

  db.prepare('UPDATE artists SET avatar = ? WHERE id = ?').run(`images/${id}/bob-avatar.jpg`, id)

  const defaultStyle = db.prepare("SELECT id FROM art_styles WHERE artist_id = ? AND name = '默认'").get(id) as { id: number } | undefined
  if (defaultStyle) setStyleCover(defaultStyle.id, `images/${id}/bob-p01.jpg`)
  console.log('[bob] avatar + 默认画风封面已设置')
}

// ─── 3. carol：旧模型画师（单画风退化路径演示） ───

async function seedCarol(): Promise<number> {
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

    // 画风与尺寸（v50 SPEC-PRICE-2：旧 price_tiers 已清退，改为 art_styles/style_sizes 默认画风）
    const defaultStyle = db.prepare("SELECT id FROM art_styles WHERE artist_id = ? AND name = '默认'").get(id) as { id: number } | undefined
    if (defaultStyle) {
      console.log(`[carol] 默认画风已存在(${defaultStyle.id})，跳过创建`)
    } else {
      const r = db.prepare(
        "INSERT INTO art_styles (artist_id, name, description, cover_image, sort_order, is_active) VALUES (?, '默认', '自由插画师默认画风，印象派光影与厚涂肌理', ?, 1, 1)"
      ).run(id, `images/${id}/carol-p01.jpg`)
      const styleId = Number(r.lastInsertRowid)
      const sizes: Array<[string, number, string]> = [
        ['头像插画', 60, `images/${id}/carol-p01.jpg`],
        ['半身场景', 150, `images/${id}/carol-p02.jpg`],
        ['全身插画', 260, `images/${id}/carol-p03.jpg`]
      ]
      const ins = db.prepare('INSERT INTO style_sizes (art_style_id, name, base_price, sort_order, image) VALUES (?, ?, ?, ?, ?)')
      sizes.forEach(([name, price, image], i) => ins.run(styleId, name, price, i + 1, image))
      console.log(`[carol] 默认画风(${styleId})已创建，3 个尺寸：头像插画¥60 / 半身场景¥150 / 全身插画¥260`)
    }

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
  await insertArtworks(id, carolSeeds)
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

  // 幂等：删除本脚本管理的固定订单号 + 历史遗留的 ALICE-% 测试单
  // （08-04 用户终验残留的 ALICE-005~014：testa/testtas/H1实测/横幅实测等，重建即清理，属预期收益——
  //   这些单直插自旧 demo 流程，无条目账本，不能通过守恒断言，必须随重建清掉）
  db.prepare(`DELETE FROM orders WHERE artist_id = ? AND order_no LIKE 'ALICE-%'`).run(id)

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
    /** 截稿日 = start_date + N 天（五号 0803 诊断：deadline 全 NULL 导致时间条整条平移被禁用；done 终态不补） */
    deadlineDays?: number
  }
  const seeds: OrderSeed[] = [
    { orderNo: 'ALICE-001', styleName: '厚涂插画', sizeName: '全身像', price: 280, status: 'confirmed', stage: '排期确认', clientQq: '99001', clientName: '演示客户A', paidRatio: 0.5, daysAgo: 2, desc: '厚涂全身立绘，原创少女角色，背景留白', deadlineDays: 7 },
    { orderNo: 'ALICE-002', styleName: '默认', sizeName: '半身像', price: 120, status: 'wip', stage: '上色确认', clientQq: '99002', clientName: '演示客户B', paidRatio: 0.5, daysAgo: 9, desc: '日系半身头像，暖色调，做社交平台头像', deadlineDays: 10 },
    { orderNo: 'ALICE-003', styleName: '厚涂插画', sizeName: '头像', price: 80, status: 'wip', stage: '草稿确认', clientQq: '99003', clientName: '演示客户C', paidRatio: 0.5, daysAgo: 5, desc: '厚涂头像，侧脸光影，深色系', deadlineDays: 14 },
    { orderNo: 'ALICE-004', styleName: '默认', sizeName: '头像', price: 50, status: 'done', stage: '交付', clientQq: '99004', clientName: '演示客户D', paidRatio: 1, daysAgo: 21, desc: '简约头像，已交付' }
  ]

  // M4 字段清单（与 orders 表展示依赖对齐，漏列 = 静默 NULL，下方 assertFieldIntegrity 兜底）：
  //   order_no / artist_id / client_qq / client_name / description / priority / status / source /
  //   client_notify / queue_position / price_snapshot / total_price_cents / quote_snapshot /
  //   final_price_cents / queue_zone / current_stage_id / paid_total_cents /
  //   start_date / deadline / completed_at / created_at / updated_at
  const ins = db.prepare(`
    INSERT INTO orders (order_no, artist_id, client_qq, client_name, description, priority, status, source,
      client_notify, queue_position, price_snapshot, total_price_cents, quote_snapshot, final_price_cents, queue_zone,
      current_stage_id, paid_total_cents, start_date, deadline, completed_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'medium', ?, 'self', 0, ?, ?, ?, ?, ?, 'formal', ?, ?, ?, ?, ?, ?, ?)
  `)

  seeds.forEach((s, idx) => {
    const sizeId = sizeOf(s.styleName, s.sizeName)
    const stageId = stageOf(s.stage)
    const cents = Math.round(s.price * 100)
    // 日期在 JS 侧计算（bind 参数不做 SQL 求值）
    const created = new Date(Date.now() - s.daysAgo * 86400_000).toISOString().slice(0, 19).replace('T', ' ')
    const startDate = created.slice(0, 10)
    // 截稿日：start_date + deadlineDays 天（本地日期计算，避免 toISOString 时区偏移——v0.26 UTC 教训）
    let deadline: string | null = null
    if (s.deadlineDays != null) {
      const d = new Date(created)
      d.setDate(d.getDate() + s.deadlineDays)
      deadline = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    const completedAt = s.status === 'done'
      ? new Date(Date.now() - 86400_000).toISOString().slice(0, 19).replace('T', ' ')
      : null
    const paidCents = Math.round(cents * s.paidRatio)
    const r = ins.run(
      s.orderNo, id, s.clientQq, s.clientName, s.desc, s.status,
      idx + 1, // queue_position（生产 createOrder 分配 max+1；队列视图按此排序，NULL 会排最前乱序）
      s.price, cents,
      `[${s.styleName} / ${s.sizeName}] 基础¥${s.price}`,
      cents,
      stageId, paidCents,
      startDate, deadline, completedAt, created, created
    )
    // REQ-025 二阶段切流：直插 orders 绕过了 createOrder，补齐新模型四要素：
    //   1. base 条目（= 总价，条目账本是总价真相源；与 createOrder 的 appendPriceEntry('base') 同构）
    //   2. generateInstallmentsForOrder 生成分期（已是引擎 allocateInitial 实现，幂等）
    //   3. refreshInstallmentLocks 按剧本已收金额 + 当前阶段推导 locked/locked_reason（付清=paidOff / 完成=completed）
    //   4. checkOrderConservation 守恒自检（Σ节点价+额外项 ≡ Σ条目 ≡ final_price_cents，失败抛错中止）
    // （幂等：本函数开头 DELETE 订单时 FK CASCADE 已清掉旧节点与旧条目）
    const orderId = Number(r.lastInsertRowid)
    db.prepare(
      "INSERT INTO order_price_entries (order_id, type, delta_cents, name, created_by) VALUES (?, 'base', ?, '初始报价', 'system')"
    ).run(orderId, cents)
    generateInstallmentsForOrder(orderId)
    refreshInstallmentLocks(orderId)
    checkOrderConservation(orderId)
    // 批4 A5：补写收款流水（双源对账：Σ order_payments = paid_total_cents；FK CASCADE 随订单重建自动清理）
    db.prepare(
      "INSERT INTO order_payments (order_id, installment_id, amount_cents, note, created_by) VALUES (?, NULL, ?, '演示收款', 'demo')"
    ).run(orderId, paidCents)
    void sizeId // styleSizeId 在 orders 表无对应列（快照体现在 quote_snapshot），此处仅校验尺寸存在
    console.log(`[orders] ${s.orderNo} ${s.status}（${s.styleName}/${s.sizeName} ¥${s.price}）`)
  })
}

// ─── 5. 存量行回填：width/height 为 NULL 的 artworks 用 sharp 补尺寸（幂等，只碰 NULL 行） ───

async function backfillMissingDims(): Promise<void> {
  const rows = db.prepare('SELECT id, image_path FROM artworks WHERE width IS NULL OR height IS NULL').all() as Array<{ id: number; image_path: string }>
  if (rows.length === 0) {
    console.log('[backfill] 无 width/height 缺失行，跳过')
    return
  }
  console.log(`[backfill] 待回填 ${rows.length} 行`)
  const update = db.prepare('UPDATE artworks SET width = ?, height = ? WHERE id = ?')
  let ok = 0
  let fail = 0
  for (const r of rows) {
    const dims = await readDims(`${UPLOAD_ROOT}/${r.image_path}`)
    if (dims) {
      update.run(dims.width, dims.height, r.id)
      ok++
    } else {
      console.warn(`[backfill] #${r.id} 无尺寸：${r.image_path}`)
      fail++
    }
  }
  console.log(`[backfill] 完成：成功 ${ok}，失败 ${fail}`)
}

// ─── 6. M4 修复：字段完整性断言（两次事故：deadline / width-height 漏字段静默通过） ───

/**
 * 对演示数据做字段清单断言：展示层依赖的字段一个不能静默 NULL，否则抛错中止。
 * 清单来源：看板/时间条（queue_position、start_date、deadline、current_stage_id）、
 * 收款展示（price_snapshot、total_price_cents、final_price_cents、paid_total_cents）、
 * 画廊占位（width、height）。
 */
function assertFieldIntegrity(): void {
  const problems: string[] = []

  // 1. 演示订单
  const orders = db.prepare("SELECT * FROM orders WHERE order_no LIKE 'ALICE-%'").all() as Array<Record<string, unknown> & { order_no: string; status: string }>
  for (const o of orders) {
    const missing: string[] = []
    if (o.queue_position == null) missing.push('queue_position')
    if (o.price_snapshot == null) missing.push('price_snapshot')
    if (o.total_price_cents == null) missing.push('total_price_cents')
    if (o.final_price_cents == null) missing.push('final_price_cents')
    if (o.paid_total_cents == null) missing.push('paid_total_cents')
    if (o.start_date == null) missing.push('start_date')
    // done 终态不要求 deadline/current_stage_id（与 OrderSeed.deadlineDays 注释一致）
    if (o.status !== 'done' && o.deadline == null) missing.push('deadline')
    if (o.status !== 'done' && o.current_stage_id == null) missing.push('current_stage_id')
    if (missing.length > 0) problems.push(`订单 ${o.order_no} 缺字段：${missing.join(', ')}`)
    // C-4 延伸：正式区有报价的订单必须有 ≥1 条分期行（对齐 createOrder 的分期生成条件）
    if (o.queue_zone === 'formal' && (o.total_price_cents as number) > 0) {
      const instCount = (db.prepare('SELECT COUNT(*) as c FROM order_payment_installments WHERE order_id = ?').get(o.id) as { c: number }).c
      if (instCount === 0) problems.push(`订单 ${o.order_no} 正式区有报价却无分期节点`)
    }
    // REQ-025 二阶段切流断言（demo-data 走引擎入口后的数据层对账）：
    //   a) 正式区有报价订单必须有 ≥1 条 base 条目（账本起点 = 总价）
    //   b) Σ条目delta = final_price_cents（A1 数据层对账：条目账本是总价真相源）
    //   c) Σ节点价 = final_price_cents（仅无额外项订单；有额外项的单由 checkOrderConservation A1 兜底）
    //   d) locked=1 的节点必有 locked_reason
    if (o.queue_zone === 'formal' && (o.total_price_cents as number) > 0) {
      const baseCount = (db.prepare("SELECT COUNT(*) as c FROM order_price_entries WHERE order_id = ? AND type = 'base'").get(o.id) as { c: number }).c
      if (baseCount === 0) problems.push(`订单 ${o.order_no} 正式区有报价却无 base 条目`)
      const entrySum = (db.prepare('SELECT COALESCE(SUM(delta_cents), 0) as s FROM order_price_entries WHERE order_id = ?').get(o.id) as { s: number }).s
      if (entrySum !== (o.final_price_cents as number)) {
        problems.push(`订单 ${o.order_no} Σ条目delta=${entrySum} ≠ final_price_cents=${o.final_price_cents}`)
      }
      // 批4 A5：双源对账——Σ收款流水 = paid_total_cents（真实库 ALICE-001~004 曾不一致，随本批修复）
      const paySum = (db.prepare('SELECT COALESCE(SUM(amount_cents), 0) as s FROM order_payments WHERE order_id = ?').get(o.id) as { s: number }).s
      if (paySum !== (o.paid_total_cents as number)) {
        problems.push(`订单 ${o.order_no} Σ流水=${paySum} ≠ paid_total_cents=${o.paid_total_cents}`)
      }
      const extraCount = (db.prepare('SELECT COUNT(*) as c FROM order_extra_items WHERE order_id = ?').get(o.id) as { c: number }).c
      if (extraCount === 0) {
        const nodeSum = (db.prepare('SELECT COALESCE(SUM(amount_cents), 0) as s FROM order_payment_installments WHERE order_id = ?').get(o.id) as { s: number }).s
        if (nodeSum !== (o.final_price_cents as number)) {
          problems.push(`订单 ${o.order_no} Σ节点价=${nodeSum} ≠ final_price_cents=${o.final_price_cents}`)
        }
      }
      const lockedMissing = (db.prepare(
        "SELECT COUNT(*) as c FROM order_payment_installments WHERE order_id = ? AND locked = 1 AND (locked_reason IS NULL OR locked_reason = '')"
      ).get(o.id) as { c: number }).c
      if (lockedMissing > 0) problems.push(`订单 ${o.order_no} 存在 ${lockedMissing} 个 locked=1 但缺 locked_reason 的节点`)
    }
  }

  // 2. 演示作品（画廊 aspect-ratio 占位依赖 width/height）
  const arts = db.prepare(`
    SELECT id, image_path, width, height FROM artworks
    WHERE image_path LIKE '%/alice-p%.jpg' OR image_path LIKE '%/bob-p%.jpg' OR image_path LIKE '%/carol-p%.jpg'
  `).all() as Array<{ id: number; image_path: string; width: number | null; height: number | null }>
  for (const a of arts) {
    if (a.width == null || a.height == null) problems.push(`作品 #${a.id}（${a.image_path}）缺 width/height`)
  }

  if (problems.length > 0) {
    throw new Error('字段完整性断言失败：\n  - ' + problems.join('\n  - '))
  }
  console.log(`[integrity] 字段完整性断言通过（订单 ${orders.length} 条，作品 ${arts.length} 张）`)
}

// ─── 主流程 ───

async function main(): Promise<void> {
  console.log('=== 示例数据制作开始 ===')
  await seedAlice()
  await seedBob()
  await seedCarol()
  seedDemoOrders()
  await backfillMissingDims()
  assertFieldIntegrity()
  console.log('=== 完成 ===')
}

main().catch(err => {
  console.error('=== 失败 ===', err)
  process.exit(1)
})
