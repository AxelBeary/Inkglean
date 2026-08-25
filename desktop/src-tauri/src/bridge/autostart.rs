// 开机自启（R2-A 壳层批）：走 tauri-plugin-autostart——Windows 为注册表机制，
// macOS/Linux 按插件默认（LaunchAgent / 桌面自启条目）。静默到托盘为二期，本批只保证自启生效。
// 前端契约 = src/bridge/window.ts 的 desktop_autostart_set / desktop_autostart_get。
use tauri::AppHandle;
use tauri_plugin_autostart::ManagerExt;

/// 开机自启开关（菜单设置项写入）
#[tauri::command]
pub fn desktop_autostart_set(app: AppHandle, enabled: bool) -> Result<(), String> {
    let manager = app.autolaunch();
    if enabled {
        manager.enable().map_err(|e| e.to_string())
    } else {
        manager.disable().map_err(|e| e.to_string())
    }
}

/// 读开机自启当前状态（菜单回显用）
#[tauri::command]
pub fn desktop_autostart_get(app: AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}
