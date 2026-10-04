use std::ffi::{CStr, CString, c_char};
use std::fs;
use std::path::Path;
use std::process::Command;

use schnorrkel::{ExpansionMode, MiniSecretKey, signing_context};
use serde_json::{Value, json};
use tempfile::TempDir;
use tuyu_account::{LoginChallenge, login_signing_digest};
use tuyufactory_native::{
    tuyufactory_administrator_challenge, tuyufactory_administrator_state,
    tuyufactory_disable_employee_gateway, tuyufactory_employee_gateway_snapshot,
    tuyufactory_enable_employee_gateway, tuyufactory_initialize_administrator,
    tuyufactory_runtime_snapshot, tuyufactory_start, tuyufactory_stop, tuyufactory_string_free,
};

fn take_response(pointer: *mut c_char) -> Value {
    assert!(!pointer.is_null(), "厂家端 FFI 不得返回空指针");
    let encoded = unsafe { CStr::from_ptr(pointer) }
        .to_str()
        .expect("厂家端 FFI 必须返回 UTF-8")
        .to_owned();
    unsafe { tuyufactory_string_free(pointer) };
    serde_json::from_str(&encoded).expect("厂家端 FFI 必须返回 JSON")
}

fn call_without_input(operation: extern "C" fn() -> *mut c_char) -> Value {
    take_response(operation())
}

fn call_with_input(
    operation: unsafe extern "C" fn(*const c_char) -> *mut c_char,
    value: Value,
) -> Value {
    let encoded = CString::new(value.to_string()).expect("测试 JSON 不得包含空字符");
    take_response(unsafe { operation(encoded.as_ptr()) })
}

fn administrator_response() -> Value {
    // 仅在真实运行验收的内存中生成临时测试身份，不持久化种子或签名材料。
    let mut seed = [0_u8; 32];
    getrandom::fill(&mut seed).unwrap();
    let pair = MiniSecretKey::from_bytes(&seed)
        .expect("随机测试种子必须有效")
        .expand_to_keypair(ExpansionMode::Ed25519);
    let response = call_without_input(tuyufactory_administrator_challenge);
    assert_eq!(response["ok"], true);
    let challenge: LoginChallenge = serde_json::from_value(response["data"].clone()).unwrap();
    let digest = login_signing_digest(&challenge, &pair.public.to_bytes()).unwrap();
    let signature = pair
        .sign(signing_context(b"substrate").bytes(&digest))
        .to_bytes()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    let public_key = pair
        .public
        .to_bytes()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    json!({"p": challenge.p, "v": challenge.v, "k": 2, "i": challenge.i,
        "e": challenge.e, "b": {"u": public_key, "s": signature}})
}

fn start(runtime_root: &Path, temporary: &TempDir) -> Value {
    let installation = temporary.path().join("installation");
    fs::create_dir_all(&installation).unwrap();
    call_with_input(
        tuyufactory_start,
        json!({
            "installation_dir": installation,
            "data_dir": temporary.path().join("data with spaces"),
            "runtime_dir": runtime_root,
            "instance_name": "途遇厂家端集成验收"
        }),
    )
}

#[test]
fn missing_runtime_fails_closed_before_starting_services() {
    let temporary = TempDir::new().unwrap();
    let response = start(&temporary.path().join("missing-runtime"), &temporary);

    assert_eq!(response["ok"], false);
    assert!(
        response["error"]["message"]["zh_cn"]
            .as_str()
            .unwrap()
            .contains("缺少文件")
    );
}

#[test]
#[ignore = "需要先物化 TUYUFACTORY_RUNTIME_ROOT，正式构建与 CI 必须显式执行"]
fn materialized_runtime_initializes_account_and_restarts() {
    let runtime_root = std::env::var("TUYUFACTORY_RUNTIME_ROOT")
        .expect("真实运行验收缺少 TUYUFACTORY_RUNTIME_ROOT");
    let temporary = TempDir::new().unwrap();

    #[cfg(target_os = "linux")]
    {
        // 真运行验收必须先核对本平台完整运行包，不能用另一架构或文件名代替。
        let platform = match std::env::consts::ARCH {
            "aarch64" => "linux-arm",
            "x86_64" => "linux-amd",
            _ => panic!("厂家Linux运行验收不支持当前CPU"),
        };
        let verify = Path::new(env!("CARGO_MANIFEST_DIR")).join("../scripts/verify.mjs");
        let result = Command::new(Path::new(&runtime_root).join("business/node/bin/node"))
            .arg(verify).arg(&runtime_root).arg(platform).status()
            .expect("Linux运行验收必须能够执行运行包验证器");
        assert!(result.success(), "厂家Linux运行包架构及依赖验证失败");
    }

    let first = start(Path::new(&runtime_root), &temporary);
    assert_eq!(first["ok"], true, "首次启动失败：{first}");
    assert_eq!(first["data"]["ready"], true);
    assert_eq!(first["data"]["runtime_materialized"], true);
    assert_eq!(first["data"]["components"].as_array().unwrap().len(), 4);

    let initial_state = call_without_input(tuyufactory_administrator_state);
    assert_eq!(initial_state["data"]["initialized"], false);
    assert_eq!(
        call_without_input(tuyufactory_enable_employee_gateway)["ok"],
        false
    );
    assert_eq!(
        call_without_input(tuyufactory_disable_employee_gateway)["ok"],
        false
    );
    let administrator = call_with_input(
        tuyufactory_initialize_administrator,
        json!({"response": administrator_response(), "name": "厂家系统管理员"}),
    );
    assert_eq!(
        administrator["ok"], true,
        "管理员初始化失败：{administrator}"
    );
    let initialized_state = call_without_input(tuyufactory_administrator_state);
    assert_eq!(initialized_state["data"]["initialized"], true);
    assert_eq!(initialized_state["data"]["total"], 1);
    assert_eq!(initialized_state["data"]["active"], 1);
    let gateway = call_without_input(tuyufactory_employee_gateway_snapshot);
    assert_eq!(gateway["data"]["authenticated"], true);
    assert_eq!(gateway["data"]["enabled"], false);

    let certificate = temporary
        .path()
        .join("data with spaces/erpnext/tls/localhost.crt");
    let login_page = temporary.path().join("login.html");
    let status = Command::new("curl")
        .args(["--fail", "--silent", "--show-error", "--cacert"])
        .arg(&certificate)
        .arg("--output")
        .arg(&login_page)
        .arg("https://127.0.0.1:59443/login")
        .status()
        .expect("真实 HTTPS 验收需要 curl");
    assert!(status.success(), "厂家 HTTPS 登录页不可用");
    assert!(login_page.is_file(), "厂家 HTTPS 登录页没有写入验收结果");

    assert_eq!(call_without_input(tuyufactory_stop)["ok"], true);
    let restarted = start(Path::new(&runtime_root), &temporary);
    assert_eq!(restarted["ok"], true, "重启失败：{restarted}");
    assert_eq!(
        call_without_input(tuyufactory_runtime_snapshot)["data"]["ready"],
        true
    );
    let persisted_state = call_without_input(tuyufactory_administrator_state);
    assert_eq!(persisted_state["data"]["initialized"], true);
    assert_eq!(persisted_state["data"]["active"], 1);
    assert_eq!(
        call_without_input(tuyufactory_employee_gateway_snapshot)["data"]["authenticated"],
        false
    );
    assert_eq!(
        call_without_input(tuyufactory_enable_employee_gateway)["ok"],
        false
    );
    assert_eq!(call_without_input(tuyufactory_stop)["ok"], true);
}
