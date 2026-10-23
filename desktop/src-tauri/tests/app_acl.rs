// GHSA-6pf3-g4xq-854w Claim6 · 应用自有命令 ACL 生效回归。
//
// 与 U46（tests/acl.rs，插件命令 sql 的真 IPC/ACL 回归）互补：本文件管**应用自有命令**。
// 口径与 U46 同款——不信静态 JSON 自证，走 `tauri::test` mock runtime 的真 IPC 路径
// （`get_ipc_response` 与真机共用 on_message/ACL 判定），另加三条静态一致性断言把
// 「命令清单 ↔ build.rs 声明 ↔ permissions 分组 ↔ capability 引用」四轨钉在一起。
//
// 两类错误信号要分清（本文件反复用到）：
//  - 含 `not allowed`  → **ACL 层拒**（该窗的 capability 没这条命令的权限），命令体根本没跑；
//  - 含 `not found`    → ACL 已放行，只是 mock app 没挂 `generate_handler!`（run() 不在测试路径上），
//                        所以它在这里是「该窗确实被授了这条命令」的证据。
use serde_json::json;
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{get_ipc_response, mock_builder, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{Manager, WebviewWindow, WebviewWindowBuilder};

const MANIFEST_DIR: &str = env!("CARGO_MANIFEST_DIR");

fn ipc(webview: &WebviewWindow<MockRuntime>, cmd: &str, body: serde_json::Value) -> String {
    let result = get_ipc_response(
        webview,
        InvokeRequest {
            cmd: cmd.into(),
            callback: CallbackFn(0),
            error: CallbackFn(1),
            url: "http://tauri.localhost".parse().unwrap(),
            body: InvokeBody::Json(body),
            headers: Default::default(),
            invoke_key: INVOKE_KEY.to_string(),
        },
    );
    match result {
        Ok(response) => match response.deserialize::<serde_json::Value>() {
            Ok(value) => format!("ok: {value}"),
            Err(e) => format!("decode-error: {e}"),
        },
        Err(rejection) => format!("rejected: {rejection}"),
    }
}

fn assert_denied(out: &str, cmd: &str, window: &str) {
    assert!(
        out.contains("not allowed"),
        "{window} 调 {cmd} 应被 ACL 拒（消息应含 not allowed），实际: {out}"
    );
    assert!(
        out.contains(cmd),
        "{window} 的拒绝消息应点名 {cmd}，实际: {out}"
    );
}

fn assert_granted(out: &str, cmd: &str, window: &str) {
    assert!(
        !out.contains("not allowed"),
        "{window} 应被授 {cmd}（不该出现 ACL 拒绝），实际: {out}"
    );
}

/// 起一个用真 capabilities 的 mock app，并拿到主窗 + 两个悬浮窗
/// （App 必须留在作用域里：它一被 drop，webview 句柄背后的 manager 就没了）
struct Harness {
    _app: tauri::App<MockRuntime>,
    main: WebviewWindow<MockRuntime>,
    timer: WebviewWindow<MockRuntime>,
    deadline: WebviewWindow<MockRuntime>,
}

fn harness() -> Harness {
    let app = mock_builder()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .build(tauri::generate_context!())
        .expect("构建 mock 应用");
    let main = app
        .get_webview_window("main")
        .unwrap_or_else(|| {
            WebviewWindowBuilder::new(&app, "main", Default::default())
                .build()
                .expect("构建主窗")
        });
    let timer = WebviewWindowBuilder::new(&app, "floating-timer", Default::default())
        .build()
        .expect("构建计时悬浮窗");
    let deadline = WebviewWindowBuilder::new(&app, "floating-deadline", Default::default())
        .build()
        .expect("构建截稿悬浮窗");
    Harness {
        _app: app,
        main,
        timer,
        deadline,
    }
}

/// 读仓库内文件（相对 src-tauri），缺失即标红而不是静默跳过
fn read(rel: &str) -> String {
    let path = std::path::Path::new(MANIFEST_DIR).join(rel);
    std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("读 {} 失败: {e}", path.display()))
}

/// 取 start…end 之间所有双引号内的字面量
fn quoted_between(src: &str, start: &str, end: &str) -> Vec<String> {
    let after = src
        .split(start)
        .nth(1)
        .unwrap_or_else(|| panic!("源文件里找不到标记「{start}」"));
    let block = after.split(end).next().unwrap_or("");
    block
        .split('"')
        .skip(1)
        .step_by(2)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .collect()
}

