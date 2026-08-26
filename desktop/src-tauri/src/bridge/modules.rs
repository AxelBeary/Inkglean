// 模块机制桥（档②波17 二件）：模块目录扫描与文件读取。
// 模块 = 本机透明文件（我的文档\拾绘\modules\<id>\）；运行期不热更，扫描由壳触发（规范 §3.7）。
// 自卫口径：目录名白名单字符校验（防路径穿越）、只读不写、限长防滥用、失败返错不恐慌。
use std::fs;
use tauri::{AppHandle, Manager};

/// 模块根目录（我的文档\拾绘\modules，顺带建目录）
fn modules_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let docs = app.path().document_dir().map_err(|e| e.to_string())?;
    let dir = docs.join("拾绘").join("modules");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// 目录名合法性：字母/数字/连字符/下划线/中文，1~64 字符；拒「.」开头与一切特殊字符（防穿越）
fn is_safe_dir_name(name: &str) -> bool {
    let n = name.chars().count();
    if n == 0 || n > 64 || name.starts_with('.') {
        return false;
    }
    name.chars().all(|c| {
        c.is_ascii_alphanumeric() || c == '-' || c == '_' || ('\u{4e00}'..='\u{9fff}').contains(&c)
    })
}

/// 列出模块目录名（只列合法目录名；非法名静默跳过）
#[tauri::command]
pub fn desktop_list_module_dirs(app: AppHandle) -> Result<Vec<String>, String> {
    let dir = modules_dir(&app)?;
    let mut out = Vec::new();
    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        if !entry.path().is_dir() {
            continue;
        }
        if let Some(name) = entry.file_name().to_str() {
            if is_safe_dir_name(name) {
                out.push(name.to_string());
            }
        }
    }
    out.sort();
    Ok(out)
}

/// 读模块 manifest.json 原文（校验归前端 parseManifest；读不到给原因）
#[tauri::command]
pub fn desktop_read_module_manifest(app: AppHandle, dir_name: String) -> Result<String, String> {
    if !is_safe_dir_name(&dir_name) {
        return Err("模块目录名非法".to_string());
    }
    let manifest = modules_dir(&app)?.join(&dir_name).join("manifest.json");
    if !manifest.is_file() {
        return Err("缺少 manifest.json".to_string());
    }
    // 限长读取：超大 manifest 视为非法（防资源滥用；正常声明远小于此）
    const MAX_MANIFEST_BYTES: u64 = 64 * 1024;
    let meta = fs::metadata(&manifest).map_err(|e| e.to_string())?;
    if meta.len() > MAX_MANIFEST_BYTES {
        return Err("manifest 超过 64KB 上限".to_string());
    }
    fs::read_to_string(&manifest).map_err(|e| e.to_string())
}

/// 读模块入口文件原文（entry 已钉死 panel.js；校验归前端；限长防滥用）
#[tauri::command]
pub fn desktop_read_module_entry(app: AppHandle, dir_name: String) -> Result<String, String> {
    if !is_safe_dir_name(&dir_name) {
        return Err("模块目录名非法".to_string());
    }
    let entry = modules_dir(&app)?.join(&dir_name).join("panel.js");
    if !entry.is_file() {
        return Err("缺少 panel.js".to_string());
    }
    const MAX_ENTRY_BYTES: u64 = 512 * 1024;
    let meta = fs::metadata(&entry).map_err(|e| e.to_string())?;
    if meta.len() > MAX_ENTRY_BYTES {
        return Err("panel.js 超过 512KB 上限".to_string());
    }
    fs::read_to_string(&entry).map_err(|e| e.to_string())
}

/// 模块私有存储路径（write.own：独立文件、不入 data.db；配额校验归前端注册表）
#[tauri::command]
pub fn desktop_module_storage_path(app: AppHandle, dir_name: String) -> Result<String, String> {
    if !is_safe_dir_name(&dir_name) {
        return Err("模块目录名非法".to_string());
    }
    let dir = modules_dir(&app)?.join(&dir_name);
    // 只给路径不建文件；写由前端经桥申请并核配额（拍板二 5MB/模块）
    Ok(dir.join("storage.json").to_string_lossy().to_string())
}

// ─── 示例模块「稿情气象台」（波17 五件）：随壳内嵌，一键装进 modules 目录 ───
// 模块即本机透明文件（AI 可照样板直写）；示例随包内嵌免分发，装了即是活样板。
const SAMPLE_MODULE_ID: &str = "mood-weather";
const SAMPLE_MANIFEST: &str = include_str!("../../sample-module/mood-weather/manifest.json");
const SAMPLE_ENTRY: &str = include_str!("../../sample-module/mood-weather/panel.js");

/// 一键安装示例模块：写入 modules/mood-weather/；已存在不覆盖（防覆盖画师改过的版本）
#[tauri::command]
pub fn desktop_install_sample_module(app: AppHandle) -> Result<(), String> {
    let dir = modules_dir(&app)?.join(SAMPLE_MODULE_ID);
    if dir.exists() {
        return Err("示例模块已存在（不覆盖；重装请先删文件夹）".to_string());
    }
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(dir.join("manifest.json"), SAMPLE_MANIFEST).map_err(|e| e.to_string())?;
    fs::write(dir.join("panel.js"), SAMPLE_ENTRY).map_err(|e| e.to_string())?;
    Ok(())
}
