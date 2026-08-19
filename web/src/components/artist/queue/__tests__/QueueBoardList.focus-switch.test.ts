// 0817 用户反馈回归：排期看板「焦点图显示」两态滑块改开关
// 覆盖：工具条渲染 el-switch（开=large 显示焦点大图）；开关切换上抛 update:focus-display（true→large / false→off），
//       持久化链路由父级 QueueBoard 既有逻辑承接（此处只验事件契约）
import { describe, it, expect, vi } from 'vitest'
import { shallowMount } from '@vue/test-utils'

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: () => {} })
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: vi.fn() }
}))

vi.mock('vuedraggable', () => ({
  default: { name: 'draggable', template: '<div><slot /></div>' }
}))

vi.mock('../../../../api/index.js', () => ({
  artistApi: {}
}))

vi.mock('../../../../utils/anonUpload.js', () => ({
  uploadReferenceWithAnonToken: vi.fn(),
  AnonTokenUnavailableError: class AnonTokenUnavailableError extends Error {}
}))

import QueueBoardList from '../QueueBoardList.vue'

// el-switch 为全局注册组件（app.use(ElementPlus)），单测环境显式 stub 才能受控发事件
const ElSwitchStub = { name: 'ElSwitch', props: ['modelValue'], template: '<button />' }

function mountList(focusDisplay: string = 'large') {
  return shallowMount(QueueBoardList, {
    props: {
      queue: [],
      focusDisplay,
      activeTab: 'formal',
      loading: false,
      bufferQueue: [],
      bufferLoading: false,
      completedQueue: [],
      completedLoading: false,
      refreshNow: () => {}
    },
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { 'el-switch': ElSwitchStub },
      directives: { loading: () => {} }
    }
  })
}

describe('QueueBoardList 焦点图显示开关（0817）', () => {
  it('large 态 → 开关为开；关闭上抛 update:focus-display off', async () => {
    const wrapper = mountList('large')
    const sw = wrapper.findComponent(ElSwitchStub)
    expect(sw.exists()).toBe(true)
    expect(sw.props('modelValue')).toBe(true)

    sw.vm.$emit('change', false)
    expect(wrapper.emitted('update:focus-display')).toEqual([['off']])
  })

  it('off 态 → 开关为关；打开上抛 update:focus-display large', async () => {
    const wrapper = mountList('off')
    const sw = wrapper.findComponent(ElSwitchStub)
    expect(sw.props('modelValue')).toBe(false)

    sw.vm.$emit('change', true)
    expect(wrapper.emitted('update:focus-display')).toEqual([['large']])
  })
})