/// 取 generate_handler! 块里的命令名（每项取最后一个 `::` 段）
fn generated_handler_names() -> Vec<String> {
    let lib_rs = read("src/lib.rs");
    let after = lib_rs
        .split("tauri::generate_handler![")
        .nth(1)
        .expect("lib.rs 应有 tauri::generate_handler!");
    let block = after.split("])").next().unwrap_or("");
    block
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| {
            s.rsplit("::")
                .next()
                .unwrap_or(s)
                .trim()
                .trim_end_matches('(')
                .to_string()
        })
        .collect()
}

fn declared_commands() -> Vec<String> {
    let mut names = quoted_between(&read("build.rs"), "APP_COMMANDS: &[&str] = &[", "\n];");
    names.sort();
    names.dedup();
    names
}

/// 四轨一致性①：build.rs 的 ACL 声明清单 == lib.rs generate_handler! 注册清单。
/// 漏一项 → 该命令对所有窗都不可用（运行期 "not allowed by ACL"）；多一项 → 声明了不存在的命令。
#[test]
fn app_manifest_list_matches_generate_handler() {
    let declared = declared_commands();
    let mut registered = generated_handler_names();
    registered.sort();
    registered.dedup();
    assert_eq!(
        registered, declared,
        "build.rs APP_COMMANDS 与 lib.rs generate_handler! 不一致（前者=ACL 声明，后者=实际注册）"
    );
    assert!(
        declared.len() >= 31,
        "自有命令数应 ≥31（Claim6 核实基线），实数 {}",
        declared.len()
    );
}

/// 四轨一致性②：每条命令都归进了 permissions/*.toml 的某个分组，且分组里没有拼错的 allow-* 名字。
/// 只扫本席手写的分组文件，不扫 autogenerated/（那是 build.rs 生成的机械件）。
#[test]
fn every_command_is_grouped_and_references_are_valid() {
    let declared = declared_commands();
    let permissions_dir = std::path::Path::new(MANIFEST_DIR).join("permissions");
    let mut grouped: Vec<String> = Vec::new();
    let entries = std::fs::read_dir(&permissions_dir)
        .unwrap_or_else(|e| panic!("permissions/ 目录应存在（{}）: {e}", permissions_dir.display()));
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("toml") {
            continue; // 目录（autogenerated/）与非 toml 文件跳过
        }
        let text = std::fs::read_to_string(&path).expect("读权限文件");
        // 只认双引号里以 allow- 开头的字面量（分组文件的 permissions 数组项）；
        // 注释里的 `allow-*` 用的是反引号，不会被这条规则捞到。
        for token in text
            .split('"')
            .skip(1)
            .step_by(2)
            .map(str::trim)
            .filter(|s| s.starts_with("allow-"))
        {
            grouped.push(token.to_string());
        }
    }
    assert!(!grouped.is_empty(), "permissions/*.toml 里应至少引用一条 allow-*");

    // 正向：每条命令都有分组引它（allow- + kebab 化的命令名，与 tauri-build 生成口径一致）
    for command in &declared {
        let expected = format!("allow-{}", command.replace('_', "-"));
        assert!(
            grouped.contains(&expected),
            "命令 {command} 未归进任何 permissions/*.toml 分组（缺 {expected}）"
        );
    }

    // 反向：分组里引到的 allow-* 必须是已声明命令的 slug（拼错的名字会让 capability 静默失守）
    for token in &grouped {
        let slug = token.strip_prefix("allow-").unwrap_or(token);
        let snake = slug.replace('-', "_");
        assert!(
            declared.contains(&snake),
            "permissions/*.toml 引用了未声明的命令权限 {token}（解析成 {snake}，不在 APP_COMMANDS 里）"
        );
    }
}

