// 凭证保险箱（825 波0 地基批）：REQ-014 安全口径一——登录凭证强制存 Windows 系统保险箱，不存明文文件。
// 实现走 DPAPI（CryptProtectData/CryptUnprotectData）：密文与当前 Windows 用户绑定，
// 同机同用户可解、换账户/拷硬盘不可解（边界诚实备注：同账户实时木马仍可偷，口径书已录）。
// 密文落 app_data_dir/secrets/<key>.bin；key 白名单校验防路径穿越。
//
// GHSA-6pf3-g4xq-854w Claim6 收敛（secure_load 吐出的是解密后的登录 token 明文）：
//  1) ACL 面（build.rs + permissions/secure-store.toml + capabilities）：读=主窗+撕悬浮三件，
//     存/删=仅主窗。此前自有命令不进 ACL，悬浮窗（同一份前端 bundle）可无条件读 token。
//  2) key 面（本文件）：字符集校验之外再加**键名白名单**——只认应用自有的三把键，
//     非白名单 key 一律拒（旧口径只限字符集，等于允许拿任意 key 去试解 secrets/ 下的文件）。
//  3) 窗口面（本文件）：非主窗只许读会话两把键（session-token / session-artist），
//     device-uuid 与其余键对投影窗不可读。为什么不一刀切「读也只给主窗」：
//     `src/router/index.ts` 守卫在每个窗都跑 `auth.restore()`（→ secure_load），
//     云端态下截稿/待办悬浮卡还要拿 token 重新 fetch；不授会把悬浮窗踹回登录页（已验收行为退化）。
//     真要做到「凭据命令物理仅主窗」，需要把会话态改成壳侧下发（改 src/router、src/stores/auth），
//     非本席领地——见 S5 交回台账「卡点」。
use tauri::{Manager, WebviewWindow};
use windows::core::PCWSTR;
use windows::Win32::Foundation::{LocalFree, HLOCAL};
use windows::Win32::Security::Cryptography::{
    CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB as DATA_BLOB,
};

/// 主窗口 label（与 capabilities/default.json 的 windows 项、bridge/window.rs MAIN_WINDOW 同源）
const MAIN_WINDOW: &str = "main";

/// 应用自有凭证键（事实源＝desktop/src/stores/auth.ts 的 KEY_TOKEN / KEY_ARTIST / KEY_DEVICE）
const KEY_SESSION_TOKEN: &str = "session-token";
const KEY_SESSION_ARTIST: &str = "session-artist";
const KEY_DEVICE_UUID: &str = "device-uuid";

/// 写/删白名单：登录与登出只会用到这三把键
pub(crate) const WRITABLE_KEYS: &[&str] = &[KEY_SESSION_TOKEN, KEY_SESSION_ARTIST, KEY_DEVICE_UUID];

/// 读白名单·主窗：与写/删同集合
pub(crate) const READABLE_KEYS_MAIN: &[&str] = WRITABLE_KEYS;

/// 读白名单·非主窗（撕悬浮三件）：只放开会话恢复需要的两把，账本设备标识不外泄给投影窗
pub(crate) const READABLE_KEYS_OTHER: &[&str] = &[KEY_SESSION_TOKEN, KEY_SESSION_ARTIST];

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

/// 写/删的键名闸：先字符集，再白名单（Claim6：非白名单 key 拒，杜绝任意 key 试解/落盘）
pub(crate) fn check_writable_key(key: &str) -> Result<(), String> {
    check_key(key)?;
    if WRITABLE_KEYS.contains(&key) {
        Ok(())
    } else {
        Err("凭证键名不在白名单".into())
    }
}

