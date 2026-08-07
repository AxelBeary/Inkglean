// message-parser 纯函数单测（REQ-035 §五 MVP-1）
// 覆盖：QQ 识别（独立数字串/边界/排除金额）、金额线索、日期线索、description 截断、解析不出不猜
import { describe, it, expect } from 'vitest'
import { parseMessage, DESCRIPTION_MAX_LEN } from '../message-parser.js'

describe('parseMessage 基础结构', () => {
  it('返回 { clientQq, description, hints:{amount,deadline} }', () => {
    const r = parseMessage('QQ 12345678 想要一张半身像')
    expect(r).toHaveProperty('clientQq')
    expect(r).toHaveProperty('description')
    expect(r.hints).toHaveProperty('amount')
    expect(r.hints).toHaveProperty('deadline')
  })

  it('非字符串/空白输入 → 全空，不抛错', () => {
    expect(parseMessage(null)).toEqual({ clientQq: '', description: '', hints: { amount: null, deadline: null } })
    expect(parseMessage(undefined)).toEqual({ clientQq: '', description: '', hints: { amount: null, deadline: null } })
    expect(parseMessage('')).toEqual({ clientQq: '', description: '', hints: { amount: null, deadline: null } })
    expect(parseMessage('   \n  ')).toEqual({ clientQq: '', description: '', hints: { amount: null, deadline: null } })
  })
})

describe('QQ 号识别（第一个独立数字串 5-15 位）', () => {
  it('常见格式：QQ 12345678 命中', () => {
    expect(parseMessage('QQ 12345678 想要一张半身像').clientQq).toBe('12345678')
  })

  it('QQ: 前缀冒号命中', () => {
    expect(parseMessage('QQ:87654321 全身像').clientQq).toBe('87654321')
  })

  it('消息以 QQ 号开头', () => {
    expect(parseMessage('12345678 想要一张半身像').clientQq).toBe('12345678')
  })

  it('中文粘连数字（不带分隔）命中', () => {
    expect(parseMessage('想要12345678这张半身像').clientQq).toBe('12345678')
  })

  it('英文/数字粘连 abc12345678xyz 命中', () => {
    expect(parseMessage('abc12345678xyz').clientQq).toBe('12345678')
  })

  it('5 位边界命中', () => {
    expect(parseMessage('QQ 12345').clientQq).toBe('12345')
  })

  it('15 位边界命中', () => {
    expect(parseMessage('QQ 123456789012345').clientQq).toBe('123456789012345')
  })

  it('4 位数字不命中（不足 5 位，不猜）', () => {
    expect(parseMessage('预算 200 元，qq 1234').clientQq).toBe('')
  })

  it('16 位数字不命中（超过 15 位，不猜）', () => {
    expect(parseMessage('QQ 1234567890123456').clientQq).toBe('')
  })

  it('取第一个独立数字串（手机号在前场景按规则取第一个）', () => {
    expect(parseMessage('联系方式 13800138000，QQ 是 12345678').clientQq).toBe('13800138000')
  })

  it('金额中的长数字不冒充 QQ（预算 100000 元）', () => {
    expect(parseMessage('预算 100000 元，QQ 12345678').clientQq).toBe('12345678')
  })

  it('日期中的数字不冒充 QQ（2 位不足以命中，纯日期无 QQ 留空）', () => {
    expect(parseMessage('8月20日前要').clientQq).toBe('')
  })

  it('无 QQ 号 → 留空（解析不出不猜）', () => {
    expect(parseMessage('想要一张半身像，预算 200 元').clientQq).toBe('')
  })
})

describe('金额线索 hints.amount（识别提示，不自动填）', () => {
  it('预算 x 元 命中', () => {
    expect(parseMessage('预算 500 元，QQ 12345678').hints.amount).toBe('500')
  })

  it('x 元 命中', () => {
    expect(parseMessage('QQ 12345678 200元 全身像').hints.amount).toBe('200')
  })

  it('预算无空格粘连命中', () => {
    expect(parseMessage('预算200元 QQ 12345678').hints.amount).toBe('200')
  })

  it('带小数命中', () => {
    expect(parseMessage('预算 66.5 元 QQ 12345678').hints.amount).toBe('66.5')
  })

  it('无金额 → null', () => {
    expect(parseMessage('QQ 12345678 想要一张半身像').hints.amount).toBeNull()
  })
})

describe('日期线索 hints.deadline（识别提示，不自动填）', () => {
  it('x号前 命中', () => {
    expect(parseMessage('5号前要，QQ 12345678').hints.deadline).toBe('5号前')
  })

  it('x月x日 命中', () => {
    expect(parseMessage('QQ 12345678 8月20日交付').hints.deadline).toBe('8月20日')
  })

  it('优先取号前（两条都有时取先命中的号前）', () => {
    expect(parseMessage('QQ 12345678 3号前画完，8月20日交付').hints.deadline).toBe('3号前')
  })

  it('无日期 → null', () => {
    expect(parseMessage('QQ 12345678 想要一张半身像').hints.deadline).toBeNull()
  })
})

describe('description（全文预填，截断 2000）', () => {
  it('原文保留（trim）', () => {
    const r = parseMessage('  QQ 12345678 想要一张半身像，预算 500 元  ')
    expect(r.description).toBe('QQ 12345678 想要一张半身像，预算 500 元')
  })

  it('超过 2000 字符截断（对齐后端 maxLength）', () => {
    const long = 'QQ 12345678 ' + '啊'.repeat(3000)
    const r = parseMessage(long)
    expect(r.description.length).toBe(DESCRIPTION_MAX_LEN)
    expect(r.description.startsWith('QQ 12345678 ')).toBe(true)
    expect(r.clientQq).toBe('12345678')
  })
})

describe('组合场景（画师真实粘贴）', () => {
  it('完整消息：QQ + 需求 + 预算 + 截稿日', () => {
    const msg = [
      '老板你好',
      '想要一张 Q 版半身像，穿着小裙子，预算 300 元',
      'QQ 号 87654321',
      '下周三前要，7号前吧'
    ].join('\n')
    const r = parseMessage(msg)
    expect(r.clientQq).toBe('87654321')
    expect(r.hints.amount).toBe('300')
    expect(r.hints.deadline).toBe('7号前')
    expect(r.description).toContain('Q 版半身像')
    expect(r.description).toContain('7号前吧')
  })
})