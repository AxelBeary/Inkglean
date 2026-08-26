// 本地核心环波9 测试：数据导出——manifest 组装/设置快照纯函数 + 桥逃生门。
import { describe, it, expect, beforeEach } from 'vitest'
import { buildManifest, dumpLocalPrefs, runExport } from '../tools/exportData'
import { fileSizes, localDbPath } from '../bridge'
import { BridgeUnavailableError } from '../bridge'
import type { LocalFile } from '../stores/localFiles'
import type { LocalOrder } from '../stores/localLedger'

beforeEach(() => localStorage.clear())

function file(p: Partial<LocalFile>): LocalFile {
  return { id: p.id ?? 1, order_id: p.order_id ?? 1, file_name: p.file_name ?? 'a.csp', file_path: p.file_path ?? 'D:\\a.csp', added_at: p.added_at ?? '' }
}

function order(p: Partial<LocalOrder>): LocalOrder {
  return {
    id: p.id ?? 1, client_name: p.client_name ?? '张三', title: p.title ?? '头像',
    price: p.price ?? 100, deadline: p.deadline ?? null, status: p.status ?? 'draft',
    created_at: '', updated_at: ''
  }
}

describe('buildManifest（文件清单组装）', () => {
  it('路径/大小/所属委托三件齐', () => {
    const m = buildManifest([file({ order_id: 7, file_path: 'D:\\稿\\b.psd' })], [order({ id: 7, client_name: '李四', title: '全身' })], [2048])
    expect(m).toEqual([{ path: 'D:\\稿\\b.psd', size: 2048, client: '李四', title: '全身', added_at: '' }])
  })

  it('委托查不到时留空不炸（孤儿文件容忍）', () => {
    const m = buildManifest([file({ order_id: 99 })], [], [0])
    expect(m[0].client).toBe('')
    expect(m[0].title).toBe('')
  })

  it('sizes 缺位落 0', () => {
    const m = buildManifest([file({}), file({ id: 2, file_path: 'c.png' })], [], [100])
    expect(m[0].size).toBe(100)
    expect(m[1].size).toBe(0)
  })
})

describe('dumpLocalPrefs（本地设置快照）', () => {
  it('只收 shihui- 与 huiyue_ 前缀键', () => {
    localStorage.setItem('shihui-desktop-prefs-v1', '{}')
    localStorage.setItem('huiyue_price_card_draft', '{}')
    localStorage.setItem('other-key', 'x')
    const dump = dumpLocalPrefs(localStorage)
    expect(Object.keys(dump).sort()).toEqual(['huiyue_price_card_draft', 'shihui-desktop-prefs-v1'])
  })

  it('空存储返空对象', () => {
    expect(dumpLocalPrefs(localStorage)).toEqual({})
  })
})

describe('导出执行与桥逃生门（纯浏览器环境）', () => {
  it('runExport 在浏览器环境返失败（不抛）', async () => {
    const r = await runExport([], [])
    expect(r.ok).toBe(false)
  })

  it('fileSizes/localDbPath 在浏览器环境抛 BridgeUnavailableError', async () => {
    await expect(fileSizes(['a'])).rejects.toThrow(BridgeUnavailableError)
    await expect(localDbPath()).rejects.toThrow(BridgeUnavailableError)
  })

  it('fileSizes 空入参不走桥', async () => {
    await expect(fileSizes([])).resolves.toEqual([])
  })
})
