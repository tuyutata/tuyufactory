#!/usr/bin/env python3
"""只在本机回环地址提供 TLS 的 Frappe WSGI 服务。"""

from __future__ import annotations

import argparse
import os
import ssl
from pathlib import Path
from socketserver import ThreadingMixIn
from wsgiref.simple_server import WSGIServer, WSGIRequestHandler, make_server


class ThreadingServer(ThreadingMixIn, WSGIServer):
    daemon_threads = True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", required=True, type=int)
    parser.add_argument("--certificate", required=True)
    parser.add_argument("--private-key", required=True)
    arguments = parser.parse_args()
    from frappe.app import application as frappe_application
    from werkzeug.middleware.shared_data import SharedDataMiddleware

    assets = Path(os.environ["TUYU_FRAPPE_ASSETS"])
    if not (assets / "assets.json").is_file():
        raise FileNotFoundError("厂家端运行包缺少 Frappe 浏览器资源")
    site_name = os.environ["TUYU_FRAPPE_SITE"]

    def site_application(environ, start_response):
        # 本机 TLS 入口使用 IP 地址，固定注入唯一厂家站点，不能由 Host 头选择其它站点。
        environ["HTTP_X_FRAPPE_SITE_NAME"] = site_name
        return frappe_application(environ, start_response)

    application = SharedDataMiddleware(
        site_application,
        {"/assets": str(assets)},
        cache=True,
        cache_timeout=31_536_000,
    )

    server = make_server(
        "127.0.0.1",
        arguments.port,
        application,
        server_class=ThreadingServer,
        handler_class=WSGIRequestHandler,
    )
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.load_cert_chain(arguments.certificate, arguments.private_key)
    server.socket = context.wrap_socket(server.socket, server_side=True)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
