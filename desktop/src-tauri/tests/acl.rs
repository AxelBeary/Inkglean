// U46：真 IPC/ACL 回归——mock runtime 走与真机相同的 on_message/ACL 路径。
// 断言悬浮窗的只读权限足够、写权限确实被 ACL 拒绝，而不是靠静态 JSON 自证。
use serde_json::json;
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{get_ipc_response, mock_builder, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{Manager, WebviewWindow, WebviewWindowBuilder};

fn ipc(
    webview: &WebviewWindow<MockRuntime>,
    cmd: &str,
    body: serde_json::Value,
) -> Result<serde_json::Value, serde_json::Value> {
    get_ipc_response(
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
    )
    .map(|b| b.deserialize::<serde_json::Value>().expect("IPC 返回值应为 JSON"))
}

fn db_url(tag: &str) -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!("sqlite:acl-test-{}-{tag}-{nanos}.db", std::process::id())
}

#[test]
fn floating_window_can_read_but_cannot_execute() {
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
    let floating = WebviewWindowBuilder::new(&app, "floating-deadline", Default::default())
        .build()
        .expect("构建截稿悬浮窗");
    let timer = WebviewWindowBuilder::new(&app, "floating-timer", Default::default())
        .build()
        .expect("构建计时悬浮窗");

    let main_db = db_url("main");
    let float_db = db_url("float");
    let timer_db = db_url("timer");

    // 主窗：SQL 写入权限在真 IPC 路径上可用
    ipc(&main, "plugin:sql|load", json!({ "db": main_db })).expect("主窗应能 load");
    ipc(
        &main,
        "plugin:sql|execute",
        json!({ "db": main_db, "query": "CREATE TABLE t (id INTEGER)", "values": [] }),
    )
    .expect("主窗应能 execute");

    // 悬浮窗：load/select 可用（U45 的只读开库路径）
    ipc(&floating, "plugin:sql|load", json!({ "db": float_db })).expect("悬浮窗应能 load");
    let rows = ipc(
        &floating,
        "plugin:sql|select",
        json!({ "db": float_db, "query": "SELECT 1 AS ok", "values": [] }),
    )
    .expect("悬浮窗应能 select");
    assert_eq!(rows[0]["ok"], 1);

    // 悬浮窗：execute 必须在 ACL 层被拒（不依赖 handler 内部逻辑）
    let denied = ipc(
        &floating,
        "plugin:sql|execute",
        json!({ "db": float_db, "query": "CREATE TABLE nope (id INTEGER)", "values": [] }),
    )
    .expect_err("悬浮窗 execute 应被 ACL 拒绝");
    let msg = denied.to_string();
    assert!(msg.contains("not allowed"), "拒绝信息应含 not allowed，实际: {msg}");
    assert!(msg.contains("execute"), "拒绝信息应点名 execute，实际: {msg}");

    // 计时悬浮窗不投影账目：最小权限面里连 sql:load 都不该有
    let timer_denied = ipc(&timer, "plugin:sql|load", json!({ "db": timer_db }))
        .expect_err("计时悬浮窗不应有 sql 权限");
    let timer_msg = timer_denied.to_string();
    assert!(timer_msg.contains("not allowed"), "计时窗拒绝信息应含 not allowed，实际: {timer_msg}");
    assert!(timer_msg.contains("load"), "计时窗拒绝信息应点名 load，实际: {timer_msg}");

    // 清场：关闭连接池（close 也在 sql:default 内），再删临时库文件
    let _ = ipc(&floating, "plugin:sql|close", json!({ "db": float_db }));
    let _ = ipc(&main, "plugin:sql|close", json!({ "db": main_db }));
    if let Ok(dir) = app.path().app_config_dir() {
        for db in [&main_db, &float_db] {
            let name = db.strip_prefix("sqlite:").unwrap();
            for suffix in ["", "-wal", "-shm"] {
                let _ = std::fs::remove_file(dir.join(format!("{name}{suffix}")));
            }
        }
    }
}
