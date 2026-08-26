// F8 二期自动识别监听（本地核心环波8）：前台窗口标题 + 键鼠输入空闲。
// REQ-014 §F8 口径：Windows 首发；只读探测，不干预任何窗口；数据仅存本地永不上传。
// 逃生门：非 Windows 平台返 Err（前端降级为纯手动计时）。
use tauri::AppHandle;

#[cfg(windows)]
mod win {
    use windows::Win32::System::SystemInformation::GetTickCount;
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW};

    /// 前台窗口标题；无前台窗口返空串（不报错——轮询方把空串当中立态）
    pub fn foreground_title() -> Result<String, String> {
        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.0.is_null() {
                return Ok(String::new());
            }
            let mut buf = [0u16; 512];
            let len = GetWindowTextW(hwnd, &mut buf);
            if len <= 0 {
                return Ok(String::new());
            }
            Ok(String::from_utf16_lossy(&buf[..len as usize]))
        }
    }

    /// 键鼠输入空闲秒数（GetLastInputInfo 与开机时基差值）
    pub fn input_idle_secs() -> Result<u32, String> {
        unsafe {
            let mut lii = LASTINPUTINFO {
                cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
                dwTime: 0,
            };
            if !GetLastInputInfo(&mut lii).as_bool() {
                return Err("GetLastInputInfo 失败".to_string());
            }
            let now = GetTickCount();
            Ok(now.saturating_sub(lii.dwTime) / 1000)
        }
    }
}

/// 前台窗口标题（F8 二期：在画/摸鱼分类的采样源）
#[tauri::command]
pub fn desktop_foreground_title(_app: AppHandle) -> Result<String, String> {
    #[cfg(windows)]
    {
        win::foreground_title()
    }
    #[cfg(not(windows))]
    {
        Err("自动识别仅支持 Windows（首发口径）".to_string())
    }
}

/// 键鼠输入空闲秒数（F8 二期：AFK 自动暂停判据，默认阈值由前端掌握）
#[tauri::command]
pub fn desktop_input_idle_secs(_app: AppHandle) -> Result<u32, String> {
    #[cfg(windows)]
    {
        win::input_idle_secs()
    }
    #[cfg(not(windows))]
    {
        Err("自动识别仅支持 Windows（首发口径）".to_string())
    }
}
