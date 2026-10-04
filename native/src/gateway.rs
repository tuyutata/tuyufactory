//! LAN 网关进程由本机运行时持有，进程管道保证主机退出后不会遗留公开入口。

use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::Error;

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct GatewaySnapshot {
    pub enabled: bool,
    pub authenticated: bool,
    pub realtime_available: bool,
    pub instance_id: String,
    pub hostname: String,
    pub https_port: u16,
    pub addresses: Vec<String>,
    pub certificate_sha256: Option<String>,
    pub error: Option<String>,
}

#[derive(Deserialize)]
struct Ready {
    product_id: String,
    protocol: String,
    instance_id: String,
    hostname: String,
    https_port: u16,
    addresses: Vec<String>,
    certificate_sha256: String,
}

pub struct Gateway {
    runtime_dir: PathBuf,
    data_dir: PathBuf,
    child: Option<Child>,
    parent: Option<ChildStdin>,
    snapshot: GatewaySnapshot,
}

impl Gateway {
    pub fn new(runtime_dir: &Path, data_dir: &Path, instance_id: Uuid) -> Self {
        Self {
            runtime_dir: runtime_dir.to_owned(),
            data_dir: data_dir.to_owned(),
            child: None,
            parent: None,
            snapshot: GatewaySnapshot {
                instance_id: instance_id.to_string(),
                hostname: format!("tuyufactory-{instance_id}.local"),
                https_port: 59460,
                ..GatewaySnapshot::default()
            },
        }
    }

    pub fn snapshot(&mut self) -> GatewaySnapshot {
        if let Some(child) = self.child.as_mut() {
            match child.try_wait() {
                Ok(Some(_)) => {
                    self.child = None;
                    self.parent = None;
                    self.snapshot.enabled = false;
                    self.snapshot.error = Some("厂家局域网进程已经退出".into());
                }
                Err(_) => {
                    self.snapshot.enabled = false;
                    self.snapshot.error = Some("无法读取厂家局域网进程状态".into());
                }
                Ok(None) => {}
            }
        }
        self.snapshot.clone()
    }

    /// 调用方必须先通过唯一账户服务检查当前管理员，不能凭布尔输入授权。
    pub fn enable(&mut self) -> Result<GatewaySnapshot, Error> {
        if self.snapshot().enabled {
            return Ok(self.snapshot.clone());
        }
        self.disable()?;
        let python = self.runtime_dir.join(if cfg!(windows) {
            "python/python.exe"
        } else {
            "python/bin/python3"
        });
        let script = self.runtime_dir.join("employee_gateway.py");
        for path in [&python, &script] {
            if !path.is_file() {
                return Err(Error::Missing(path.clone()));
            }
        }
        let mut command = Command::new(python);
        command
            .arg(script)
            .arg("--data-dir")
            .arg(&self.data_dir)
            .arg("--instance-id")
            .arg(&self.snapshot.instance_id)
            .current_dir(&self.runtime_dir)
            .env("PYTHONHOME", self.runtime_dir.join("python"))
            .env("PYTHONNOUSERSITE", "1")
            .env("PYTHONDONTWRITEBYTECODE", "1")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        #[cfg(target_os = "macos")]
        command.env(
            "DYLD_LIBRARY_PATH",
            format!(
                "{}:{}",
                self.runtime_dir.join("lib").display(),
                self.runtime_dir.join("python/lib").display()
            ),
        );
        #[cfg(target_os = "linux")]
        command.env(
            "LD_LIBRARY_PATH",
            format!(
                "{}:{}",
                self.runtime_dir.join("lib").display(),
                self.runtime_dir.join("python/lib").display()
            ),
        );
        let mut child = command.spawn()?;
        self.parent = child.stdin.take();
        let output = child
            .stdout
            .take()
            .ok_or_else(|| Error::Process("网关状态管道不可用".into()))?;
        self.child = Some(child);
        let (sender, receiver) = mpsc::sync_channel(1);
        let reader = std::thread::spawn(move || {
            let mut line = String::new();
            let result = BufReader::new(output.take(8192))
                .read_line(&mut line)
                .map(|_| line);
            let _ = sender.send(result);
        });
        let result = receiver
            .recv_timeout(Duration::from_secs(15))
            .map_err(|_| Error::Process("厂家局域网启动超时".into()))
            .and_then(|value| value.map_err(Error::from))
            .and_then(|line| self.accept_ready(&line));
        if result.is_err() {
            self.disable()?;
            self.snapshot.error = Some("厂家局域网启动失败".into());
        }
        let _ = reader.join();
        result?;
        Ok(self.snapshot())
    }

