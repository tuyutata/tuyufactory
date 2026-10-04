#!/usr/bin/env python3
"""厂家管理员启用的 LAN HTTPS 入口；仅转发固定本机 ERPNext 站点。"""

from __future__ import annotations

import argparse
import hashlib
import http.client
import http.server
import ipaddress
import json
import signal
import socket
import ssl
import struct
import sys
import threading
import uuid
from pathlib import Path
from urllib.parse import unquote, urlsplit

from runtime_common import ensure_certificate

PORT = 59460
UPSTREAM_PORT = 59443
SERVICE = "_tuyufactory._tcp.local"
PROTOCOL = "TUYU/1"
HOP_HEADERS = {"connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
               "te", "trailer", "transfer-encoding", "upgrade", "content-length"}
MAX_BODY = 64 * 1024 * 1024


def fingerprint(certificate: Path) -> str:
    return hashlib.sha256(ssl.PEM_cert_to_DER_cert(certificate.read_text("ascii"))).hexdigest()


def local_addresses() -> list[str]:
    # UDP connect 仅查询系统路由，不发送数据；无可用 LAN 时明确失败。
    values = set()
    try:
        for item in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            values.add(item[4][0])
    except OSError:
        pass
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
        try:
            probe.connect(("192.0.2.1", 9))
            values.add(probe.getsockname()[0])
        except OSError:
            pass
    return sorted(value for value in values if ipaddress.ip_address(value).is_private
                  and not ipaddress.ip_address(value).is_loopback
                  and not ipaddress.ip_address(value).is_unspecified)


def dns_name(value: str) -> bytes:
    return b"".join(bytes([len(part.encode("ascii"))]) + part.encode("ascii")
                    for part in value.rstrip(".").split(".")) + b"\0"


def advertisement(metadata: dict, ttl: int = 120) -> bytes:
    instance = f"TuyuFactory-{metadata['instance_id']}.{SERVICE}"
    def record(name, kind, data, flush=True):
        return dns_name(name) + struct.pack("!HHIH", kind, 0x8001 if flush else 1, ttl, len(data)) + data
    text = [f"protocol={PROTOCOL}", "product_id=tuyufactory",
            f"instance_id={metadata['instance_id']}", f"https_port={metadata['https_port']}",
            f"certificate_sha256={metadata['certificate_sha256']}"]
    records = [record(SERVICE, 12, dns_name(instance), False),
               record(instance, 33, struct.pack("!HHH", 0, 0, metadata['https_port']) + dns_name(metadata['hostname'])),
               record(instance, 16, b"".join(bytes([len(item)]) + item.encode("ascii") for item in text))]
    records += [record(metadata['hostname'], 1, socket.inet_aton(address)) for address in metadata['addresses']]
    return struct.pack("!HHHHHH", 0, 0x8400, 0, len(records), 0, 0) + b"".join(records)


class Advertiser:
    def __init__(self, metadata: dict):
        self.metadata = metadata
        self.stopping = threading.Event()
        self.error = False
        self.socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        try:
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.socket.bind(("", 5353))
            self.socket.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 255)
            for address in metadata['addresses']:
                self.socket.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP,
                                      socket.inet_aton("224.0.0.251") + socket.inet_aton(address))
            self.socket.settimeout(1)
            self.send(120)
        except BaseException:
            self.socket.close()
            raise
        self.thread = threading.Thread(target=self.run, daemon=True)
        self.thread.start()

    def send(self, ttl):
        packet = advertisement(self.metadata, ttl)
        for address in self.metadata['addresses']:
            self.socket.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_IF, socket.inet_aton(address))
            self.socket.sendto(packet, ("224.0.0.251", 5353))

    def run(self):
        try:
            while not self.stopping.is_set():
                try:
                    packet, _ = self.socket.recvfrom(9000)
                except TimeoutError:
                    continue
                # 只响应查询，避免把自己的广播再广播形成循环。
                if len(packet) >= 12 and not (packet[2] & 0x80) and (
                    b"_tuyufactory" in packet.lower() or self.metadata['hostname'].split('.')[0].encode() in packet.lower()
                ):
                    self.send(120)
        except OSError:
            self.error = not self.stopping.is_set()

    def close(self):
        self.stopping.set()
        self.thread.join(2)
        try:
            self.send(0)
        finally:
            self.socket.close()


