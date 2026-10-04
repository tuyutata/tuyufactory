"""仅在回环测试端口执行真实 TLS 请求，不启动厂家产品或上游数据库。"""

import http.client
import http.server
import json
import os
import socket
import ssl
import subprocess
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

import employee_gateway as gateway
from runtime_common import ensure_certificate


class Upstream(http.server.BaseHTTPRequestHandler):
    received = []

    def do_GET(self):
        body = self.rfile.read(int(self.headers.get('Content-Length', '0')))
        type(self).received.append((self.path, dict(self.headers), body))
        self.send_response(302 if self.path == '/redirect' else 200)
        if self.path == '/redirect':
            self.send_header('Location', 'https://127.0.0.1:59443/app')
        self.send_header('Set-Cookie', 'sid=; Max-Age=0; Path=/; Secure; HttpOnly')
        self.send_header('Set-Cookie', 'user_id=Guest; Path=/; Secure')
        self.send_header('Content-Type', 'application/octet-stream')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    do_POST = do_GET
    do_HEAD = do_GET

    def log_message(self, *args):
        pass

    def handle(self):
        try:
            super().handle()
        except ConnectionResetError:
            pass


class GatewayTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # 所有临时证书和测试资产归当前厂家测试目录，退出自动清理。
        directory = Path(os.environ['TUYUFACTORY_TEST_DIR']).resolve()
        if not directory.is_absolute():
            raise ValueError('factory test directory must be absolute')
        cls.temporary = tempfile.TemporaryDirectory(dir=directory)
        root = Path(cls.temporary.name)
        cls.certificate, cls.key = root / 'test.crt', root / 'test.key'
        subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
                        '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1',
                        '-keyout', str(cls.key), '-out', str(cls.certificate)], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        cls.key.chmod(0o600)
        cls.upstream = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Upstream)
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(cls.certificate, cls.key)
        cls.upstream.socket = context.wrap_socket(cls.upstream.socket, server_side=True)
        cls.upstream_thread = threading.Thread(target=cls.upstream.serve_forever, daemon=True)
        cls.upstream_thread.start()
        cls.port_patch = patch.object(gateway, 'UPSTREAM_PORT', cls.upstream.server_port)
        cls.port_patch.start()
        cls.metadata = {'product_id': 'tuyufactory', 'protocol': 'TUYU/1',
                        'instance_id': '00000000-0000-4000-8000-000000000001',
                        'hostname': 'localhost', 'https_port': 0, 'addresses': ['127.0.0.1'],
                        'certificate_sha256': gateway.fingerprint(cls.certificate)}
        cls.server = gateway.Gateway(('127.0.0.1', 0), cls.metadata, cls.certificate, cls.key, cls.certificate)
        cls.metadata['https_port'] = cls.server.server_port
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        for server, thread in [(cls.server, cls.thread), (cls.upstream, cls.upstream_thread)]:
            server.shutdown()
            server.server_close()
            thread.join(3)
        cls.port_patch.stop()
        cls.temporary.cleanup()

    def setUp(self):
        Upstream.received.clear()

    def request(self, path, method='GET', body=None, headers=None):
        context = ssl.create_default_context(cafile=str(self.certificate))
        connection = http.client.HTTPSConnection('127.0.0.1', self.server.server_port, context=context, timeout=3)
        try:
            connection.request(method, path, body=body, headers=headers or {})
            response = connection.getresponse()
            return response.status, response.getheaders(), response.read()
        finally:
            connection.close()

    def test_status_and_certificate_are_consistent(self):
        status, _, body = self.request('/tuyu/status')
        self.assertEqual(status, 200)
        result = json.loads(body)
        self.assertEqual(result['instance_id'], self.metadata['instance_id'])
        self.assertEqual(result['certificate_sha256'], gateway.fingerprint(self.certificate))
        self.assertFalse(result['realtime_available'])
        self.assertNotIn('authenticated', result)
        self.assertEqual(Upstream.received, [])

    def test_binary_upload_and_cookie_csrf_are_forwarded(self):
        body = bytes(range(256)) * 1000
        status, headers, result = self.request('/api/method/upload_file', 'POST', body,
            {'Content-Type': 'application/octet-stream', 'X-Frappe-CSRF-Token': 'test-only',
             'Cookie': 'user_id=Guest', 'X-Frappe-Site-Name': 'attacker.local',
             'X-Forwarded-Host': 'attacker.local', 'Forwarded': 'host=attacker.local'})
        self.assertEqual((status, result), (200, body))
        self.assertEqual(sum(name.lower() == 'set-cookie' for name, _ in headers), 2)
        _, received, payload = Upstream.received[-1]
        self.assertEqual(received['X-Frappe-Site-Name'], 'factory.localhost')
        self.assertEqual(received['X-Frappe-CSRF-Token'], 'test-only')
        self.assertEqual(received['Cookie'], 'user_id=Guest')
        self.assertNotIn('X-Forwarded-Host', received)
        self.assertNotIn('Forwarded', received)
        self.assertEqual(payload, body)

    def test_client_tls_relay_origin_preserves_native_site_and_cookies(self):
        authority = '127.0.0.1:49211'
        status, headers, payload = self.request('/api/method/upload_file', 'POST', b'file',
            {'Host': authority, 'Origin': f'https://{authority}',
             'Cookie': 'user_id=Guest', 'X-Frappe-CSRF-Token': 'test-only'})
        self.assertEqual((status, payload), (200, b'file'))
        self.assertEqual(Upstream.received[-1][1]['Host'], authority)
        self.assertEqual(Upstream.received[-1][1]['Origin'], f'https://{authority}')
        self.assertEqual(Upstream.received[-1][1]['X-Frappe-Site-Name'], 'factory.localhost')
        self.assertEqual(sum(k.lower() == 'set-cookie' for k, _ in headers), 2)
        csp = dict(headers)['Content-Security-Policy']
        self.assertIn(f'connect-src https://{authority};', csp)
        self.assertIn("form-action 'self'", csp)
        self.assertNotIn("connect-src 'self'", csp)
        status, headers, _ = self.request('/redirect', headers={'Host': authority})
        self.assertEqual(status, 302)
        self.assertEqual(dict(headers)['Location'], f'https://{authority}/app')

    def test_client_relay_rejects_other_origins_and_noncanonical_authorities(self):
        for authority in ['127.0.0.1:443', '127.0.0.1:049211', 'localhost:49211',
                          '127.0.0.2:49211', '127.0.0.1:65536', '127.0.0.1:abc',
                          '127.0.0.1:49211@other.local', '127.0.0.1:49211/path']:
            with self.subTest(authority=authority):
                self.assertEqual(self.request('/app', headers={'Host': authority})[0], 421)
        self.assertEqual(self.request('/app', headers={'Host': '127.0.0.1:49211',
            'Origin': 'https://other.local'})[0], 403)
        self.assertEqual(Upstream.received, [])

    def test_origin_header_is_not_forged_to_bypass_csrf(self):
        self.request('/api/method/login', 'POST', b'', {'Origin': 'https://attacker.invalid'})
        self.assertEqual(Upstream.received[-1][1]['Origin'], 'https://attacker.invalid')

    def test_internal_redirect_returns_to_lan_origin(self):
        status, headers, _ = self.request('/redirect')
        self.assertEqual(status, 302)
        self.assertEqual(dict(headers)['Location'], f'https://127.0.0.1:{self.server.server_port}/app')

    def test_forbidden_targets_never_reach_upstream(self):
        for path in ['/../secrets.json', '/%2e%2e/site_config.json', '/%252e%252e/secrets.json',
                     '/tuyu/administrator', '/tuyu/enable', '//attacker.invalid/', '/assets/.git/config']:
            with self.subTest(path=path):
                self.assertIn(self.request(path)[0], (400, 404))
        self.assertEqual(self.request('/app', headers={'Host': 'factory.localhost'})[0], 421)
        self.assertEqual(Upstream.received, [])

    def test_realtime_and_ambiguous_body_fail_closed(self):
        self.assertEqual(self.request('/socket.io/?transport=polling')[0], 503)
        self.assertEqual(self.request('/app', headers={'Upgrade': 'websocket'})[0], 503)
        self.assertEqual(self.request('/app', headers={'Transfer-Encoding': 'chunked'})[0], 400)
        self.assertEqual(self.request('/app', headers={'Content-Length': str(gateway.MAX_BODY + 1)})[0], 413)
        self.assertEqual(Upstream.received, [])

    def test_untrusted_certificate_and_plaintext_are_rejected(self):
        client = http.client.HTTPSConnection('127.0.0.1', self.server.server_port, timeout=3)
        try:
            with self.assertRaises(ssl.SSLCertVerificationError):
                client.request('GET', '/tuyu/status')
        finally:
            client.close()
        with socket.create_connection(('127.0.0.1', self.server.server_port), timeout=3) as connection:
            connection.sendall(b'GET /tuyu/status HTTP/1.1\r\nHost: localhost\r\n\r\n')
            try:
                self.assertNotIn(b'200 OK', connection.recv(128))
            except ConnectionResetError:
                pass

    def test_upstream_certificate_verification_cannot_be_disabled(self):
        original = self.server.upstream_context
        self.server.upstream_context = ssl.create_default_context()
        try:
            self.assertEqual(self.request('/app')[0], 502)
            self.assertEqual(self.request('/tuyu/status')[0], 503)
        finally:
            self.server.upstream_context = original

    def test_dns_packet_has_identity_fingerprint_and_goodbye(self):
        packet = gateway.advertisement(self.metadata)
        for expected in ['TUYU/1', self.metadata['instance_id'], self.metadata['certificate_sha256']]:
            self.assertIn(expected.encode(), packet)
        self.assertIn(gateway.dns_name(gateway.SERVICE), packet)
        self.assertNotEqual(packet, gateway.advertisement(self.metadata, 0))
        self.assertFalse(self.server.upstream_context.check_hostname is False)
        self.assertGreaterEqual(self.server.tls_context.minimum_version, ssl.TLSVersion.TLSv1_2)

    def test_idle_client_does_not_block_other_tls_handshakes(self):
        with socket.create_connection(('127.0.0.1', self.server.server_port), timeout=3):
            self.assertEqual(self.request('/tuyu/status')[0], 200)

    def test_upstream_document_names_keep_percent_and_leading_dot(self):
        for path in ['/api/resource/Item/50%25', '/api/resource/Item/.sample']:
            self.assertEqual(self.request(path)[0], 200)
            self.assertEqual(Upstream.received[-1][0], path)

    def test_runtime_lock_and_scripts_include_the_same_gateway(self):
        root = Path(__file__).parent
        contract = json.loads((root / 'runtime.lock.json').read_text())['employee_gateway']
        self.assertFalse(contract['enabled'])
        self.assertFalse(contract['realtime_available'])
        self.assertEqual(contract['https_port'], gateway.PORT)
        self.assertEqual(contract['discovery_service'], gateway.SERVICE)
        self.assertEqual(contract['discovery_protocol'], gateway.PROTOCOL)
        for name in ['materialize.mjs', 'verify.mjs']:
            self.assertIn('employee_gateway.py', (root / name).read_text())

    def test_persisted_certificate_is_reused_and_partial_pair_fails_closed(self):
        with tempfile.TemporaryDirectory(dir=self.temporary.name) as directory:
            root = Path(directory)
            (root / 'tls').mkdir()
            certificate, key = root / 'tls/localhost.crt', root / 'tls/localhost.key'
            certificate.write_bytes(self.certificate.read_bytes())
            with self.assertRaises(ValueError):
                ensure_certificate(root, 'localhost')
            key.write_bytes(self.key.read_bytes())
            key.chmod(0o600)
            self.assertEqual(ensure_certificate(root, 'localhost'), (certificate, key))
            self.assertEqual(gateway.fingerprint(certificate), gateway.fingerprint(self.certificate))

    def test_duplicate_lengths_never_reach_upstream(self):
        context = ssl.create_default_context(cafile=str(self.certificate))
        connection = http.client.HTTPSConnection('127.0.0.1', self.server.server_port, context=context, timeout=3)
        try:
            connection.putrequest('POST', '/api/method/login')
            connection.putheader('Content-Length', '0')
            connection.putheader('Content-Length', '1')
            connection.endheaders()
            response = connection.getresponse()
            self.assertEqual(response.status, 400)
            response.read()
            self.assertEqual(Upstream.received, [])
        finally:
            connection.close()


if __name__ == '__main__':
    unittest.main()
