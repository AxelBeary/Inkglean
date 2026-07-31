import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { cleanDb, seedArtist, seedOrder } from './setup.js'
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs'
import { join, resolve } from 'path'
import * as adminService from '../src/features/admin/admin.service.js'

describe('管理员服务 (Admin Service)', () => {
  beforeEach(() => {
    cleanDb()
  })

  // ─── getGlobalStats ───

  it('TC-AS-01: 空库返回全零', () => {
    const stats = adminService.getGlobalStats()
    expect(stats).toEqual({ artistCount: 0, orderCount: 0, activeOrders: 0 })
  })

  it('TC-AS-02: 多画师多订单正确计数', () => {
    const a1 = seedArtist({ qq_number: '111', subdomain: 'aaa' })
    const a2 = seedArtist({ qq_number: '222', subdomain: 'bbb' })
    seedOrder(a1.id, { status: 'pending' })
    seedOrder(a1.id, { status: 'wip' })
    seedOrder(a2.id, { status: 'delivered' })

    const stats = adminService.getGlobalStats()
    expect(stats.artistCount).toBe(2)
    expect(stats.orderCount).toBe(3)
  })

  it('TC-AS-03: activeOrders 排除 delivered/cancelled', () => {
    const a = seedArtist()
    seedOrder(a.id, { status: 'pending' })
    seedOrder(a.id, { status: 'wip' })
    seedOrder(a.id, { status: 'delivered' })
    seedOrder(a.id, { status: 'cancelled' })
    seedOrder(a.id, { status: 'done' })

    const stats = adminService.getGlobalStats()
    expect(stats.orderCount).toBe(5)
    // ACTIVE_ORDER_SQL = status NOT IN ('delivered', 'cancelled')
    expect(stats.activeOrders).toBe(3) // pending + wip + done
  })

  // ─── listRecycleBin / emptyRecycleBin ───

  const uploadDir = resolve(process.env.UPLOAD_DIR || './uploads')
  const binRoot = join(uploadDir, '.recycle-bin')

  afterEach(() => {
    // 清理测试创建的回收站目录
    if (existsSync(binRoot)) {
      rmSync(binRoot, { recursive: true, force: true })
    }
  })

  it('TC-AS-04: 回收站不存在时返回空数组', () => {
    expect(adminService.listRecycleBin()).toEqual([])
  })

  it('TC-AS-05: 回收站有文件时正确列出', () => {
    // 模拟回收站结构：.recycle-bin/2026-08-01/images/1/avatar.png
    const dateDir = join(binRoot, '2026-08-01', 'images', '1')
    mkdirSync(dateDir, { recursive: true })
    writeFileSync(join(dateDir, 'avatar.png'), 'fake-png-data')

    const items = adminService.listRecycleBin()
    expect(items).toHaveLength(1)
    expect(items[0].fileName).toBe('avatar.png')
    expect(items[0].originalPath).toBe('images/1/avatar.png')
    expect(items[0].size).toBeGreaterThan(0)
    expect(items[0].movedAt).toBeTruthy()
  })

  it('TC-AS-06: 空回收站 emptyRecycleBin 返回 0', () => {
    expect(adminService.emptyRecycleBin()).toBe(0)
  })

  it('TC-AS-07: emptyRecycleBin 返回删除数且文件真没了', () => {
    const dateDir = join(binRoot, '2026-08-01', 'images', '2')
    mkdirSync(dateDir, { recursive: true })
    writeFileSync(join(dateDir, 'a.png'), 'data-a')
    writeFileSync(join(dateDir, 'b.png'), 'data-b')

    const count = adminService.emptyRecycleBin()
    expect(count).toBe(2)
    // 不可逆：目录已删除
    expect(existsSync(binRoot)).toBe(false)
  })

  it('TC-AS-08: 清空后再次 list 返回空', () => {
    const dateDir = join(binRoot, '2026-08-01')
    mkdirSync(dateDir, { recursive: true })
    writeFileSync(join(dateDir, 'x.png'), 'x')

    adminService.emptyRecycleBin()
    expect(adminService.listRecycleBin()).toEqual([])
  })
})
