// v75 W1：管理动作处置留痕页单测
// 覆盖：挂载即调 complianceApi.getAdminActions（带 limit 默认）；表格渲染 admin_ip / action / 对象；
//       动作标签未知时回退原始值；加载失败清空并提示（非静默）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { h } from 'vue'
import type { SetupContext } from 'vue'
import AdminActions from '../AdminActions.vue'

const hoisted = vi.hoisted(() => ({
  getAdminActions: vi.fn(),
  adminActionsExportUrl: vi.fn(() => '/api/admin/admin-actions/export'),
  msgError: vi.fn(),
  msgSuccess: vi.fn(),
  logout: vi.fn()
}))

vi.mock('../../../api/index.js', () => ({
  complianceApi: {
    getAdminActions: hoisted.getAdminActions,
    adminActionsExportUrl: hoisted.adminActionsExportUrl
  }
}))

// R-2：导出 401 分支会调 store.logout() 跳登录
vi.mock('../../../stores/artist.js', () => ({
  useArtistStore: () => ({ logout: hoisted.logout })
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('../../../i18n/index.js', () => ({
  i18n: { global: { t: (key: string) => key } },
  setLocale: vi.fn()
}))

vi.mock('element-plus', () => ({
  ElMessage: { error: hoisted.msgError, success: hoisted.msgSuccess }
}))

/** 列 stub：逐行渲染 #default，行数据由测试控制 */
let currentRow: Record<string, unknown> = {}
const RowColStub = {
  name: 'RowColStub',
  setup(_props: Record<string, unknown>, { slots }: SetupContext) {
    return () => h('div', { class: 'col-stub' }, [
      slots.default ? slots.default({ row: currentRow }) : []
    ])
  }
}

const EP_STUBS = {
  'el-table': { template: '<div class="table-stub"><slot /></div>' },
  'el-table-column': RowColStub,
  'el-select': {
    props: ['modelValue'],
    emits: ['update:modelValue', 'change'],
    name: 'AuditSelectStub',
    template: '<div class="select-stub"><slot /></div>'
  },
  'el-option': { props: ['value', 'label'], template: '<div :data-option="value">{{ label }}</div>' },
  'el-empty': { name: 'ElEmpty', props: ['description'], template: '<div class="empty-stub">{{ description }}</div>' },
  // R-2：导出按钮——stub 成真 <button>，好让测试能按文本找到并 click（element-plus 在此被整包 mock）
  'el-button': {
    name: 'ElButton',
    props: ['loading', 'disabled', 'type', 'plain', 'title'],
    emits: ['click'],
    template: '<button :disabled="disabled" :title="title" @click="$emit(\'click\')"><slot /></button>'
  }
}

const mountedWrappers: ReturnType<typeof mount>[] = []

async function mountPage() {
  const wrapper = mount(AdminActions, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: EP_STUBS,
      directives: { loading: {} }
    }
  })
  mountedWrappers.push(wrapper)
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  currentRow = {
    id: 1, admin_id: 1, action: 'home_takedown', target_type: 'artist', target_id: 10,
    reason: '恶意引流', admin_ip: '198.51.100.7', created_at: '2026-09-13T00:00:00.000Z'
  }
  hoisted.getAdminActions.mockReset().mockResolvedValue({ rows: [currentRow], total: 1 })
  hoisted.msgError.mockReset()
  hoisted.msgSuccess.mockReset()
})

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  vi.restoreAllMocks()
})

describe('AdminActions 处置留痕页（v75 W1）', () => {
  it('挂载即以默认 limit 拉取留痕，并渲染 admin_ip / action / 对象', async () => {
    const wrapper = await mountPage()
    expect(hoisted.getAdminActions).toHaveBeenCalledTimes(1)
    expect(hoisted.getAdminActions).toHaveBeenCalledWith({ limit: 100 })
    const text = wrapper.text()
    expect(text).toContain('198.51.100.7') // admin_ip 列
    expect(text).toContain('#10') // 对象列 target_id
    expect(text).toContain('恶意引流') // reason 列
  })

  it('未知动作白名单回退原始值（t 返回生键时不显示未翻译路径）', async () => {
    // t stub 恒等于 key → actionLabel 回退 action 原值
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('home_takedown')
    expect(wrapper.text()).not.toContain('compliance.admin.action.home_takedown')
  })

  it('可按补发交付链接动作和交付文件对象组合筛选', async () => {
    const wrapper = await mountPage()
    const [action, target] = wrapper.findAllComponents({ name: 'AuditSelectStub' })
    expect(action?.find('[data-option="delivery_link_reissue"]').exists()).toBe(true)
    expect(target?.find('[data-option="deliverable"]').exists()).toBe(true)
    action?.vm.$emit('update:modelValue', 'delivery_link_reissue')
    action?.vm.$emit('change')
    target?.vm.$emit('update:modelValue', 'deliverable')
    target?.vm.$emit('change')
    await flushPromises()
    expect(hoisted.getAdminActions).toHaveBeenLastCalledWith({
      limit: 100, action: 'delivery_link_reissue', targetType: 'deliverable'
    })
  })

  it('加载失败 → 清空数据并回退到空态（非静默）', async () => {
    hoisted.getAdminActions.mockRejectedValueOnce(new Error('boom'))
    const wrapper = await mountPage()
    expect(hoisted.msgError).toHaveBeenCalledWith('boom')
    // rows 置空 → 命中空态分支（与有数据时显总量而非空态互斥）
    expect(wrapper.find('.empty-stub').text()).toBe('compliance.admin.adminActionsEmpty')
    expect(wrapper.find('.actions-total').exists()).toBe(false)
  })
})

