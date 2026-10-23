// 文件保存桥（工具箱波2）：导出物（价目卡/小票 PNG）落盘 + 读回。
//
// GHSA-6pf3-g4xq-854w Claim6 收紧（本文件口径变了，注释即事实源）：
// 旧口径＝路径全部由前端经系统对话框取得，本命令只做「不含 .. 段」的最低自卫，其余全信；
// 叠上当时应用自有命令**不进 ACL**（Tauri 2 对 generate_handler! 命令默认对所有窗放行），
// 结果任意能 invoke 到它的上下文（撕悬浮窗、注入内容、模块面板）都能读 `%USERPROFILE%\.ssh\*`、
// 往启动目录写文件做持久化——这就是审计定性的「文件命令任意路径读写」。
//
// 新口径＝两道各自独立的防线：
//  1) ACL：build.rs 的 AppManifest::commands + permissions/ + capabilities → 文件命令只授主窗；
//  2) 本文件的白名单根 containment：入参先规范成**真实路径**（dunce::canonicalize 顺带解掉
//     符号链接 / junction / 8.3 短名这三条绕过路），再要求落在白名单根内；文件尚不存在
//     （写新件、建新目录）时取「最近的已存在祖先」规范化后把剩余段接回。越界一律拒并给人话原因。
//
// 白名单根（每次调用现取，天然随 Windows 用户隔离）：
//   - app_data_dir                    ：local.db、img-cache、自动备份包（导入/导出/备份的自家落点）
//   - 我的文档\拾绘                    ：与 desktop_shihui_home 同源（模板母版、委托文件夹）
//   - 我的文档 / 下载 / 桌面 / 图片 / 音频 / 视频：系统「保存/打开」对话框的默认落点，
//     即 REQ-014「用户显式选择路径」的现实口径（价目卡、小票、CSV 导出、头像导入、备份包导入）。
// 白名单**不含**：系统目录（%WINDIR%、Program Files）、本应用之外的用户配置区（%APPDATA% 其余部分，
// 含启动目录这个持久化点）、其他用户目录、非个人数据卷（如 D:\）。
//
// ⚠️ 已知取舍（S5 写下的，S5B 改了一半，别当没发生）：
// S5B（GHSA 后续）新增两个 **dialog 跑在壳侧** 的命令 desktop_export_save_b64 / desktop_import_read_b64：
// 用户主动「导出/导入到自选目录」改走它们——原生「另存为/打开」对话框由 Rust 侧调起
// （tauri-plugin-dialog 的 Rust API），落点路径由壳侧从对话框结果取得、**不经渲染层传入**，
// 渲染层被攻破也无法伪造「用户已选」，故 Claim6 边界不破（对话结果即用户授权，无需再过白名单根）。
// 仍受白名单根约束的是下面的 path-命令（程序化内部写：自动备份/图缓存/local.db 覆写等）；
// F1「关联文件」指向非个人目录时 desktop_check_files 仍按「丢失」显示——放开它需要会话级根登记，
// 超出本批改口，调用点在 stores/panels（见 S5B 交回台账「遗留」）。
use base64::{engine::general_purpose::STANDARD, Engine};
use std::fs;
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Manager, Window};
use tauri_plugin_dialog::{DialogExt, FilePath};

/// 拒因（前端 toast 直出，故一律写人话；与既有「路径含非法段」文案保持同族）
const ERR_TRAVERSAL: &str = "路径含非法段";
const ERR_ABSOLUTE: &str = "路径必须是绝对路径";
const ERR_VERBATIM: &str = "路径含非法前缀";
fn err_out_of_root() -> String {
    "路径超出应用允许目录".to_string()
}

/// 白名单根（canonicalize 后的真实路径）。解析不出或不存在的根直接跳过＝不授该根，不 panic。
/// 每次调用现取：不缓存，省掉「用户中途改了 OneDrive/文档重定向」的陈旧口径问题。
pub(crate) fn allowed_roots(app: &AppHandle) -> Vec<PathBuf> {
    let resolver = app.path();
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(dir) = resolver.app_data_dir() {
        candidates.push(dir);
    }
    if let Ok(docs) = resolver.document_dir() {
        candidates.push(docs.join("拾绘"));
        candidates.push(docs);
    }
    if let Ok(dir) = resolver.download_dir() {
        candidates.push(dir);
    }
    if let Ok(dir) = resolver.desktop_dir() {
        candidates.push(dir);
    }
    if let Ok(dir) = resolver.picture_dir() {
        candidates.push(dir);
    }
    if let Ok(dir) = resolver.audio_dir() {
        candidates.push(dir);
    }
    if let Ok(dir) = resolver.video_dir() {
        candidates.push(dir);
    }

    let mut out: Vec<PathBuf> = Vec::new();
    for candidate in candidates {
        if let Some(real) = canonicalize_existing(&candidate) {
            if !out.contains(&real) {
                out.push(real);
            }
        }
    }
    out
}

