//! 途遇厂家端复用全途遇唯一账户实现的入口。

use serde::Serialize;
use tuyu_account::{AccountService, Error};
use uuid::Uuid;

use crate::runtime::PRODUCT_ID;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AccountContract {
    pub implementation: &'static str,
    pub product_id: &'static str,
    pub session_scope: &'static str,
    pub cloud_registration_required: bool,
}

/// 厂家端初始化和管理员管理只能通过该共享服务执行，不建立第二套账户逻辑。
pub fn account_service(installation_id: Uuid) -> Result<AccountService, Error> {
    AccountService::new(PRODUCT_ID, installation_id)
}

pub const fn account_contract() -> AccountContract {
    AccountContract {
        implementation: "tuyuserve/account",
        product_id: PRODUCT_ID,
        session_scope: "local",
        cloud_registration_required: false,
    }
}
