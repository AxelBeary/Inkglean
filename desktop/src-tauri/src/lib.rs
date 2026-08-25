// 自定义命令统一收口于 bridge 模块（逃生门纪律，见 src/bridge/mod.rs）
mod bridge;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        // 窗口几何记忆：只记主窗口，撕悬浮三件进 deny list（壳层不替悬浮窗记几何）
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_denylist(&[
                    "floating-timer",
                    "floating-today-todo",
                    "floating-deadline",
                ])
                .build(),
        )
        // 开机自启：Windows 注册表 / macOS LaunchAgent / Linux 桌面自启，插件默认机制
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .invoke_handler(tauri::generate_handler![
            bridge::bridge_ping,
            bridge::secure_store::secure_save,
            bridge::secure_store::secure_load,
            bridge::secure_store::secure_delete,
            bridge::window::desktop_window_minimize,
            bridge::window::desktop_window_toggle_maximize,
            bridge::window::desktop_window_close,
            bridge::window::desktop_floating_open,
            bridge::window::desktop_floating_close,
            bridge::autostart::desktop_autostart_set,
            bridge::autostart::desktop_autostart_get
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
