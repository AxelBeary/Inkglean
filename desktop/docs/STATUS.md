# 桌面端（拾绘桌面版）子项目状态

> 本文件为桌面端子项目专有事实源，与主项目 `docs/comms/STATUS.md` 分工：
> - 平台整体状态/发版/门禁基线 → 主 STATUS
> - 桌面端（`desktop/` 目录）开工进度/专属拍板/验收清单 → 本文件
> 需求决策总书 = `docs/requirements/REQ-014-桌面端伴侣应用.md`（父级文档，所有拍板的唯一事实源；本文件不复制细节，只做索引与运营状态）。

> 🔑 **最新：2026-08-24 desktop-bridge 首层落地 + 门禁体系建齐（双侧全绿）**——开工清单第三步首层完成：**前端** `desktop/src/bridge/`（env 环境探测 / errors 逃生门错误类型 / index 统一收口），首批能力：ping 健康检查、openWithSystem 调起系统程序、pickDirectory 目录选择；逃生门纪律=纯浏览器环境抛 BridgeUnavailableError，模板 greet 演示页已换成桥接自检页（App.vue）。**Rust 侧** 自定义命令收口于 `src-tauri/src/bridge/mod.rs`（首个命令 bridge_ping 返回版本号；F8 窗口枚举/输入空闲后续仅此处允许）；接入 tauri-plugin-dialog（capabilities 同步放行）。**门禁体系建齐（口径登记）**：`cd desktop` 后 `npm run lint`（eslint，口径对齐 web）/ `npm run test`（vitest+happy-dom，首基线 6/6）/ `npm run build`（vue-tsc+vite）；Rust 侧 `cargo check`；本批四项全绿（lint 0 错 0 警）。工具链新增：eslint10+typescript-eslint+eslint-plugin-vue / vitest4+happy-dom / jiti / @tauri-apps/plugin-dialog。**小坑实录**：①npm install 被沙箱超时截断留残骸致二次安装 ENOTEMPTY，清残后恢复；②eslint TS 配置文件需 jiti 显式安装。**开放项**：SignPath 申请（用户拍板晚点再交，表已备好）；`npm run tauri dev` 桌面壳内首启冒烟（待用户验收）。上一批脚手架条照旧保留。

> ✅ 2026-08-24 Tauri 2 脚手架落地——开工清单第二步完成：官方 create-tauri-app 生成 desktop/ 脚手架（Vue 3 + TS + Vite 6，与 web 同栈），含 tauri-plugin-opener。项目化调整：productName=拾绘桌面版、窗口标题=拾绘、identifier=com.shihui.desktop、包名 artist-commission-desktop、AGPL-3.0 标注；esbuild 安装脚本登记 allowScripts（对齐根目录/web 惯例）；THIRD-PARTY-NOTICES 补「桌面端」登记段。**环境配套（本机首次）**：winget 装 rustup + Rust stable 1.98.0（minimal→默认 profile）；VS Build Tools 2022 已有。**门禁现口径**：`cd desktop && npm run build`（vue-tsc + vite build）全绿；Rust 侧 `cargo check` 全绿（tauri 2.11.5）；eslint/vitest 未引入，功能施工时补齐并更新本条。**事故实录**：脚手架 `--force` 曾吞掉已建成的 desktop/docs/（本文件与 CONTEXT），经 git restore 完整恢复——教训：非空目录跑 create-tauri-app 前先确认 git 干净备份。**开放项**：SignPath 申请（等用户下令）；`npm run tauri dev` 首启窗口冒烟（未跑，属 GUI 交互验证）。

> ✅ 2026-08-24 立项准备（用户拍板两项：同仓开发 + 子项目独立 docs；零代码）——①桌面端于现有仓库建 `desktop/` 目录（与 web/server 平级），不单独开仓库、不单独开开发 profile；②`desktop/docs/` 为桌面端专属状态事实源（STATUS + CONTEXT），自本日起桌面端专属拍板与进度落本文件、不再并入主 STATUS。开工第一步 = SignPath 签名申请（公开仓+AGPL 已达标，等用户下令）；第二步 = Tauri 2 脚手架。开放项：用户研判验收（二轮研判批落档内容）。

## 已拍板决策索引（详请见 REQ-014）

