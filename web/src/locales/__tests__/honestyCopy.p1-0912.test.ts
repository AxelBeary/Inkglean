// 9/12 用户拍板（任务1·对外文书诚实度收尾）的防漂移断言
// 覆盖：① 隐私政策「最后更新」日期跟随正文实改（上一批改了正文、这批补日期），中英一致；
//       ② 两处通知开关文案不再承诺未接通的 QQ 通知能力，且与已提交的 common.notifyDevHint 同口径；
//       ③ 服务条款正文本批未动，故其日期不得被顺手改（防止"只动日期不动正文"的反向不诚实）
import { describe, it, expect } from 'vitest'
import zhCN from '../zh-CN'
import en from '../en'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

describe('隐私政策更新日期与正文实改对齐', () => {
  it('zh-CN / en 的 compliance.privacy.updated 均为 2026-09-12 且格式合法', () => {
    expect(zhCN.compliance.privacy.updated).toBe('2026-09-12')
    expect(en.compliance.privacy.updated).toBe('2026-09-12')
    expect(zhCN.compliance.privacy.updated).toMatch(DATE_RE)
    expect(en.compliance.privacy.updated).toMatch(DATE_RE)
  })

  it('本批未改服务条款正文：terms.updated 不得跑到隐私政策日期之后（防只动日期的反向不诚实）', () => {
    expect(Date.parse(zhCN.compliance.terms.updated)).toBeLessThanOrEqual(Date.parse(zhCN.compliance.privacy.updated))
    expect(Date.parse(en.compliance.terms.updated)).toBeLessThanOrEqual(Date.parse(en.compliance.privacy.updated))
  })
})

describe('通知开关文案不再承诺未接通的能力（QQ 通道未接通）', () => {
  // 旧文案：「有新订单、留言或节点推进时提醒你。」/「允许客户接收排队/完成通知」
  it('preferences.notifyDesc：写明本开关实际控制什么，并点出通道开发中', () => {
    expect(zhCN.preferences.notifyDesc).not.toMatch(/提醒你|通知你|即时推送/)
    expect(zhCN.preferences.notifyDesc).toContain('开发中')
    expect(zhCN.preferences.notifyDesc).toMatch(/不会真的|还用不了/)
    expect(en.preferences.notifyDesc).not.toMatch(/alerts you|notifies you/i)
    expect(en.preferences.notifyDesc).toMatch(/in development/i)
    expect(en.preferences.notifyDesc).toMatch(/sends no|will not send/i)
  })

  it('settings.notify* 三键已作为死键退役（全仓零渲染，无渲染器不得加回）', () => {
    // 2026-09-12：画师侧通知开关实为 preferences.notifyLabel/notifyDesc，客户页为 orderForm.notifyLabel；
    // settings 段那三个键从来没有组件引用，曾误导台账对账把死键当活文案派工，故删并锁住。
    // 用 `in` 而非属性访问：断言的就是「键不存在」，属性访问在类型上会直接编译错。
    for (const settings of [zhCN.settings, en.settings]) {
      expect('notifyText' in settings).toBe(false)
      expect('notifyPanelTitle' in settings).toBe(false)
      expect('notifyLabel' in settings).toBe(false)
    }
    // 而真正在渲染的两处必须还活着（防止反向误删）
    expect(zhCN.preferences.notifyLabel).toBeTruthy()
    expect(zhCN.orderForm.notifyLabel).toBeTruthy()
  })

  it('活文案与 common.notifyDevHint 同口径：同一事实、各自精简，不复读整段也不互相矛盾', () => {
    for (const text of [zhCN.common.notifyDevHint, zhCN.preferences.notifyDesc]) {
      expect(text).toContain('开发中')
    }
    for (const text of [en.common.notifyDevHint, en.preferences.notifyDesc]) {
      expect(text).toMatch(/in development/i)
    }
    // notifyDevHint 描述的是「灰着、默认不勾」的客户侧勾选项；画师侧开关并未灰置，
    // 因此不得复读该描述，否则构成新的不实陈述（这里锁住这条边界）
    expect(zhCN.preferences.notifyDesc).not.toContain('先灰着')
    expect(en.preferences.notifyDesc).not.toMatch(/greyed out|grayed out/i)
  })
})

describe('开箱向导「画师入驻方式」步词条（中英成对）', () => {
  const keys = [
    'stepModeTitle', 'stepModeDesc', 'stepModeInviteLabel', 'stepModeInviteDesc',
    'stepModeManualLabel', 'stepModeManualDesc', 'stepModeNote', 'stepModeSubmit', 'stepModeFailed'
  ] as const

  it('9 个新键在 zh-CN 与 en 均已定义且非空', () => {
    for (const key of keys) {
      expect(zhCN.setup[key], `zh-CN setup.${key} 缺失`).toBeTruthy()
      expect(en.setup[key], `en setup.${key} 缺失`).toBeTruthy()
    }
  })

  it('两个选项的差别说人话：invite 提到邀请码，manual 提到登录页不显示入驻入口', () => {
    expect(zhCN.setup.stepModeInviteDesc).toContain('邀请码')
    expect(zhCN.setup.stepModeManualDesc).toContain('登录页')
    expect(en.setup.stepModeInviteDesc).toMatch(/invite code/i)
    expect(en.setup.stepModeManualDesc).toMatch(/login page/i)
  })

  it('插入新步后，创建管理员步的验证器预告不再把扫码说成紧邻的下一步', () => {
    expect(zhCN.setup.step2Prep).not.toContain('下一步要扫二维码')
    expect(en.setup.step2Prep).not.toMatch(/the next step binds/i)
  })
})
