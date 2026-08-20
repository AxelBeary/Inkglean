// message-parser 纯函数单测（REQ-035 §五 MVP-1）
// 覆盖：QQ 识别（独立数字串/边界/排除金额）、金额线索、日期线索、description 截断、解析不出不猜
import { describe, it, expect, beforeEach } from 'vitest'
import { parseMessage, DESCRIPTION_MAX_LEN } from '../message-parser'
import { i18n, setLocale } from '../../i18n/index'

beforeEach(() => {
  // b4-10: 线索显示按 locale 格式化——测试固定 zh-CN 断言中文形态
  i18n.global.locale.value = 'zh-CN'
})

describe('parseMessage 基础结构', () => {
  it('返回 { clientQq, clientName, description, hints:{amount,deadline} }', () => {
    const r = parseMessage('QQ 12345678 想要一张半身像')
    expect(r).toHaveProperty('clientQq')
    expect(r).toHaveProperty('clientName')
    expect(r).toHaveProperty('description')
    expect(r.hints).toHaveProperty('amount')
    expect(r.hints).toHaveProperty('deadline')
  })

  it('非字符串/空白输入 → 全空，不抛错', () => {
    const empty = { clientQq: '', clientName: '', description: '', hints: { amount: null, deadline: null } }
    expect(parseMessage(null as unknown as string)).toEqual(empty)
    expect(parseMessage(undefined as unknown as string)).toEqual(empty)
    expect(parseMessage('')).toEqual(empty)
    expect(parseMessage('   \n  ')).toEqual(empty)
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

  // 820 规则补全：¥/￥ 符号、价格/总价等前缀、定金尾款
  it('820: ¥680 命中（货币符号）', () => {
    expect(parseMessage('头像 ¥680，QQ 12345678').hints.amount).toBe('680')
  })

  it('820: ￥300（全角符号）命中', () => {
    expect(parseMessage('￥300 画一张 Q 版').hints.amount).toBe('300')
  })

  it('820: 价格/总价/一共/报价前缀命中（无需「元」字）', () => {
    expect(parseMessage('价格 1200').hints.amount).toBe('1200')
    expect(parseMessage('总价1500，QQ 12345678').hints.amount).toBe('1500')
    expect(parseMessage('一共 88.5 元').hints.amount).toBe('88.5')
  })

  it('820: 定金/尾款命中作金额线索', () => {
    expect(parseMessage('定金 300 元，尾款到货再付').hints.amount).toBe('300')
  })

  it('820: ¥ 金额内的长数字不冒充 QQ', () => {
    expect(parseMessage('¥100000 大单，QQ 12345678').clientQq).toBe('12345678')
  })

  it('820: x块 命中（口语形态）', () => {
    expect(parseMessage('200块画个头像').hints.amount).toBe('200')
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

  it('817-D 体验12: 非法月（22月31日）不采纳 → null', () => {
    expect(parseMessage('QQ 12345678 22月31日交付').hints.deadline).toBeNull()
  })

  it('817-D 体验12: 非法月（13月1日）不采纳 → null', () => {
    expect(parseMessage('QQ 12345678 13月1日交付').hints.deadline).toBeNull()
  })

  it('817-D 体验12: 日超该月上限（2月30日 / 4月31日）不采纳 → null', () => {
    expect(parseMessage('QQ 12345678 2月30日交付').hints.deadline).toBeNull()
    expect(parseMessage('QQ 12345678 4月31日交付').hints.deadline).toBeNull()
  })

  it('817-D 体验12: 无年份的 2月29日 按宽容口径采纳（闰年不可判）', () => {
    expect(parseMessage('QQ 12345678 2月29日交付').hints.deadline).toBe('2月29日')
  })

  it('817-D 体验12: 非法日期在前时跳过，取后续合法日期', () => {
    expect(parseMessage('QQ 12345678 22月31日交付，8月20日结稿').hints.deadline).toBe('8月20日')
  })

  it('817-D 体验12: 非法「32号前」不采纳 → null', () => {
    expect(parseMessage('QQ 12345678 32号前交付').hints.deadline).toBeNull()
  })

  it('b4-10: en locale 下按英文日期格式显示', async () => {
    // en 消息懒加载：直改 locale.value 不载入 en 包，须走 setLocale（与真实切语言链路同口径）
    await setLocale('en')
    expect(parseMessage('5号前要，QQ 12345678').hints.deadline).toBe('before 5')
    expect(parseMessage('QQ 12345678 8月20日交付').hints.deadline).toBe('8/20')
    await setLocale('zh-CN')
  })

  // 820 规则补全：月日前 / 点分前 / 斜线前 / ISO / 年月日 / 文中位置优先
  it('820: x月x日前 命中（带「前」更完整的形态优先同位置无「前」）', () => {
    expect(parseMessage('9月10日前要，QQ 12345678').hints.deadline).toBe('9月10日前')
  })

  it('820: 点分/斜线日期带「前」命中', () => {
    expect(parseMessage('9.10前能交吗').hints.deadline).toBe('9月10日前')
    expect(parseMessage('9/10前交付').hints.deadline).toBe('9月10日前')
  })

  it('820: 点分/斜线日期无「前」不采纳（歧义太大，不猜）', () => {
    expect(parseMessage('版本 9.10 更新').hints.deadline).toBeNull()
  })

  it('820: ISO 日期命中（带/不带「前」）', () => {
    expect(parseMessage('2026-09-10 截稿').hints.deadline).toBe('2026年9月10日')
    expect(parseMessage('2026/9/10前要').hints.deadline).toBe('2026年9月10日')
  })

  it('820: 中文年月日命中', () => {
    expect(parseMessage('2026年9月10日交付').hints.deadline).toBe('2026年9月10日')
  })

  it('820: ISO 日期非法月日不采纳 → null', () => {
    expect(parseMessage('2026-13-40 乱写的').hints.deadline).toBeNull()
  })

  it('820: 年份越界不采纳（1234-05-06 非截稿）→ null', () => {
    expect(parseMessage('编号 1234-05-06').hints.deadline).toBeNull()
  })

  it('820: 多个日期线索按文中位置取最早（替代旧「号前恒优先」）', () => {
    expect(parseMessage('QQ 12345678 8月20日交付，3号前画完').hints.deadline).toBe('8月20日')
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

describe('昵称识别 clientName（820）', () => {
  it('昵称：小明 命中', () => {
    expect(parseMessage('昵称：小明\n想要一张头像').clientName).toBe('小明')
  })

  it('客户/金主/买家/老板 标签均命中（半角冒号也认）', () => {
    expect(parseMessage('客户: Alice').clientName).toBe('Alice')
    expect(parseMessage('金主：老王').clientName).toBe('老王')
    expect(parseMessage('买家：小美\nQQ 12345678').clientName).toBe('小美')
  })

  it('粘连形态（QQ昵称：）命中', () => {
    expect(parseMessage('QQ昵称：星星').clientName).toBe('星星')
  })

  it('无标签 → 空（不猜）', () => {
    expect(parseMessage('想要一张头像，小明说的').clientName).toBe('')
  })

  it('超长值截断 30 字', () => {
    const long = '名'.repeat(50)
    expect(parseMessage('昵称：' + long).clientName.length).toBe(30)
  })

  it('取第一个标签行的值（多标签不叠加）', () => {
    expect(parseMessage('昵称：小明\n客户：小红').clientName).toBe('小明')
  })
})

describe('描述清洗（820：只吸纳真正有用的，不吸纳重复和垃圾）', () => {
  it('重复行只留第一条', () => {
    expect(parseMessage('画一只猫\n画一只猫\n要Q版').description).toBe('画一只猫\n要Q版')
  })

  it('纯时间戳行删除（含带日期形态）', () => {
    expect(parseMessage('2026-08-20 14:32\n画一只猫\n14:35:02').description).toBe('画一只猫')
  })

  it('聊天系统占位删除（[图片]/[表情]/【语音】）', () => {
    expect(parseMessage('[图片]\n[表情]\n【语音】\n想要头像').description).toBe('想要头像')
  })

  it('系统事件行删除（撤回/新消息分隔）', () => {
    expect(parseMessage('对方撤回了一条消息\n以下是新消息\n需求是头像').description).toBe('需求是头像')
  })

  it('行首时间前缀剥离（QQ 聊天记录复制形态）', () => {
    expect(parseMessage('2026-08-20 14:32:05 画一只猫').description).toBe('画一只猫')
  })

  it('已提取的声明行删除（昵称/预算/QQ号），值已进表单不再重复', () => {
    const msg = '昵称：小明\n预算：500元\nQQ号：12345678\n想要一张头像'
    const r = parseMessage(msg)
    expect(r.clientName).toBe('小明')
    expect(r.clientQq).toBe('12345678')
    expect(r.description).toBe('想要一张头像')
  })

  it('正常内容带标签的行不误删（需求：画一只猫 保留）', () => {
    expect(parseMessage('需求：画一只猫').description).toBe('需求：画一只猫')
  })

  it('综合：真实 QQ 聊天记录形态', () => {
    const msg = [
      '2026-08-20 14:32:05 老板在吗',
      '2026-08-20 14:32:40 想要一张 Q 版头像，预算 300 元',
      '2026-08-20 14:33:01 [图片]',
      '2026-08-20 14:33:01 [图片]',
      '2026-08-20 14:33:20 9月10日前能交吗',
      '2026-08-20 14:33:20 9月10日前能交吗',
      '2026-08-20 14:34:00 我 QQ 87654321'
    ].join('\n')
    const r = parseMessage(msg)
    expect(r.clientQq).toBe('87654321')
    expect(r.hints.amount).toBe('300')
    expect(r.hints.deadline).toBe('9月10日前')
    expect(r.description).toBe('老板在吗\n想要一张 Q 版头像，预算 300 元\n9月10日前能交吗\n我 QQ 87654321')
    expect(r.description).not.toContain('[图片]')
    expect(r.description).not.toContain('2026-08-20')
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
