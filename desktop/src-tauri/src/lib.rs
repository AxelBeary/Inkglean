// 自定义命令统一收口于 bridge 模块（逃生门纪律，见 src/bridge/mod.rs）
mod bridge;
// 托盘常驻与主窗口唤隐（壳层商业化批）
mod tray;

use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};

use bridge::window::{CloseAction, CloseBehaviorState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 全局快捷键（REQ-014 首发）：Ctrl+Alt+S 唤隐主窗口（拾绘＝S；口径登记于 STATUS，可改）
    let toggle_shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyS);

    tauri::Builder::default()
        // 单实例常驻：二次拉起不开新窗，只唤起既有主窗口（商业化桌面应用标配）
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            tray::show_main_window(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        // 系统通知（REQ-014 首发）：留言待审等场景，前端经 bridge/notification.ts 逃生门调用
        .plugin(tauri_plugin_notification::init())
        // 本地数据层（本地核心环波1）：SQLite，建表/查询由前端经 @tauri-apps/plugin-sql 执行
        .plugin(tauri_plugin_sql::Builder::default().build())
        // 全局快捷键：注册在 Rust 侧，不经 IPC，无需 capabilities 放行
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcuts([toggle_shortcut])
                .expect("全局快捷键登记失败")
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        tray::toggle_main_window(app);
                    }
                })
                .build(),
        )
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
        // 关闭行为偏好：默认直接退出，前端启动即按本地偏好同步（App.vue）
        .manage(CloseBehaviorState(Mutex::new(CloseAction::Quit)))
        .setup(|app| {
            // 托盘常驻：启动即建，图标随 bundle.icon 单一事实源
            tray::setup_tray(app.handle())?;
            Ok(())
        })
        // 关闭到托盘拦截：主窗口关窗请求时按偏好改「隐藏驻留」；
        // 覆盖自绘关闭按钮/标题栏右键/Alt+F4 全部路径（悬浮三件不在此列，照常销毁）
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    let app = window.app_handle();
                    if let Some(state) = app.try_state::<CloseBehaviorState>() {
                        let to_tray = state
                            .0
                            .lock()
                            .map(|g| *g == CloseAction::ToTray)
                            .unwrap_or(false);
                        if to_tray {
                            api.prevent_close();
                            let _ = window.hide();
                        }
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            bridge::bridge_ping,
            bridge::secure_store::secure_save,
            bridge::secure_store::secure_load,
            bridge::secure_store::secure_delete,
            bridge::window::desktop_window_minimize,
            bridge::window::desktop_window_toggle_maximize,
            bridge::window::desktop_window_close,
            bridge::window::desktop_close_behavior_set,
            bridge::window::desktop_floating_open,
            bridge::window::desktop_floating_close,
            bridge::autostart::desktop_autostart_set,
            bridge::autostart::desktop_autostart_get,
            bridge::db::desktop_local_db_path,
            bridge::files::desktop_save_file,
            bridge::files::desktop_check_files,
            bridge::files::desktop_file_sizes,
            bridge::files::desktop_read_file_b64,
            bridge::files::desktop_read_backup_b64,
            bridge::files::desktop_delete_cache_file,
            bridge::files::desktop_shihui_home,
            bridge::files::desktop_cache_dir,
            bridge::files::desktop_copy_file,
            bridge::monitor::desktop_foreground_title,
            bridge::monitor::desktop_input_idle_secs,
            crate::tray::desktop_tray_set_tooltip
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
