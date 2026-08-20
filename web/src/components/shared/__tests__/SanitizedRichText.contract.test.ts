// b3 清扫：SanitizedRichText 渲染契约单测
// @vitest-environment jsdom
// ↑ 环境裁决（2026-08-14 一号实证）：DOMPurify 3.4.13 在 happy-dom 下属性消毒失效
// （isSupported=true 但 onerror 拦不住，FORBID_ATTR/ALLOWED_ATTR 均无效，探针实证），
// 真实浏览器无此问题；安全契约测试切 jsdom 环境单独验证，其余套件仍用 happy-dom。
// 契约：入参必须已 sanitizeHtml 消毒（REQ-042），本组件是全领地唯一统一渲染入口，
// 组件自身不再二次消毒。本文件固定该边界——后续调用方若绕过消毒直接传未清洗 HTML，
// 第三用例即明确暴露「组件原样渲染」的契约事实。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SanitizedRichText from '../SanitizedRichText.vue'
import { sanitizeHtml } from '../../../utils/sanitize'

describe('SanitizedRichText 渲染契约', () => {
  it('渲染已消毒富文本（调用方 sanitizeHtml 后传入）', () => {
    const html = sanitizeHtml('<p>你好 <strong>画师</strong></p>')
    const wrapper = mount(SanitizedRichText, { props: { html } })
    expect(wrapper.element.innerHTML).toContain('<strong>画师</strong>')
  })

  it('消毒链路拦截恶意内容：onerror/script 不进入 v-html', () => {
    const raw = '<img src="x" onerror="alert(1)"><script>alert(2)</script>'
    const html = sanitizeHtml(raw)
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('<script')

    const wrapper = mount(SanitizedRichText, { props: { html } })
    expect(wrapper.element.innerHTML).not.toContain('onerror')
    expect(wrapper.element.innerHTML).not.toContain('<script')
  })

  it('契约自证：未消毒输入原样渲染——调用方必须先走 sanitizeHtml（防再犯护栏）', () => {
    const wrapper = mount(SanitizedRichText, { props: { html: '<img src="x" onerror="alert(1)">' } })
    expect(wrapper.element.innerHTML).toContain('onerror')
  })
})
