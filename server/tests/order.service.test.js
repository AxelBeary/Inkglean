import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import * as orderService from '../src/features/order/order.service.js'

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

  // TC-O-25: current_stage_id 字段不存在时返回 undefined（路由层 ?? null）
  it('TC-O-25: 订单无 current_stage_id 字段（迁移 v12 前）', () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    // 迁移 v12 前 orders 表无此列，getOrder 返回的对象不含该字段
    expect(order.current_stage_id).toBeUndefined()
  })
})
