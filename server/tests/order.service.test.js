import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import * as orderService from '../src/features/order/order.service.js'
import { seedArtistStages } from '../src/features/artist/workflow.service.js'

describe('订单服务 (Order Service)', () => {
  let artist

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '11111', subdomain: 'alice' })
  })

  // TC-O-01: 创建订单 — 正常流程（订单号 = 身份码-序号）
  it('TC-O-01: 创建订单返回正确格式', () => {
    const order = orderService.createOrder({
      artistId: artist.id,
      clientQq: '123456',
      source: 'self'
    })

    expect(order.order_no).toBe('ALICE-001')
    expect(order.status).toBe('pending')
    expect(order.queue_position).toBe(1)
    expect(order.source).toBe('self')
  })

  // TC-O-02: 创建订单 — 序号递增
  it('TC-O-02: 订单号自动递增', () => {
    orderService.createOrder({ artistId: artist.id, clientQq: '111', source: 'self' })
    const second = orderService.createOrder({ artistId: artist.id, clientQq: '222', source: 'self' })

    expect(second.order_no).toBe('ALICE-002')
  })

  // TC-O-02b: 订单号 >999 时动态位数
  it('TC-O-02b: 超过999后不补零', () => {
    // 手动插入一个序号为 999 的订单
    db.prepare(`
      INSERT INTO orders (order_no, artist_id, client_qq, priority, status, source, queue_position)
      VALUES ('ALICE-999', ?, '000', 'medium', 'delivered', 'self', 1)
    `).run(artist.id)

    const next = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    expect(next.order_no).toBe('ALICE-1000')
  })

  // TC-O-03: 创建订单 — 画师不存在
  it('TC-O-03: 画师不存在时抛出错误', () => {
    expect(() => {
      orderService.createOrder({ artistId: 999, clientQq: '123456' })
    }).toThrow('ARTIST_NOT_FOUND')
  })

  // TC-O-04: 订单状态流转 — 合法路径
  it('TC-O-04: 状态按合法路径流转', () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '123456' })
    const flow = ['confirmed', 'wip', 'revision', 'wip', 'done', 'delivered']

    for (const status of flow) {
      const updated = orderService.updateOrderStatus(order.id, status)
      expect(updated.status).toBe(status)
    }
  })

  // TC-O-05: 订单状态流转 — 非法状态
  it('TC-O-05: 非法状态抛出错误', () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '123456' })

    expect(() => {
      orderService.updateOrderStatus(order.id, 'invalid_status')
    }).toThrow('ORDER_INVALID_STATUS')
  })

  // TC-O-05b: 状态机 — 不允许跳跃转换
  it('TC-O-05b: pending 不能直接跳到 delivered', () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '123456' })

    expect(() => {
      orderService.updateOrderStatus(order.id, 'delivered')
    }).toThrow('INVALID_TRANSITION')
  })

  // TC-O-06: 交付/取消后队列重排
  it('TC-O-06: 交付后队列位置重排', () => {
    const o1 = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    orderService.createOrder({ artistId: artist.id, clientQq: '222' })
    orderService.createOrder({ artistId: artist.id, clientQq: '333' })

    // 走合法路径到 delivered
    orderService.updateOrderStatus(o1.id, 'confirmed')
    orderService.updateOrderStatus(o1.id, 'wip')
    orderService.updateOrderStatus(o1.id, 'done')
    orderService.updateOrderStatus(o1.id, 'delivered')

    const queue = orderService.getArtistQueue(artist.id)
    expect(queue).toHaveLength(2)
    expect(queue[0].queue_position).toBe(1)
    expect(queue[1].queue_position).toBe(2)
  })

  // TC-O-07: 拖拽排序 — 按传入顺序排列（N1-1: 新语义，拖拽即绝对顺序）
  it('TC-O-07: reorderQueue 按传入顺序重新排列队列', () => {
    const o1 = orderService.createOrder({ artistId: artist.id, clientQq: '111', priority: 'high' })
    const o2 = orderService.createOrder({ artistId: artist.id, clientQq: '222', priority: 'medium' })
    const o3 = orderService.createOrder({ artistId: artist.id, clientQq: '333', priority: 'low' })

    // 倒序拖拽：[o3, o2, o1]
    orderService.reorderQueue(artist.id, [o3.id, o2.id, o1.id])

    const queue = orderService.getArtistQueue(artist.id)
    expect(queue).toHaveLength(3)
    expect(queue[0].id).toBe(o3.id)
    expect(queue[1].id).toBe(o2.id)
    expect(queue[2].id).toBe(o1.id)
    // 优先级不应被拖拽改变
    expect(queue[0].priority).toBe('low')
    expect(queue[2].priority).toBe('high')
  })

  // TC-O-08: 更新优先级 — 非法值
  it('TC-O-08: 非法优先级抛出错误', () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '123456' })

    expect(() => {
      orderService.updatePriority(order.id, 'urgent')
    }).toThrow('INVALID_PRIORITY')
  })

  // TC-O-09: 客户查询排队位置（需 QQ 验证）
  it('TC-O-09: 客户查询返回正确位置', () => {
    orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    const o2 = orderService.createOrder({ artistId: artist.id, clientQq: '222' })
    orderService.createOrder({ artistId: artist.id, clientQq: '333' })

    const result = orderService.getClientQueuePosition(o2.order_no, '222')
    expect(result.position).toBe(2)
    expect(result.total).toBe(3)
  })

  // TC-O-09b: QQ 不匹配时返回 null（防枚举）
  it('TC-O-09b: QQ号不匹配返回 null', () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })

    const result = orderService.getClientQueuePosition(order.order_no, '999')
    expect(result).toBeNull()
  })

  // TC-O-10: 客户查询 — 已交付订单
  it('TC-O-10: 已交付订单位置为 null', () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    orderService.updateOrderStatus(order.id, 'confirmed')
    orderService.updateOrderStatus(order.id, 'wip')
    orderService.updateOrderStatus(order.id, 'done')
    orderService.updateOrderStatus(order.id, 'delivered')

    const result = orderService.getClientQueuePosition(order.order_no, '111')
    expect(result.position).toBeNull()
    expect(result.total).toBeNull()
  })

  // TC-O-11: 添加备注
  it('TC-O-11: 添加备注后订单包含备注', () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    const updated = orderService.addNote(order.id, '测试备注', 'artist')

    expect(updated.notes).toHaveLength(1)
    expect(updated.notes[0].content).toBe('测试备注')
  })

  // TC-O-12: 订单列表 — 状态筛选
  it('TC-O-12: getArtistOrders 按状态筛选', () => {
    const o1 = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    orderService.createOrder({ artistId: artist.id, clientQq: '222' })
    orderService.updateOrderStatus(o1.id, 'confirmed')

    const all = orderService.getArtistOrders(artist.id)
    expect(all.items).toHaveLength(2)

    const confirmed = orderService.getArtistOrders(artist.id, 'confirmed')
    expect(confirmed.items).toHaveLength(1)
    expect(confirmed.items[0].id).toBe(o1.id)
  })

  // TC-O-13: 统计数据
  it('TC-O-13: getArtistStats 返回正确统计', () => {
    const o1 = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    orderService.createOrder({ artistId: artist.id, clientQq: '222' })
    orderService.updateOrderStatus(o1.id, 'confirmed')
    orderService.updateOrderStatus(o1.id, 'wip')
    orderService.updateOrderStatus(o1.id, 'done')
    orderService.updateOrderStatus(o1.id, 'delivered')

    const stats = orderService.getArtistStats(artist.id)
    expect(stats.pendingCount).toBe(1)
    expect(stats.activeCount).toBe(1)
    expect(stats.totalCompleted).toBe(1)
  })

  // TC-O-14: 添加交付文件
  it('TC-O-14: addDeliverable 写入交付记录', () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    orderService.addDeliverable(order.id, 'deliverables/1/test.png', 'test.png', 1024)

    const updated = orderService.getOrder(order.id)
    expect(updated.deliverables).toHaveLength(1)
    expect(updated.deliverables[0].original_name).toBe('test.png')
  })

  // TC-O-15: 凭 QQ 查询客户订单列表
  it('TC-O-15: getClientOrdersByQq 返回该客户订单', () => {
    orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    orderService.createOrder({ artistId: artist.id, clientQq: '222' })

    const orders = orderService.getClientOrdersByQq(artist.id, '111')
    expect(orders).toHaveLength(2)
    expect(orders[0].order_no).toBe('ALICE-002') // 最新的在前
  })

  // TC-O-16: v0.6.3 - 创建订单时快照价格
  it('TC-O-16: createOrder 快照 price_snapshot', () => {
    db.prepare("INSERT INTO price_tiers (artist_id, name, price) VALUES (?, 'headshot', 150)").run(artist.id)
    const tier = db.prepare('SELECT id FROM price_tiers WHERE artist_id=? AND name=?').get(artist.id, 'headshot')

    const order = orderService.createOrder({ artistId: artist.id, tierId: tier.id, clientQq: '111' })
    expect(order.price_snapshot).toBe(150)
    // 快照不应随后续改价变化
    db.prepare('UPDATE price_tiers SET price=999 WHERE id=?').run(tier.id)
    const reloaded = orderService.getOrder(order.id)
    expect(reloaded.price_snapshot).toBe(150)
    expect(reloaded.tier_price).toBe(999) // tier_price 是实时 JOIN 的价格
  })

  // TC-O-17: v0.6.3 - done/delivered 写入 completed_at
  it('TC-O-17: 进入 done 时记录 completed_at', () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    expect(order.completed_at).toBeNull()

    orderService.updateOrderStatus(order.id, 'confirmed')
    orderService.updateOrderStatus(order.id, 'wip')
    const afterWip = orderService.getOrder(order.id)
    expect(afterWip.completed_at).toBeNull()

    orderService.updateOrderStatus(order.id, 'done')
    const afterDone = orderService.getOrder(order.id)
    expect(afterDone.completed_at).not.toBeNull()
    expect(afterDone.completed_at).toBeTruthy()
  })

  // ─── v0.11 新增用例 ───

  // TC-O-18: 报价快照字符串生成
  it('TC-O-18: createOrder 生成 quote_snapshot 字符串', () => {
    db.prepare("INSERT INTO price_tiers (artist_id, name, price) VALUES (?, '头像', 200)").run(artist.id)
    const tier = db.prepare('SELECT id FROM price_tiers WHERE artist_id=? AND name=?').get(artist.id, '头像')

    const order = orderService.createOrder({ artistId: artist.id, tierId: tier.id, clientQq: '111' })
    expect(order.quote_snapshot).toContain('头像')
    expect(order.quote_snapshot).toContain('¥200')
    expect(order.quote_snapshot).toContain('→ 总价')
  })

  // TC-O-18b: 手动录单无价格时 quote_snapshot 为空
  it('TC-O-18b: 无 tierId 时 quote_snapshot 为 null', () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111', source: 'manual' })
    expect(order.quote_snapshot).toBeNull()
  })

  // TC-O-19: 修改最终价格 + 自动备注
  it('TC-O-19: updateFinalPrice 改价并追加备注', () => {
    db.prepare("INSERT INTO price_tiers (artist_id, name, price) VALUES (?, '全身', 500)").run(artist.id)
    const tier = db.prepare('SELECT id FROM price_tiers WHERE artist_id=? AND name=?').get(artist.id, '全身')
    const order = orderService.createOrder({ artistId: artist.id, tierId: tier.id, clientQq: '111' })

    const updated = orderService.updateFinalPrice(order.id, 60000, '全身 ¥500 → 总价 ¥600')
    expect(updated.final_price_cents).toBe(60000)
    expect(updated.quote_snapshot).toBe('全身 ¥500 → 总价 ¥600')

    // 自动备注
    const note = updated.notes.find(n => n.created_by === 'system')
    expect(note).toBeTruthy()
    expect(note.content).toContain('最终价格从')
    expect(note.content).toContain('¥600.00')
  })

  // TC-O-19b: 最终价格校验 — 拒绝非法值
  it('TC-O-19b: updateFinalPrice 拒绝零/负数/超限', () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })

    expect(() => orderService.updateFinalPrice(order.id, 0)).toThrow('INVALID_PRICE')
    expect(() => orderService.updateFinalPrice(order.id, -100)).toThrow('INVALID_PRICE')
    expect(() => orderService.updateFinalPrice(order.id, 100000000)).toThrow('INVALID_PRICE')
    expect(() => orderService.updateFinalPrice(order.id, 99.5)).toThrow('INVALID_PRICE')
  })

  // TC-O-20: 焦点图设置与关闭
  it('TC-O-20: setFocusImage 设置/关闭焦点图', () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    orderService.addReference(order.id, 'references/1/ref1.png', 'ref1.png', 1024)

    // 设置焦点图
    const withFocus = orderService.setFocusImage(order.id, 'references/1/ref1.png', 'large')
    expect(withFocus.focus_image_path).toBe('references/1/ref1.png')
    expect(withFocus.focus_image_mode).toBe('large')

    // 关闭焦点图
    const cleared = orderService.setFocusImage(order.id, null, 'off')
    expect(cleared.focus_image_path).toBeNull()
    expect(cleared.focus_image_mode).toBe('off')
  })

  // TC-O-20b: 焦点图路径必须属于该订单
  it('TC-O-20b: setFocusImage 拒绝非本订单参考图', () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })

    expect(() => {
      orderService.setFocusImage(order.id, 'references/1/not-exist.png', 'small')
    }).toThrow('FOCUS_IMAGE_NOT_OWNED')
  })

  // TC-O-20c: 无效焦点图模式
  it('TC-O-20c: setFocusImage 拒绝无效 mode', () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })

    expect(() => {
      orderService.setFocusImage(order.id, 'x.png', 'huge')
    }).toThrow('INVALID_FOCUS_MODE')
  })

  // TC-O-21: 删除参考图时清理焦点图
  it('TC-O-21: removeReference 删除焦点图参考图时清理字段', () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    orderService.addReference(order.id, 'references/1/focus.png', 'focus.png', 2048)
    orderService.addReference(order.id, 'references/1/other.png', 'other.png', 1024)

    // 设为焦点图
    orderService.setFocusImage(order.id, 'references/1/focus.png', 'small')

    // 找到参考图 ID
    const refs = db.prepare('SELECT * FROM order_references WHERE order_id = ?').all(order.id)
    const focusRef = refs.find(r => r.file_path === 'references/1/focus.png')

    // 删除焦点图参考图
    const afterDelete = orderService.removeReference(order.id, focusRef.id)
    expect(afterDelete.references).toHaveLength(1)
    expect(afterDelete.focus_image_path).toBeNull()
    expect(afterDelete.focus_image_mode).toBe('off')
  })

  // TC-O-21b: 删除非焦点图参考图不影响焦点图
  it('TC-O-21b: removeReference 删除非焦点图不清理焦点字段', () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    orderService.addReference(order.id, 'references/1/focus.png', 'focus.png', 2048)
    orderService.addReference(order.id, 'references/1/other.png', 'other.png', 1024)

    orderService.setFocusImage(order.id, 'references/1/focus.png', 'large')

    const refs = db.prepare('SELECT * FROM order_references WHERE order_id = ?').all(order.id)
    const otherRef = refs.find(r => r.file_path === 'references/1/other.png')

    const afterDelete = orderService.removeReference(order.id, otherRef.id)
    expect(afterDelete.references).toHaveLength(1)
    expect(afterDelete.focus_image_path).toBe('references/1/focus.png')
    expect(afterDelete.focus_image_mode).toBe('large')
  })

  // TC-O-22: 收入统计使用 final_price_cents
  it('TC-O-22: getArtistStats 收入优先使用 final_price_cents', () => {
    db.prepare("INSERT INTO price_tiers (artist_id, name, price) VALUES (?, '测试', 300)").run(artist.id)
    const tier = db.prepare('SELECT id FROM price_tiers WHERE artist_id=? AND name=?').get(artist.id, '测试')

    const order = orderService.createOrder({ artistId: artist.id, tierId: tier.id, clientQq: '111' })
    // 改最终价格为 800 元 = 80000 分
    orderService.updateFinalPrice(order.id, 80000)

    // 走到 done
    orderService.updateOrderStatus(order.id, 'confirmed')
    orderService.updateOrderStatus(order.id, 'wip')
    orderService.updateOrderStatus(order.id, 'done')

    const stats = orderService.getArtistStats(artist.id)
    expect(stats.monthRevenueCents).toBe(80000)
    expect(stats.monthRevenue).toBe(800)
  })

  // TC-O-23: 迁移幂等 — 重复执行不报错
  it('TC-O-23: 迁移 v11 幂等（列已存在时跳过）', async () => {
    // 内存数据库已在 setup 中建表（含 v11 列），再次调用 initDatabase 不应报错
    const { initDatabase } = await import('../src/db/init.js')
    expect(() => initDatabase(db)).not.toThrow()
  })

  // ─── v0.11 R11: track 接口扩展 ───

  // TC-O-24: getClientQueuePosition 返回的订单含 artist_id（供 track 查流程）
  it('TC-O-24: getClientQueuePosition 返回 artist_id 用于查流程', () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    const result = orderService.getClientQueuePosition(order.order_no, '111')
    expect(result).not.toBeNull()
    expect(result.order.artist_id).toBe(artist.id)
  })

  // TC-O-25: current_stage_id 字段存在但无工作流时为 null
  it('TC-O-25: 无工作流时 current_stage_id 为 null', () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    // seedArtist 不创建工作流节点，所以 current_stage_id 为 null
    expect(order.current_stage_id).toBeNull()
  })

  // ─── v0.12 新增用例 ───

  // TC-O-26: addReference 显式传 source（画师图 'artist'，客户图 'client'）
  it('TC-O-26: addReference 显式传 source 值', () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })

    // 客户图（默认 source='client'）
    orderService.addReference(order.id, 'references/1/client.png', 'client.png', 1024)
    // 画师图（显式 source='artist'）
    orderService.addReference(order.id, 'references/1/artist.png', 'artist.png', 2048, 'artist')

    const refs = db.prepare('SELECT * FROM order_references WHERE order_id = ? ORDER BY id').all(order.id)
    expect(refs[0].source).toBe('client')
    expect(refs[1].source).toBe('artist')
  })

  // TC-O-26b: createOrder 的参考图 source='client'（显式传值，不依赖 DEFAULT）
  it('TC-O-26b: createOrder 参考图 source 为 client', () => {
    const order = orderService.createOrder({
      artistId: artist.id,
      clientQq: '111',
      references: ['references/1/a.png', 'references/1/b.png']
    })

    const refs = db.prepare('SELECT * FROM order_references WHERE order_id = ?').all(order.id)
    expect(refs).toHaveLength(2)
    for (const r of refs) {
      expect(r.source).toBe('client')
    }
  })

  // TC-O-27: 参考图 20 张总量限制
  it('TC-O-27: addReference 超 20 张拒绝', () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })

    // 插入 20 张
    for (let i = 0; i < 20; i++) {
      orderService.addReference(order.id, `references/1/img${i}.png`, `img${i}.png`, 100)
    }

    // 第 21 张被拒绝
    expect(() => {
      orderService.addReference(order.id, 'references/1/overflow.png', 'overflow.png', 100)
    }).toThrow('REFERENCES_LIMIT')
  })

  // TC-O-28: getOrder clientOnly 过滤
  it('TC-O-28: getOrder clientOnly 只返回客户图', () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    orderService.addReference(order.id, 'references/1/client.png', 'client.png', 1024, 'client')
    orderService.addReference(order.id, 'references/1/artist.png', 'artist.png', 2048, 'artist')

    // 画师端：看全部
    const full = orderService.getOrder(order.id)
    expect(full.references).toHaveLength(2)

    // 客户端：只看 client
    const clientView = orderService.getOrder(order.id, { clientOnly: true })
    expect(clientView.references).toHaveLength(1)
    expect(clientView.references[0].source).toBe('client')
  })

  // TC-O-28b: getClientQueuePosition 使用 clientOnly
  it('TC-O-28b: 客户查询排队位置只看客户图', () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    orderService.addReference(order.id, 'references/1/client.png', 'client.png', 1024, 'client')
    orderService.addReference(order.id, 'references/1/artist.png', 'artist.png', 2048, 'artist')

    const result = orderService.getClientQueuePosition(order.order_no, '111')
    expect(result.order.references).toHaveLength(1)
    expect(result.order.references[0].source).toBe('client')
  })

  // TC-O-29: addNote 带 imagePath
  it('TC-O-29: addNote 支持可选附图', () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })

    // 纯文字备注
    const noImage = orderService.addNote(order.id, '纯文字', 'artist')
    expect(noImage.notes[0].image_path).toBeNull()

    // 带图备注
    const withImage = orderService.addNote(order.id, '带图', 'artist', 'notes/1/abc.png')
    const noteWithImg = withImage.notes.find(n => n.content === '带图')
    expect(noteWithImg.image_path).toBe('notes/1/abc.png')
  })

  // TC-O-30: 迁移 v12 幂等
  it('TC-O-30: 迁移 v12 幂等（列已存在时跳过）', async () => {
    const { initDatabase } = await import('../src/db/init.js')
    // 内存数据库已在 setup 中建表（含 v12 列），再次调用不应报错
    expect(() => initDatabase(db)).not.toThrow()
  })

  // TC-O-30b: 迁移 v12 列存在性验证
  it('TC-O-30b: 迁移 v12 三列均已存在', () => {
    const artistCols = db.prepare('PRAGMA table_info(artists)').all()
    expect(artistCols.some(c => c.name === 'custom_links')).toBe(true)

    const refCols = db.prepare('PRAGMA table_info(order_references)').all()
    expect(refCols.some(c => c.name === 'source')).toBe(true)

    const noteCols = db.prepare('PRAGMA table_info(order_notes)').all()
    expect(noteCols.some(c => c.name === 'image_path')).toBe(true)
  })

  // TC-O-30c: source DEFAULT 'client' — 存量行读出 'client' 而非 NULL
  it('TC-O-30c: source 列默认值为 client', () => {
    // 直接 SQL 插入不指定 source（模拟存量行）
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    db.prepare('INSERT INTO order_references (order_id, file_path) VALUES (?, ?)').run(order.id, 'references/1/legacy.png')

    const ref = db.prepare('SELECT * FROM order_references WHERE order_id = ? AND file_path = ?').get(order.id, 'references/1/legacy.png')
    expect(ref.source).toBe('client')
  })

  // ─── v0.13 新增用例 ───

  // TC-O-31: 迁移 v13 幂等（login_codes 列类型已为 INTEGER 时跳过）
  it('TC-O-31: 迁移 v13 幂等（列类型已对齐时跳过）', async () => {
    const { initDatabase } = await import('../src/db/init.js')
    // 内存数据库已在 setup 中建表（schema 声明 expires_at INTEGER），再次调用不应报错
    expect(() => initDatabase(db)).not.toThrow()
  })

  // TC-O-31b: login_codes.expires_at 列类型为 INTEGER
  it('TC-O-31b: login_codes.expires_at 列类型为 INTEGER', () => {
    const cols = db.prepare('PRAGMA table_info(login_codes)').all()
    const expiresCol = cols.find(c => c.name === 'expires_at')
    expect(expiresCol.type.toUpperCase()).toBe('INTEGER')
  })

  // ─── v0.13 R30d: 流程状态机 ───

  // TC-O-32: 新订单自动接入工作流
  it('TC-O-32: createOrder 自动设 current_stage_id 为第一节点', () => {
    seedArtistStages(artist.id)
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    expect(order.current_stage_id).not.toBeNull()

    const firstStage = db.prepare(
      'SELECT id FROM artist_workflow_stages WHERE artist_id = ? ORDER BY sort_order ASC LIMIT 1'
    ).get(artist.id)
    expect(order.current_stage_id).toBe(firstStage.id)
    expect(order.status).toBe('pending')
  })

  // TC-O-33: advanceStage 推进 + 状态映射
  it('TC-O-33: advanceStage 推进节点并映射状态', () => {
    seedArtistStages(artist.id)
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    const stages = db.prepare(
      'SELECT * FROM artist_workflow_stages WHERE artist_id = ? ORDER BY sort_order ASC'
    ).all(artist.id)

    // 推进到第 2 个节点（排期确认，收款节点）→ confirmed
    const advanced = orderService.advanceStage(order.id, stages[1].id)
    expect(advanced.current_stage_id).toBe(stages[1].id)
    expect(advanced.status).toBe('confirmed')

    // 推进到第 3 个节点（草稿确认）→ wip
    const advanced2 = orderService.advanceStage(order.id, stages[2].id)
    expect(advanced2.status).toBe('wip')

    // 推进到最后一个节点（交付）→ done
    const last = stages[stages.length - 1]
    const advanced3 = orderService.advanceStage(order.id, last.id)
    expect(advanced3.status).toBe('done')
    expect(advanced3.completed_at).not.toBeNull()
  })

  // TC-O-34: advanceStage 不能后退
  it('TC-O-34: advanceStage 拒绝后退', () => {
    seedArtistStages(artist.id)
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    const stages = db.prepare(
      'SELECT * FROM artist_workflow_stages WHERE artist_id = ? ORDER BY sort_order ASC'
    ).all(artist.id)

    // 先推进到第 3 个
    orderService.advanceStage(order.id, stages[2].id)

    // 尝试回到第 1 个 → 拒绝
    expect(() => {
      orderService.advanceStage(order.id, stages[0].id)
    }).toThrow('INVALID_TRANSITION')
  })

  // TC-O-35: rollbackStage 打回 + revision + 系统备注
  it('TC-O-35: rollbackStage 打回并记录备注', () => {
    seedArtistStages(artist.id)
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    const stages = db.prepare(
      'SELECT * FROM artist_workflow_stages WHERE artist_id = ? ORDER BY sort_order ASC'
    ).all(artist.id)

    // 推进到第 4 个（线稿确认）
    orderService.advanceStage(order.id, stages[3].id)

    // 打回到第 2 个（排期确认）
    const rolledBack = orderService.rollbackStage(order.id, stages[1].id)
    expect(rolledBack.current_stage_id).toBe(stages[1].id)
    expect(rolledBack.status).toBe('revision')

    // 系统备注
    const note = rolledBack.notes.find(n => n.created_by === 'system' && n.content.includes('↩'))
    expect(note).toBeTruthy()
    expect(note.content).toContain('打回')
  })

  // TC-O-36: rollbackStage 不能前进
  it('TC-O-36: rollbackStage 拒绝前进方向', () => {
    seedArtistStages(artist.id)
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    const stages = db.prepare(
      'SELECT * FROM artist_workflow_stages WHERE artist_id = ? ORDER BY sort_order ASC'
    ).all(artist.id)

    // 当前在第 1 个，尝试"打回"到第 3 个 → 拒绝
    expect(() => {
      orderService.rollbackStage(order.id, stages[2].id)
    }).toThrow('INVALID_TRANSITION')
  })

  // TC-O-37: advanceStage(null) 关闭流程跟踪
  it('TC-O-37: advanceStage(null) 关闭流程回退旧模式', () => {
    seedArtistStages(artist.id)
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    expect(order.current_stage_id).not.toBeNull()

    const disabled = orderService.advanceStage(order.id, null)
    expect(disabled.current_stage_id).toBeNull()
  })

  // TC-O-38: getStageInfo 返回进度
  it('TC-O-38: getStageInfo 返回节点名和进度', () => {
    seedArtistStages(artist.id)
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    const info = orderService.getStageInfo(order)

    expect(info.currentStageName).toBe('定稿')
    expect(info.stageProgress.current).toBe(1)
    expect(info.stageProgress.total).toBe(7)
  })

  // TC-O-38b: getStageInfo 无流程时返回 null
  it('TC-O-38b: getStageInfo 无 current_stage_id 返回 null', () => {
    seedArtistStages(artist.id)
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    orderService.advanceStage(order.id, null) // 关闭
    const fresh = orderService.getOrder(order.id)
    expect(orderService.getStageInfo(fresh)).toBeNull()
  })

  // TC-O-39: 迁移 v14 幂等
  it('TC-O-39: 迁移 v14 幂等（current_stage_id 已存在时跳过）', async () => {
    const { initDatabase } = await import('../src/db/init.js')
    expect(() => initDatabase(db)).not.toThrow()
  })

  // TC-O-39b: orders.current_stage_id 列存在
  it('TC-O-39b: orders 表含 current_stage_id 列', () => {
    const cols = db.prepare('PRAGMA table_info(orders)').all()
    expect(cols.some(c => c.name === 'current_stage_id')).toBe(true)
  })

  // ─── v0.14: 启用流程跟踪 ───

  // TC-O-40: enableTracking 正常启用（先建订单后建工作流，模拟历史订单）
  it('TC-O-40: enableTracking 设第一节点且 status 不变', () => {
    // 先建订单（无工作流 → current_stage_id=null）
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    expect(order.current_stage_id).toBeNull()

    // 手动改 status 为 wip，验证 enableTracking 不动 status
    db.prepare("UPDATE orders SET status = 'wip' WHERE id = ?").run(order.id)

    // 后建工作流
    seedArtistStages(artist.id)

    const tracked = orderService.enableTracking(order.id)
    const firstStage = db.prepare(
      'SELECT id FROM artist_workflow_stages WHERE artist_id = ? ORDER BY sort_order ASC LIMIT 1'
    ).get(artist.id)

    expect(tracked.current_stage_id).toBe(firstStage.id)
    expect(tracked.status).toBe('wip') // status 保持不变
  })

  // TC-O-41: enableTracking 已有跟踪 → 409
  it('TC-O-41: enableTracking 已有跟踪抛 TRACK_ALREADY_ON', () => {
    seedArtistStages(artist.id)
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    // createOrder 自动接入工作流，current_stage_id 非 null
    expect(order.current_stage_id).not.toBeNull()

    expect(() => orderService.enableTracking(order.id)).toThrow('TRACK_ALREADY_ON')
  })

  // TC-O-42: enableTracking 无工作流模板 → 400
  it('TC-O-42: enableTracking 无工作流抛 NO_WORKFLOW_TEMPLATE', () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    expect(order.current_stage_id).toBeNull()

    expect(() => orderService.enableTracking(order.id)).toThrow('NO_WORKFLOW_TEMPLATE')
  })

  // ─── v0.15 R46: 备注删除 ───

  // TC-O-43: 正常删除画师备注
  it('TC-O-43: deleteNote 删除画师备注', () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    orderService.addNote(order.id, '要删的备注', 'artist')
    const withNote = orderService.getOrder(order.id)
    expect(withNote.notes).toHaveLength(1)

    const noteId = withNote.notes[0].id
    const afterDelete = orderService.deleteNote(order.id, noteId)
    expect(afterDelete.notes).toHaveLength(0)
  })

  // TC-O-44: 系统备注拒绝删除
  it('TC-O-44: deleteNote 拒绝删除系统备注', () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    // 系统备注（状态变更、改价等场景写入）
    db.prepare("INSERT INTO order_notes (order_id, content, created_by) VALUES (?, '系统记录', 'system')").run(order.id)
    const withNote = orderService.getOrder(order.id)
    const noteId = withNote.notes[0].id

    expect(() => orderService.deleteNote(order.id, noteId)).toThrow('SYSTEM_NOTE_PROTECTED')
  })

  // TC-O-45: 备注不存在 → NOTE_NOT_FOUND
  it('TC-O-45: deleteNote 备注不存在抛 NOTE_NOT_FOUND', () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    expect(() => orderService.deleteNote(order.id, 99999)).toThrow('NOTE_NOT_FOUND')
  })

  // TC-O-46: 带图备注删除（记录删除，图片由 GC 孤儿回收清理）
  it('TC-O-46: deleteNote 删除带图备注', () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    orderService.addNote(order.id, '带图备注', 'artist', 'notes/1/img.png')
    const withNote = orderService.getOrder(order.id)
    expect(withNote.notes[0].image_path).toBe('notes/1/img.png')

    const noteId = withNote.notes[0].id
    const afterDelete = orderService.deleteNote(order.id, noteId)
    expect(afterDelete.notes).toHaveLength(0)
    // 图片文件由 gcUploads 孤儿回收机制自动清理（app.js:60 已收集 order_notes.image_path）
  })

  // ─── v0.15 R52: 今日统计 ───

  // TC-O-47: 今日新增订单金额
  it('TC-O-47: getArtistStats 返回 todayNewOrderCents', () => {
    // 创建有价格的订单
    db.prepare("INSERT INTO price_tiers (artist_id, name, price) VALUES (?, '头像', 200)").run(artist.id)
    const tier = db.prepare('SELECT id FROM price_tiers WHERE artist_id=? AND name=?').get(artist.id, '头像')
    orderService.createOrder({ artistId: artist.id, tierId: tier.id, clientQq: '111' })

    const stats = orderService.getArtistStats(artist.id)
    // 200 元 = 20000 分
    expect(stats.todayNewOrderCents).toBe(20000)
  })

  // TC-O-48: 今日收入（completed_at 在今天）
  it('TC-O-48: getArtistStats 返回 todayRevenueCents', () => {
    db.prepare("INSERT INTO price_tiers (artist_id, name, price) VALUES (?, '全身', 500)").run(artist.id)
    const tier = db.prepare('SELECT id FROM price_tiers WHERE artist_id=? AND name=?').get(artist.id, '全身')
    const order = orderService.createOrder({ artistId: artist.id, tierId: tier.id, clientQq: '111' })

    // 走到 done（completed_at = 当前时间 = 今天）
    orderService.updateOrderStatus(order.id, 'confirmed')
    orderService.updateOrderStatus(order.id, 'wip')
    orderService.updateOrderStatus(order.id, 'done')

    const stats = orderService.getArtistStats(artist.id)
    expect(stats.todayRevenueCents).toBe(50000)
  })

  // TC-O-49: 无数据时返回 0
  it('TC-O-49: 无订单时今日统计为 0', () => {
    const stats = orderService.getArtistStats(artist.id)
    expect(stats.todayNewOrderCents).toBe(0)
    expect(stats.todayRevenueCents).toBe(0)
  })

  // TC-O-50: 昨天的订单不计入今日统计
  it('TC-O-50: 昨天创建的订单不计入 todayNewOrderCents', () => {
    db.prepare("INSERT INTO price_tiers (artist_id, name, price) VALUES (?, '测试', 100)").run(artist.id)
    const tier = db.prepare('SELECT id FROM price_tiers WHERE artist_id=? AND name=?').get(artist.id, '测试')
    const order = orderService.createOrder({ artistId: artist.id, tierId: tier.id, clientQq: '111' })

    // 手动把 created_at 改为昨天
    db.prepare("UPDATE orders SET created_at = datetime('now', '-1 day') WHERE id = ?").run(order.id)

    const stats = orderService.getArtistStats(artist.id)
    expect(stats.todayNewOrderCents).toBe(0)
  })

  // ─── v0.15 R51: 截稿日 ───

  // TC-O-51: 迁移 v15 幂等
  it('TC-O-51: 迁移 v15 幂等（accent_color + deadline 已存在时跳过）', async () => {
    const { initDatabase } = await import('../src/db/init.js')
    expect(() => initDatabase(db)).not.toThrow()
  })

  // TC-O-51b: 迁移 v15 列存在性
  it('TC-O-51b: artists.accent_color + orders.deadline 列存在', () => {
    const artistCols = db.prepare('PRAGMA table_info(artists)').all()
    expect(artistCols.some(c => c.name === 'accent_color')).toBe(true)

    const orderCols = db.prepare('PRAGMA table_info(orders)').all()
    expect(orderCols.some(c => c.name === 'deadline')).toBe(true)
  })

  // TC-O-52: updateDeadline 设置截稿日
  it('TC-O-52: updateDeadline 设置和清除截稿日', () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    expect(order.deadline).toBeNull()

    // 设置（ISO 8601 输入 → SQLite 格式存储）
    const withDeadline = orderService.updateDeadline(order.id, '2026-08-15T00:00:00.000Z')
    expect(withDeadline.deadline).toBe('2026-08-15 00:00:00')

    // 清除
    const cleared = orderService.updateDeadline(order.id, null)
    expect(cleared.deadline).toBeNull()
  })

  // TC-O-53: updateDeadline 拒绝非法格式
  it('TC-O-53: updateDeadline 拒绝非法日期', () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    expect(() => orderService.updateDeadline(order.id, 'not-a-date')).toThrow('INVALID_DEADLINE')
  })

  // TC-O-54: getUpcomingDeadlines 返回 7 天内到期订单
  it('TC-O-54: getUpcomingDeadlines 返回即将到期订单', () => {
    const o1 = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    const o2 = orderService.createOrder({ artistId: artist.id, clientQq: '222' })
    const o3 = orderService.createOrder({ artistId: artist.id, clientQq: '333' })

    // o1: 3 天后到期（应出现）
    const d3 = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
    orderService.updateDeadline(o1.id, d3)

    // o2: 10 天后到期（超出 7 天，不出现）
    const d10 = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString()
    orderService.updateDeadline(o2.id, d10)

    // o3: 已取消（不出现）
    const d1 = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString()
    orderService.updateDeadline(o3.id, d1)
    orderService.updateOrderStatus(o3.id, 'cancelled')

    const upcoming = orderService.getUpcomingDeadlines(artist.id)
    expect(upcoming).toHaveLength(1)
    expect(upcoming[0].id).toBe(o1.id)
    expect(upcoming[0].order_no).toBe(o1.order_no)
  })

  // TC-O-55: todayTodoCount 统计
  it('TC-O-55: getArtistStats 返回 todayTodoCount', () => {
    // pending 订单（应计入）
    orderService.createOrder({ artistId: artist.id, clientQq: '111' })

    // wip 订单（不计入，除非今天截稿）
    const o2 = orderService.createOrder({ artistId: artist.id, clientQq: '222' })
    orderService.updateOrderStatus(o2.id, 'confirmed')
    orderService.updateOrderStatus(o2.id, 'wip')

    // wip + 今天截稿（应计入）
    const o3 = orderService.createOrder({ artistId: artist.id, clientQq: '333' })
    orderService.updateOrderStatus(o3.id, 'confirmed')
    orderService.updateOrderStatus(o3.id, 'wip')
    const today = new Date()
    today.setHours(12, 0, 0, 0)
    orderService.updateDeadline(o3.id, today.toISOString())

    const stats = orderService.getArtistStats(artist.id)
    // pending(1) + wip今天截稿(1) = 2
    expect(stats.todayTodoCount).toBe(2)
  })
})
