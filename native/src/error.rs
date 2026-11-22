//! 定义厂家原生运行时的文件、进程、数据目录及启动错误。

use std::path::PathBuf;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("厂家端运行包缺少文件：{0}")]
    Missing(PathBuf),
    #[error("厂家端数据目录不能位于安装目录内")]
    DataInsideInstallation,
    #[error("厂家端本地服务已经启动")]
    AlreadyStarted,
    #[error("厂家端本地服务尚未启动")]
    NotStarted,
    #[error("厂家端运行配置无效：{0}")]
    Invalid(String),
    #[error("厂家端本地进程失败：{0}")]
    Process(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Postgres(#[from] tokio_postgres::Error),
    #[error(transparent)]
    Account(#[from] tuyu_account::Error),
}
