// 改稿计数器挂载测试（812-tools-a：②改稿计数器）
// 覆盖：建条目、+1、撤销一次、重置、删除、超限标红提醒、localStorage 持久化
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key })
}))

import RevisionCount from '../RevisionCount.vue'

const STORAGE_KEY = 'huiyue_revision_counters'

const ElInputStub = {
  props: ['modelValue', 'placeholder', 'maxlength'],
  emits: ['update:modelValue'],
  template: '<input :value="modelValue" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)" />'
}
const ElInputNumberStub = {
  props: ['modelValue', 'min', 'max', 'size'],
  emits: ['update:modelValue', 'change'],
  template: '<input type="number" :value="modelValue" @input="$emit(\'update:modelValue\', Number($event.target.value)); $emit(\'change\', Number($event.target.value))" />'
}
const ElButtonStub = {
  props: ['disabled', 'type', 'size', 'loading'],
  emits: ['click'],
  template: '<button type="button" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'
}

function mountCounter() {
  return mount(RevisionCount, {
    global: {
      mocks: { $t: (key) => key, $tm: () => [] },
      stubs: {
        'el-input': ElInputStub,
        'el-input-number': ElInputNumberStub,
        'el-button': ElButtonStub,
        // A4: 删除按钮包了二次确认，测试桩点击即确认
        'el-popconfirm': {
          emits: ['confirm'],
          template: '<span @click="$emit(\'confirm\')"><slot name="reference" /></span>'
        }
      }
    }
  })
}

function findBtnByText(wrapper, key) {
  return wrapper.findAll('.rc-mini-btn').find((b) => b.text().includes(key))
}

describe('改稿计数器（812-tools-a）', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  async function addEntry(wrapper, name = '张三-头像') {
    await wrapper.find('.rc-name-input').setValue(name)
    await wrapper.find('.rc-add-row button').trigger('click')
  }

  it('初始空态；添加条目后出现卡片，默认上限 3', async () => {
    const wrapper = mountCounter()
    expect(wrapper.text()).toContain('revisionCount.empty')
    await addEntry(wrapper)
    expect(wrapper.text()).not.toContain('revisionCount.empty')
    expect(wrapper.find('.rc-card-name').text()).toBe('张三-头像')
    expect(wrapper.find('.rc-count').text()).toContain('0')
  })

  it('+1 累加：3 次后达到上限，卡片与数字变朱砂并出提醒；撤销一次回到 2', async () => {
    const wrapper = mountCounter()
    await addEntry(wrapper)
    const plus = wrapper.find('.rc-plus')
    for (let i = 0; i < 3; i++) await plus.trigger('click')

    expect(wrapper.find('.rc-count').text()).toContain('3')
    expect(wrapper.find('.rc-card').classes()).toContain('rc-card--over')
    expect(wrapper.find('.rc-count').classes()).toContain('rc-count--over')
    expect(wrapper.find('.rc-over-hint').exists()).toBe(true)

    await findBtnByText(wrapper, 'revisionCount.undo').trigger('click')
    expect(wrapper.find('.rc-count').text()).toContain('2')
    expect(wrapper.find('.rc-card').classes()).not.toContain('rc-card--over')
    expect(wrapper.find('.rc-over-hint').exists()).toBe(false)
  })

  it('撤销在 0 时禁用；重置清零', async () => {
    const wrapper = mountCounter()
    await addEntry(wrapper)
    const undoBtn = findBtnByText(wrapper, 'revisionCount.undo')
    expect(undoBtn.attributes('disabled')).toBeDefined()

    await wrapper.find('.rc-plus').trigger('click')
    expect(findBtnByText(wrapper, 'revisionCount.undo').attributes('disabled')).toBeUndefined()

    await findBtnByText(wrapper, 'revisionCount.reset').trigger('click')
    expect(wrapper.find('.rc-count').text()).toContain('0')
    expect(findBtnByText(wrapper, 'revisionCount.reset').attributes('disabled')).toBeDefined()
  })

  it('删除条目后列表清空回空态', async () => {
    const wrapper = mountCounter()
    await addEntry(wrapper)
    await wrapper.find('.rc-card-head .rc-mini-btn').trigger('click')
    expect(wrapper.findAll('.rc-card')).toHaveLength(0)
    expect(wrapper.text()).toContain('revisionCount.empty')
  })

  it('localStorage 持久化：键带 huiyue_ 前缀，重挂载恢复计数', async () => {
    const wrapper = mountCounter()
    await addEntry(wrapper, '李四-全身')
    await wrapper.find('.rc-plus').trigger('click')

    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY))
    expect(Array.isArray(saved)).toBe(true)
    expect(saved[0].name).toBe('李四-全身')
    expect(saved[0].count).toBe(1)
    expect(saved[0].limit).toBe(3)

    wrapper.unmount()
    const remounted = mountCounter()
    // onMounted 读回 storage 后的重渲染需等一个 tick（产品无碍，测试时序补等）
    await remounted.vm.$nextTick()
    expect(remounted.find('.rc-card-name').text()).toBe('李四-全身')
    expect(remounted.find('.rc-count').text()).toContain('1')
  })

  it('每条上限可独立调整：改小后立即触发超限提醒', async () => {
    const wrapper = mountCounter()
    await addEntry(wrapper)
    await wrapper.find('.rc-plus').trigger('click')
    expect(wrapper.find('.rc-over-hint').exists()).toBe(false)

    await wrapper.find('.rc-limit-edit').setValue('1')
    expect(wrapper.find('.rc-over-hint').exists()).toBe(true)
  })

  it('重挂载后 prevCount 为 null（无撤销记录）时撤销按钮保持禁用', async () => {
    const wrapper = mountCounter()
    await addEntry(wrapper)
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY))
    saved[0].prevCount = null
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
    wrapper.unmount()

    const remounted = mountCounter()
    await remounted.vm.$nextTick()
    expect(findBtnByText(remounted, 'revisionCount.undo').attributes('disabled')).toBeDefined()
  })
})