/// 取真实路径：目标存在直接 canonicalize；不存在（写新件/建新目录）时从最近的**已存在祖先**
/// 规范化，再把缺失段接回。全部祖先都规范化不了（盘符不在等）返回 None——调用侧按越界拒。
fn canonicalize_existing(path: &Path) -> Option<PathBuf> {
    if let Ok(canonical) = dunce::canonicalize(path) {
        return Some(canonical);
    }
    let comps: Vec<Component<'_>> = path.components().collect();
    for cut in (0..comps.len()).rev() {
        let mut prefix = PathBuf::new();
        for comp in &comps[..=cut] {
            prefix.push(comp.as_os_str());
        }
        if let Ok(real) = dunce::canonicalize(&prefix) {
            let mut full = real;
            for comp in &comps[cut + 1..] {
                full.push(comp.as_os_str());
            }
            return Some(full);
        }
    }
    None
}

/// verbatim / device 命名空间（`\\?\C:\…`、`\\.\PhysicalDrive0`、`\\?\UNC\…`）：这类写法
/// 跳过 Win32 的路径规范化，是短名/符号链接之外的第三条绕过路，一律拒。
/// UNC（`\\server\share`）不在此列：它落在白名单根之外，containment 同样会拒，不必额外发明口径。
fn is_verbatim_or_device(raw: &str) -> bool {
    let unified = raw.replace('/', "\\");
    unified.starts_with("\\\\?\\") || unified.starts_with("\\\\.\\")
}

/// 核心闸：规范成真实路径并校验落在 roots 内。越界/非法 → Err(拒因)。
/// 纯函数（roots 由调用侧给）：单测不必起壳，见本文件底部 tests。
pub(crate) fn resolve_within_roots(raw: &str, roots: &[PathBuf]) -> Result<PathBuf, String> {
    if raw.trim().is_empty() {
        return Err(ERR_ABSOLUTE.to_string());
    }
    let path = Path::new(raw);
    // 与既有 desktop_save_file/desktop_copy_file 同款口径：任何位置的 `..` 段都拒。
    // 注意这是「口径」而不是「绕过手段」——真正的绕过防线是下面的 canonicalize 比对。
    if path.components().any(|c| c.as_os_str() == "..") {
        return Err(ERR_TRAVERSAL.to_string());
    }
    if is_verbatim_or_device(raw) {
        return Err(ERR_VERBATIM.to_string());
    }
    if !path.is_absolute() {
        return Err(ERR_ABSOLUTE.to_string());
    }
    let canonical = canonicalize_existing(path).ok_or_else(err_out_of_root)?;
    // 比对前两侧都过 dunce::simplified：根可能是 `C:\…` 形态而目标是 `\\?\C:\…` 形态
    // （超长路径 >260 时 std 保留 verbatim 前缀），前缀形态不一致会让 starts_with 假否，
    // 把合法深路径误判成越界。**返回值仍是 canonical**（fs 操作照它走，不丢长路径能力）。
    let comparable = dunce::simplified(&canonical);
    if roots
        .iter()
        .any(|root| comparable.starts_with(dunce::simplified(root)))
    {
        Ok(canonical)
    } else {
        Err(err_out_of_root())
    }
}

/// 命令侧封装：白名单根现取 + 校验。
fn guard(app: &AppHandle, raw: &str) -> Result<PathBuf, String> {
    resolve_within_roots(raw, &allowed_roots(app))
}

/// 限定在某个具体目录内（比白名单根更窄的组件级前缀，沿用 desktop_delete_cache_file 范式）：
/// 两侧都先规范化，防用符号链接把「在 img-cache 里」的前缀比较骗过去。
fn resolve_within_dir(raw: &str, dir: &Path) -> Result<PathBuf, String> {
    let roots = match canonicalize_existing(dir) {
        Some(real) => vec![real],
        None => return Err(err_out_of_root()),
    };
    resolve_within_roots(raw, &roots)
}

#[tauri::command]
pub fn desktop_save_file(app: AppHandle, path: String, data_b64: String) -> Result<(), String> {
    let target = guard(&app, &path)?;
    if let Some(parent) = target.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    let bytes = STANDARD.decode(data_b64.as_bytes()).map_err(|e| e.to_string())?;
    fs::write(&target, bytes).map_err(|e| e.to_string())
}

