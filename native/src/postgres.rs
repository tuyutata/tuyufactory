use std::fs::OpenOptions;
use std::future::Future;
use std::io::Write;
use std::path::PathBuf;
use std::pin::Pin;
use std::process::{Command, Stdio};

#[cfg(unix)]
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};

use crate::error::Error;

#[derive(Clone, Debug)]
pub enum Connection {
    Socket { directory: PathBuf, port: u16 },
    Loopback { port: u16 },
}

#[derive(Clone, Debug)]
pub struct PostgresConfig {
    pub bin_dir: PathBuf,
    pub installation_dir: PathBuf,
    pub data_dir: PathBuf,
    pub log_file: PathBuf,
    pub username: String,
    pub database: String,
    pub connection: Connection,
}

impl PostgresConfig {
    pub fn validate(&self) -> Result<(), Error> {
        if self.data_dir.starts_with(&self.installation_dir) {
            return Err(Error::DataInsideInstallation);
        }
        for name in ["postgres", "initdb", "pg_ctl", "psql"] {
            let path = self.bin_dir.join(executable_name(name));
            if !path.is_file() {
                return Err(Error::Missing(path));
            }
        }
        for name in ["postgres.bki", "postgresql.conf.sample"] {
            let path = self.share_dir().join(name);
            if !path.is_file() {
                return Err(Error::Missing(path));
            }
        }
        Ok(())
    }

    pub fn share_dir(&self) -> PathBuf {
        self.bin_dir
            .parent()
            .unwrap_or(&self.bin_dir)
            .join("share/postgresql")
    }

    pub fn host(&self) -> String {
        match &self.connection {
            Connection::Socket { directory, .. } => directory.display().to_string(),
            Connection::Loopback { .. } => "127.0.0.1".to_owned(),
        }
    }

    pub const fn port(&self) -> u16 {
        match self.connection {
            Connection::Socket { port, .. } | Connection::Loopback { port } => port,
        }
    }

    fn options(&self) -> String {
        match &self.connection {
            Connection::Socket { directory, port } => {
                let socket = shell_single_quoted(&directory.display().to_string());
                format!(
                    "-c listen_addresses='' -c unix_socket_directories={socket} -p {} \
                 -c shared_memory_type=mmap -c dynamic_shared_memory_type=mmap",
                    port
                )
            }
            Connection::Loopback { port } => format!(
                "-c listen_addresses=127.0.0.1 -p {port} \
                 -c shared_memory_type=mmap -c dynamic_shared_memory_type=mmap"
            ),
        }
    }
}

pub struct Postgres {
    config: PostgresConfig,
    started: bool,
}

impl Postgres {
    pub fn new(config: PostgresConfig) -> Result<Self, Error> {
        config.validate()?;
        Ok(Self {
            config,
            started: false,
        })
    }

    pub fn config(&self) -> &PostgresConfig {
        &self.config
    }

    pub fn initialize(&self, password: &str) -> Result<(), Error> {
        self.prepare_directories()?;
        if self.config.data_dir.join("PG_VERSION").is_file() {
            return Ok(());
        }
        let password_file = self
            .config
            .data_dir
            .parent()
            .unwrap_or(&self.config.data_dir)
            .join(format!(".tuyufactory-initdb-{}", std::process::id()));
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        options.mode(0o600);
        let mut handle = options.open(&password_file)?;
        handle.write_all(password.as_bytes())?;
        handle.write_all(b"\n")?;
        handle.sync_all()?;
        drop(handle);
        let output = Command::new(self.executable("initdb"))
            .arg("--pgdata")
            .arg(&self.config.data_dir)
            .arg("--username")
            .arg(&self.config.username)
            .arg("--pwfile")
            .arg(&password_file)
            .arg("-L")
            .arg(self.config.share_dir())
            .arg("--set")
            .arg("shared_memory_type=mmap")
            .arg("--set")
            .arg("dynamic_shared_memory_type=mmap")
            .arg("--auth-local=scram-sha-256")
            .arg("--auth-host=scram-sha-256")
            .arg("--encoding=UTF8")
            .arg("--no-locale")
            .env("TZ", "GMT")
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .output();
        let removal = std::fs::remove_file(&password_file);
        let result = command_result("initdb", output?);
        removal?;
        result
    }

    fn prepare_directories(&self) -> Result<(), Error> {
        std::fs::create_dir_all(&self.config.data_dir)?;
        if let Connection::Socket { directory, .. } = &self.config.connection {
            std::fs::create_dir_all(directory)?;
            #[cfg(unix)]
            std::fs::set_permissions(directory, std::fs::Permissions::from_mode(0o700))?;
        }
        if let Some(parent) = self.config.log_file.parent() {
            std::fs::create_dir_all(parent)?;
        }
        Ok(())
    }

