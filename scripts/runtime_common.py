#!/usr/bin/env python3
"""途遇厂家端离线运行时的文件、证书与进程公共边界。"""

from __future__ import annotations

import json
import os
import signal
import subprocess
import time
from pathlib import Path
from typing import Any


def read_config(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError("厂家端运行配置必须是 JSON 对象")
    return value


def write_private_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    try:
        temporary.chmod(0o600)
    except OSError:
        pass
    temporary.replace(path)


def executable(path: Path) -> Path:
    if os.name == "nt" and path.suffix.lower() != ".exe":
        candidate = path.with_suffix(".exe")
        if candidate.is_file():
            return candidate
        if path.as_posix().endswith("python/bin/python3"):
            candidate = path.parents[1] / "python.exe"
            if candidate.is_file():
                return candidate
    return path


def ensure_certificate(data_dir: Path, hostname: str) -> tuple[Path, Path]:
    """为固定主机身份保存证书；证书对损坏时拒绝隐式更换已被分机信任的身份。"""
    tls_dir = data_dir / "tls"
    certificate = tls_dir / "localhost.crt"
    private_key = tls_dir / "localhost.key"
    if certificate.is_file() and private_key.is_file():
        return certificate, private_key
    if certificate.exists() or private_key.exists():
        raise ValueError("厂家 TLS 证书或私钥缺失，拒绝自动替换主机身份")
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID
    import datetime
    import ipaddress

    tls_dir.mkdir(parents=True, exist_ok=True)
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = issuer = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, hostname)])
    now = datetime.datetime.now(datetime.UTC)
    value = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(minutes=1))
        .not_valid_after(now + datetime.timedelta(days=825))
        .add_extension(
            x509.SubjectAlternativeName(
                [x509.DNSName(hostname), x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]
            ),
            critical=False,
        )
        # Apple严格TLS策略要求显式服务器认证用途；分机不能放宽证书校验。
        .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), critical=False)
        .sign(key, hashes.SHA256())
    )
    descriptor = os.open(private_key, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "wb") as handle:
        handle.write(key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        ))
    certificate.write_bytes(value.public_bytes(serialization.Encoding.PEM))
    private_key.chmod(0o600)
    return certificate, private_key


def supervise(commands: list[tuple[list[str], dict[str, str], Path]]) -> int:
    """一个必需子进程退出时，关闭同一厂家站点的全部子进程。"""
    children: list[subprocess.Popen[bytes]] = []
    stopping = False

    def stop_children(_signum: int | None = None, _frame: object | None = None) -> None:
        nonlocal stopping
        stopping = True
        for child in children:
            if child.poll() is None:
                child.terminate()

    for signum in (signal.SIGINT, signal.SIGTERM):
        signal.signal(signum, stop_children)
    try:
        for command, environment, cwd in commands:
            children.append(
                subprocess.Popen(
                    command,
                    cwd=cwd,
                    env=environment,
                    stdin=subprocess.DEVNULL,
                )
            )
        while not stopping:
            for child in children:
                code = child.poll()
                if code is not None:
                    stop_children()
                    return code or 1
            time.sleep(0.25)
        return 0
    finally:
        stop_children()
        deadline = time.monotonic() + 10
        for child in children:
            if child.poll() is None:
                try:
                    child.wait(max(0.1, deadline - time.monotonic()))
                except subprocess.TimeoutExpired:
                    child.kill()
        for child in children:
            if child.poll() is None:
                child.wait()