// ─── R-2：留痕 CSV 导出按钮 ───

/** 最小 fetch 响应替身（只覆盖 doExport 读的字段） */
function mockOkResponse(disposition = 'attachment; filename="admin-actions-20261128.csv"') {
  return {
    ok: true,
    status: 200,
    headers: { get: (k: string) => (k.toLowerCase() === 'content-disposition' ? disposition : null) },
    blob: () => Promise.resolve(new Blob(['id,action\r\n'], { type: 'text/csv' })),
    json: () => Promise.resolve({})
  }
}

describe('AdminActions 留痕导出按钮（R-2）', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    hoisted.adminActionsExportUrl.mockClear()
    hoisted.msgSuccess.mockReset()
    hoisted.msgError.mockReset()
    hoisted.logout.mockReset()
    fetchMock.mockReset()
    // happy-dom 未实现 createObjectURL/revokeObjectURL，直接注入（同 download.test.ts 手法）
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:mock-csv'), configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL
    delete (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL
  })

  it('点击导出 → 按当前筛选条件拼 URL 并下载', async () => {
    fetchMock.mockResolvedValue(mockOkResponse())
    const wrapper = await mountPage()

    // 先设筛选，再导出：导出的必须是「页面上筛的这一段」
    const [action] = wrapper.findAllComponents({ name: 'AuditSelectStub' })
    action?.vm.$emit('update:modelValue', 'artist_ban')
    action?.vm.$emit('change')
    await flushPromises()

    const btn = wrapper.findAll('button').find(b => b.text().includes('compliance.admin.adminActionsExport'))
    expect(btn, '导出按钮必须渲染出来').toBeTruthy()
    await btn!.trigger('click')
    await flushPromises()

    expect(hoisted.adminActionsExportUrl).toHaveBeenCalledWith({ action: 'artist_ban' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/admin/admin-actions/export')
    // 凭证走 cookie：必须带 credentials，否则 401
    expect(init.credentials).toBe('include')
    expect(hoisted.msgSuccess).toHaveBeenCalledWith('compliance.admin.adminActionsExported')
  })

  it('无筛选时导出全量（URL helper 收到空对象）', async () => {
    fetchMock.mockResolvedValue(mockOkResponse())
    const wrapper = await mountPage()
    const btn = wrapper.findAll('button').find(b => b.text().includes('compliance.admin.adminActionsExport'))
    await btn!.trigger('click')
    await flushPromises()
    expect(hoisted.adminActionsExportUrl).toHaveBeenCalledWith({})
  })

  it('导出失败 → 错误提示非静默', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      headers: { get: () => null },
      json: () => Promise.reject(new Error('not json'))
    })
    const wrapper = await mountPage()
    const btn = wrapper.findAll('button').find(b => b.text().includes('compliance.admin.adminActionsExport'))
    await btn!.trigger('click')
    await flushPromises()
    expect(hoisted.msgError).toHaveBeenCalledWith('HTTP 500')
    // 失败不报成功
    expect(hoisted.msgSuccess).not.toHaveBeenCalled()
  })

  it('导出 401 → 清会话并跳登录（与请求核口径一致）', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => null },
      json: () => Promise.resolve({})
    })
    const wrapper = await mountPage()
    const btn = wrapper.findAll('button').find(b => b.text().includes('compliance.admin.adminActionsExport'))
    await btn!.trigger('click')
    await flushPromises()
    expect(hoisted.logout).toHaveBeenCalled()
  })
})