/// 四轨一致性③：悬浮窗的两份 capability 里不出现文件读写 / 凭据写删 / 模块 / 主窗窗口控制等标识符。
/// （真 IPC 见下面的 floating_windows_* 用例，这里补一道**声明面**的防线：改 JSON 时肉眼漏不掉。）
#[test]
fn floating_capabilities_list_no_sensitive_permissions() {
    const FORBIDDEN: &[&str] = &[
        // 文件读写三组与其成员命令
        "file-write",
        "file-read",
        "file-dirs",
        "allow-desktop-save-file",
        "allow-desktop-copy-file",
        "allow-desktop-delete-cache-file",
        "allow-desktop-read-file-b64",
        "allow-desktop-read-backup-b64",
        "allow-desktop-check-files",
        "allow-desktop-file-sizes",
        "allow-desktop-shihui-home",
        "allow-desktop-cache-dir",
        // S5B 自选目录导出/导入（对话框类）：整组连名带组都不该出现在悬浮窗
        "file-dialog",
        "allow-desktop-export-save-b64",
        "allow-desktop-import-read-b64",
        // 凭据写删（读见下面的 granted 用例）
        "secure-store-write",
        "allow-secure-save",
        "allow-secure-delete",
        // 模块面 / 本地库写面 / 主窗窗口面
        "modules-read",
        "modules-install",
        "allow-desktop-install-sample-module",
        "allow-desktop-read-module-entry",
        "db-sidecar",
        "window-controls",
        "window-float-open",
        "activity-monitor",
        "bridge-diagnostics",
    ];
    for file in ["capabilities/floating.json", "capabilities/floating-deadline.json"] {
        let value: serde_json::Value =
            serde_json::from_str(&read(file)).unwrap_or_else(|e| panic!("{file} 应是严格 JSON: {e}"));
        let list = value["permissions"]
            .as_array()
            .unwrap_or_else(|| panic!("{file} 应有 permissions 数组"));
        let ids: Vec<&str> = list.iter().filter_map(serde_json::Value::as_str).collect();
        for forbidden in FORBIDDEN {
            assert!(
                !ids.contains(forbidden),
                "{file} 不该含敏感权限 {forbidden}，实际 permissions: {ids:?}"
            );
        }
    }

    // 反向钉住「悬浮窗确实拿到那三项投影必需权限」，免得哪天被当成多余权限删掉后静默坏功能
    let floating: serde_json::Value =
        serde_json::from_str(&read("capabilities/floating.json")).expect("floating.json");
    let ids: Vec<&str> = floating["permissions"]
        .as_array()
        .expect("floating.json permissions")
        .iter()
        .filter_map(serde_json::Value::as_str)
        .collect();
    for needed in ["window-float-close", "secure-store-read", "db-path"] {
        assert!(
            ids.contains(&needed),
            "floating.json 应保留投影窗必需的 {needed}，实际: {ids:?}"
        );
    }
}

/// 核心断言（真 IPC）：悬浮窗对文件读写、凭据写删、模块面一律 invoke 不通。
/// 收紧前这 31 条自有命令对所有窗无条件放行，本用例当时必然全红。
#[test]
fn floating_windows_cannot_reach_file_credential_or_module_commands() {
    let harness = harness();

    let denied_calls: &[(&str, serde_json::Value)] = &[
        (
            "desktop_save_file",
            json!({ "path": r"C:\Users\anyone\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\拾绘.png", "dataB64": "" }),
        ),
        ("desktop_read_file_b64", json!({ "path": r"C:\Users\anyone\.ssh\id_rsa" })),
        (
            "desktop_read_backup_b64",
            json!({ "path": r"C:\Windows\System32\config\SAM" }),
        ),
        ("desktop_check_files", json!({ "paths": ["C:\\Windows\\win.ini"] })),
        ("desktop_file_sizes", json!({ "paths": ["C:\\Windows\\win.ini"] })),
        (
            "desktop_copy_file",
            json!({ "src": r"C:\Users\anyone\.ssh\id_rsa", "dst": "C:\\Windows\\Temp\\x.psd" }),
        ),
        // S5B 自选目录导出/导入：即便带“合法”入参，悬浮窗也应被 ACL 拒（命令体压根不该跑到弹框）
        (
            "desktop_export_save_b64",
            json!({ "suggestedName": "拾绘备份.zip", "dataB64": "" }),
        ),
        ("desktop_import_read_b64", json!({ "filters": null })),
        ("desktop_delete_cache_file", json!({ "path": "local.db" })),
        ("desktop_shihui_home", json!({})),
        ("desktop_cache_dir", json!({})),
        ("desktop_delete_db_sidecar", json!({})),
        ("secure_save", json!({ "key": "session-token", "value": "x" })),
        ("secure_delete", json!({ "key": "session-token" })),
        ("desktop_install_sample_module", json!({})),
        ("desktop_read_module_entry", json!({ "dirName": "mood-weather" })),
        ("desktop_window_close", json!({})),
        ("desktop_floating_open", json!({ "kind": "timer" })),
        ("desktop_close_behavior_set", json!({ "behavior": "tray" })),
        ("desktop_autostart_set", json!({ "enabled": true })),
        ("desktop_tray_set_tooltip", json!({ "text": "x" })),
        ("desktop_foreground_title", json!({})),
        ("bridge_ping", json!({})),
    ];

    // 留一条样例消息给台账（--nocapture 可见）：证明拒的是 ACL，而不是 mock app 没挂 handler
    let mut sample: Option<String> = None;
    for (cmd, body) in denied_calls {
        for webview in [&harness.timer, &harness.deadline] {
            let out = ipc(webview, cmd, body.clone());
            if sample.is_none() {
                sample = Some(out.clone());
            }
            assert_denied(&out, cmd, webview.label());
        }
    }
    eprintln!(
        "ACL 拒绝样例：{}",
        sample.unwrap_or_default().replace('\n', " / ")
    );
}

