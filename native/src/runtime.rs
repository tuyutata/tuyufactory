use serde::Serialize;

pub const PRODUCT_ID: &str = "tuyufactory";
pub const TECHNICAL_NAME: &str = "TuyuFactory";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct RuntimeComponent {
    pub id: &'static str,
    pub state: &'static str,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct FrameworkContract {
    pub product_id: &'static str,
    pub technical_name: &'static str,
    pub framework_ready: bool,
    pub runtime_materialized: bool,
    pub components: Vec<RuntimeComponent>,
}

/// 返回已经落地的本机运行组件能力；进程级实时状态由 `runtime_snapshot` 单独返回。
pub fn framework_contract() -> FrameworkContract {
    FrameworkContract {
        product_id: PRODUCT_ID,
        technical_name: TECHNICAL_NAME,
        framework_ready: true,
        runtime_materialized: true,
        components: vec![
            RuntimeComponent {
                id: "account",
                state: "ready",
            },
            RuntimeComponent {
                id: "postgresql",
                state: "ready",
            },
            RuntimeComponent {
                id: "frappe",
                state: "ready",
            },
            RuntimeComponent {
                id: "erpnext",
                state: "ready",
            },
            RuntimeComponent {
                id: "https-gateway",
                state: "ready",
            },
        ],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn framework_reports_materialized_runtime_components() {
        let contract = framework_contract();

        assert!(contract.framework_ready);
        assert!(contract.runtime_materialized);
        assert_eq!(contract.product_id, "tuyufactory");
        assert_eq!(contract.components[0].state, "ready");
        assert!(
            contract
                .components
                .iter()
                .all(|component| component.state == "ready")
        );
    }
}
