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
})
