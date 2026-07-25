import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import * as orderService from '../src/features/order/order.service.js'

describe('订单服务 (Order Service)', () => {
  let artist

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '11111', subdomain: 'alice' })
  })

  // TC-O-01: 创建订单 — 正常流程
  it('TC-O-01: 创建订单返回正确格式', () => {
    const order = orderService.createOrder({
      artistId: artist.id,
      clientQq: '123456',
      source: 'self'
    })

    expect(order.order_no).toBe('A001')
    expect(order.status).toBe('pending')
    expect(order.queue_position).toBe(1)
    expect(order.source).toBe('self')
  })

  // TC-O-02: 创建订单 — 序号递增
  it('TC-O-02: 订单号自动递增', () => {
    orderService.createOrder({ artistId: artist.id, clientQq: '111', source: 'self' })
    const second = orderService.createOrder({ artistId: artist.id, clientQq: '222', source: 'self' })

    expect(second.order_no).toBe('A002')
  })

  // TC-O-03: 创建订单 — 画师不存在
  it('TC-O-03: 画师不存在时抛出错误', () => {
    expect(() => {
      orderService.createOrder({ artistId: 999, clientQq: '123456' })
    }).toThrow('画师不存在')
  })

  // TC-O-04: 订单状态流转 — 合法路径
  it('TC-O-04: 状态按合法路径流转', () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '123456' })
    const flow = ['confirmed', 'wip', 'revision', 'done', 'delivered']

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
    }).toThrow('无效状态')
  })

  // TC-O-06: 交付/取消后队列重排
  it('TC-O-06: 交付后队列位置重排', () => {
    const o1 = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    const o2 = orderService.createOrder({ artistId: artist.id, clientQq: '222' })
    const o3 = orderService.createOrder({ artistId: artist.id, clientQq: '333' })

    orderService.updateOrderStatus(o1.id, 'delivered')

    const queue = orderService.getArtistQueue(artist.id)
    expect(queue).toHaveLength(2)
    expect(queue[0].queue_position).toBe(1)
    expect(queue[1].queue_position).toBe(2)
  })

  // TC-O-07: 拖拽排序 — 优先级继承
  it('TC-O-07: 拖拽到 high 区域继承优先级', () => {
    const high = orderService.createOrder({ artistId: artist.id, clientQq: '111', priority: 'high' })
    const med1 = orderService.createOrder({ artistId: artist.id, clientQq: '222', priority: 'medium' })
    orderService.createOrder({ artistId: artist.id, clientQq: '333', priority: 'medium' })

    // 将 med1 拖到位置 0（high 区域）
    orderService.reorderQueueByDrag(artist.id, med1.id, 0)

    const updated = orderService.getOrder(med1.id)
    expect(updated.priority).toBe('high')
  })

  // TC-O-08: 更新优先级 — 非法值
  it('TC-O-08: 非法优先级抛出错误', () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '123456' })

    expect(() => {
      orderService.updatePriority(order.id, 'urgent')
    }).toThrow('无效优先级')
  })

  // TC-O-09: 客户查询排队位置
  it('TC-O-09: 客户查询返回正确位置', () => {
    orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    const o2 = orderService.createOrder({ artistId: artist.id, clientQq: '222' })
    orderService.createOrder({ artistId: artist.id, clientQq: '333' })

    const result = orderService.getClientQueuePosition(o2.order_no)
    expect(result.position).toBe(2)
    expect(result.total).toBe(3)
  })

  // TC-O-10: 客户查询 — 已交付订单
  it('TC-O-10: 已交付订单位置为 null', () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    orderService.updateOrderStatus(order.id, 'delivered')

    const result = orderService.getClientQueuePosition(order.order_no)
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
    expect(all).toHaveLength(2)

    const confirmed = orderService.getArtistOrders(artist.id, 'confirmed')
    expect(confirmed).toHaveLength(1)
    expect(confirmed[0].id).toBe(o1.id)
  })

  // TC-O-13: 统计数据
  it('TC-O-13: getArtistStats 返回正确统计', () => {
    const o1 = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    orderService.createOrder({ artistId: artist.id, clientQq: '222' })
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
})