    pub fn start(&mut self) -> Result<(), Error> {
        if self.started {
            return Err(Error::AlreadyStarted);
        }
        let output = Command::new(self.executable("pg_ctl"))
            .arg("--pgdata")
            .arg(&self.config.data_dir)
            .arg("--log")
            .arg(&self.config.log_file)
            .arg("--options")
            .arg(self.config.options())
            .arg("--wait")
            .arg("start")
            .output()?;
        command_result("pg_ctl start", output)?;
        self.started = true;
        Ok(())
    }

    pub fn ensure_database(&self, password: &str) -> Result<(), Error> {
        if !self.started {
            return Err(Error::NotStarted);
        }
        if !valid_identifier(&self.config.database) {
            return Err(Error::Invalid("PostgreSQL 数据库名称无效".to_owned()));
        }
        let output = self
            .psql(password, "postgres")
            .arg("--tuples-only")
            .arg("--no-align")
            .arg("--command")
            .arg(format!(
                "SELECT 1 FROM pg_database WHERE datname='{}';",
                self.config.database
            ))
            .output()?;
        command_result("检查厂家数据库", output.clone())?;
        if !String::from_utf8_lossy(&output.stdout).trim().is_empty() {
            return Ok(());
        }
        let output = self
            .psql(password, "postgres")
            .arg("--command")
            .arg(format!("CREATE DATABASE \"{}\";", self.config.database))
            .output()?;
        command_result("创建厂家数据库", output)
    }

    pub fn stop(&mut self) -> Result<(), Error> {
        if !self.started {
            return Ok(());
        }
        let output = Command::new(self.executable("pg_ctl"))
            .arg("--pgdata")
            .arg(&self.config.data_dir)
            .arg("--mode")
            .arg("fast")
            .arg("--wait")
            .arg("stop")
            .output()?;
        command_result("pg_ctl stop", output)?;
        self.started = false;
        Ok(())
    }

    fn psql(&self, password: &str, database: &str) -> Command {
        let mut command = Command::new(self.executable("psql"));
        command
            .arg("--host")
            .arg(self.config.host())
            .arg("--port")
            .arg(self.config.port().to_string())
            .arg("--username")
            .arg(&self.config.username)
            .arg("--dbname")
            .arg(database)
            .arg("--set")
            .arg("ON_ERROR_STOP=1")
            .env("PGPASSWORD", password)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        command
    }

    fn executable(&self, name: &str) -> PathBuf {
        self.config.bin_dir.join(executable_name(name))
    }
}

impl Drop for Postgres {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}

pub type DatabaseFuture<'a, T> = Pin<Box<dyn Future<Output = Result<T, Error>> + 'a>>;

pub fn connect<T>(
    config: &PostgresConfig,
    password: &str,
    operation: impl for<'a> FnOnce(&'a mut tokio_postgres::Client) -> DatabaseFuture<'a, T>,
) -> Result<T, Error> {
    let executor = tokio::runtime::Builder::new_current_thread()
        .enable_io()
        .enable_time()
        .build()
        .map_err(Error::Io)?;
    executor.block_on(async {
        let mut value = tokio_postgres::Config::new();
        value
            .user(&config.username)
            .password(password)
            .dbname(&config.database)
            .port(config.port());
        match &config.connection {
            Connection::Socket { directory, .. } => value.host_path(directory),
            Connection::Loopback { .. } => value.host("127.0.0.1"),
        };
        let (mut client, connection) = value.connect(tokio_postgres::NoTls).await?;
        let task = tokio::spawn(async move { connection.await });
        let result = operation(&mut client).await;
        task.abort();
        result
    })
}

fn command_result(name: &str, output: std::process::Output) -> Result<(), Error> {
    if output.status.success() {
        Ok(())
    } else {
        Err(Error::Process(format!(
            "{name} 退出状态 {}：{}",
            output.status,
            String::from_utf8_lossy(&output.stderr).trim()
        )))
    }
}

fn executable_name(name: &str) -> String {
    if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_owned()
    }
}

fn valid_identifier(value: &str) -> bool {
    !value.is_empty()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
}

/// `pg_ctl --options` 最终经由平台命令行解析；单引号编码同时保留空格并拒绝路径注入。
fn shell_single_quoted(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

#[cfg(test)]
mod tests {
    use super::shell_single_quoted;

    #[test]
    fn socket_path_keeps_spaces_and_quotes_in_one_argument() {
        assert_eq!(
            shell_single_quoted("/Users/Factory Owner/O'Reilly/socket"),
            "'/Users/Factory Owner/O'\\''Reilly/socket'"
        );
    }
}
