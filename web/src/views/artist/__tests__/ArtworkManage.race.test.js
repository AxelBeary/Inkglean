// 围剿 a1-12/a1-13: ArtworkManage 删除失败明示（不吞成取消）+ 分页/刷新请求序号守卫
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key })
}))

const h = vi.hoisted(() => ({
  getArtworksPaged: vi.fn(),
  getArtStyles: vi.fn(),
  deleteArtwork: vi.fn(),
  confirm: vi.fn(() => Promise.resolve('confirm')),
  msgSuccess: vi.fn(),
  msgError: vi.fn(),
  msgWarning: vi.fn()
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: h.msgSuccess, error: h.msgError, warning: h.msgWarning, info: vi.fn() },
  ElMessageBox: { confirm: h.confirm }
}))

vi.mock('../../../api/index.js', () => ({
  artistApi: {
    getArtworksPaged: h.getArtworksPaged,
    getArtStyles: h.getArtStyles,
    deleteArtwork: h.deleteArtwork,
    createArtwork: vi.fn(),
    setArtworkCover: vi.fn(),
    unsetArtworkCover: vi.fn(),
    reorderCovers: vi.fn(),
    updateArtwork: vi.fn(),
    setArtworkTags: vi.fn()
  },
  uploadApi: { image: vi.fn() }
}))

vi.mock('../../../utils/track.js', () => ({
  trackEvent: vi.fn()
}))

vi.mock('../../../composables/usePasteUpload.js', () => ({
  usePasteUpload: () => ({ pasteError: ref(null) })
}))
vi.mock('../../../composables/useDropGuard.js', () => ({
  useDropGuard: () => ({
    guardDragEnter: () => true,
    guardDragOver: () => true,
    guardDrop: () => true
  })
}))
vi.mock('../../../composables/useSlideConfirm.js', () => ({
  useSlideConfirm: () => ({
    progress: ref(0),
    onStart: () => {},
    onMove: () => {},
    onEnd: () => {}
  })
}))

import ArtworkManage from '../ArtworkManage.vue'

async function mountArtwork() {
  h.getArtworksPaged.mockImplementation(() => Promise.resolve({ items: [], total: 0 }))
  h.getArtStyles.mockResolvedValue([])
  const wrapper = shallowMount(ArtworkManage, {
    global: {
      mocks: { $t: (key) => key, $tm: () => [] },
      directives: { loading: () => {} }
    }
  })
  await flushPromises()
  return wrapper
}

describe('ArtworkManage 删除错误分支 + 分页守卫（a1-12/a1-13）', () => {
  beforeEach(() => {
    h.getArtworksPaged.mockReset()
    h.getArtStyles.mockReset()
    h.deleteArtwork.mockReset()
    h.confirm.mockReset()
    h.confirm.mockImplementation(() => Promise.resolve('confirm'))
    h.msgSuccess.mockClear()
    h.msgError.mockClear()
  })

  it('a1-12: 删除 API 失败时明示错误（不再当用户取消吞掉）', async () => {
    h.deleteArtwork.mockRejectedValue(new Error('delete boom'))
    const wrapper = await mountArtwork()

    await wrapper.vm.remove({ id: 1 })
    await flushPromises()

    expect(h.confirm).toHaveBeenCalledTimes(1)
    expect(h.msgError).toHaveBeenCalledWith('delete boom')
    expect(h.msgSuccess).not.toHaveBeenCalled()
  })

  it('a1-12: 用户取消确认时不调用删除 API', async () => {
    h.confirm.mockRejectedValue('cancel')
    const wrapper = await mountArtwork()

    await wrapper.vm.remove({ id: 1 })
    await flushPromises()

    expect(h.deleteArtwork).not.toHaveBeenCalled()
    expect(h.msgError).not.toHaveBeenCalled()
  })

  it('a1-13: 上传刷新与翻页并发时旧响应不覆盖新页', async () => {
    const deferreds = []
    const wrapper = await mountArtwork()
    h.getArtworksPaged.mockImplementation(() => new Promise((resolve) => {
      deferreds.push(resolve)
    }))

    // 并发两次刷新：先发 seq2、后发 seq3
    wrapper.vm.loadArtworks()
    wrapper.vm.loadArtworks()

    // 最新请求（seq3）先回 → 写入
    deferreds[1]({ items: [{ id: 2 }], total: 1 })
    await flushPromises()
    expect(wrapper.vm.artworks.map(a => a.id)).toEqual([2])
    expect(wrapper.vm.total).toBe(1)

    // 旧请求（seq2）后回 → 丢弃
    deferreds[0]({ items: [{ id: 1 }], total: 1 })
    await flushPromises()
    expect(wrapper.vm.artworks.map(a => a.id)).toEqual([2])
    expect(wrapper.vm.total).toBe(1)
  })

  it('b1-B9: covers 封面列表单源（按 cover_order 排序，主图区/计数/序号共用）', async () => {
    const wrapper = await mountArtwork()
    h.getArtworksPaged.mockReset()
    h.getArtworksPaged.mockResolvedValueOnce({
      items: [
        { id: 1, image_path: 'a.png', is_cover: 1, cover_order: 2 },
        { id: 2, image_path: 'b.png', is_cover: 0 },
        { id: 3, image_path: 'c.png', is_cover: 1, cover_order: 1 }
      ],
      total: 3
    })
    await wrapper.vm.loadArtworks()
    await flushPromises()

    expect(wrapper.vm.covers.map(a => a.id)).toEqual([3, 1])
    expect(wrapper.vm.coverCount).toBe(2)
    expect(wrapper.vm.coverOrderOf({ id: 1 })).toBe(2)
    // 封面只进主图区，网格排除主图
    expect(wrapper.vm.gridArtworks.map(a => a.id)).toEqual([2])
  })
})