/// 批量校验文件是否存在（F1 丢失提醒）：入参顺序与返回一致；
/// 只读存在性检查，不碰文件本体（「文件保持原样在磁盘」口径）。
/// 越界/非法路径按「查不到」处理（false），不与整批一起报错——F1 面板逐行显示，一行越界不该拖垮全表。
#[tauri::command]
pub fn desktop_check_files(app: AppHandle, paths: Vec<String>) -> Vec<bool> {
    let roots = allowed_roots(&app);
    paths
        .iter()
        .map(|p| {
            resolve_within_roots(p, &roots)
                .map(|canonical| canonical.exists())
                .unwrap_or(false)
        })
        .collect()
}

/// 批量读文件字节大小（导出 manifest 用）：不存在/读失败/越界返 0，入参顺序一致。
#[tauri::command]
pub fn desktop_file_sizes(app: AppHandle, paths: Vec<String>) -> Vec<u64> {
    let roots = allowed_roots(&app);
    paths
        .iter()
        .map(|p| {
            resolve_within_roots(p, &roots)
                .ok()
                .and_then(|canonical| fs::metadata(canonical).ok())
                .map(|m| m.len())
                .unwrap_or(0)
        })
        .collect()
}

/// 读文件转 base64（F6 头像自含存储）：限 5MB，超限拒绝（防大文件炸内存）。
const READ_LIMIT: u64 = 5 * 1024 * 1024;

#[tauri::command]
pub fn desktop_read_file_b64(app: AppHandle, path: String) -> Result<String, String> {
    let target = guard(&app, &path)?;
    let meta = fs::metadata(&target).map_err(|e| e.to_string())?;
    if meta.len() > READ_LIMIT {
        return Err("文件超过 5MB 上限".to_string());
    }
    let bytes = fs::read(&target).map_err(|e| e.to_string())?;
    Ok(STANDARD.encode(bytes))
}

/// 读备份包转 base64（波10 导入用）：数据包口径几 MB，放宽到 100MB 仍防失控。
/// 波2 DSK-02：导出/导入前自动备份打包 local.db 也走本命令（库含头像 base64 可超 5MB），
/// 不再走 5MB 的 desktop_read_file_b64——后者本为头像单件设，撑大库后导出/备份双双失效。
const BACKUP_READ_LIMIT: u64 = 100 * 1024 * 1024;

#[tauri::command]
pub fn desktop_read_backup_b64(app: AppHandle, path: String) -> Result<String, String> {
    let target = guard(&app, &path)?;
    let meta = fs::metadata(&target).map_err(|e| e.to_string())?;
    if meta.len() > BACKUP_READ_LIMIT {
        return Err("备份包超过 100MB 上限".to_string());
    }
    let bytes = fs::read(&target).map_err(|e| e.to_string())?;
    Ok(STANDARD.encode(bytes))
}

/// 删除缓存文件（波15 图缓存淘汰）：自卫口径＝只许 img-cache 目录内的文件，
/// 组件级前缀比较防路径穿越；文件不在视为成功（幂等）。
/// Claim6 补强：前缀比较改在**两侧都规范化之后**做，符号链接/junction/短名不再能冒充「在缓存目录里」。
#[tauri::command]
pub fn desktop_delete_cache_file(app: AppHandle, path: String) -> Result<(), String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("img-cache");
    let target = resolve_within_dir(&path, &dir)?;
    match fs::remove_file(&target) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// 删除本地库的 -wal/-shm 边车文件（波2 DSK-09 导入整库覆写前清场）：
/// WAL 模式下覆写 local.db 而残留旧 -wal/-shm，下次开库会把旧边车套到新库上致脏库/损坏。
/// 自卫口径＝路径全部由 app_data_dir 内部推导（不收前端入参，杜绝路径穿越）；
/// 文件名固定 local.db-wal / local.db-shm（须与 bridge/db.rs desktop_local_db_path 的 local.db 同源）；
/// 文件不在视为成功（幂等：连接干净关闭时 SQLite 本会自删边车，此处兜底崩溃残留）。
#[tauri::command]
pub fn desktop_delete_db_sidecar(app: AppHandle) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    for name in ["local.db-wal", "local.db-shm"] {
        match fs::remove_file(dir.join(name)) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(())
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

/// 图缓存目录（app_data_dir/img-cache，F5）：与本地库同层，不侵入用户文档；顺带建目录。
#[tauri::command]
pub fn desktop_cache_dir(app: AppHandle) -> Result<String, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("img-cache");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().to_string())
}

