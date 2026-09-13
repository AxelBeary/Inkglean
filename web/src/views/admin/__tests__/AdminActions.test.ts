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
  msgError: vi.fn(),
  msgSuccess: vi.fn()
}))

vi.mock('../../../api/index.js', () => ({
  complianceApi: {
    getAdminActions: hoisted.getAdminActions
  }
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
    template: '<div class="select-stub"><slot /></div>'
  },
  'el-option': { template: '<div />' },
  'el-empty': { name: 'ElEmpty', props: ['description'], template: '<div class="empty-stub">{{ description }}</div>' }
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

  it('加载失败 → 清空数据并回退到空态（非静默）', async () => {
    hoisted.getAdminActions.mockRejectedValueOnce(new Error('boom'))
    const wrapper = await mountPage()
    expect(hoisted.msgError).toHaveBeenCalledWith('boom')
    // rows 置空 → 命中空态分支（与有数据时显总量而非空态互斥）
    expect(wrapper.find('.empty-stub').text()).toBe('compliance.admin.adminActionsEmpty')
    expect(wrapper.find('.actions-total').exists()).toBe(false)
  })
})
