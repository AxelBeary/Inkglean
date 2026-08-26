// desktop-bridge 原生命令收口模块：所有自定义 Rust 命令集中在此注册，
// 前端一律经 src/bridge/index.ts 调用，禁止散落各处。
// 后续增量：F8 窗口枚举 + 输入空闲检测（自定义 Rust，仅此处允许）。
pub mod autostart;
pub mod db;
pub mod secure_store;
pub mod window;

/// 前后端通路健康检查：返回应用版本号
#[tauri::command]
pub fn bridge_ping() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
