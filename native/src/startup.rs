use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;

#[cfg(unix)]
use std::os::unix::fs::OpenOptionsExt;

use serde::{Deserialize, Serialize};
use serde_json::json;
use tuyu_account::{
    AccountService, AdministratorState, AuthenticatedSession, LoginChallenge, LoginResponse,
};
use uuid::Uuid;

use crate::error::Error;
use crate::gateway::{Gateway, GatewaySnapshot};
use crate::postgres::{Connection, Postgres, PostgresConfig, connect};
use crate::process::{ProcessStatus, SiteProcess};

const DATABASE_PORT: u16 = 59432;
const HTTPS_PORT: u16 = 59443;
const SCHEMA: &str = include_str!("../../scripts/schema.sql");

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StartRequest {
    pub installation_dir: PathBuf,
    pub data_dir: PathBuf,
    pub runtime_dir: PathBuf,
    pub instance_name: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AdministratorRequest {
    pub response: LoginResponse,
    pub name: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct RuntimeSnapshot {
    pub ready: bool,
    pub runtime_materialized: bool,
    pub https_origin: Option<String>,
    pub components: Vec<ComponentSnapshot>,
}

#[derive(Debug, Serialize)]
pub struct ComponentSnapshot {
    pub id: &'static str,
    pub status: ProcessStatus,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SessionSnapshot {
    pub session_id: Uuid,
    pub administrator_id: Uuid,
    pub administrator_name: Option<String>,
    pub public_key_fingerprint: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct Secrets {
    installation_id: Uuid,
    database_password: String,
    administrator_password: String,
}

pub struct FactoryRuntime {
    gateway: Gateway,
    postgres: Postgres,
    site: SiteProcess,
    password: String,
    account: Arc<AccountService>,
}

impl FactoryRuntime {
    pub fn start(request: StartRequest) -> Result<Self, Error> {
        validate_request(&request)?;
        let secrets = load_secrets(&request.data_dir)?;
        let postgres_root = request.runtime_dir.join("postgresql");
        let business_root = request.runtime_dir.join("business");
        let connection = if cfg!(windows) {
            Connection::Loopback {
                port: DATABASE_PORT,
            }
        } else {
            Connection::Socket {
                directory: request.data_dir.join("socket"),
                port: DATABASE_PORT,
            }
        };
        let config = PostgresConfig {
            bin_dir: postgres_root.join("bin"),
            installation_dir: request.installation_dir,
            data_dir: request.data_dir.join("postgresql"),
            log_file: request.data_dir.join("logs/postgresql.log"),
            username: "tuyufactory".to_owned(),
            database: "tuyufactory".to_owned(),
            connection,
        };
        let mut postgres = Postgres::new(config)?;
        postgres.initialize(&secrets.database_password)?;
        postgres.start()?;
        postgres.ensure_database(&secrets.database_password)?;
        connect(postgres.config(), &secrets.database_password, |client| {
            Box::pin(async move {
                client.batch_execute(SCHEMA).await?;
                client
                    .execute(
                        "INSERT INTO tuyu_core.installation (id, instance_name)
                         VALUES ($1, $2)
                         ON CONFLICT (id) DO UPDATE SET instance_name=EXCLUDED.instance_name,
                           updated_at=CURRENT_TIMESTAMP,
                           version=tuyu_core.installation.version+1",
                        &[&secrets.installation_id, &request.instance_name],
                    )
                    .await?;
                Ok(())
            })
        })?;
        let site_data = request.data_dir.join("erpnext");
        std::fs::create_dir_all(&site_data)?;
        let supervisor = site_data.join("supervisor.json");
        write_private(
            &supervisor,
            &json!({
                "runtime_dir": business_root,
                "data_dir": site_data,
                "public_hostname": "127.0.0.1",
                "https_port": HTTPS_PORT,
                "database_host": postgres.config().host(),
                "database_port": postgres.config().port(),
                "database_name": postgres.config().database,
                "database_superuser": postgres.config().username,
                "database_superuser_password": secrets.database_password,
                "database_role": "tuyufactory_erp",
                "database_schema": "module_factory",
                "site_name": "factory.localhost",
                "administrator_password": secrets.administrator_password,
            }),
        )?;
        let site = match SiteProcess::start(
            &request.runtime_dir.join("business"),
            &supervisor,
            &request.data_dir.join("logs/erpnext.log"),
            "127.0.0.1",
            HTTPS_PORT,
        ) {
            Ok(site) => site,
            Err(error) => {
                let _ = postgres.stop();
                return Err(error);
            }
        };
        let account = Arc::new(AccountService::new("tuyufactory", secrets.installation_id)?);
        Ok(Self {
            gateway: Gateway::new(&business_root, &request.data_dir, secrets.installation_id),
            postgres,
            site,
            password: secrets.database_password,
            account,
        })
    }

    pub fn snapshot(&mut self) -> RuntimeSnapshot {
        self.site.refresh();
        let status = self.site.status();
        let ready = status == ProcessStatus::Ready;
        let error = self.site.error().map(ToOwned::to_owned);
        RuntimeSnapshot {
            ready,
            runtime_materialized: ready,
            https_origin: ready.then(|| format!("https://127.0.0.1:{HTTPS_PORT}")),
            components: vec![
                component("postgresql", ProcessStatus::Ready, None),
                component("frappe", status, error.clone()),
                component("erpnext", status, error.clone()),
                component("https-gateway", status, error),
            ],
        }
    }

    pub fn administrator_state(&self) -> Result<AdministratorState, Error> {
        let account = Arc::clone(&self.account);
        connect(self.postgres.config(), &self.password, move |client| {
            Box::pin(async move { account.state(client).await.map_err(Error::from) })
        })
    }

    pub fn initialize_administrator(
        &self,
        request: AdministratorRequest,
    ) -> Result<SessionSnapshot, Error> {
        let account = Arc::clone(&self.account);
        connect(self.postgres.config(), &self.password, move |client| {
            Box::pin(async move {
                account
                    .initialize(client, request.response, request.name.as_deref())
                    .await
                    .map(SessionSnapshot::from)
                    .map_err(Error::from)
            })
        })
    }

    pub fn administrator_challenge(&self) -> Result<LoginChallenge, Error> {
        let account = Arc::clone(&self.account);
        connect(self.postgres.config(), &self.password, move |client| {
            Box::pin(async move {
                account
                    .create_administrator_challenge(client)
                    .await
                    .map_err(Error::from)
            })
        })
    }

    pub fn complete_login(&self, response: LoginResponse) -> Result<SessionSnapshot, Error> {
        let account = Arc::clone(&self.account);
        connect(self.postgres.config(), &self.password, move |client| {
            Box::pin(async move {
                account
                    .complete_login(client, response)
                    .await
                    .map(SessionSnapshot::from)
                    .map_err(Error::from)
            })
        })
    }

    fn require_administrator(&self) -> Result<(), Error> {
        // list 内部同时核对会话有效期与数据库中的 active 状态；无需复制账户策略。
        self.account.require_session()?;
        let account = Arc::clone(&self.account);
        connect(self.postgres.config(), &self.password, move |client| {
            Box::pin(async move { account.list(client).await.map(|_| ()).map_err(Error::from) })
        })
    }

    pub fn gateway_snapshot(&mut self) -> Result<GatewaySnapshot, Error> {
        let authenticated = self.require_administrator().is_ok();
        let mut snapshot = self.gateway.snapshot();
        snapshot.authenticated = authenticated;
        Ok(snapshot)
    }

    pub fn enable_gateway(&mut self) -> Result<GatewaySnapshot, Error> {
        self.require_administrator()?;
        self.site.refresh();
        if self.site.status() != ProcessStatus::Ready {
            return Err(Error::NotStarted);
        }
        self.gateway.enable()?;
        self.gateway_snapshot()
    }

    pub fn disable_gateway(&mut self) -> Result<GatewaySnapshot, Error> {
        self.require_administrator()?;
        self.gateway.disable()?;
        self.gateway_snapshot()
    }

    pub fn stop(mut self) -> Result<(), Error> {
        self.gateway.disable()?;
        self.site.stop()?;
        self.postgres.stop()
    }
}

fn component(id: &'static str, status: ProcessStatus, error: Option<String>) -> ComponentSnapshot {
    ComponentSnapshot { id, status, error }
}

fn validate_request(request: &StartRequest) -> Result<(), Error> {
    if request.instance_name.trim().is_empty() {
        return Err(Error::Invalid("厂家实例名称不能为空".to_owned()));
    }
    if request.data_dir.starts_with(&request.installation_dir) {
        return Err(Error::DataInsideInstallation);
    }
    for path in [
        request.runtime_dir.join("schema.sql"),
        request.runtime_dir.join("business/runtime.lock.json"),
        request.runtime_dir.join("business/factory_runtime.py"),
    ] {
        if !path.is_file() {
            return Err(Error::Missing(path));
        }
    }
    Ok(())
}

fn load_secrets(data_dir: &Path) -> Result<Secrets, Error> {
    std::fs::create_dir_all(data_dir)?;
    let path = data_dir.join("secrets.json");
    if path.is_file() {
        return Ok(serde_json::from_slice(&std::fs::read(path)?)?);
    }
    let value = Secrets {
        installation_id: Uuid::now_v7(),
        database_password: random_secret()?,
        administrator_password: random_secret()?,
    };
    write_private(&path, &value)?;
    Ok(value)
}

fn random_secret() -> Result<String, Error> {
    let mut bytes = [0_u8; 32];
    getrandom::fill(&mut bytes).map_err(|error| Error::Invalid(error.to_string()))?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn write_private(path: &Path, value: &impl Serialize) -> Result<(), Error> {
    let temporary = path.with_extension("json.tmp");
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    options.mode(0o600);
    let mut file = options.open(&temporary)?;
    file.write_all(&serde_json::to_vec_pretty(value)?)?;
    file.write_all(b"\n")?;
    file.sync_all()?;
    drop(file);
    std::fs::rename(temporary, path)?;
    Ok(())
}

impl From<AuthenticatedSession> for SessionSnapshot {
    fn from(value: AuthenticatedSession) -> Self {
        Self {
            session_id: value.id,
            administrator_id: value.administrator_id,
            administrator_name: value.administrator_name,
            public_key_fingerprint: value.public_key_fingerprint,
        }
    }
}
