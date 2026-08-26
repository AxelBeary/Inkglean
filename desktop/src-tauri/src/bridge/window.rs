// 窗口所有权与撕悬浮（R2-A 壳层批）：系统标题栏退役（decorations:false）后，
// 最小化/最大化切换/关闭、撕悬浮三件的独立窗口投影均由本模块收口。
// 前端契约 = src/bridge/window.ts（方向 A 落码批冻结件），invoke 名与参数一一对应。
// 纪律：找不到窗口等场景返回 Result 静默语义，绝不 panic 拖垮壳；不碰保险箱/凭据。
use serde::Deserialize;
use std::sync::Mutex;
use tauri::{AppHandle, LogicalPosition, Manager, WebviewUrl, WebviewWindowBuilder};

/// 主窗口 label（tauri.conf.json app.windows 首项，capabilities 按此匹配）
const MAIN_WINDOW: &str = "main";

// ─── 关闭行为偏好（壳层商业化批） ───
// 前端菜单选「直接退出 / 最小化到托盘」后同步到本状态；
// 真正拦截在 lib.rs on_window_event（CloseRequested）里做——这样 Alt+F4 等
// 不经过自绘关闭按钮的关窗路径也一律命中，不留死角。

/// 关闭行为：退出 / 收进托盘（隐藏窗口，应用驻留）
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum CloseAction {
    Quit,
    ToTray,
}

/// Managed state（lib.rs .manage() 注册）；锁失败一律当 Quit 处理，绝不 panic。
pub struct CloseBehaviorState(pub Mutex<CloseAction>);

/// 前端同步关闭行为偏好（'quit' | 'tray'）；非法值归一为 quit。
#[tauri::command]
pub fn desktop_close_behavior_set(app: AppHandle, behavior: String) -> Result<(), String> {
    let action = if behavior == "tray" {
        CloseAction::ToTray
    } else {
        CloseAction::Quit
    };
    let state = app.state::<CloseBehaviorState>();
    // 中毒锁（理论不会发生）也静默降级，关窗偏好非关键路径
    if let Ok(mut guard) = state.0.lock() {
        *guard = action;
    }
    Ok(())
}

/// 撕悬浮三件白名单：非法 kind 反序列化即失败（防前端拼出未登记 label）
#[derive(Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FloatingKind {
    Timer,
    TodayTodo,
    Deadline,
}

impl FloatingKind {
    /// kind 字符串（含连字符），用于拼 label 与前端路由
    fn as_str(&self) -> &'static str {
        match self {
            FloatingKind::Timer => "timer",
            FloatingKind::TodayTodo => "today-todo",
            FloatingKind::Deadline => "deadline",
        }
    }

    /// label = `floating-{kind}`（kind 含连字符，直接拼）
    fn label(&self) -> String {
        format!("floating-{}", self.as_str())
    }

    /// 逻辑像素尺寸（拍板口径：计时器 280×200 / 今日待办 340×380 / 截稿倒计时 340×260）
    fn size(&self) -> (f64, f64) {
        match self {
            FloatingKind::Timer => (280.0, 200.0),
            FloatingKind::TodayTodo => (340.0, 380.0),
            FloatingKind::Deadline => (340.0, 260.0),
        }
    }
}

fn main_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    app.get_webview_window(MAIN_WINDOW)
        .ok_or_else(|| "主窗口不存在".to_string())
}

/// 主窗口最小化（自绘标题栏按钮）
#[tauri::command]
pub fn desktop_window_minimize(app: AppHandle) -> Result<(), String> {
    main_window(&app)?.minimize().map_err(|e| e.to_string())
}

/// 主窗口最大化/还原切换，返回切换后是否处于最大化（供按钮图标换态）
#[tauri::command]
pub fn desktop_window_toggle_maximize(app: AppHandle) -> Result<bool, String> {
    let win = main_window(&app)?;
    let maximized = win.is_maximized().map_err(|e| e.to_string())?;
    if maximized {
        win.unmaximize().map_err(|e| e.to_string())?;
    } else {
        win.maximize().map_err(|e| e.to_string())?;
    }
    Ok(!maximized)
}

/// 关闭主窗口（关闭行为偏好由前端壳层判断后决定调本命令与否）
#[tauri::command]
pub fn desktop_window_close(app: AppHandle) -> Result<(), String> {
    main_window(&app)?.close().map_err(|e| e.to_string())
}

/// 撕出悬浮窗：已存在且存活则聚焦/请求注意；残留旧句柄（贴回/被关后 label 注册表
/// 清理延迟）先销毁再新建，防「撕出的窗口再也回不来」（826 终验报障根治）。
/// 新建 = 置顶无框不可缩放。悬浮窗不参与 window-state 持久化（lib.rs deny list 同款三 label）。
#[tauri::command]
pub async fn desktop_floating_open(app: AppHandle, kind: FloatingKind) -> Result<(), String> {
    let label = kind.label();
    if let Some(win) = app.get_webview_window(&label) {
        if win.is_visible().unwrap_or(false) {
            win.set_focus().map_err(|e| e.to_string())?;
            // 请求注意：焦点抢不回来（如最小化中）时闪任务栏提醒，失败静默
            let _ = win.request_user_attention(None);
            return Ok(());
        }
        // 不可见的残留旧窗（关闭流程中/隐藏态）：销毁后重建，绕过 label 注册表延迟释放
        win.destroy().map_err(|e| e.to_string())?;
    }
    let (width, height) = kind.size();
    // url = index.html#/float/{kind}（前端路由由另一路提供，壳层只管建窗）
    let url = WebviewUrl::App(format!("index.html#/float/{}", kind.as_str()).into());
    // 首发落位：屏幕偏右上的逻辑坐标（无几何记忆，悬浮窗不持久化位置）
    let position = LogicalPosition::new(940.0, 160.0);
    let builder = WebviewWindowBuilder::new(&app, &label, url.clone())
        .inner_size(width, height)
        .position(position.x, position.y)
        .always_on_top(true)
        .decorations(false)
        .resizable(false)
        .visible(true);
    match builder.build() {
        Ok(_) => Ok(()),
        // label 撞车兑底：同 label 残留一律销毁重试一次（仍败才向上报错）
        Err(_) => {
            if let Some(stale) = app.get_webview_window(&label) {
                let _ = stale.destroy();
            }
            WebviewWindowBuilder::new(&app, &label, url)
                .inner_size(width, height)
                .position(position.x, position.y)
                .always_on_top(true)
                .decorations(false)
                .resizable(false)
                .visible(true)
                .build()
                .map(|_| ())
                .map_err(|e| e.to_string())
        }
    }
}

/// 贴回：关闭对应悬浮窗；不存在视为静默成功（不报错不 panic）。
/// close 后主动 destroy 兑底：确保 label 释放，下次撕出不撞车。
#[tauri::command]
pub async fn desktop_floating_close(app: AppHandle, kind: FloatingKind) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(&kind.label()) {
        if win.close().is_err() {
            let _ = win.destroy();
        }
    }
    Ok(())
}
