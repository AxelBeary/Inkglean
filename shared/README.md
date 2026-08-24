# @inkglean/shared —— 拾绘双端共享组件包

> 2026-08-24 用户拍板（方案 A：仓库根目录公共仓 + 分两步走）。决策总书见 `docs/requirements/REQ-014-桌面端伴侣应用.md` §仓库与开发形态。

## 职责边界

- **住这里的**：web 与 desktop 两端共用的组件与纯逻辑——F3 约稿条 / F4 小票 / F12 完稿引导（首批名单），后续双端共用件一律进本包
- **不住这里的**：单端专属代码、需要调用原生能力的代码（归 desktop-bridge）、需要调平台 API 的数据层（各端自持，通过 props/事件与本包组件对接）

## 契约

1. 两端以 `file:../shared` 链接引用，直接导入源码，无构建产物、无发布流程
2. 本包组件保持「哑组件」纪律：不直接发网络请求、不直接读写存储，数据进 props、事件出 emit，保证两端宿主都能接
3. 依赖最小化：运行期依赖仅 vue（peer）；新增第三方依赖必须先登记 `THIRD-PARTY-NOTICES.md`
4. 视觉样式遵循纸墨设计语言，颜色/圆角等 token 由宿主注入的 CSS 变量提供，本包不写死主题色

### 哑组件接口口径（824 搬家批定稿，F3/F4 同款）

- **i18n 注入**：`t: (key, params?) => string` 必填 prop，组件内零硬编码文案；`locale` prop 供本地化格式（默认 'zh-CN'）
- **草稿**：`initialDraft` prop 进、`draft-change` 事件出（含挂载归一化 echo 一次），存储读写归宿主
- **提示**：`notify({kind,text})` 事件出（text 已翻好），宿主映射 toast
- **复制**：`copy-text({text})` 事件出，剪贴板与成败提示归宿主
- **导出**：`export-png({blob,filename})` 事件出，下载/保存归宿主；另 expose `buildCanvas()`
- **取数**：平台数据经 props 回灌（如 `artworks`）+ `request-*` 事件请求，组件不碰 API
- **宿主注入 token**：组件样式消费 `--paper2/--card/--ink/--ink2/--ink3/--line/--line2/--hq/--zs/--white/--r-s/--r-m/--r-paper/--font-scale/--dur-fast`；web 由 artist-tokens.css 注入；**desktop 侧 token 注入层待桌面端施工批建立（开放项）**

## 搬家计划（分步纪律）

- **第一步（824 定契批）**：骨架 + 契约 + 两端接线，零现有代码改动 ✅
- **第二步（824 搬家批，本批）**：F3 约稿条 / F4 小票整件迁入（去 element-plus 化：分段控件/遮罩弹窗自绘），web 页面原地改薄宿主壳，带三端全量门禁回归 ✅
- 后续双端共用件（F12 完稿引导等）一律直接在本包开发，不再走搬家

## 本包门禁

```
cd shared && npm run lint && npm run test && npm run typecheck
```