/// 反向对照（真 IPC）：悬浮窗被授的三项投影必需命令要能过 ACL 闸（不出现 not allowed）。
/// 这三条一旦被删，撕悬浮窗会在守卫/贴回按钮上静默坏掉——本用例就是那条防线。
#[test]
fn floating_windows_keep_only_the_granted_projection_commands() {
    let harness = harness();

    for webview in [&harness.timer, &harness.deadline] {
        // 三条放行路径的样例（应见 not found 而非 not allowed：ACL 闸过了，只是 mock 没挂 handler）
        let load_out = ipc(webview, "secure_load", json!({ "key": "device-uuid" }));
        let path_out = ipc(webview, "desktop_local_db_path", json!({}));
        let close_out = ipc(webview, "desktop_floating_close", json!({ "kind": "timer" }));
        eprintln!(
            "投影窗放行样例 [{}]: secure_load → {} | local_db_path → {} | floating_close → {}",
            webview.label(),
            load_out,
            path_out,
            close_out
        );
        assert_granted(&load_out, "secure_load", webview.label());
        assert_granted(&path_out, "desktop_local_db_path", webview.label());
        assert_granted(&close_out, "desktop_floating_close", webview.label());
    }
}

/// 主窗对照：文件读写、凭据、模块面在主窗都过得了 ACL 闸（拒的是 confinement 而不是 ACL）。
#[test]
fn main_window_keeps_file_credential_and_module_access() {
    let harness = harness();
    let main = &harness.main;
    for cmd in [
        "desktop_save_file",
        "desktop_read_file_b64",
        "desktop_check_files",
        "desktop_copy_file",
        "desktop_export_save_b64",
        "desktop_import_read_b64",
        "desktop_shihui_home",
        "secure_load",
        "secure_save",
        "secure_delete",
        "desktop_read_module_entry",
        "desktop_install_sample_module",
        "desktop_floating_open",
        "desktop_close_behavior_set",
        "bridge_ping",
    ] {
        let out = ipc(main, cmd, json!({}));
        assert_granted(&out, cmd, "main");
    }
}

/// S5B 边界（静态签名轨）：两个 dialog 命令的**参数表里不得出现 path 类入参**。
/// 写盘/读盘落点只可能来自原生对话框结果——这条若被改红（有人给命令加了 path 参数），
/// 等于把 files.rs 的 Claim6 收敛从旁门绕穿，必须红。
/// 与四轨一致性同款思路：include 读源码取签名文本比对，不依赖运行期起真对话框
/// （原生对话框在 CI/headless 不可自动化，用本静态断言替代，交回台账已如实标注）。
#[test]
fn dialog_export_import_commands_accept_no_path_parameter() {
    let files_rs = read("src/bridge/files.rs");
    for marker in [
        "pub async fn desktop_export_save_b64(",
        "pub async fn desktop_import_read_b64(",
    ] {
        let params = signature_params(&files_rs, marker);
        for forbidden in ["path", "dir", "dst", "src"] {
            assert!(
                !params.contains(forbidden),
                "{marker} 的参数表不该接受 {forbidden:?} 类入参，实际参数表：{params}"
            );
        }
    }
}

/// 取 `marker` 之后到匹配右括号为止的参数表文本（容忍泛型尖括号内无括号的情况）
fn signature_params(src: &str, marker: &str) -> String {
    let after = src
        .split(marker)
        .nth(1)
        .unwrap_or_else(|| panic!("files.rs 里找不到命令签名「{marker}」"));
    let mut depth = 1usize;
    let mut end = None;
    for (i, ch) in after.char_indices() {
        match ch {
            '(' => depth += 1,
            ')' => {
                depth -= 1;
                if depth == 0 {
                    end = Some(i);
                    break;
                }
            }
            _ => {}
        }
    }
    after
        .get(..end.expect("命令签名应有闭合括号"))
        .unwrap_or("")
        .to_string()
}