| 领域 | 摘要 | REQ-014 出处 |
|------|------|--------------|
| 框架/平台 | Tauri 2 + Vue 3（与 web 同栈），Windows 首发；desktop-bridge 逃生层强制 | §技术选型 |
| 模式 | 双模式完全分离（本地脱网/云端登录），仅本地数据可导出 | §模式设计 |
| 功能 | F1~F8（一轮）+ F9~F13（二轮）：文件/记账/约稿条/小票/图缓存/档案/时间统计 + 快查卡/录单/排期三视图/完稿宣传链/成品归档再许可 | §功能清单 + §二轮章 |
| 首页 | 7 板块（排期/待办/订单/收入/挂牌/留言/统计卡）复用拖排显隐；配置页留网页；工具箱搬 3 留 16 | §二轮章 |
| 窗口化 | 选 B 可拆悬浮组件（首发仅撕计时器/今日待办/截稿倒计时），专注画画模式首发；布局偏好复用 dashboard_prefs | §二轮章 |
| 体验 | 托盘快照/系统通知/全局快捷键首发；代写系统日历二期；开机自启静默到托盘 | §二轮章 |
| 登录 | TOTP 首发 + 90 天长效会话（方案 A 服务器记账式）+ 设备清单可踢；Passkey 二期 | §二轮章 |
| 更新 | 自托管静默更新（latest.json + NSIS + Ed25519 验签）+ SignPath 代码签名 | §技术选型 |
| 签名 | SignPath（防 SmartScreen 误报）与更新签名（防掉包）两回事都要做 | §二轮章 |

## 安全口径三条（开工前强制基线）

1. **凭证**：记账式会话（设备表一张账：登录记账/踢人撕账/顺延改账/设备清单同账）+ 登录凭证强制存 Windows 系统保险箱（凭据保管柜），不存明文文件
2. **免验证通道**：CF 只放行登录类接口、不整站放行；桌面端「身份标签」落档写死「可伪造、非防线」，真正防线=应用层限流/锁定/重放防护 + AOP
3. **更新防投毒**：签名私钥永不进服务器（CI 签名） / 客户端验签失败拒装 / 服务器保留前几版包可回滚

## 开工任务清单（按序执行）

- [ ] SignPath 开源签名申请（条件已核实满足；失败自动回退「不签名+下载页指引」，无需重拍）
- [x] Tauri 2 脚手架（Vue 3 + TS + 官方插件），`desktop/` 目录结构落地（824，见顶部最新条）
- [x] desktop-bridge 适配层首层（824：前端收口+逃生门+Rust 命令模块；F8 原生命令接入时扩充）
- [ ] 共享组件抽取方案（F3 约稿条 / F4 小票 / F12 完稿引导双端共享路径与构建接线定契约）
- [ ] 后端增量：桌面 token 类型 + 设备表（记账式会话）；登录留痕复用
- [ ] CF 规则调整：登录类接口免验证放行；身份标签仅分流
- [ ] 更新通道：Caddy 静态托管（只读）+ CI 签名流水线 + 旧版保留
- [x] 桌面端门禁体系（824 建齐）：`npm run lint` / `npm run test`（基线 6）/ `npm run build` / `cargo check`
- [ ] 双端回流三项（F9 快查卡 / F11 容量标识 / F12 完稿引导）与桌面端施工同批落地

## 待研判项（未拍板，仅索引）

- **第三方软件接入研判**：五路子代理调研已落档 → `docs/comms/画师软件生态与开放接口调研-20260824-待桌面端研判.md`（824，用户指令：交由桌面端研判是否接入）。要点速览：Eagle 本地 REST API（9.4 分）为素材管理集成首选、Ko-fi/爱发电为订单导入管道、CSP/Procreate/米画师/微信为死墙；Eagle/SD WebUI/ComfyUI/Blender 均为本地服务接口，与桌面端本地优先架构同构。**研判未启动前不构成任何施工依据。**


## 接手指引

- 接手桌面端工作：先读本文件顶部最新条 + REQ-014「2026-08-24 二轮功能研判拍板」章
- 拍板落档纪律：桌面端专属拍板 → 本文件；跨端/平台级拍板 → 主 `docs/comms/STATUS.md`
- 领地纪律：`desktop/` 与 `web/`、`server/` 并行施工时按文件划领地，共享组件先定契约后动手
- 门禁口径（824 建齐）：`cd desktop && npm run lint && npm run test && npm run build`，Rust 侧另跑 `cargo check`；首启验证=`npm run tauri dev`