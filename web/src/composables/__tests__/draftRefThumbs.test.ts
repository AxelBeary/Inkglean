// draftRefThumbs 单测（issue #82 补）：草稿参考图现签的三档结局
// 覆盖：空列表不发请求 / 全部签回只补 url 不动顺序 / 签不出的摘掉并回调张数 / 请求失败原样保留
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import type { RefFileItem } from '../../views/client/order-form/types'

const h = vi.hoisted(() => ({
  sign: vi.fn<(paths: string[]) => Promise<Map<string, string>>>()
}))

vi.mock('../../utils/anonUpload.js', () => ({
  signReferenceUrlsWithAnonToken: h.sign
}))

import { hydrateDraftRefUrls } from '../draftRefThumbs'

function item(filePath: string, url: string | null = null): RefFileItem {
  return { name: filePath.split('/').pop()!, uid: `u-${filePath}`, status: 'success', url, filePath }
}

beforeEach(() => {
  vi.clearAllMocks()
  h.sign.mockReset().mockResolvedValue(new Map())
})

describe('hydrateDraftRefUrls', () => {
  it('没有恢复出参考图：不发请求、不动列表', async () => {
    const list = ref<RefFileItem[]>([])
    const onExpired = vi.fn()

    await hydrateDraftRefUrls(list, [], onExpired)

    expect(h.sign).not.toHaveBeenCalled()
    expect(onExpired).not.toHaveBeenCalled()
  })

  it('全部签回：按 filePath 补 url，顺序不变，不报失效', async () => {
    const list = ref<RefFileItem[]>([item('references/b.png'), item('references/a.png')])
    h.sign.mockResolvedValue(new Map([
      ['references/b.png', '/uploads/references/b.png?sig=1'],
      ['references/a.png', '/uploads/references/a.png?sig=2']
    ]))
    const onExpired = vi.fn()

    await hydrateDraftRefUrls(list, ['references/b.png', 'references/a.png'], onExpired)

    expect(list.value.map(f => f.filePath)).toEqual(['references/b.png', 'references/a.png'])
    expect(list.value.map(f => f.url)).toEqual([
      '/uploads/references/b.png?sig=1',
      '/uploads/references/a.png?sig=2'
    ])
    expect(onExpired).not.toHaveBeenCalled()
  })

  it('签不出来的条目：摘掉并回调失效张数（剩下的图与顺序不受影响）', async () => {
    const list = ref<RefFileItem[]>([
      item('references/ok.png'),
      item('references/gone.png'),
      item('references/new.png', '/uploads/references/new.png')
    ])
    h.sign.mockResolvedValue(new Map([['references/ok.png', '/uploads/references/ok.png?sig=1']]))
    const onExpired = vi.fn()

    await hydrateDraftRefUrls(list, ['references/ok.png', 'references/gone.png'], onExpired)

    expect(list.value.map(f => f.filePath)).toEqual(['references/ok.png', 'references/new.png'])
    // 恢复弹窗期间新贴的图（不在本次 paths 里）不能被误摘、url 不能被清
    expect(list.value[1].url).toBe('/uploads/references/new.png')
    expect(onExpired).toHaveBeenCalledWith(1)
  })

  it('请求失败：条目原样保留（filePath 仍可提交），不摘、不报失效', async () => {
    const list = ref<RefFileItem[]>([item('references/a.png')])
    h.sign.mockRejectedValue(new Error('network down'))
    const onExpired = vi.fn()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await hydrateDraftRefUrls(list, ['references/a.png'], onExpired)

    expect(list.value.map(f => f.filePath)).toEqual(['references/a.png'])
    expect(list.value[0].url).toBeNull()
    expect(onExpired).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