/// 复制文件（F1a 母版→复印件）：只复制不搬迁，源文件（母版）永不被改动；
/// 目标存在则覆盖（模板更换口径：已建订单不受影响，因为各自持有自己的副本）。
/// Claim6：src 与 dst **两侧**都过白名单根（旧口径 src 零校验＝任意文件可被复制进拾绘目录）。
#[tauri::command]
pub fn desktop_copy_file(app: AppHandle, src: String, dst: String) -> Result<(), String> {
    let source = guard(&app, &src)?;
    let target = guard(&app, &dst)?;
    if let Some(parent) = target.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    fs::copy(source, target).map(|_| ()).map_err(|e| e.to_string())
}

// ─── S5B：用户自选目录导出/导入（对话框跑壳侧）────────────────────────────
//
// 威胁模型（与上面 path-命令的分工）：渲染层一旦被 XSS/依赖投毒攻破，也**造不出**
// 「用户在原生对话框里选了某路径」这个事实——对话框由 Rust 侧调起、落点只回给 Rust，
// 渲染层全程只经手「数据 + 建议文件名」与最终「已保存/已取消」结果。
// 因此这两个命令的落点/取点来自 OS 对话框本身＝用户授权即边界，无需再过白名单根；
// Claim6 对 path-命令的收敛一条不变（程序化内部写仍全部落在白名单根内）。
//
// 必须是 **async 命令**：Tauri 的同步命令体在主线程执行，而 blocking_*_file 要把对话框
// 派回主线程并阻塞等待——主线程调 blocking 即自锁死。async 命令跑在 async_runtime 工作线程上，
// 阻塞等待只占工作线程，事件循环照常驱动对话框（插件文档同款口径）。

/// 建议文件名的显示防线：只取末段（`/` `\` 都当分隔符）、剥 Windows 非法字符与控制符、
/// 去尾部点号、限长；清洗后为空回退「拾绘导出」。
/// 仅是对话框默认名的卫生处理——真正落点由用户在对话框定夺，本函数不产生任何写权限。
fn sanitize_suggested_name(raw: &str) -> String {
    const FALLBACK: &str = "拾绘导出";
    const MAX_CHARS: usize = 100; // 单段组件 Windows 上限 255 字节，中文名留足余量
    let leaf = raw.rsplit(['/', '\\']).next().unwrap_or("");
    let cleaned: String = leaf
        .chars()
        .filter(|c| !matches!(c, '<' | '>' | ':' | '"' | '|' | '?' | '*') && !c.is_control())
        .collect();
    let mut trimmed: String = cleaned.trim().to_string();
    if trimmed == "." || trimmed == ".." {
        trimmed = String::new();
    }
    while trimmed.ends_with('.') {
        trimmed.pop();
    }
    if trimmed.is_empty() {
        return FALLBACK.to_string();
    }
    trimmed.chars().take(MAX_CHARS).collect()
}

/// 导出写入上限：数据本已由渲染层经 IPC 进过一次内存，此闸只防无界放大，与导入侧同 100MB 口径。
fn decode_export_payload(data_b64: &str) -> Result<Vec<u8>, String> {
    let bytes = STANDARD
        .decode(data_b64.as_bytes())
        .map_err(|_| "导出数据编码无效".to_string())?;
    if bytes.len() as u64 > BACKUP_READ_LIMIT {
        return Err("导出数据超过 100MB 上限".to_string());
    }
    Ok(bytes)
}

/// 壳侧弹原生「另存为」对话框（owner＝调用窗，capability 使其只可能是主窗），
/// 用户选定后把 data_b64 解码字节写到**对话框返回的路径**；取消则不写盘、savedPath 为 null。
/// 类型层面收不到目标路径参数——这是本命令与 desktop_save_file 的本质区别。
#[tauri::command]
pub async fn desktop_export_save_b64(
    window: Window,
    suggested_name: String,
    data_b64: String,
    title: Option<String>,
) -> Result<ExportSaveOutcome, String> {
    // 先验数据再弹框：坏数据不该浪费用户一次对话框往返
    let bytes = decode_export_payload(&data_b64)?;
    let mut builder = window
        .dialog()
        .file()
        .set_file_name(sanitize_suggested_name(&suggested_name));
    if let Some(title) = title {
        builder = builder.set_title(title);
    }
    let picked: Option<FilePath> = builder.set_parent(&window).blocking_save_file();
    let Some(picked) = picked else {
        return Ok(ExportSaveOutcome { saved_path: None }); // 用户取消：不写盘、不报错
    };
    let target = picked
        .into_path()
        .map_err(|_| "保存对话框返回了非本地路径，已放弃写入".to_string())?;
    fs::write(&target, bytes).map_err(|e| format!("写入所选文件失败：{e}"))?;
    Ok(ExportSaveOutcome {
        saved_path: Some(target.to_string_lossy().into_owned()),
    })
}

