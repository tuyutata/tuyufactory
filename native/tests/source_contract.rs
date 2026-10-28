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
fn linux_platforms_use_current_product_build_and_architecture_declarations() {
    // 本机合同只核验当前唯一入口；远端工作流的真实验收归自动化步骤。
    let root = project_root();
    let build = fs::read_to_string(root.join("scripts/build.mjs")).unwrap();
    assert!(build.contains("export const contract="));
    assert!(build.contains("export async function runOwnedShell"));
    assert!(build.contains("if(process.argv[2]==='materialize')"));
    assert!(!build.contains("tuyubooking/imported"));
    for (platform, cpu, package) in [
        ("linux-arm", "aarch64", "arm64"),
        ("linux-amd", "x86_64", "amd64"),
    ] {
        assert!(build.contains(&format!("\"host-{platform}\"")));
        let value: serde_json::Value = serde_json::from_str(
            &fs::read_to_string(root.join("native").join(format!("{platform}.package.json")))
                .unwrap(),
        )
        .unwrap();
        assert_eq!(value["platform"], platform);
        assert_eq!(value["cpuArchitecture"], cpu);
        assert_eq!(value["packageArchitecture"], package);
    }
}
