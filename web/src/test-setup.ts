// 前端测试全局 setup（vitest setupFiles）
/* eslint-disable no-console -- 本文件职责就是接管 console.warn 做警告过滤 */

// ─── 已知无害警告的定向过滤（2026-08-22 用户拍板：测试结果不再被警告刷屏） ───
// 背景：单测有意不注册 Element Plus / vue-router 组件（断言只针对文本与逻辑，
// 不测组件长相），Vue 会对每处 el-*/router-link 喊一声 "Failed to resolve component"，
// 112 个测试文件累计上千条，把「测试通过数」汇总行淹没。
// 纪律：只静音下列已核实的无害模式，其余警告（含新出现的未知组件/真实 prop 错误）
// 一律照常显示——这是过滤器不是消音器，新增警告必须先排查再决定是否扩列。
const MUTE_PATTERNS: RegExp[] = [
  /Failed to resolve component: router-link/,
  /Failed to resolve directive: loading/,
]

// F0258: el-* 过滤收窄为「已知 Element Plus 组件」白名单——原先 /el-/ 通配会吞掉真实拼错的未注册组件
// （如 el-buttn），这类才是需要暴露的回归。白名单外的 el-* 一律照常警告。
const EP_COMPONENTS = [
  'el-button', 'el-input', 'el-input-number', 'el-select', 'el-option', 'el-switch',
  'el-table', 'el-table-column', 'el-dialog', 'el-form', 'el-form-item', 'el-card',
  'el-image', 'el-icon', 'el-upload', 'el-popover', 'el-tooltip', 'el-timeline',
  'el-timeline-item', 'el-tabs', 'el-tab-pane', 'el-radio-group', 'el-radio-button',
  'el-radio', 'el-checkbox', 'el-checkbox-group', 'el-date-picker', 'el-badge',
  'el-popconfirm', 'el-message-box', 'el-empty', 'el-skeleton', 'el-drawer',
  'el-dropdown', 'el-menu', 'el-menu-item', 'el-pagination', 'el-progress',
  'el-slider', 'el-tag', 'el-tooltip', 'el-scrollbar', 'el-config-provider',
  'el-collapse', 'el-collapse-item', 'el-divider', 'el-alert', 'el-loading',
  'el-cascader', 'el-autocomplete', 'el-tree', 'el-steps', 'el-step'
]
const EP_WARN_RE = new RegExp(`Failed to resolve component: (${EP_COMPONENTS.join('|')})\\b`)

const origWarn = console.warn
console.warn = (...args: unknown[]) => {
  const msg = String(args[0] ?? '')
  if (MUTE_PATTERNS.some(p => p.test(msg))) return
  if (EP_WARN_RE.test(msg)) return
  origWarn(...args)
}
