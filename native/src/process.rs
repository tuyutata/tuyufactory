use std::fs::OpenOptions;
use std::net::{TcpStream, ToSocketAddrs};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

#[cfg(unix)]
use std::os::unix::process::CommandExt;

use serde::Serialize;

use crate::error::Error;

const STARTUP_TIMEOUT: Duration = Duration::from_secs(600);

#[derive(Debug, Clone, Copy, Eq, PartialEq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ProcessStatus {
    Starting,
    Ready,
    Failed,
    Stopped,
}

pub struct SiteProcess {
    child: Option<Child>,
    status: ProcessStatus,
    error: Option<String>,
    hostname: String,
    port: u16,
}

impl SiteProcess {
    pub fn start(
        runtime_dir: &Path,
        config_path: &Path,
        log_file: &Path,
        hostname: &str,
        port: u16,
    ) -> Result<Self, Error> {
        let python = if cfg!(windows) {
            runtime_dir.join("python/python.exe")
        } else {
            runtime_dir.join("python/bin/python3")
        };
        let script = runtime_dir.join("factory_runtime.py");
        for path in [&python, &script] {
            if !path.is_file() {
                return Err(Error::Missing(path.to_path_buf()));
            }
        }
        if let Some(parent) = log_file.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let log = OpenOptions::new()
            .create(true)
            .append(true)
            .open(log_file)?;
        let stderr = log.try_clone()?;
        let mut command = Command::new(&python);
        command
            .arg(&script)
            .arg("--config")
            .arg(config_path)
            .current_dir(runtime_dir)
            .env("PYTHONHOME", runtime_dir.join("python"))
            .env("PYTHONNOUSERSITE", "1")
            .env("PYTHONDONTWRITEBYTECODE", "1")
            .stdin(Stdio::null())
            .stdout(Stdio::from(log))
            .stderr(Stdio::from(stderr));
        #[cfg(target_os = "macos")]
        command.env(
            "DYLD_LIBRARY_PATH",
            format!(
                "{}:{}",
                runtime_dir.join("lib").display(),
                runtime_dir.join("python/lib").display()
            ),
        );
        #[cfg(target_os = "linux")]
        command.env(
            "LD_LIBRARY_PATH",
            format!(
                "{}:{}",
                runtime_dir.join("lib").display(),
                runtime_dir.join("python/lib").display()
            ),
        );
        #[cfg(unix)]
        command.process_group(0);
        let mut value = Self {
            child: Some(command.spawn()?),
            status: ProcessStatus::Starting,
            error: None,
            hostname: hostname.to_owned(),
            port,
        };
        value.wait_ready()?;
        Ok(value)
    }

    fn wait_ready(&mut self) -> Result<(), Error> {
        let deadline = Instant::now() + STARTUP_TIMEOUT;
        while Instant::now() < deadline {
            self.refresh();
            if self.status == ProcessStatus::Failed {
                return Err(Error::Process(
                    self.error
                        .clone()
                        .unwrap_or_else(|| "厂家 ERPNext 进程已经退出".to_owned()),
                ));
            }
            if endpoint_ready(&self.hostname, self.port) {
                self.status = ProcessStatus::Ready;
                return Ok(());
            }
            thread::sleep(Duration::from_millis(250));
        }
        self.stop()?;
        Err(Error::Process("厂家 ERPNext 启动超时".to_owned()))
    }

    pub fn refresh(&mut self) {
        let Some(child) = self.child.as_mut() else {
            return;
        };
        match child.try_wait() {
            Ok(Some(status)) => {
                self.child = None;
                self.status = ProcessStatus::Failed;
                self.error = Some(format!("厂家 ERPNext 进程退出：{status}"));
            }
            Ok(None) if self.status == ProcessStatus::Ready => {
                if !endpoint_ready(&self.hostname, self.port) {
                    self.status = ProcessStatus::Failed;
                    self.error = Some("厂家 HTTPS 入口不可用".to_owned());
                }
            }
            Ok(None) => {}
            Err(error) => {
                self.status = ProcessStatus::Failed;
                self.error = Some(error.to_string());
            }
        }
    }

    pub const fn status(&self) -> ProcessStatus {
        self.status
    }

    pub fn error(&self) -> Option<&str> {
        self.error.as_deref()
    }

    pub fn stop(&mut self) -> Result<(), Error> {
        let Some(mut child) = self.child.take() else {
            self.status = ProcessStatus::Stopped;
            return Ok(());
        };
        #[cfg(unix)]
        {
            let process_group = format!("-{}", child.id());
            let _ = Command::new("kill")
                .arg("-TERM")
                .arg(process_group)
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status();
        }
        #[cfg(windows)]
        child.kill()?;
        let deadline = Instant::now() + Duration::from_secs(12);
        while Instant::now() < deadline {
            if child.try_wait()?.is_some() {
                self.status = ProcessStatus::Stopped;
                return Ok(());
            }
            thread::sleep(Duration::from_millis(100));
        }
        child.kill()?;
        child.wait()?;
        self.status = ProcessStatus::Stopped;
        Ok(())
    }
}

impl Drop for SiteProcess {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}

pub fn endpoint_ready(hostname: &str, port: u16) -> bool {
    format!("{hostname}:{port}")
        .to_socket_addrs()
        .ok()
        .into_iter()
        .flatten()
        .any(|address| TcpStream::connect_timeout(&address, Duration::from_millis(250)).is_ok())
}
