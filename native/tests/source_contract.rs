use std::{fs, path::PathBuf};

fn project_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("native 必须位于厂家端工程内")
        .to_path_buf()
}

#[test]
fn source_manifest_locks_erpnext_and_frappe() {
    let manifest = fs::read_to_string(project_root().join("tuyufactory.sources.json"))
        .expect("必须存在厂家端源码锁定清单");

    assert!(manifest.contains("\"dependency_mode\": \"git_subtree\""));
    assert!(manifest.contains("8bc4bfb7d96a0b9a4d5a20e1ded93b40efee53ec"));
    assert!(manifest.contains("b24c9eba551905e256e336ff170a91a92d197a2f"));
    assert!(project_root().join("imported/frappe/LICENSE").is_file());
    assert!(
        project_root()
            .join("imported/erpnext/license.txt")
            .is_file()
    );
    assert!(!project_root().join("imported/frappe/.git").exists());
    assert!(!project_root().join("imported/erpnext/.git").exists());
}

#[test]
fn manufacturer_sources_are_independent_from_booking_sources() {
    let manifest = fs::read_to_string(project_root().join("tuyufactory.sources.json"))
        .expect("必须存在厂家端源码锁定清单");

    assert!(!manifest.contains("tuyubooking/imported"));
}

#[test]
fn linux_platforms_share_one_strict_runtime_builder() {
    let scripts = project_root().join("scripts");
    let implementation = fs::read_to_string(scripts.join("build_linux.sh")).unwrap();
    for platform in ["linux-arm", "linux-amd"] {
        let entry = fs::read_to_string(scripts.join(platform).join("build.sh")).unwrap();
        assert!(entry.contains(&format!("build_linux.sh\" {platform} \"$@\"")));
        assert!(!entry.contains("make install"), "平台入口不得复制运行件构建实现");
        assert!(scripts.join(platform).join("package.json").is_file());
    }
    assert!(implementation.contains("TUYUFACTORY_PLATFORM"));
    assert!(implementation.contains("--elf-tree"));
    assert!(!implementation.contains("Machine:.*AArch64"));
}
