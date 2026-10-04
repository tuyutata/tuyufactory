use tuyufactory_native::{account_contract, account_service};
use uuid::Uuid;

#[test]
fn factory_uses_the_unique_tuyu_account_service() {
    let contract = account_contract();
    assert_eq!(contract.implementation, "tuyuserve/account");
    assert_eq!(contract.product_id, "tuyufactory");
    assert_eq!(contract.session_scope, "local");
    assert!(!contract.cloud_registration_required);
    account_service(Uuid::now_v7()).expect("厂家端必须能够创建统一账户服务");
}
