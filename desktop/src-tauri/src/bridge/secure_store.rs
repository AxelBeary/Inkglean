// 凭证保险箱（825 波0 地基批）：REQ-014 安全口径一——登录凭证强制存 Windows 系统保险箱，不存明文文件。
// 实现走 DPAPI（CryptProtectData/CryptUnprotectData）：密文与当前 Windows 用户绑定，
// 同机同用户可解、换账户/拷硬盘不可解（边界诚实备注：同账户实时木马仍可偷，口径书已录）。
// 密文落 app_data_dir/secrets/<key>.bin；key 白名单校验防路径穿越。
use tauri::Manager;
use windows::core::PCWSTR;
use windows::Win32::Foundation::{LocalFree, HLOCAL};
use windows::Win32::Security::Cryptography::{
    CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB as DATA_BLOB,
};

fn secrets_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("secrets");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// key 白名单：仅字母数字与 -_，长度 1~64，防路径穿越与怪文件名
fn check_key(key: &str) -> Result<(), String> {
    let ok = !key.is_empty()
        && key.len() <= 64
        && key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
    if ok {
        Ok(())
    } else {
        Err("非法的凭证键名".into())
    }
}

fn dpapi_protect(data: &[u8]) -> Result<Vec<u8>, String> {
    unsafe {
        let in_blob = DATA_BLOB {
            cbData: data.len() as u32,
            pbData: data.as_ptr() as *mut u8,
        };
        let mut out_blob = DATA_BLOB::default();
        CryptProtectData(
            &in_blob,
            PCWSTR::null(),
            None,
            None,
            None,
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut out_blob,
        )
        .map_err(|e| format!("加密失败: {e}"))?;
        let out = std::slice::from_raw_parts(out_blob.pbData, out_blob.cbData as usize).to_vec();
        let _ = LocalFree(HLOCAL(out_blob.pbData as *mut std::ffi::c_void));
        Ok(out)
    }
}

fn dpapi_unprotect(data: &[u8]) -> Result<Vec<u8>, String> {
    unsafe {
        let in_blob = DATA_BLOB {
            cbData: data.len() as u32,
            pbData: data.as_ptr() as *mut u8,
        };
        let mut out_blob = DATA_BLOB::default();
        CryptUnprotectData(
            &in_blob,
            None,
            None,
            None,
            None,
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut out_blob,
        )
        .map_err(|e| format!("解密失败: {e}"))?;
        let out = std::slice::from_raw_parts(out_blob.pbData, out_blob.cbData as usize).to_vec();
        let _ = LocalFree(HLOCAL(out_blob.pbData as *mut std::ffi::c_void));
        Ok(out)
    }
}

/// 加密存入保险箱（覆盖同 key 旧值）
#[tauri::command]
pub fn secure_save(app: tauri::AppHandle, key: String, value: String) -> Result<(), String> {
    check_key(&key)?;
    let path = secrets_dir(&app)?.join(format!("{key}.bin"));
    let encrypted = dpapi_protect(value.as_bytes())?;
    std::fs::write(path, encrypted).map_err(|e| e.to_string())
}

/// 读取并解密；不存在返回 None，密文损坏视为无值（重新登录即可）
#[tauri::command]
pub fn secure_load(app: tauri::AppHandle, key: String) -> Result<Option<String>, String> {
    check_key(&key)?;
    let path = secrets_dir(&app)?.join(format!("{key}.bin"));
    let encrypted = match std::fs::read(&path) {
        Ok(v) => v,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.to_string()),
    };
    match dpapi_unprotect(&encrypted)
        .ok()
        .and_then(|v| String::from_utf8(v).ok())
    {
        Some(s) => Ok(Some(s)),
        None => Ok(None),
    }
}

/// 删除（登出/换号用）；不存在视为成功
#[tauri::command]
pub fn secure_delete(app: tauri::AppHandle, key: String) -> Result<(), String> {
    check_key(&key)?;
    let path = secrets_dir(&app)?.join(format!("{key}.bin"));
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