/// 壳侧弹原生「打开文件」对话框，读**用户所选文件**字节转 base64；取消返回 null。
/// 供导入备份包/头像图等「用户主动从任意位置取件」场景，替代
/// 「JS 对话框选路 → desktop_read_backup_b64(path)」旧流程（后者仍受白名单根约束）。
/// 同样必须是 async（对话框要跑主事件循环，见本段头注释）。
#[tauri::command]
pub async fn desktop_import_read_b64(
    window: Window,
    filters: Option<Vec<ImportFilter>>,
    title: Option<String>,
) -> Result<Option<ImportReadOutcome>, String> {
    let mut builder = window.dialog().file();
    if let Some(title) = title {
        builder = builder.set_title(title);
    }
    for filter in filters.unwrap_or_default() {
        let extensions: Vec<&str> = filter.extensions.iter().map(String::as_str).collect();
        builder = builder.add_filter(filter.name, &extensions);
    }
    let picked: Option<FilePath> = builder.set_parent(&window).blocking_pick_file();
    let Some(picked) = picked else {
        return Ok(None); // 用户取消：不读盘、不报错
    };
    let target = picked
        .into_path()
        .map_err(|_| "文件选择对话框返回了非本地路径，已放弃读取".to_string())?;
    let meta = fs::metadata(&target).map_err(|e| format!("读取所选文件失败：{e}"))?;
    if meta.len() > BACKUP_READ_LIMIT {
        return Err("所选文件超过 100MB 上限".to_string());
    }
    let bytes = fs::read(&target).map_err(|e| format!("读取所选文件失败：{e}"))?;
    Ok(Some(ImportReadOutcome {
        data_b64: STANDARD.encode(bytes),
        path: target.to_string_lossy().into_owned(),
    }))
}

/// desktop_export_save_b64 返回体（JS 侧收 camelCase：{ savedPath }）
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportSaveOutcome {
    /// 用户确认保存后的落点；取消为 null
    pub saved_path: Option<String>,
}

/// desktop_import_read_b64 的过滤器入参（JS 传 [{ name, extensions }]）
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportFilter {
    pub name: String,
    pub extensions: Vec<String>,
}

