// @inkglean/shared —— 拾绘双端共享组件事实源（web + desktop）
//
// 契约（2026-08-24 用户拍板方案 A）：
// 1. F3 约稿条 / F4 小票 / F12 完稿引导等双端共用组件一律住在本包，禁止两端各抄一份
// 2. web 与 desktop 以 file: 链接方式引用（"@inkglean/shared": "file:../shared"），直接导入源码，无构建产物
// 3. 本包依赖保持最小（vue 走 peer），新增第三方依赖须按仓库纪律登记 THIRD-PARTY-NOTICES.md
// 4. 现有 web 组件迁入本包走单独搬家批（带 web 全量门禁回归），不与功能开发混批
export const sharedVersion = '0.1.0'

/** i18n 注入签名：宿主传自己的翻译函数，共享组件内一律 t('key') / t('key', { param }) */
export type TFn = (key: string, params?: Record<string, unknown>) => string

// ─── 纯工具（两端单一事实源） ───
// 金额工具（分/元换算与展示，817 科学计数法消毒口径）
export * from './utils/money'
// canvas 纸墨色板单源（P1 汇总波 C19）
export * from './utils/ink-palette'
// 小票计算口径（oimimo 吸纳批五）：赠品恒 0 → 小计 → 折扣 → 应收 → 定金/尾款
export * from './receipt/totals'

// ─── F3 约稿条 / F4 小票哑组件（shared-824 整件搬家批） ───
// 哑组件纪律：不发请求、不读存储、不碰剪贴板；数据进 props、事件出 emit
export { default as PriceCard } from './components/PriceCard.vue'
export { default as ReceiptPrinter } from './components/ReceiptPrinter.vue'
export type {
  PriceCardTier,
  ExamplePick,
  PriceCardDraft,
  PriceCardArtwork,
  ImportedTier
} from './components/PriceCard.vue'
export type { ReceiptDraft, ReceiptDraftItem } from './components/ReceiptPrinter.vue'
