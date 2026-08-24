# 桌面端（拾绘桌面版）技术上下文速查

> 与主项目 `docs/CONTEXT.md` 分工：平台技术栈看主 CONTEXT；本文件只放桌面端特有技术口径。决策总书 = `docs/requirements/REQ-014-桌面端伴侣应用.md`；运营状态 = 本目录 `STATUS.md`。

## 技术栈（桌面端专属）

| 层 | 技术 | 备注 |
|----|------|------|
| 壳 | Tauri 2（Rust 壳 + 官方插件优先） | 自定义 Rust 仅限 F8（窗口枚举 + 输入空闲检测），收口 desktop-bridge 逃生层 |
| 前端 | Vue 3 + Vite + TS（与 web 同栈） | F3/F4/F12 双端共享组件 |
| 渲染 | Windows WebView2（Chromium 内核） | 与网页端渲染一致 |
| 本地存储 | SQLite（tauri-plugin-sql），路径 `我的文档\拾绘\data.db` | 路径透明、不藏深层目录 |
| 文件 | tauri-plugin-fs / dialog / shell（调起 CSP/PS 等） | capabilities 沙箱声明放行目录（自选委托目录 + `我的文档\拾绘\`） |
| 窗口 | Tauri 官方多窗口/置顶/无框窗 | 支撑「可拆悬浮组件」与「专注画画模式」，无自定义 Rust |
| 托盘/通知/快捷键 | Tauri 官方插件 | 托盘快照 / 系统通知（含免打扰）/ 全局快捷键 |
| 更新 | tauri-plugin-updater：latest.json + NSIS 包 + Ed25519 验签 | 仅云端模式执行；服务器 Caddy 静态只读托管 |
| 代码签名 | SignPath（Authenticode，开源免费） | 前置条件=公开仓+AGPL+公开 CI（已达标） |
| 会话凭证 | 服务器记账式会话（后端设备表）+ 凭证存 Windows 系统保险箱 | 安全口径一（强制基线） |

## 关键路径与边界

- **数据**：`我的文档\拾绘\`（data.db / templates/ / 导出包）；工程文件不搬迁、只记路径
- **双模式铁律**：本地模式零网络请求（含更新检查）；云端模式才走 API/更新；联网功能离线直接隐藏
- **API**：复用既有 REST API，不新增桌面端专用特权端点；布局偏好复用 `dashboard_prefs`
- **本地/云端零关联**：本地记账与平台订单不做任何关联/合并；仅本地数据可导出
- **F8 时间统计**：数据仅存本地、永不上传、不进 Sentry、云端模式不静默同步
- **更新签名两分**：SignPath 签名管 SmartScreen 误报；Ed25519 更新签名管包掉包——两回事都要
- **共享组件（已定契，824 拍板方案 A）**：仓库根 `shared/` 公共仓（包名 `@inkglean/shared`），web/desktop 以 `file:../shared` 链接直接导入源码；哑组件纪律（不发请求/不读存储，数据进 props 事件出 emit）；F3/F4 从 web 迁入走单独搬家批（见 `shared/README.md`）