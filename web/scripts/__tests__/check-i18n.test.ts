// check-i18n 门禁自身单测：中文口径（含 CJK 扩展区）与 template 插值外全角标点规则
import { describe, it, expect } from 'vitest'
import { CJK_RE, FULLWIDTH_PUNCT_RE, collectTemplateFullwidth } from '../check-i18n'

/** 包一层顶层 template，正文从第 2 行开始（便于断言行号） */
const vue = (body: string): string => `<template>\n${body}\n</template>\n`

describe('中文判定口径（CJK_RE）', () => {
  it('主区/Ext-A/兼容区/Ext-B 及以后/〇/々 都算中文', () => {
    const chars = ['\u4E00', '\u3400', '\uF900', '\u{20000}', '\u{2A700}', '\u{30000}', '\u3007', '\u3005']
    for (const ch of chars) expect(CJK_RE.test(ch), ch).toBe(true)
  })

  it('英文与全角标点不算中文', () => {
    expect(CJK_RE.test('abc （）：，')).toBe(false)
  })
})

describe('全角标点集合（FULLWIDTH_PUNCT_RE）', () => {
  it('覆盖中文标点', () => {
    for (const ch of ['（', '）', '：', '、', '。', '，', '！', '；']) expect(FULLWIDTH_PUNCT_RE.test(ch), ch).toBe(true)
  })

  it('排除占位符 —…· 与全角字母数字、半角片假名', () => {
    for (const ch of ['—', '…', '·', 'Ａ', '１', 'ｱ']) expect(FULLWIDTH_PUNCT_RE.test(ch), ch).toBe(false)
  })
})

describe('template-fullwidth-punct', () => {
  it('插值外的全角标点命中，违规串取整段文本', () => {
    const hits = collectTemplateFullwidth('src/x.vue', vue('<div>（{{ n }}）</div>'))
    expect(hits).toHaveLength(1)
    expect(hits[0].rule).toBe('template-fullwidth-punct')
    expect(hits[0].text).toBe('（{{ n }}）')
    expect(hits[0].line).toBe(2)
  })

  it('静态属性值命中', () => {
    const hits = collectTemplateFullwidth('src/x.vue', vue('<el-button title="（{{ n }}）">go</el-button>'))
    expect(hits.map(h => h.text)).toEqual(['（{{ n }}）'])
  })

  it('表达式里的 > 不截断标签（v-if="a > 0" 后面的文本照常命中）', () => {
    const hits = collectTemplateFullwidth('src/x.vue', vue('<div v-if="a > 0">（{{ n }}）</div>'))
    expect(hits.map(h => h.text)).toEqual(['（{{ n }}）'])
  })

  it('插值内的 JS 字符串不命中', () => {
    expect(collectTemplateFullwidth('src/x.vue', vue(`<div>{{ a ? '（' : '）' }}</div>`))).toEqual([])
  })

  it(':attr / @event / v-* 表达式不命中', () => {
    const src = vue(`<div :title="'（'" @click="f('）')" v-if="x === '：'">ok</div>`)
    expect(collectTemplateFullwidth('src/x.vue', src)).toEqual([])
  })

  it('script/style 区与 HTML 注释不命中', () => {
    const src = `<script setup lang="ts">\nconst s = '（全角）'\n</script>\n<template><div><!-- （注释） -->ok</div></template>\n<style>.a{content:'：'}</style>\n`
    expect(collectTemplateFullwidth('src/x.vue', src)).toEqual([])
  })

  it('全角加号当图标字不计；「」属标点要计（英文态会露出中文引号）', () => {
    expect(collectTemplateFullwidth('src/x.vue', vue(`<p>＋ {{ $t('a') }}</p>`))).toEqual([])
    expect(collectTemplateFullwidth('src/x.vue', vue(`<p>「{{ stage }}」</p>`))).toHaveLength(1)
  })
})
