// 托盘常驻与壳层驻留行为（壳层商业化批）：
// REQ-014 首发拍板三件＝托盘常驻 / 系统通知 / 全局快捷键，本模块收口托盘与主窗口显隐。
// 托盘图标暂用 default_window_icon（脚手架默认图）；正式图标组落 tauri.conf.json
// bundle.icon 后此处自动跟随（单一事实源不变）。
// 纪律：一切窗口操作失败静默（托盘是常驻件，任何 panic 都会拖垮整个应用）。
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

/// 主窗口 label（与 bridge/window.rs 同口径；tauri.conf.json app.windows 首项）
const MAIN_WINDOW: &str = "main";

/// 显示并聚焦主窗口（托盘菜单/左键唤起/全局快捷键/单实例二次拉起共用收口）
pub fn show_main_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(MAIN_WINDOW) {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
}

/// 显隐切换：可见且聚焦 → 隐藏（收进托盘）；否则唤起聚焦。
/// 托盘左键与全局快捷键（Ctrl+Alt+S）行为一致。
pub fn toggle_main_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(MAIN_WINDOW) {
        let focused_visible =
            win.is_visible().unwrap_or(false) && win.is_focused().unwrap_or(false);
        if focused_visible {
            let _ = win.hide();
        } else {
            show_main_window(app);
        }
    }
}

/// 建托盘：右键菜单（显示拾绘 / 退出拾绘），左键显隐切换。
/// 「退出」走 app.exit(0)——「关闭到托盘」偏好生效时这是唯一真正的退出通道，
/// 绝不允许被 close-request 拦截逻辑绕回去。
pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "显示拾绘", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出拾绘", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;
    let mut builder = TrayIconBuilder::with_id("shihui-tray")
        .tooltip("拾绘桌面版")
        .menu(&menu)
        // Windows 主流托盘交互：左键＝唤隐切换、右键＝菜单（左键不弹菜单）
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            // 抬起时刻判定（防按住拖动误触）
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_main_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}
