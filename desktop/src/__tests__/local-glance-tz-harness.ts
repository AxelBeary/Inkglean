// #23-2 时区回归的执行体（被 local-glance.test.ts 以子进程方式派生，本文件自己不是用例）。
//
// 为什么要另开一个子进程：这条回归要判的是「进程本地时区是负偏移时，纯日期串会不会差一天」。
// 就地写 `process.env.TZ = 'America/New_York'` 能不能改变 Date 的行为，取决于平台与 Node 版本
// （Windows 上运行期改 TZ 从来不是被承诺的口径），而桌面端门禁跑在 windows-latest：
// 一旦不生效，用例就变成「无论修没修都绿」的假绿，正好把要防的 bug 放过去。
// TZ 在**子进程启动前**设好则是所有平台都支持的口径，且本进程与 CI 环境解耦。
//
// 本文件只做一件事：在给定 TZ 下调用真实的 localDaysLeft，把观察值打给父进程，
// 断言全在父进程侧做（子进程无权给自己发绿卡）。
//
// 文件名不匹配 vitest 的 include（`src/**/__tests__/**/*.test.ts`），故不会被当用例收集；
// import 带 `.ts` 后缀是 Node 类型剥离（type stripping）的要求，
// 桌面 tsconfig 已开 allowImportingTsExtensions，vue-tsc 同样能过。
import assert from 'node:assert/strict'
import { localDaysLeft } from '../components/home/localGlance.ts'

const targetTz = process.argv[2] ?? ''
const refMs = Number(process.argv[3])
assert.ok(targetTz, '缺少目标时区参数')
assert.ok(Number.isFinite(refMs), '缺少参照瞬间（毫秒）参数')

/** 本地日历日字符串 'YYYY-MM-DD'：与画师在日期选择器里看到的形式一致（分量取本进程时区） */
function localDayStr(at: Date, offsetDays: number): string {
  const d = new Date(at.getFullYear(), at.getMonth(), at.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const now = new Date(refMs)
const observed = {
  // 本进程实际生效的偏移（分钟，口径同 Date#getTimezoneOffset 取负：东为正、西为负）
  offset: -now.getTimezoneOffset(),
  today: localDaysLeft(localDayStr(now, 0)),
  tomorrow: localDaysLeft(localDayStr(now, 1)),
  dayBeforeYesterday: localDaysLeft(localDayStr(now, -2)),
  // 带时间的串不该被当成纯日期（维持原解析口径）
  isoNow: localDaysLeft(now.toISOString())
}

process.stdout.write(`TZ_OBSERVED ${targetTz} ${JSON.stringify(observed)}\n`)