/// desktop_import_read_b64 返回体（JS 侧收 camelCase：{ dataB64, path }）
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportReadOutcome {
    pub data_b64: String,
    /// 用户经对话框选定的来源路径（回给渲染层仅用于展示/记库；后续按此路径的读写仍走各自闸口）
    pub path: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 本批自建的临时根（护栏口径：%TEMP%\qoder\S5\<批次>\，只删自建目录本身）
    struct TempTree {
        root: PathBuf,
        outside: PathBuf,
    }

    impl TempTree {
        fn new(tag: &str) -> Self {
            let nanos = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let base = std::env::temp_dir()
                .join("qoder")
                .join("S5")
                .join("claim6-files")
                .join(format!("{tag}-{}-{nanos}", std::process::id()));
            let root = base.join("root");
            let outside = base.join("outside");
            fs::create_dir_all(&root).expect("建白名单根临时目录");
            fs::create_dir_all(&outside).expect("建越界临时目录");
            Self { root, outside }
        }

        /// 白名单根一律先规范化：Windows 下 temp 常带 8.3 短名/junction，不规范化会假失败
        fn roots(&self) -> Vec<PathBuf> {
            vec![dunce::canonicalize(&self.root).expect("规范化白名单根")]
        }

        fn cleanup(&self) {
            // 只删本测试自建的这一个 tag 目录（root/outside 的父目录）本身；
            // 上一级 claim6-files/ 是本批次各用例共享的容器，并行跑时绝不清它——
            // 清它会连带抹掉同期别的用例的目录（第一版就因为这个把邻居的 outside 删了，os error 3）。
            let own_base = match self.root.parent() {
                Some(p) => p.to_path_buf(),
                None => return,
            };
            let _ = fs::remove_dir_all(&own_base);
        }
    }

    #[test]
    fn inside_root_allowed_and_read_back() {
        let tree = TempTree::new("inside");
        let roots = tree.roots();
        let file = tree.root.join("avatar.png");
        fs::write(&file, b"png-bytes").expect("写测试文件");

        let resolved = resolve_within_roots(&file.to_string_lossy(), &roots)
            .expect("白名单根内的路径应放行");
        assert_eq!(resolved, dunce::canonicalize(&file).unwrap());

        // 放行后确实读得到本体（口径：放行＝真的能干活，不是只过校验）
        let meta = fs::metadata(&resolved).expect("规范化路径应可 stat");
        assert_eq!(meta.len(), 9);
        tree.cleanup();
    }

    #[test]
    fn parent_traversal_rejected() {
        let tree = TempTree::new("traversal");
        let roots = tree.roots();
        let sneaky = tree.root.join("..").join("outside").join("id_rsa");
        let err = resolve_within_roots(&sneaky.to_string_lossy(), &roots)
            .expect_err(".. 段应一律拒（与既有 save_file/copy_file 口径同族）");
        assert!(err.contains("非法段"), "拒因应点名非法段，实际: {err}");
        tree.cleanup();
    }

    #[test]
    fn path_outside_roots_rejected() {
        let tree = TempTree::new("outside");
        let roots = tree.roots();
        let foreign = tree.outside.join("secret.bin");
        fs::write(&foreign, b"x").expect("写越界测试文件");
        let err =
            resolve_within_roots(&foreign.to_string_lossy(), &roots).expect_err("根外应拒");
        assert!(err.contains("超出应用允许目录"), "拒因应点名越界，实际: {err}");
        tree.cleanup();
    }

    #[test]
    fn system_directory_rejected() {
        // 系统目录（审计点名的靶子之一）：取本机 Windows 目录，不在任何白名单根内
        let Some(system_root) = std::env::var_os("SystemRoot").map(PathBuf::from) else {
            eprintln!("跳过：本机无 SystemRoot");
            return;
        };
        let target = system_root.join("win.ini");
        let tree = TempTree::new("system");
        let err = resolve_within_roots(&target.to_string_lossy(), &tree.roots())
            .expect_err("系统目录应拒");
        assert!(err.contains("超出应用允许目录"), "实际: {err}");
        tree.cleanup();
    }

    #[test]
    fn other_volume_rejected() {
        // 审计点名的「其他盘」：找一个与白名单根不同卷、且真实存在的盘符
        let tree = TempTree::new("volume");
        let roots = tree.roots();
        let home_drive = dunce::canonicalize(&tree.root)
            .unwrap()
            .to_string_lossy()
            .into_owned()
            .chars()
            .next()
            .map(|c| c.to_ascii_uppercase())
            .unwrap_or('C');
        let mut probe: Option<PathBuf> = None;
        for letter in ['D', 'E', 'F', 'G', 'A', 'B', 'C'] {
            if letter == home_drive {
                continue;
            }
            let candidate_root = PathBuf::from(format!("{letter}:\\"));
            if dunce::canonicalize(&candidate_root).is_ok() {
                probe = Some(candidate_root.join("Windows").join("System32").join("config").join("sam"));
                break;
            }
        }
        let Some(target) = probe else {
            eprintln!("跳过：本机只有单一卷 {home_drive}:");
            tree.cleanup();
            return;
        };
        let err = resolve_within_roots(&target.to_string_lossy(), &roots)
            .expect_err("其他盘的绝对路径应拒");
        assert!(err.contains("超出应用允许目录"), "实际: {err}");
        tree.cleanup();
    }

    #[test]
    fn verbatim_device_prefix_rejected() {
        let tree = TempTree::new("verbatim");
        let roots = tree.roots();
        for raw in [
            "\\\\?\\C:\\Windows\\win.ini",
            "\\\\.\\PhysicalDrive0",
            "//?/C:/Windows/win.ini",
        ] {
            let err = resolve_within_roots(raw, &roots).expect_err("verbatim/device 前缀应拒");
            assert!(err.contains("非法前缀"), "{raw} → 实际: {err}");
        }
        tree.cleanup();
    }

    #[test]
    fn relative_path_rejected() {
        // 相对路径会按壳进程 CWD（exe 安装目录）解析，属越界面，一律拒
        let tree = TempTree::new("relative");
        for raw in ["local.db", "..\\local.db", "sub\\dir\\x.png"] {
            let err = resolve_within_roots(raw, &tree.roots()).expect_err("相对路径应拒");
            assert!(
                err.contains("绝对路径") || err.contains("非法段"),
                "{raw} → 实际: {err}"
            );
        }
        tree.cleanup();
    }

    #[test]
    fn nonexistent_leaf_under_root_resolves_for_write() {
        // 写新件场景：目标不存在，但祖先在根内 → 应放行并给出接回后的路径（备份/导出的常态）
        let tree = TempTree::new("write-new");
        let target = tree.root.join("orders").join("客户-约稿").join("copy.psd");
        let resolved = resolve_within_roots(&target.to_string_lossy(), &tree.roots())
            .expect("根内新建路径应放行");
        assert!(resolved.ends_with(target.strip_prefix(&tree.root).unwrap()));
        tree.cleanup();
    }

    #[test]
    fn unresolvable_volume_rejected() {
        // 全祖先都规范化不了（盘符不存在）：按越界拒，不 panic
        let tree = TempTree::new("no-volume");
        let mut bogus: Option<String> = None;
        for letter in ['Y', 'Z', 'W', 'V'] {
            let candidate_root = PathBuf::from(format!("{letter}:\\"));
            if dunce::canonicalize(&candidate_root).is_err() {
                bogus = Some(format!("{letter}:\\拾绘导出\\backup.zip"));
                break;
            }
        }
        let Some(raw) = bogus else {
            eprintln!("跳过：本机无可试的不存在卷");
            tree.cleanup();
            return;
        };
        let err = resolve_within_roots(&raw, &tree.roots()).expect_err("不存在卷应拒");
        assert!(err.contains("超出应用允许目录"), "实际: {err}");
        tree.cleanup();
    }

    #[cfg(windows)]
    #[test]
    fn link_or_junction_escape_rejected() {
        // 链接绕过（审计点名的第三条路）：根内放一个指向根外的链接，链上的目标不该可达。
        // 两条手段依次试：① symlink（需开发者模式/管理员，普通会话常报 os error 1314）；
        // ② 目录 junction（mklink /J，普通用户可建，同样能骗过纯前缀比较）。
        // 两条都建不出来才跳过，并如实打印原因（不假绿）。
        // cfg(windows) 门控：std::os::windows 在非 Windows 上不存在，别给 #22-8 平台议题再添堵。
        let tree = TempTree::new("junction");
        let roots = tree.roots();
        let outside_key = tree.outside.join("id_ed25519");
        fs::write(&outside_key, b"key").expect("写链接目标");

        // ① 文件符号链接：root\link → outside\id_ed25519
        let symlink_path = tree.root.join("link");
        if std::os::windows::fs::symlink_file(&outside_key, &symlink_path).is_ok() {
            eprintln!("链路防线：本次走符号链接路径（本机有链接权限）");
            let err = resolve_within_roots(&symlink_path.to_string_lossy(), &roots)
                .expect_err("根内符号链接指向根外时应按真实落点拒");
            assert!(err.contains("超出应用允许目录"), "实际: {err}");
            let _ = fs::remove_file(&symlink_path);
            tree.cleanup();
            return;
        }

        // ② 目录 junction：root\linkj → outside\（前缀比较会以为它还在 root 里）
        let junction = tree.root.join("linkj");
        let junction_failure = match std::process::Command::new("cmd")
            .args([
                "/C",
                "mklink",
                "/J",
                &junction.to_string_lossy(),
                &tree.outside.to_string_lossy(),
            ])
            .output()
        {
            Ok(output) if output.status.success() => None,
            Ok(output) => Some(String::from_utf8_lossy(&output.stderr).into_owned()),
            Err(e) => Some(e.to_string()),
        };
        if let Some(reason) = junction_failure {
            eprintln!(
                "跳过：本机既建不出符号链接也建不出 junction（{reason}）；canonicalize 防线由其余用例覆盖"
            );
            tree.cleanup();
            return;
        }
        let escaped = junction.join("id_ed25519");
        eprintln!("链路防线：本次走 junction 路径（已在本机建出根外 junction 并验证被拒）");
        let err = resolve_within_roots(&escaped.to_string_lossy(), &roots)
            .expect_err("经根外 junction 逃逸的路径应按规范化落点拒");
        assert!(
            err.contains("超出应用允许目录"),
            "junction 逃逸应被拒，实际: {err}"
        );
        // junction 本体先删（remove_dir 只摘链接不递归目标），再清整棵临时树
        let _ = fs::remove_dir(&junction);
        tree.cleanup();
    }

    #[test]
    fn cache_dir_scope_rule_still_narrows() {
        // desktop_delete_cache_file 的组件级前缀口径：img-cache 内放行，img-cache\..\local.db 之类拒
        let tree = TempTree::new("cache");
        let cache = tree.root.join("img-cache");
        fs::create_dir_all(&cache).expect("建缓存目录");
        let inside = cache.join("a.png");
        fs::write(&inside, b"a").expect("写缓存文件");
        assert!(resolve_within_dir(&inside.to_string_lossy(), &cache).is_ok());

        let escape = cache.join("..").join("local.db");
        let err =
            resolve_within_dir(&escape.to_string_lossy(), &cache).expect_err(".. 段应拒");
        assert!(err.contains("非法段"), "实际: {err}");

        let foreign = tree.outside.join("local.db");
        fs::write(&foreign, b"x").expect("写越界文件");
        let err =
            resolve_within_dir(&foreign.to_string_lossy(), &cache).expect_err("缓存目录外应拒");
        assert!(err.contains("超出应用允许目录"), "实际: {err}");
        tree.cleanup();
    }

    #[cfg(windows)]
    #[test]
    fn verbatim_root_prefix_still_matches_plain_path() {
        // 根带 \\?\ verbatim 前缀（超长路径场景）而目标是普通形态时，不该把合法路径误判成越界
        let tree = TempTree::new("prefix");
        let file = tree.root.join("backup.zip");
        fs::write(&file, b"pk").expect("写测试文件");
        let verbatim_root = std::fs::canonicalize(&tree.root).expect("std canonicalize 给 verbatim 形态");
        assert!(
            verbatim_root.to_string_lossy().starts_with("\\\\?\\"),
            "本用例前提：std canonicalize 应给 `\\\\?\\` 形态，实际 {}",
            verbatim_root.display()
        );
        let resolved = resolve_within_roots(&file.to_string_lossy(), &[verbatim_root])
            .expect("前缀形态不一致不该造成假越界");
        assert!(resolved.exists());
        tree.cleanup();
    }

    #[test]
    fn empty_path_rejected() {
        let tree = TempTree::new("empty");
        for raw in ["", "   "] {
            let err = resolve_within_roots(raw, &tree.roots()).expect_err("空路径应拒");
            assert!(err.contains("绝对路径"), "实际: {err}");
        }
        tree.cleanup();
    }

    // ─── S5B：dialog 命令的纯函数防线（对话框本体不可 headless 自动化，见交回台账）───

    #[test]
    fn suggested_name_keeps_leaf_and_cjk() {
        assert_eq!(sanitize_suggested_name("拾绘备份-20261024.zip"), "拾绘备份-20261024.zip");
        // 只取末段：渲染层塞路径分隔符也带不出目录
        assert_eq!(sanitize_suggested_name("a/b/拾绘.png"), "拾绘.png");
        assert_eq!(sanitize_suggested_name(r"C:\x\y\..\z.csv"), "z.csv");
    }

    #[test]
    fn suggested_name_strips_illegal_chars() {
        // 分隔符先切末段（a<b>:" 落在段外随切段丢弃），再剥段内非法字符
        assert_eq!(sanitize_suggested_name("a<b>:\"/\\|?*c.txt"), "c.txt");
        assert_eq!(sanitize_suggested_name("a<b>c.txt"), "abc.txt");
        // 控制符（含 NUL 截断把戏）全剥
        assert_eq!(sanitize_suggested_name("x\0y\u{7}.zip"), "xy.zip");
    }

    #[test]
    fn suggested_name_falls_back_on_empty_or_traversal() {
        for raw in ["", "  ", "..", ".", "\\", "///", "...", "..\\..", "???" /* 全非法字符→空 */] {
            assert_eq!(sanitize_suggested_name(raw), "拾绘导出", "入参 {raw:?}");
        }
    }

    #[test]
    fn suggested_name_capped_in_length() {
        let long = "名".repeat(300);
        let capped = sanitize_suggested_name(&long);
        assert_eq!(capped.chars().count(), 100);
    }

    #[test]
    fn export_payload_valid_b64_and_bounded() {
        let ok = decode_export_payload(&STANDARD.encode(b"zip-bytes")).expect("合法编码应通过");
        assert_eq!(ok, b"zip-bytes");
        assert!(decode_export_payload("!!!not-base64!!!").is_err());
        // 空数据合法（0 字节文件也存在）
        assert!(decode_export_payload("").unwrap().is_empty());
    }

    #[test]
    fn export_payload_rejects_over_limit() {
        // 100MB+1 的字节对应约 133MB 的 base64；构造略超阈值的最小输入：直接用极限换算注释口径，
        // 真分配 100MB 太慢——改为验证「阈值判定按解码后字节数」这条口径：取 limit+1 字节的编码。
        let limit = BACKUP_READ_LIMIT as usize;
        let bytes = vec![b'x'; limit + 1];
        let encoded = STANDARD.encode(&bytes);
        let err = decode_export_payload(&encoded).expect_err("超过 100MB 应拒");
        assert!(err.contains("100MB"), "实际: {err}");
    }
}
