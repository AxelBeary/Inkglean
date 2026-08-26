// 本地数据层桥（本地核心环波1）：F2 本地记账等「仅存本机」数据的 SQLite 底座。
// 纪律：数据库文件落在 app_data_dir（随系统用户隔离）；建表/查询一律由前端经
// tauri-plugin-sql 执行，本模块只给路径与目录保障（逃生门同口径：找不到目录返回 Err）。
use std::fs;
use tauri::{AppHandle, Manager};

/// 本地数据库绝对路径（前端交 @tauri-apps/plugin-sql 的 Database.load 打开）。
/// 顺带确保 app_data_dir 存在（首启目录可能尚未建，SQLite 不代建父目录）。
#[tauri::command]
pub fn desktop_local_db_path(app: AppHandle) -> Result<String, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("local.db").to_string_lossy().to_string())
}
