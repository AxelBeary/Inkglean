// #22-7 发布包资源协议 / CSP 的静态回归。
//
// 这三个条件只在发布包成立：dev 模式不施加 CSP、图缓存也少走 asset 协议，
// 既有冒烟测不出来。本文件把配置面的三件钉死；真机启动发布包（图标显示、模块帧加载）
// 仍是最后一道人工验证，不能被本测试替代。
use std::path::Path;

fn read(rel: &str) -> String {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join(rel);
    std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("读 {} 失败: {e}", path.display()))
}

fn config() -> serde_json::Value {
    serde_json::from_str(&read("tauri.conf.json")).expect("tauri.conf.json 应是严格 JSON")
}

#[test]
fn asset_protocol_enabled_for_release() {
    let config = config();
    let security = &config["app"]["security"];
    assert_eq!(
        security["assetProtocol"]["enable"],
        serde_json::json!(true),
        "assetProtocol.enable 必须为 true：图缓存用 convertFileSrc 返回 asset 地址，关着就在发布包静默加载失败"
    );
    let scope = security["assetProtocol"]["scope"]
        .as_array()
        .expect("assetProtocol.scope 应为数组");
    assert!(
        scope.iter().any(|v| v.as_str() == Some("$APPDATA/**")),
        "图缓存落在 app_data_dir，scope 需覆盖 $APPDATA/**，实际: {scope:?}"
    );
}

#[test]
fn csp_allows_data_iframes_and_asset_images() {
    let config = config();
    let csp = config["app"]["security"]["csp"]
        .as_str()
        .expect("app.security.csp 应为字符串");
    assert!(
        csp.contains("frame-src 'self' data:"),
        "模块沙箱帧是 data:text/html iframe，发布包 CSP 必须放行 frame-src data:（否则回退 default-src 'self' 被拒），实际: {csp}"
    );
    assert!(
        csp.contains("asset:") && csp.contains("http://asset.localhost"),
        "asset 协议图片需 img-src 同时放行 asset: 与 http://asset.localhost（Windows 实际地址），实际: {csp}"
    );
}

#[test]
fn tauri_crate_declares_protocol_asset_feature() {
    let cargo = read("Cargo.toml");
    assert!(
        cargo.contains("protocol-asset"),
        "启用 security.assetProtocol 还要求 tauri 依赖开 protocol-asset feature，否则发布包 asset 协议不注册"
    );
}
