// ArtistManage.deleted.test.js
// 0817 用户拍板：已移除画师清单 + 恢复入口
// 覆盖：点「已移除画师」拉清单并弹窗；恢复走两步确认 → 调接口 → 成功提示并刷新两处列表；
//       取消确认不调接口；接口失败有错误提示
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { h } from 'vue'
import type { SetupContext } from 'vue'
import ArtistManage from '../ArtistManage.vue'

const hoisted = vi.hoisted(() => ({
  getArtists: vi.fn(),
  getDeletedArtists: vi.fn(),
  restoreArtist: vi.fn(),
  msgSuccess: vi.fn(),
  msgError: vi.fn(),
  msgWarning: vi.fn(),
  confirm: vi.fn(),
  prompt: vi.fn()
}))

vi.mock('../../../api/index.js', () => ({
  adminApi: {
    getArtists: hoisted.getArtists,
    getDeletedArtists: hoisted.getDeletedArtists,
    restoreArtist: hoisted.restoreArtist
  },
  complianceApi: {}
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('../../../i18n/index.js', () => ({
  i18n: { global: { t: (key: string) => key } },
  setLocale: vi.fn()
}))

vi.mock('element-plus', () => ({
  ElMessage: {
    success: hoisted.msgSuccess,
    error: hoisted.msgError,
    warning: hoisted.msgWarning
  },
  ElMessageBox: { confirm: hoisted.confirm, prompt: hoisted.prompt }
}))

vi.mock('../ArtistDetailDrawer.vue', () => ({
  default: { name: 'ArtistDetailDrawer', template: '<div />' }
}))

vi.mock('../../../components/artist/visual/CardHead.vue', () => ({
  default: { name: 'CardHead', template: '<div />' }
}))

vi.mock('../../../components/admin/StepUpDialog.vue', () => ({
  default: {
    name: 'StepUpDialog',
    props: ['modelValue'],
    emits: ['verified', 'cancel'],
    template: '<div v-if="modelValue" class="stepup-stub">stepup</div>'
  }
}))

/** 表格行 fixture：操作列 stub 渲染当前行（与 ban 测试同款手法） */
interface DeletedRow {
  id: number
  name: string
  subdomain: string
  qqNumber: string
  isBanned: boolean
  deletedAt: string
}

let currentRow: DeletedRow = { id: 0, name: '', subdomain: '', qqNumber: '', isBanned: false, deletedAt: '' }
const RowColStub = {
  name: 'RowColStub',
  setup(_props: Record<string, unknown>, { slots }: SetupContext) {
    return () => h('div', { class: 'col-stub' }, [
      slots.default ? slots.default({ row: currentRow }) : []
    ])
  }
}

const EP_STUBS = {
  'el-button': {
    inheritAttrs: false,
    template: '<button type="button" @click="$emit(\'click\')"><slot /></button>'
  },
  'el-table': { template: '<div class="table-stub"><slot /></div>' },
  'el-table-column': RowColStub,
  'el-select': { template: '<div />' },
  'el-option': { template: '<div />' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-pagination': { template: '<div />' },
  'el-input-number': { template: '<div />' },
  'el-dialog': {
    props: ['modelValue'],
    template: '<div v-if="modelValue" class="dialog-stub"><slot /><slot name="footer" /></div>'
  },
  'el-input': {
    props: ['modelValue'],
    template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  },
  'el-form': { template: '<div><slot /></div>' },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-card': { template: '<div><slot /></div>' },
  'el-empty': { template: '<div />' },
  'el-icon': { template: '<i><slot /></i>' }
}

const mountedWrappers: ReturnType<typeof mount>[] = []

async function mountPage() {
  const wrapper = mount(ArtistManage, {
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

function clickButtonByText(wrapper: ReturnType<typeof mount>, text: string) {
  const button = wrapper.findAll('button').find((b) => b.text() === text)
  expect(button).toBeDefined()
  return button!.trigger('click')
}

beforeEach(() => {
  currentRow = { id: 9, name: '被移除画师', subdomain: 'gone', qqNumber: '88060', isBanned: false, deletedAt: '2026-08-17 10:00:00' }
  hoisted.getArtists.mockReset().mockResolvedValue([])
  hoisted.getDeletedArtists.mockReset().mockResolvedValue([currentRow])
  hoisted.restoreArtist.mockReset().mockResolvedValue({ success: true, message: '已恢复' })
  hoisted.msgSuccess.mockReset()
  hoisted.msgError.mockReset()
  hoisted.msgWarning.mockReset()
  hoisted.confirm.mockReset().mockResolvedValue('confirm')
  hoisted.prompt.mockReset().mockResolvedValue({ value: '' })
})

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  vi.restoreAllMocks()
})

describe('ArtistManage 已移除画师清单+恢复（0817）', () => {
  it('点「已移除画师」→ 拉清单并打开弹窗', async () => {
    const wrapper = await mountPage()
    await clickButtonByText(wrapper, 'admin.deletedArtists.title')
    await flushPromises()

    expect(hoisted.getDeletedArtists).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.dialog-stub').exists()).toBe(true)
  })

  it('恢复两步确认：确认 → 调接口 → 成功提示并刷新清单与在册列表', async () => {
    const wrapper = await mountPage()
    await clickButtonByText(wrapper, 'admin.deletedArtists.title')
    await flushPromises()
    await clickButtonByText(wrapper, 'admin.deletedArtists.restore')
    await flushPromises()

    expect(hoisted.confirm).toHaveBeenCalledWith(
      'admin.deletedArtists.restoreConfirm',
      'admin.deletedArtists.title',
      expect.anything()
    )
    expect(hoisted.restoreArtist).toHaveBeenCalledWith(9)
    expect(hoisted.msgSuccess).toHaveBeenCalledWith('admin.deletedArtists.restored')
    expect(hoisted.getDeletedArtists).toHaveBeenCalledTimes(2) // 打开 + 恢复后刷新
    expect(hoisted.getArtists).toHaveBeenCalledTimes(2) // 初始 + 恢复后回在册刷新
  })

  it('恢复确认取消：不调接口', async () => {
    hoisted.confirm.mockRejectedValue(new Error('cancel'))
    const wrapper = await mountPage()
    await clickButtonByText(wrapper, 'admin.deletedArtists.title')
    await flushPromises()
    await clickButtonByText(wrapper, 'admin.deletedArtists.restore')
    await flushPromises()

    expect(hoisted.restoreArtist).not.toHaveBeenCalled()
  })

  it('恢复接口失败：错误提示，清单重拉不吞错', async () => {
    hoisted.restoreArtist.mockRejectedValue(new Error('网络异常'))
    const wrapper = await mountPage()
    await clickButtonByText(wrapper, 'admin.deletedArtists.title')
    await flushPromises()
    await clickButtonByText(wrapper, 'admin.deletedArtists.restore')
    await flushPromises()

    expect(hoisted.msgError).toHaveBeenCalledWith('网络异常')
  })
})
