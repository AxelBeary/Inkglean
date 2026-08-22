// 前端测试全局 setup（vitest setupFiles）
/* eslint-disable no-console -- 本文件职责就是接管 console.warn 做警告过滤 */

// ─── 已知无害警告的定向过滤（2026-08-22 用户拍板：测试结果不再被警告刷屏） ───
// 背景：单测有意不注册 Element Plus / vue-router 组件（断言只针对文本与逻辑，
// 不测组件长相），Vue 会对每处 el-*/router-link 喊一声 "Failed to resolve component"，
// 112 个测试文件累计上千条，把「测试通过数」汇总行淹没。
// 纪律：只静音下列已核实的无害模式，其余警告（含新出现的未知组件/真实 prop 错误）
// 一律照常显示——这是过滤器不是消音器，新增警告必须先排查再决定是否扩列。
const MUTE_PATTERNS: RegExp[] = [
  /Failed to resolve component: el-/,
  /Failed to resolve component: router-link/,
  /Failed to resolve directive: loading/,
]

const origWarn = console.warn
console.warn = (...args: unknown[]) => {
  const msg = String(args[0] ?? '')
  if (MUTE_PATTERNS.some(p => p.test(msg))) return
  origWarn(...args)
}
