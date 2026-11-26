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
 * 用例对一组边界值（含 1.005 / 8.215 / 1e21 / NaN）逐点断言「与 shared 原版结果一致」，
 * 任一处算法漂移即红。改 shared/src/utils/money.ts 时必须同步改这里并跑该 parity 用例。
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
 * 两个兜底分支与事实源逐点等价：有限数的 toString() 必匹配该正则（!parts 不可达，
 * 保守归 0）；exp+2 后溢出（|金额| 逼近 Number.MAX_VALUE）时原版回退二进制乘法亦溢出为
 * Infinity，此处直接取 Infinity，行为一致且不再写 Math.round(x*100)。
 */
export function yuanToCents(yuan: number | string | null | undefined): number {
  const n = toFiniteNumber(yuan)
  const parts = /^(-?)(\d+(?:\.\d+)?)(?:e([+-]?\d+))?$/.exec(n.toString())
  if (!parts) return 0
  const shifted = Number(`${parts[1]}${parts[2]}e${(parts[3] ? Number(parts[3]) : 0) + 2}`)
  return Number.isFinite(shifted) ? Math.round(shifted) : Infinity
}