/// 读的键名闸：按调用窗口的 label 取不同白名单（非主窗只许读会话两把键）
pub(crate) fn check_readable_key(window_label: &str, key: &str) -> Result<(), String> {
    check_key(key)?;
    let allowed = if window_label == MAIN_WINDOW {
        READABLE_KEYS_MAIN
    } else {
        READABLE_KEYS_OTHER
    };
    if allowed.contains(&key) {
        Ok(())
    } else {
        Err("凭证键名不在白名单".into())
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
    check_writable_key(&key)?;
    let path = secrets_dir(&app)?.join(format!("{key}.bin"));
    let encrypted = dpapi_protect(value.as_bytes())?;
    std::fs::write(path, encrypted).map_err(|e| e.to_string())
}

/// 读取并解密；不存在返回 None，密文损坏视为无值（重新登录即可）
/// Claim6：入参 window 用于取调用窗 label——非主窗只许读会话两把键（见 check_readable_key）
#[tauri::command]
pub fn secure_load(
    app: tauri::AppHandle,
    window: WebviewWindow,
    key: String,
) -> Result<Option<String>, String> {
    check_readable_key(window.label(), &key)?;
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
    check_writable_key(&key)?;
    let path = secrets_dir(&app)?.join(format!("{key}.bin"));
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 非白名单 key 一律拒（旧口径只查字符集，等于允许拿任意 key 去试解 secrets/ 下的文件）
    #[test]
    fn load_rejects_keys_outside_whitelist() {
        let err = check_readable_key(MAIN_WINDOW, "session-other")
            .expect_err("白名单外键名应拒（主窗也一样）");
        assert!(err.contains("白名单"), "实际: {err}");
        // 攻击性构造：字符集合法但语义是「别的落点」
        assert!(check_readable_key(MAIN_WINDOW, "local-db").is_err());
        assert!(check_readable_key(MAIN_WINDOW, "").is_err());
    }

    /// 主窗可读自家三把键
    #[test]
    fn main_window_reads_all_three_keys() {
        for key in READABLE_KEYS_MAIN {
            check_readable_key(MAIN_WINDOW, key)
                .unwrap_or_else(|e| panic!("主窗应能读 {key}：{e}"));
        }
    }

    /// 撕悬浮投影窗只许读会话两把键，device-uuid 不外泄
    #[test]
    fn floating_window_reads_session_keys_only() {
        for key in READABLE_KEYS_OTHER {
            check_readable_key("floating-deadline", key)
                .unwrap_or_else(|e| panic!("悬浮窗应能读 {key}：{e}"));
        }
        let err = check_readable_key("floating-timer", KEY_DEVICE_UUID)
            .expect_err("投影窗不应读到设备标识");
        assert!(err.contains("白名单"), "实际: {err}");
        assert!(check_readable_key("floating-today-todo", "session-other").is_err());
    }

    /// 写/删同样吃白名单（防把保险箱当任意文件存放点、防任意 key 落盘）
    #[test]
    fn write_rejects_keys_outside_whitelist() {
        for key in WRITABLE_KEYS {
            check_writable_key(key).unwrap_or_else(|e| panic!("应可写 {key}：{e}"));
        }
        assert!(check_writable_key("startup-payload").is_err());
        // 字符集闸仍在前：路径穿越类 key 名先被字符集拒
        let err = check_writable_key("../local").expect_err("穿越 key 名应拒");
        assert!(err.contains("非法的凭证键名"), "实际: {err}");
    }

    /// 双轨一致性（同款「DDL 双轨」思路）：白名单必须与前端 auth store 的键名同源。
    /// 前端新增第 4 把键而本文件没跟上时，本用例标红——否则线上表现是「登录后重开认不出来」。
    #[test]
    fn whitelist_matches_frontend_auth_store_keys() {
        let auth_ts = include_str!("../../../src/stores/auth.ts");
        let mut found = 0usize;
        for line in auth_ts.lines() {
            let line = line.trim();
            let Some(rest) = line.strip_prefix("const KEY_") else { continue };
            // 取 `const KEY_XXX = 'yyy'` 等号后单引号里的字面量
            let Some((_, after_eq)) = rest.split_once('=') else { continue };
            let literal = after_eq.trim().trim_start_matches(':').trim();
            let Some(body) = literal.strip_prefix('\'').and_then(|s| s.split('\'').next()) else {
                continue;
            };
            found += 1;
            assert!(
                WRITABLE_KEYS.contains(&body),
                "前端 auth.ts 出现白名单外凭证键 {body}：要么并入 WRITABLE_KEYS，要么别走保险箱"
            );
        }
        assert_eq!(found, 3, "auth.ts 的 KEY_* 常量应为 3 把（token/artist/device），实取 {found}");
    }
}