class Gateway(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = False

    def __init__(self, address, metadata, certificate, private_key, upstream_certificate):
        # 端口/目标不接受网络请求、URL或发现结果覆盖。
        self.metadata = metadata
        self.upstream_context = ssl.create_default_context(cafile=str(upstream_certificate))
        self.upstream_context.minimum_version = ssl.TLSVersion.TLSv1_2
        self.slots = threading.BoundedSemaphore(32)
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.minimum_version = ssl.TLSVersion.TLSv1_2
        context.load_cert_chain(certificate, private_key)
        super().__init__(address, Handler)
        self.tls_context = context

    def get_request(self):
        connection, address = super().get_request()
        connection.settimeout(10)
        return connection, address

    def process_request(self, request, address):
        if not self.slots.acquire(blocking=False):
            request.close()
            return
        try:
            super().process_request(request, address)
        except BaseException:
            self.slots.release()
            raise

    def process_request_thread(self, request, address):
        try:
            # TLS 握手放在线程内，慢客户端不能阻塞整个监听器。
            with self.tls_context.wrap_socket(request, server_side=True) as connection:
                super().process_request_thread(connection, address)
        except (OSError, ssl.SSLError):
            request.close()
        finally:
            self.slots.release()

    def upstream(self):
        return http.client.HTTPSConnection("127.0.0.1", UPSTREAM_PORT,
                                           context=self.upstream_context, timeout=10)

    def available(self):
        upstream = self.upstream()
        try:
            upstream.connect()
            return True
        except (OSError, ssl.SSLError):
            return False
        finally:
            upstream.close()

    def handle_error(self, request, client_address):
        # 请求、Cookie、签名响应和查询参数不得进入日志。
        pass


def safe_path(raw: str) -> bool:
    if not raw.startswith("/") or raw.startswith("//") or any(ord(c) < 32 for c in raw):
        return False
    parsed = urlsplit(raw)
    if parsed.scheme or parsed.netloc or parsed.fragment:
        return False
    decoded = parsed.path
    for _ in range(4):
        next_path = unquote(decoded)
        if "\\" in next_path or any(c in next_path for c in "\r\n\0"):
            return False
        parts = next_path.split("/")
        if any(part in {".", "..", ".git", "site_config.json", "common_site_config.json", "secrets.json"}
               for part in parts):
            return False
        if next_path == decoded:
            return True
        decoded = next_path
    return False


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def parse_request(self):
        if not super().parse_request():
            return False
        # 标准库会把双斜线目标规范成单斜线；必须核对未经规范化的原请求。
        parts = self.raw_requestline.split()
        if len(parts) < 2 or not safe_path(parts[1].decode('iso-8859-1')):
            self.fail(400)
            return False
        return True

    def handle_expect_100(self):
        self.fail(417)
        return False

    def log_message(self, *args):
        pass

    def fail(self, code):
        self.close_connection = True
        self.send_response(code)
        self.send_header("Content-Length", "0")
        self.send_header("Connection", "close")
        self.end_headers()

    def forward(self):
        self.close_connection = True
        metadata = self.server.metadata
        hosts = {f"{name}:{metadata['https_port']}" for name in
                 [metadata['hostname'], *metadata['addresses']]}
        authority = self.headers.get("Host", "")
        # Client回环端口仅透传原始TLS到本入口，站点仍固定factory.localhost。
        # 只接受规范127.0.0.1随机高端口，不接受localhost别名/其它主机或任意站点。
        prefix = "127.0.0.1:"
        port = authority[len(prefix):] if authority.startswith(prefix) else ""
        relay = (port.isascii() and port.isdecimal() and str(int(port)) == port
                 and 1024 <= int(port) <= 65535)
        if self.headers.get_all("Host", []) != [self.headers.get("Host")] or (authority not in hosts and not relay):
            return self.fail(421)
        if relay and authority not in hosts and self.headers.get("Origin") not in {None, f"https://{authority}"}:
            return self.fail(403)
        if not safe_path(self.path):
            return self.fail(400)
        path = unquote(urlsplit(self.path).path)
        # 当前上游未提供实时服务，Socket.IO 轮询与 Upgrade 都必须明确失败。
        if path.startswith("/socket.io") or self.headers.get("Upgrade"):
            return self.fail(503)
        if path.startswith("/tuyu/"):
            if path != "/tuyu/status" or self.command not in {"GET", "HEAD"}:
                return self.fail(404)
            ready = self.server.available()
            body = json.dumps({**metadata, "ok": ready, "realtime_available": False}).encode()
            self.send_response(200 if ready else 503)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Connection", "close")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)
            return
        lengths = self.headers.get_all("Content-Length", [])
        if self.headers.get("Transfer-Encoding") or len(lengths) > 1:
            return self.fail(400)
        if lengths and (not lengths[0].isascii() or not lengths[0].isdigit()):
            return self.fail(400)
        length = int(lengths[0]) if lengths else 0
        if length > MAX_BODY:
            return self.fail(413)
        # 多值 Cookie/头原样发送；仅移除逐跳头和不可信转发信息。
        hop = HOP_HEADERS | {value.strip().lower() for value in self.headers.get("Connection", "").split(",")}
        upstream = self.server.upstream()
        sent = False
        try:
            upstream.putrequest(self.command, self.path, skip_host=True, skip_accept_encoding=True)
            for name, value in self.headers.items():
                lower = name.lower()
                if lower not in hop | {"host", "forwarded", "expect"} and not lower.startswith("x-forwarded-") and lower != "x-frappe-site-name":
                    upstream.putheader(name, value)
            upstream.putheader("Host", self.headers['Host'])
            upstream.putheader("X-Frappe-Site-Name", "factory.localhost")
            upstream.putheader("Content-Length", str(length))
            upstream.endheaders()
            remaining = length
            while remaining:
                data = self.rfile.read(min(65536, remaining))
                if not data:
                    raise ConnectionError("incomplete request")
                upstream.send(data)
                remaining -= len(data)
            response = upstream.getresponse()
            response_hop = HOP_HEADERS | {value.strip().lower() for value in response.getheader("Connection", "").split(",")}
            headers = []
            for name, value in response.getheaders():
                if name.lower() in response_hop:
                    continue
                if name.lower() == "location":
                    parsed = urlsplit(value)
                    if parsed.netloc in {"127.0.0.1:59443", "factory.localhost:59443", "factory.localhost"}:
                        value = f"https://{self.headers['Host']}{parsed.path}" + (f"?{parsed.query}" if parsed.query else "") + (f"#{parsed.fragment}" if parsed.fragment else "")
                    elif parsed.scheme not in {"", "https"} or parsed.netloc not in {"", self.headers['Host']}:
                        return self.fail(502)
                headers.append((name, value))
            self.send_response(response.status)
            for name, value in headers:
                self.send_header(name, value)
            self.send_header("Connection", "close")
            self.send_header("X-Content-Type-Options", "nosniff")
            # 附加传输策略，不改上游页面/会话；显式HTTPS不允许'self'隐含的WSS。
            self.send_header("Content-Security-Policy",
                "default-src 'self'; base-uri 'self'; form-action 'self'; "
                "frame-ancestors 'self'; frame-src 'self'; object-src 'none'; "
                f"connect-src https://{authority}; "
                "img-src 'self' data: blob:; media-src 'self' blob:; "
                "style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
                "font-src 'self' data:; worker-src 'none'")
            self.end_headers()
            sent = True
            if self.command != "HEAD":
                while data := response.read(65536):
                    self.wfile.write(data)
        except (OSError, http.client.HTTPException, ssl.SSLError):
            if not sent:
                self.fail(502)
        finally:
            upstream.close()

    do_GET = do_POST = do_PUT = do_PATCH = do_DELETE = do_OPTIONS = do_HEAD = forward


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", required=True, type=Path)
    parser.add_argument("--instance-id", required=True)
    arguments = parser.parse_args()
    instance_id = str(uuid.UUID(arguments.instance_id))
    hostname = f"tuyufactory-{instance_id}.local"
    addresses = local_addresses()
    if not addresses:
        raise RuntimeError("no LAN address")
    # 主机数据根下直接使用 tls 的证书对，不增加只有一个子目录的包装层。
    certificate, private_key = ensure_certificate(arguments.data_dir, hostname)
    metadata = {"product_id": "tuyufactory", "protocol": PROTOCOL, "instance_id": instance_id,
                "hostname": hostname, "https_port": PORT, "addresses": addresses,
                "certificate_sha256": fingerprint(certificate)}
    upstream_certificate = arguments.data_dir / "erpnext" / "tls" / "localhost.crt"
    with Gateway(("0.0.0.0", PORT), metadata, certificate, private_key, upstream_certificate) as server:
        if not server.available():
            raise RuntimeError("upstream TLS unavailable")
        advertiser = Advertiser(metadata)
        stopping = threading.Event()
        for signum in (signal.SIGTERM, signal.SIGINT):
            signal.signal(signum, lambda *_: stopping.set())
        # 主机意外退出也停止网关；stdin 仅作为父进程生存管道，不承载命令或秘密。
        def watch_parent():
            sys.stdin.buffer.read()
            stopping.set()
        threading.Thread(target=watch_parent, daemon=True).start()
        server.timeout = 0.25
        print(json.dumps(metadata), flush=True)
        try:
            while not stopping.is_set() and not advertiser.error:
                server.handle_request()
        finally:
            advertiser.close()
        return 1 if advertiser.error else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception:
        # 不输出可能包含路径、请求或凭据的异常正文。
        print("Factory LAN HTTPS gateway failed", file=sys.stderr)
        raise SystemExit(1)
