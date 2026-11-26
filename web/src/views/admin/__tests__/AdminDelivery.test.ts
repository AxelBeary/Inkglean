import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import router from '../../../router/index'
import zhCN from '../../../locales/zh-CN'
import en from '../../../locales/en'
import AdminDelivery from '../AdminDelivery.vue'

const fakes = vi.hoisted(() => ({ confirm: vi.fn(), copy: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn() }))
vi.mock('element-plus', () => ({
  ElMessage: { error: fakes.error, success: fakes.success, warning: fakes.warning },
  ElMessageBox: { confirm: fakes.confirm }
}))
vi.mock('../../../utils/clipboard', () => ({ copyText: fakes.copy }))

const STUBS = {
  'el-input': {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: `<input :value="modelValue" @input="$emit('update:modelValue', $event.target.value)">`
  },
  'el-button': {
    props: ['disabled', 'loading', 'nativeType', 'icon', 'type'],
    template: `<button :type="nativeType || 'button'" :disabled="disabled || loading"><slot /></button>`
  },
  'el-tag': { template: '<span><slot /></span>' },
  StepUpDialog: {
    props: ['modelValue'],
    emits: ['verified', 'cancel'],
    template: `<div v-if="modelValue"><button data-testid="stepup-verify" @click="$emit('verified')" /><button data-testid="stepup-cancel" @click="$emit('cancel')" /></div>`
  }
}
const fetchMock = vi.fn<typeof fetch>()
const ORDER_A = 'AB-001'
const ORDER_B = 'AB-002'
const FILE_ONE = { id: 17, fileName: 'final.png', fileSize: 2048, downloadLocked: true }
const FILE_TWO = { id: 26, fileName: 'layers.zip', fileSize: 512, downloadLocked: false }
const QUERY = '#admin-delivery-order-no'
const RECEIPT = '[data-testid="delivery-receipt"]'
const COPY = '[data-testid="delivery-copy"]'
const VERIFY = '[data-testid="stepup-verify"]'
const REISSUE_PATH = '/api/admin/delivery/AB-001/files/17/reissue'
const LINK = '/api/files/synthetic-delivery'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
function responseForOrder(orderNo = ORDER_A) {
  return json({ orderNo, deliverables: [FILE_ONE, FILE_TWO] })
}
function needStepUp() {
  return json({ code: 'STEP_UP_REQUIRED', error: 'Verification needed' }, 401)
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
function mountPage(locale = 'zh-CN') {
  const i18n = createI18n({ legacy: false, locale, messages: { 'zh-CN': zhCN, en } })
  return mount(AdminDelivery, { global: { plugins: [i18n], stubs: STUBS } })
}
async function search(wrapper: ReturnType<typeof mountPage>, orderNo: string) {
  await wrapper.get(QUERY).setValue(orderNo)
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}
function fileRow(wrapper: ReturnType<typeof mountPage>, id = FILE_ONE.id) {
  return wrapper.get('[data-testid="delivery-file-' + id + '"]')
}
function reissue(wrapper: ReturnType<typeof mountPage>, id = FILE_ONE.id) {
  return fileRow(wrapper, id).get('[data-testid="delivery-reissue"]').trigger('click')
}

enableAutoUnmount(afterEach)
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock.mockReset())
  fakes.confirm.mockReset().mockResolvedValue('confirm')
  fakes.copy.mockReset().mockResolvedValue(true)
  fakes.error.mockReset()
  fakes.success.mockReset()
  fakes.warning.mockReset()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('管理交付取件合同', () => {
  it('管理页作为需要管理员的嵌套路由可达', () => {
    const match = router.resolve('/admin/delivery')
    expect(match.name).toBe('AdminDelivery')
    expect(match.meta).toMatchObject({ requiresAdmin: true, titleKey: 'admin.delivery.title' })
    expect(match.matched.map(route => route.path)).toEqual(['/admin', '/admin/delivery'])
  })

  it('用完整订单号带会话查询；确认指定文件后才发链并可复制，展示 5 分钟', async () => {
    const wrapper = mountPage()
    const confirmation = deferred<void>()
    fakes.confirm.mockReturnValueOnce(confirmation.promise)
    await search(wrapper, '  ')
    expect(fetchMock).not.toHaveBeenCalled()
    fetchMock.mockResolvedValueOnce(responseForOrder())
    await search(wrapper, ' ' + ORDER_A + ' ')
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/admin/delivery/AB-001', expect.objectContaining({
      method: 'GET', credentials: 'include', body: undefined
    }))
    expect(fileRow(wrapper).text()).toContain('final.png')
    expect(fileRow(wrapper).text()).toContain('2.0 KB')
    expect(fileRow(wrapper).text()).toContain('下载已锁定')
    expect(fileRow(wrapper, FILE_TWO.id).text()).toContain('下载未锁定')

    await reissue(wrapper)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fakes.confirm.mock.calls[0]?.[0]).toContain('AB-001')
    expect(fakes.confirm.mock.calls[0]?.[0]).toContain('final.png')
    expect(fakes.confirm.mock.calls[0]?.[0]).toContain('#17')
    expect(fakes.confirm.mock.calls[0]?.[0]).not.toContain('layers.zip')
    expect(wrapper.find(RECEIPT).exists()).toBe(false)

    fetchMock.mockResolvedValueOnce(json({ url: LINK, expiresInSeconds: 300 }))
    confirmation.resolve(undefined)
    await flushPromises()
    expect(fetchMock).toHaveBeenLastCalledWith(REISSUE_PATH, expect.objectContaining({
      method: 'POST', credentials: 'include', body: undefined
    }))
    const linkInput = fileRow(wrapper).get(RECEIPT).get<HTMLInputElement>('input')
    const absolute = new URL(LINK, window.location.origin).href
    expect(linkInput.element.value).toBe(absolute)
    expect(fileRow(wrapper).get(RECEIPT).text()).toContain('5 分钟')
    expect(fileRow(wrapper).text()).toContain('下载未锁定')
    expect(fileRow(wrapper, FILE_TWO.id).find(RECEIPT).exists()).toBe(false)
    expect(fakes.copy).not.toHaveBeenCalled()
    await wrapper.get(COPY).trigger('click')
    await flushPromises()
    expect(fakes.copy).toHaveBeenCalledExactlyOnceWith(absolute)
    expect(fakes.success).toHaveBeenCalledWith('链接已复制')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('取消单文件确认，不发请求也不展示回执', async () => {
    const wrapper = mountPage()
    fetchMock.mockResolvedValueOnce(responseForOrder())
    fakes.confirm.mockRejectedValueOnce('cancel')
    await search(wrapper, ORDER_A)
    await reissue(wrapper)
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(wrapper.find(RECEIPT).exists()).toBe(false)
  })

  it('不合格/不存在的订单不展示文件；普通失败不回显服务器原文', async () => {
    const wrapper = mountPage()
    fetchMock.mockResolvedValueOnce(json({ error: 'fixture' }, 404))
    fetchMock.mockResolvedValueOnce(json({ error: 'fixture' }, 500))
    await search(wrapper, ORDER_A)
    expect(wrapper.text()).toContain('未找到符合条件的已交付订单')
    expect(wrapper.find(RECEIPT).exists()).toBe(false)
    await search(wrapper, ORDER_B)
    expect(wrapper.get('[role="alert"]').text()).toBe('查询失败，请重试')
    expect(wrapper.text()).not.toContain('fixture')
  })

  it.each([
    [404, 'issueMissing', 'error'], [409, 'issueBusy', 'warning'], [500, 'issueFailed', 'error']
  ] as const)('补发失败 %i 时只显示对应的本地提示', async (status, key, message) => {
    const wrapper = mountPage()
    fetchMock.mockResolvedValueOnce(responseForOrder()).mockResolvedValueOnce(json({ error: 'fixture' }, status))
    await search(wrapper, ORDER_A)
    await reissue(wrapper)
    await flushPromises()
    expect(fakes[message]).toHaveBeenCalledExactlyOnceWith(zhCN.admin.delivery[key])
    expect(wrapper.find(RECEIPT).exists()).toBe(false)
    expect(fileRow(wrapper).text()).toContain('下载已锁定')
  })

  it('旧档案元数据可为空，仍用文件 ID 确认', async () => {
    const wrapper = mountPage()
    fetchMock.mockResolvedValueOnce(json({ orderNo: ORDER_A, deliverables: [{ ...FILE_ONE, fileName: null, fileSize: null }] }))
    fakes.confirm.mockRejectedValueOnce('cancel')
    await search(wrapper, ORDER_A)
    expect(fileRow(wrapper).text()).toContain('未命名文件')
    expect(fileRow(wrapper).text()).not.toContain('0 B')
    await reissue(wrapper)
    expect(fakes.confirm.mock.calls[0]?.[0]).toContain('#17')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('旧订单查询迟到时不覆盖当前查询结果', async () => {
    const wrapper = mountPage()
    const first = deferred<Response>()
    fetchMock.mockReturnValueOnce(first.promise).mockResolvedValueOnce(responseForOrder(ORDER_B))
    await search(wrapper, ORDER_A)
    await search(wrapper, ORDER_B)
    first.resolve(responseForOrder(ORDER_A))
    await flushPromises()
    expect(wrapper.get('h2').text()).toBe('订单 AB-002')
  })

  it('确认期间更改搜索上下文后，旧文件确认不会发出 POST', async () => {
    const wrapper = mountPage()
    const confirmation = deferred<void>()
    fakes.confirm.mockReturnValueOnce(confirmation.promise)
    fetchMock.mockResolvedValueOnce(responseForOrder()).mockResolvedValueOnce(responseForOrder(ORDER_B))
    await search(wrapper, ORDER_A)
    await reissue(wrapper)
    await search(wrapper, ORDER_B)
    confirmation.resolve(undefined)
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(wrapper.find(RECEIPT).exists()).toBe(false)
  })

  it('旧签发回执不附到后续订单，即使当前行的文件 ID 相同', async () => {
    const wrapper = mountPage()
    const pending = deferred<Response>()
    fetchMock.mockResolvedValueOnce(responseForOrder()).mockReturnValueOnce(pending.promise).mockResolvedValueOnce(responseForOrder(ORDER_B))
    await search(wrapper, ORDER_A)
    await reissue(wrapper)
    await flushPromises()
    expect(fetchMock).toHaveBeenLastCalledWith(REISSUE_PATH, expect.objectContaining({ method: 'POST' }))
    await search(wrapper, ORDER_B)
    pending.resolve(json({ url: LINK, expiresInSeconds: 300 }))
    await flushPromises()
    expect(wrapper.get('h2').text()).toBe('订单 AB-002')
    expect(wrapper.find(RECEIPT).exists()).toBe(false)
    expect(fakes.copy).not.toHaveBeenCalled()
  })

  it('查询和补发遇二次验证续办时，各自只重试原操作一次', async () => {
    const wrapper = mountPage()
    fetchMock.mockResolvedValueOnce(needStepUp()).mockResolvedValueOnce(responseForOrder())
    fetchMock.mockResolvedValueOnce(needStepUp()).mockResolvedValueOnce(needStepUp())
    await search(wrapper, ORDER_A)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await wrapper.get(VERIFY).trigger('click')
    await flushPromises()
    expect(fetchMock.mock.calls.slice(0, 2).map(([url]) => url)).toEqual(Array(2).fill('/api/admin/delivery/AB-001'))
    await reissue(wrapper)
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(3)
    await wrapper.get(VERIFY).trigger('click')
    await flushPromises()
    expect(fetchMock.mock.calls.slice(2).map(([url]) => url)).toEqual(Array(2).fill(REISSUE_PATH))
    expect(fakes.confirm).toHaveBeenCalledTimes(1)
    expect(fakes.error).toHaveBeenCalledWith(zhCN.errors.STEP_UP_REQUIRED)
    expect(wrapper.find(VERIFY).exists()).toBe(false)
    expect(wrapper.find(RECEIPT).exists()).toBe(false)
  })

  it('英文按回执显示非整分钟的 TTL，过期后移除链接和复制入口', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const wrapper = mountPage('en')
    fetchMock.mockResolvedValueOnce(responseForOrder()).mockResolvedValueOnce(json({ url: LINK, expiresInSeconds: 90 }))
    await search(wrapper, ORDER_A)
    await reissue(wrapper)
    await flushPromises()
    expect(wrapper.get(RECEIPT).text()).toContain('90 sec')
    await vi.advanceTimersByTimeAsync(89_999)
    expect(wrapper.find(COPY).exists()).toBe(true)
    await vi.advanceTimersByTimeAsync(1)
    expect(wrapper.find(RECEIPT).exists()).toBe(false)
    expect(wrapper.find(COPY).exists()).toBe(false)
    expect(wrapper.text()).toContain('Link expired')
  })

  it('B7-F0285: 回执 TTL 畸形但链接可用 → 降级展示不丢弃（解锁态同步、无倒计时）', async () => {
    const wrapper = mountPage()
    fetchMock.mockResolvedValueOnce(responseForOrder()).mockResolvedValueOnce(json({ url: LINK, expiresInSeconds: 0 }))
    await search(wrapper, ORDER_A)
    expect(fileRow(wrapper).text()).toContain('下载已锁定')

    await reissue(wrapper)
    await flushPromises()

    // 服务端已重签：解锁态照实同步（修复前整份收据抛错，解锁态也不落地）
    expect(fileRow(wrapper).text()).toContain('下载未锁定')
    // 链接不丢弃：降级收据展示链接与「有效期未知」文案（不虚构倒计时数字）
    const receipt = fileRow(wrapper).get(RECEIPT)
    const linkInput = receipt.get<HTMLInputElement>('input')
    expect(linkInput.element.value).toBe(new URL(LINK, window.location.origin).href)
    expect(receipt.text()).toContain('有效期信息异常')
    expect(fakes.error).not.toHaveBeenCalled()
  })

  it('B7-F0285: 回执 URL 跨源不可用 → 报错不出链接，但服务端已发生的解锁态仍如实同步', async () => {
    const wrapper = mountPage()
    fetchMock
      .mockResolvedValueOnce(responseForOrder())
      .mockResolvedValueOnce(json({ url: 'https://evil.example.com/link', expiresInSeconds: 300 }))
    await search(wrapper, ORDER_A)
    await reissue(wrapper)
    await flushPromises()

    expect(fakes.error).toHaveBeenCalledWith(zhCN.admin.delivery.issueFailed)
    expect(wrapper.find(RECEIPT).exists()).toBe(false)
    // 重签 HTTP 已成功——解锁态不因收据畸形回滚成「锁定」
    expect(fileRow(wrapper).text()).toContain('下载未锁定')
  })
})
