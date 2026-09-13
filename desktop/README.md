# 拾绘桌面版（`desktop/`）

Tauri 2 + Vue 3 的画师桌面端：本地记账 / 排期可视化 / 悬浮小窗与云端约稿管理的本机壳，与 `web/`、`server/` 同仓并行开发。

- 开发：`npm install` → `npm run tauri dev`（需 Rust stable 工具链；纯前端改动可只跑 `npm run dev`）
- 门禁：`npm run lint` / `npm run test` / `npm run build`；Rust 侧另跑 `cd src-tauri && cargo check`
- 状态与拍板事实源：[docs/STATUS.md](docs/STATUS.md)（先读顶部最新条）· 技术口径速查：[docs/CONTEXT.md](docs/CONTEXT.md)
- 需求决策总书：[../docs/requirements/REQ-014-桌面端伴侣应用.md](../docs/requirements/REQ-014-桌面端伴侣应用.md) · 发布前待办：[docs/发布前待办清单-825.md](docs/发布前待办清单-825.md)
