// @inkglean/shared —— 拾绘双端共享组件事实源（web + desktop）
//
// 契约（2026-08-24 用户拍板方案 A）：
// 1. F3 约稿条 / F4 小票 / F12 完稿引导等双端共用组件一律住在本包，禁止两端各抄一份
// 2. web 与 desktop 以 file: 链接方式引用（"@inkglean/shared": "file:../shared"），直接导入源码，无构建产物
// 3. 本包依赖保持最小（vue 走 peer），新增第三方依赖须按仓库纪律登记 THIRD-PARTY-NOTICES.md
// 4. 现有 web 组件迁入本包走单独搬家批（带 web 全量门禁回归），不与功能开发混批
export const sharedVersion = '0.1.0'
