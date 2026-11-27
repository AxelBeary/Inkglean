/**
 * XEND-12：服务端金额「元 → 分」单一事实源。
 *
 * 算法镜像 `shared/src/utils/money.ts:yuanToCents`（F0168/F0169 十进制指数移位，
 * 修 `Math.round(x*100)` 的 IEEE754 截断误差：1.005 → 101 分而不是 100 分）。
 *
 * 为什么不直接 `import { yuanToCents } from '@inkglean/shared'`：
 * - server/package.json 不依赖 @inkglean/shared（该包 peerDependency 是 vue、index.ts 导出 .vue 组件）；
 * - production Dockerfile Stage 2 只 `COPY server/`，容器里没有 ../shared 源码，相对路径导入会在运行时 404。
 * 故本文件是**部署安全的镜像副本**，并由 `server/tests/discount-fixed-cent.test.ts` 的跨端 parity
 * 用例对一组边界值（含 1.005 / 8.215 / 1e21 / ±Number.MAX_VALUE / NaN）逐点断言「与 shared 原版结果
 * 一致」，任一处算法漂移即红。改 shared/src/utils/money.ts 时必须同步改这里并跑该 parity 用例。
 *
 * MONEY-2：兜底表达式必须与事实源**逐字同式**，不能替换成等价的常量——溢出分支对负数给
 * `-Infinity`，写死 `Infinity` 会丢符号（parity 用例原先测不到这一格）。
 */

/** 非有限值（NaN/±Infinity/非法字符串）→ 0，否则归一化为数值 */
function toFiniteNumber(value: number | string | null | undefined): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * 元 → 分（整数分）。从 Number 的最短十进制表示取尾数/指数，指数 +2 即乘 100，
 * 全程不经二进制乘法，避免 1.005 之类的三位小数被 IEEE754 截断成 100 分。
 *
 * 两个兜底分支与事实源**逐字同式**（`Math.round(n * 100)`）：
 * - `!parts` 对有限数不可达（`Number.prototype.toString()` 的十进制表示必匹配该正则），
 *   保留与事实源同形的表达式即可，不再改成「保守归 0」的等价常量——形态不同就无法靠
 *   文本比对发现漂移；
 * - exp+2 后溢出（|金额| 逼近 Number.MAX_VALUE）时回退二进制乘法：**该表达式对负向溢出给
 *   `-Infinity`**，此前硬编码成 `Infinity` 把符号丢了（MONEY-2：`-1e307` 事实源 -Infinity、
 *   镜像 +Infinity，20 万随机 fuzz 抓出 277 个负数差异）。回退到同式后，parity 用例才真的
 *   钉得住这一格。
 */
export function yuanToCents(yuan: number | string | null | undefined): number {
  const n = toFiniteNumber(yuan)
  const parts = /^(-?)(\d+(?:\.\d+)?)(?:e([+-]?\d+))?$/.exec(n.toString())
  if (!parts) return Math.round(n * 100)
  const shifted = Number(`${parts[1]}${parts[2]}e${(parts[3] ? Number(parts[3]) : 0) + 2}`)
  return Number.isFinite(shifted) ? Math.round(shifted) : Math.round(n * 100)
}