    fn accept_ready(&mut self, line: &str) -> Result<(), Error> {
        let ready: Ready = serde_json::from_str(line)?;
        if ready.product_id != "tuyufactory"
            || ready.protocol != "TUYU/1"
            || ready.instance_id != self.snapshot.instance_id
            || ready.hostname != self.snapshot.hostname
            || ready.https_port != 59460
            || ready.addresses.is_empty()
            || ready
                .addresses
                .iter()
                .any(|address| address.parse::<std::net::Ipv4Addr>().is_err())
            || ready.certificate_sha256.len() != 64
            || !ready
                .certificate_sha256
                .bytes()
                .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
        {
            return Err(Error::Invalid("厂家网关身份不一致".into()));
        }
        self.snapshot.addresses = ready.addresses;
        self.snapshot.certificate_sha256 = Some(ready.certificate_sha256);
        self.snapshot.enabled = true;
        self.snapshot.error = None;
        Ok(())
    }

    pub fn disable(&mut self) -> Result<GatewaySnapshot, Error> {
        self.parent = None;
        if let Some(child) = self.child.as_mut() {
            // 先关闭生存管道，让 Python 发出 mDNS goodbye；超时才强制停止本子进程。
            for _ in 0..30 {
                if child.try_wait()?.is_some() {
                    break;
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            if child.try_wait()?.is_none() {
                child.kill()?;
            }
            child.wait()?;
        }
        self.child = None;
        self.snapshot.enabled = false;
        self.snapshot.error = None;
        Ok(self.snapshot.clone())
    }
}

impl Drop for Gateway {
    fn drop(&mut self) {
        let _ = self.disable();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_runtime_never_enables_lan_and_stop_is_idempotent() {
        let mut gateway = Gateway::new(Path::new("unused"), Path::new("unused"), Uuid::now_v7());
        assert!(!gateway.snapshot().enabled);
        assert!(!gateway.disable().unwrap().enabled);
        assert!(!gateway.disable().unwrap().enabled);
        assert!(!gateway.snapshot().realtime_available);
    }

    #[test]
    fn unrelated_process_or_forged_identity_cannot_mark_gateway_ready() {
        let mut gateway = Gateway::new(Path::new("unused"), Path::new("unused"), Uuid::now_v7());
        assert!(gateway.accept_ready("{}").is_err());
        assert!(!gateway.snapshot().enabled);
    }

    #[cfg(unix)]
    #[test]
    fn unexpected_child_exit_is_reported_and_stop_reaps_the_owned_child() {
        let mut gateway = Gateway::new(Path::new("unused"), Path::new("unused"), Uuid::now_v7());
        gateway.child = Some(
            Command::new("/bin/sh")
                .args(["-c", "exit 7"])
                .spawn()
                .unwrap(),
        );
        gateway.snapshot.enabled = true;
        gateway.child.as_mut().unwrap().wait().unwrap();
        let snapshot = gateway.snapshot();
        assert!(!snapshot.enabled);
        assert!(snapshot.error.is_some());
        gateway.child = Some(
            Command::new("/bin/sh")
                .args(["-c", "read -r line"])
                .stdin(Stdio::piped())
                .spawn()
                .unwrap(),
        );
        gateway.parent = gateway.child.as_mut().unwrap().stdin.take();
        gateway.disable().unwrap();
        assert!(gateway.child.is_none());
        assert!(gateway.parent.is_none());
    }
}
