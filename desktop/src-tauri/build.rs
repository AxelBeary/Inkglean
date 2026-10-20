fn main() {
    tauri_build::build();

    // tauri-build 只把 Windows 资源链到 bin，测试 exe 缺 Common Controls v6 manifest 会
    // 在加载期 STATUS_ENTRYPOINT_NOT_FOUND（tray-icon 依赖 TaskDialogIndirect 等 v6 导出）。
    #[cfg(windows)]
    {
        let out_dir = std::path::PathBuf::from(
            std::env::var("OUT_DIR").expect("OUT_DIR should be set by cargo"),
        );
        let rc = out_dir.join("resource.rc");
        if rc.exists() {
            embed_resource::compile_for_tests(&rc, embed_resource::NONE)
                .manifest_required()
                .expect("embed Windows resource into test binaries");
        }
    }
}
