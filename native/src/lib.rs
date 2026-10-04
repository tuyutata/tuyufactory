mod account;
mod error;
mod gateway;
mod postgres;
mod process;
mod runtime;
mod startup;

use std::ffi::{CStr, CString, c_char};
use std::sync::{Mutex, OnceLock};

pub use account::{AccountContract, account_contract, account_service};
pub use runtime::{FrameworkContract, RuntimeComponent, framework_contract};
pub use startup::{ComponentSnapshot, RuntimeSnapshot};

use error::Error;
use startup::{AdministratorRequest, FactoryRuntime, StartRequest};

fn with_runtime<T>(
    operation: impl FnOnce(&mut FactoryRuntime) -> Result<T, Error>,
) -> Result<T, Error> {
    let mut guard = state()
        .lock()
        .map_err(|_| Error::Invalid("厂家端运行状态锁不可用".into()))?;
    operation(guard.runtime.as_mut().ok_or(Error::NotStarted)?)
}

#[unsafe(no_mangle)]
pub extern "C" fn tuyufactory_administrator_challenge() -> *mut c_char {
    respond(|| with_runtime(|runtime| runtime.administrator_challenge()))
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn tuyufactory_complete_login(input: *const c_char) -> *mut c_char {
    respond(|| {
        let request = serde_json::from_str(&unsafe { read_input(input)? })
            .map_err(|_| Error::Invalid("管理员签名响应格式无效".into()))?;
        with_runtime(|runtime| runtime.complete_login(request))
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn tuyufactory_employee_gateway_snapshot() -> *mut c_char {
    respond(|| with_runtime(FactoryRuntime::gateway_snapshot))
}

/// 权限验证发生在运行时内部，FFI 没有接受客户端自报管理员身份的参数。
#[unsafe(no_mangle)]
pub extern "C" fn tuyufactory_enable_employee_gateway() -> *mut c_char {
    respond(|| with_runtime(FactoryRuntime::enable_gateway))
}

#[unsafe(no_mangle)]
pub extern "C" fn tuyufactory_disable_employee_gateway() -> *mut c_char {
    respond(|| with_runtime(FactoryRuntime::disable_gateway))
}

#[derive(Default)]
struct State {
    runtime: Option<FactoryRuntime>,
}

fn state() -> &'static Mutex<State> {
    static STATE: OnceLock<Mutex<State>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new(State::default()))
}

/// 向 Flutter FFI 暴露框架状态；返回值必须由 `tuyufactory_string_free` 释放。
#[unsafe(no_mangle)]
pub extern "C" fn tuyufactory_framework_contract_json() -> *mut c_char {
    let json = serde_json::to_string(&framework_contract()).expect("厂家端框架契约必须能够序列化");
    CString::new(json)
        .expect("框架契约 JSON 不得包含空字符")
        .into_raw()
}

/// 启动厂家端独立 PostgreSQL 与 ERPNext；返回真实组件状态。
#[unsafe(no_mangle)]
pub unsafe extern "C" fn tuyufactory_start(input: *const c_char) -> *mut c_char {
    respond(|| {
        let request: StartRequest = serde_json::from_str(&unsafe { read_input(input)? })?;
        let mut guard = state()
            .lock()
            .map_err(|_| Error::Invalid("厂家端运行状态锁不可用".to_owned()))?;
        if guard.runtime.is_some() {
            return Err(Error::AlreadyStarted);
        }
        let mut runtime = FactoryRuntime::start(request)?;
        let snapshot = runtime.snapshot();
        guard.runtime = Some(runtime);
        Ok(snapshot)
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn tuyufactory_runtime_snapshot() -> *mut c_char {
    respond(|| {
        let mut guard = state()
            .lock()
            .map_err(|_| Error::Invalid("厂家端运行状态锁不可用".to_owned()))?;
        guard
            .runtime
            .as_mut()
            .map(FactoryRuntime::snapshot)
            .ok_or(Error::NotStarted)
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn tuyufactory_administrator_state() -> *mut c_char {
    respond(|| {
        let guard = state()
            .lock()
            .map_err(|_| Error::Invalid("厂家端运行状态锁不可用".to_owned()))?;
        guard
            .runtime
            .as_ref()
            .ok_or(Error::NotStarted)?
            .administrator_state()
    })
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn tuyufactory_initialize_administrator(input: *const c_char) -> *mut c_char {
    respond(|| {
        let request: AdministratorRequest = serde_json::from_str(&unsafe { read_input(input)? })
            .map_err(|_| Error::Invalid("管理员签名响应格式无效".into()))?;
        let guard = state()
            .lock()
            .map_err(|_| Error::Invalid("厂家端运行状态锁不可用".to_owned()))?;
        guard
            .runtime
            .as_ref()
            .ok_or(Error::NotStarted)?
            .initialize_administrator(request)
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn tuyufactory_stop() -> *mut c_char {
    respond(|| {
        let mut guard = state()
            .lock()
            .map_err(|_| Error::Invalid("厂家端运行状态锁不可用".to_owned()))?;
        guard.runtime.take().ok_or(Error::NotStarted)?.stop()?;
        Ok(serde_json::json!({"stopped": true}))
    })
}

/// 释放由本库分配并跨 FFI 返回的字符串。
#[unsafe(no_mangle)]
pub unsafe extern "C" fn tuyufactory_string_free(value: *mut c_char) {
    if !value.is_null() {
        // SAFETY: 调用方只能传回本库通过 CString::into_raw 返回的指针，并且只释放一次。
        unsafe { drop(CString::from_raw(value)) };
    }
}

unsafe fn read_input(value: *const c_char) -> Result<String, Error> {
    if value.is_null() {
        return Err(Error::Invalid("厂家端原生输入为空".to_owned()));
    }
    unsafe { CStr::from_ptr(value) }
        .to_str()
        .map(ToOwned::to_owned)
        .map_err(|error| Error::Invalid(error.to_string()))
}

fn respond<T: serde::Serialize>(operation: impl FnOnce() -> Result<T, Error>) -> *mut c_char {
    let value = match operation() {
        Ok(data) => serde_json::json!({"ok": true, "data": data}),
        Err(error) => serde_json::json!({
            "ok": false,
            "error": {
                "code": "tuyufactory.runtime",
                "message": {"zh_cn": error.to_string(), "en_us": "The TuyuFactory local runtime is unavailable"}
            }
        }),
    };
    CString::new(value.to_string())
        .expect("厂家端原生响应不得包含空字符")
        .into_raw()
}
