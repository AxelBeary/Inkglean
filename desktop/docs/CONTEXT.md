# 桌面端（拾绘桌面版）技术上下文速查

> 与主项目 `docs/CONTEXT.md` 分工：平台技术栈看主 CONTEXT；本文件只放桌面端特有技术口径。决策总书 = `docs/requirements/REQ-014-桌面端伴侣应用.md`；运营状态 = 本目录 `STATUS.md`。

## 技术栈（桌面端专属）

| 层 | 技术 | 备注 |
|----|------|------|
| 壳 | Tauri 2（Rust 壳 + 官方插件优先） | 自定义 Rust 收口 `src-tauri/src/bridge/`（**8 个 .rs**，`src/` 全量 11 个），覆盖面早已超出 F8：文件落盘/凭证保险箱/窗口与关闭行为/托盘 tooltip/模块目录/前台标题与输入空闲 |
| 前端 | Vue 3 + Vite + TS（与 web 同栈） | F3/F4/F12 双端共享组件 |
| 渲染 | Windows WebView2（Chromium 内核） | 与网页端渲染一致 |
| 本地存储 | SQLite（tauri-plugin-sql），路径 `app_data_dir/local.db` | 七张 `local_*` 表；`desktop_local_db_path` 顺带保障父目录存在（SQLite 不代建） |
| 文件 | tauri-plugin-dialog（系统选路径/保存）+ tauri-plugin-opener（`openPath` 调起 CSP/PS 等）+ 自定义文件桥（Rust `std::fs`：保存/存在校验/复制副本/读 b64） | **未装 tauri-plugin-fs / tauri-plugin-shell**，capabilities 里也无二者权限声明；落盘路径唯一来源＝系统对话框，Rust 侧只拒「..」段自卫 |
| 窗口 | Tauri 官方多窗口/置顶/无框窗 + `bridge/window.rs`（最小化/最大化/关闭拦截） | 支撑「可拆悬浮组件」与「专注画画模式」；另配 window-state 几何记忆、autostart 开机自启、single-instance 常驻 |
| 托盘/通知/快捷键 | tauri-plugin-notification / tauri-plugin-global-shortcut + 自绘托盘（`src-tauri/src/tray.rs`） | 托盘快照（tooltip 动态今日概要）/ 系统通知（留言待审 + 截稿提醒，按条目去重）/ 全局快捷键 Ctrl+Alt+S 唤隐主窗 |
| 更新 | tauri-plugin-updater：latest.json + NSIS 包 + Ed25519 验签 | 仅云端模式执行；服务器 Caddy 静态只读托管 |
| 代码签名 | SignPath（Authenticode，开源免费） | 前置条件=公开仓+AGPL+公开 CI（已达标） |
| 会话凭证 | 服务器记账式会话（后端设备表）+ 凭证存 Windows 系统保险箱 | 安全口径一（强制基线） |

## 关键路径与边界

- **数据分两处，别混**：应用本机数据 `app_data_dir/`（`local.db` / `img-cache/` / `secrets/`，随 Windows 用户隔离）；画师可见的 `我的文档\拾绘\`（`templates/` 母版 / `modules/` 插件 / `orders\客户名-档位名\` 建单副本 / 替换前自动备份包）。工程文件不搬迁、只记路径
- **双模式铁律**：本地模式零网络请求（含更新检查）；云端模式才走 API/更新；联网功能离线直接隐藏
- **API**：复用既有 REST API，不新增桌面端专用特权端点；布局偏好**只存本地**（localStorage 键 `shihui-desktop-prefs-v1`，不写 `dashboard_prefs`、不传服务端——8/25 亲定口径 γ，代码事实源 `desktop/src/stores/prefs.ts` 头注）
- **本地/云端零关联**：本地记账与平台订单不做任何关联/合并；仅本地数据可导出
- **F8 时间统计**：数据仅存本地、永不上传、不进 Sentry、云端模式不静默同步
- **更新签名两分**：SignPath 签名管 SmartScreen 误报；Ed25519 更新签名管包掉包——两回事都要
- **共享组件（已定契，824 拍板方案 A）**：仓库根 `shared/` 公共仓（包名 `@inkglean/shared`），web/desktop 以 `file:../shared` 链接直接导入源码；哑组件纪律（不发请求/不读存储，数据进 props 事件出 emit）；F3/F4 从 web 迁入走单独搬家批（见 `shared/README.md`）

## 能力已存在但本文原先缺席（只给指针，不复制细节）

以下八块均已在代码里，8/24 版的本文未登记；细节一律看各自事实源，避免双份漂移：

- **板块契约档①**：实为 **4 个板块**（today/ops/msgs/orders），定制收敛为显隐 + 装裱纸式 + 模块开关，**拖排已退役** → `desktop/src/panels/contract.ts`；拍板 `docs/comms/插件化研判-板块契约-20260825-已拍板.md`
- **档② 本地模块机制**：manifest 校验 → 注册表/目录扫描 → 管理页 → data: URL 沙箱帧 + 帧级 CSP → 桥协议（握手口令 + 心跳保险丝）→ 示例模块「稿情气象台」 → `desktop/src/modules/`、`desktop/src-tauri/src/bridge/modules.rs`；规范 `docs/comms/拾绘模块规范-v0.1-20260825-已拍板立项.md`
- **暗色主题**：`html[data-desktop-theme="dark"]` 作用域（值与 web 墨黑块同口径移植），偏好 auto/light/dark 进 prefs、墨笔菜单三档循环 → `desktop/src/styles/paper-ink.css`
- **工具箱六条目**：价目分享卡 / 小票打印机 / 我的档案 / 工程模板 / 数据导出与导入 / 模块管理 → `desktop/src/views/tools/`（路由 `/tools/*`）
- **排期域**：独立排期页 `/schedule` 三视图（**只读**，拖拽改期属波2）+ 卷心主位「今日要办 ⇄ 排期月历」+ 卷尾近 7 天摘要签 → 纯函数 `desktop/src/schedule/`、双模式 store `desktop/src/stores/schedule.ts`（本地零云端调用）
- **本地七张表**：`local_orders` / `local_files` / `local_profile` / `local_templates` / `local_img_cache` / `local_time_log` / `local_order_time` → 幂等建表在 `desktop/src/bridge/db.ts`
- **凭证保险箱**：Windows DPAPI（`CryptProtectData`）密文落 `app_data_dir/secrets/<key>.bin`，key 白名单防穿越 → `desktop/src-tauri/src/bridge/secure_store.rs`
- **首启引导与壳层偏好**：三步引导页（模式选择/桌面习惯/文件口径）+ 开机自启 + 关闭行为双选 → `desktop/src/views/OnboardingView.vue`、`desktop/src-tauri/src/bridge/{autostart,window}.rs`