// 文件保存桥（工具箱波2）：导出物（价目卡/小票 PNG）落盘。
// 路径由前端经系统保存对话框（tauri-plugin-dialog）取得；本命令做最低自卫：
// 拒绝含「..」段的路径（防目录穿越拼出对话框之外的落点），其余信任系统对话框口径。
use base64::{engine::general_purpose::STANDARD, Engine};
use std::fs;
use std::path::Path;
use tauri::{AppHandle, Manager};

#[tauri::command]
pub fn desktop_save_file(path: String, data_b64: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.components().any(|c| c.as_os_str() == "..") {
        return Err("路径含非法段".to_string());
    }
    if let Some(parent) = p.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    let bytes = STANDARD.decode(data_b64.as_bytes()).map_err(|e| e.to_string())?;
    fs::write(p, bytes).map_err(|e| e.to_string())
}

/// 批量校验文件是否存在（F1 丢失提醒）：入参顺序与返回一致；
/// 只读存在性检查，不碰文件本体（「文件保持原样在磁盘」口径）。
#[tauri::command]
pub fn desktop_check_files(paths: Vec<String>) -> Vec<bool> {
    paths.iter().map(|p| Path::new(p).exists()).collect()
}

/// 读文件转 base64（F6 头像自含存储）：限 5MB，超限拒绝（防大文件炸内存）。
const READ_LIMIT: u64 = 5 * 1024 * 1024;

#[tauri::command]
pub fn desktop_read_file_b64(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    let meta = fs::metadata(p).map_err(|e| e.to_string())?;
    if meta.len() > READ_LIMIT {
        return Err("文件超过 5MB 上限".to_string());
    }
    let bytes = fs::read(p).map_err(|e| e.to_string())?;
    Ok(STANDARD.encode(bytes))
}

/// 拾绘数据根目录（我的文档\拾绘）：F1a 模板母版存 templates/，委托文件夹根 orders/。
/// 顺带建目录（首启可能不存在）。
#[tauri::command]
pub fn desktop_shihui_home(app: AppHandle) -> Result<String, String> {
    let docs = app.path().document_dir().map_err(|e| e.to_string())?;
    let home = docs.join("拾绘");
    fs::create_dir_all(&home).map_err(|e| e.to_string())?;
    Ok(home.to_string_lossy().to_string())
}

/// 复制文件（F1a 母版→复印件）：只复制不搬迁，源文件（母版）永不被改动；
/// 目标存在则覆盖（模板更换口径：已建订单不受影响，因为各自持有自己的副本）。
#[tauri::command]
pub fn desktop_copy_file(src: String, dst: String) -> Result<(), String> {
    let d = Path::new(&dst);
    if d.components().any(|c| c.as_os_str() == "..") {
        return Err("路径含非法段".to_string());
    }
    if let Some(parent) = d.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    fs::copy(&src, d).map(|_| ()).map_err(|e| e.to_string())
}
