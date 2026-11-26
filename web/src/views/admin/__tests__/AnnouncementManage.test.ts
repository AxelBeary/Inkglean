// B7-F0282：公告发布门闩——首次回显完成前禁止发布（空表单会把现有公告清成 null）
// 覆盖：回显在途 → 按钮禁用 + publish() 纵深拦截；回显落地 → 门闩解除；回显失败 → 横幅 + publish 触发重拉
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AnnouncementManage from '../AnnouncementManage.vue'

const h = vi.hoisted(() => ({
  getAnnouncement: vi.fn(),
  saveAnnouncement: vi.fn(),
  msgError: vi.fn(),
  msgSuccess: vi.fn()
}))

vi.mock('../../../api/index.js', () => ({
  artistApi: { getAnnouncement: h.getAnnouncement },
  adminApi: { saveAnnouncement: h.saveAnnouncement }
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: h.msgSuccess, error: h.msgError, warning: vi.fn() }
}))

const EP_STUBS = {
  'el-button': {
    // 按真实语义渲染 disabled（被测门闩之一）
    props: ['loading', 'disabled'],
    template: '<button type="button" :disabled="disabled || loading" @click="$emit(\'click\')"><slot /></button>'
  },
  'el-input': {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  }
}

/** script-setup 暴露面（最小必要断言） */
interface AnnouncementVm {
  loaded: boolean
  loadFailed: boolean
  form: { title: string; content: string }
  publish: () => Promise<void>
}

const mountedWrappers: ReturnType<typeof mount>[] = []

function mountPage() {
  const wrapper = mount(AnnouncementManage, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: EP_STUBS
    }
  })
  mountedWrappers.push(wrapper)
  return { wrapper, vm: wrapper.vm as unknown as AnnouncementVm }
}

function publishButton(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('button').find(b => b.text() === 'announcement.admin.publish')!
}

beforeEach(() => {
  h.getAnnouncement.mockReset()
  h.saveAnnouncement.mockReset()
  h.msgError.mockReset()
  h.msgSuccess.mockReset()
})

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  vi.restoreAllMocks()
})

describe('B7-F0282 公告发布门闩', () => {
  it('回显在途：按钮禁用且 publish() 被拦；回显落地：门闩解除可发布', async () => {
    let resolveLoad!: (v: unknown) => void
    h.getAnnouncement.mockReturnValue(new Promise(r => { resolveLoad = r }))
    const { wrapper, vm } = mountPage()

    // 回显在途 → 发布按钮禁用
    expect((publishButton(wrapper).element as HTMLButtonElement).disabled).toBe(true)
    // 纵深防御：即使绕过按钮直接调 publish，也不得发保存请求（空表单会清掉现有公告）
    await vm.publish()
    expect(h.saveAnnouncement).not.toHaveBeenCalled()

    // 回显落地 → 门闩解除
    resolveLoad({ title: '现有公告', content: '现有内容', updatedAt: '2026-11-01T00:00:00Z' })
    await flushPromises()
    expect(vm.loaded).toBe(true)
    expect((publishButton(wrapper).element as HTMLButtonElement).disabled).toBe(false)

    // 正常发布路径不受影响
    h.saveAnnouncement.mockResolvedValue(null)
    await vm.publish()
    expect(h.saveAnnouncement).toHaveBeenCalledTimes(1)
    expect(h.saveAnnouncement).toHaveBeenCalledWith({ title: '现有公告', content: '现有内容' })
  })

  it('回显失败：横幅出现，publish 提示错误并触发重拉，仍不发保存请求', async () => {
    h.getAnnouncement.mockRejectedValueOnce(new Error('load boom'))
      .mockResolvedValueOnce({ title: '重试后的公告', content: '内容', updatedAt: null })
    const { wrapper, vm } = mountPage()
    await flushPromises()

    expect(wrapper.find('.load-error-banner').exists()).toBe(true)
    expect(vm.loaded).toBe(false)

    await vm.publish()
    await flushPromises()
    // 既有语义保持：提示错误 + 重拉回显；保存请求仍被拦
    expect(h.msgError).toHaveBeenCalledWith('common.networkError')
    expect(h.getAnnouncement).toHaveBeenCalledTimes(2)
    expect(h.saveAnnouncement).not.toHaveBeenCalled()
  })
})
