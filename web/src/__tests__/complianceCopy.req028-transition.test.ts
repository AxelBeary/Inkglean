// REQ-028 过渡期（P1 修复批）对外文书与共用文案键的防漂移断言
// 覆盖：① common.notifyDevTag / notifyDevHint 中英成对且非空（客户下单页与画师录单页共用同一个键）；
//       ② 隐私政策「浏览行为」条目不再向用户承诺可自行关闭埋点（实际只有管理员全站开关），
//          同时保留原有数据范围与 180 天留存说明；中英双份同口径
import { describe, it, expect } from 'vitest'
import zhCN from '../locales/zh-CN'
import en from '../locales/en'

/** compliance.privacy.sections 的章节形状（与 InviteOverlay 同口径：文书只渲染不复制） */
interface DocSection { title: string; paragraphs: string[]; items?: string[] }

interface ComplianceLocale { compliance: { privacy: { sections: unknown } } }

function privacyItems(locale: ComplianceLocale): string[] {
  return (locale.compliance.privacy.sections as unknown as DocSection[])
    .flatMap(sec => sec.items || [])
}

describe('REQ-028 过渡期共用文案键（中英成对）', () => {
  it('common.notifyDevTag / common.notifyDevHint 在 zh-CN 与 en 均已定义且非空', () => {
    expect(zhCN.common.notifyDevTag.length).toBeGreaterThan(0)
    expect(zhCN.common.notifyDevHint.length).toBeGreaterThan(0)
    expect(en.common.notifyDevTag.length).toBeGreaterThan(0)
    expect(en.common.notifyDevHint.length).toBeGreaterThan(0)
  })

  it('说明文案明示「开发中」并给出原因，不写「敬请期待」这类空话', () => {
    expect(zhCN.common.notifyDevHint).toContain(zhCN.common.notifyDevTag)
    expect(zhCN.common.notifyDevHint).toMatch(/还用不了|灰/)
    expect(zhCN.common.notifyDevHint).not.toMatch(/敬请期待|即将上线|后续开放/)
  })
})

describe('隐私政策埋点条目（告知与实际能力一致）', () => {
  const zhItem = privacyItems(zhCN).find(line => line.startsWith('浏览行为'))
  const enItem = privacyItems(en).find(line => line.startsWith('Browsing behavior'))

  it('条目存在（中英各一条）', () => {
    expect(zhItem).toBeTypeOf('string')
    expect(enItem).toBeTypeOf('string')
  })

  it('不再承诺用户能自己关闭埋点，改为写明管理员全站开关', () => {
    expect(zhItem).not.toMatch(/可在偏好中关闭|可在偏好里关闭|可自行关闭|随时关闭/)
    expect(enItem!.toLowerCase()).not.toMatch(/can be disabled in preferences|you can (?:disable|turn off|opt out)/)
    expect(zhItem).toContain('管理员')
    expect(enItem!.toLowerCase()).toContain('administrator')
  })

  it('原有的数据范围说明与 180 天留存没有被删', () => {
    expect(zhItem).toContain('180 天')
    expect(enItem).toContain('180 days')
    expect(zhItem).toContain('页面')
    expect(enItem!.toLowerCase()).toContain('page')
    // 「不含内容与文件」这条范围说明必须留着（防止只留开关口径、把数据范围说没）
    expect(zhItem).toMatch(/不含/)
    expect(enItem!.toLowerCase()).toMatch(/not /)
  })
})
