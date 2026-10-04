import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:tuyufactory/client/mdns_discovery.dart';

class PinnedHttpsClient {
  PinnedHttpsClient({
    Future<ConnectionTask<Socket>> Function(String, int)? connect,
  }) : _connect =
           connect ?? ((address, port) => Socket.startConnect(address, port));
  final Future<ConnectionTask<Socket>> Function(String, int) _connect;
  final Set<Socket> _sockets = {};
  final Set<ConnectionTask<Socket>> _tasks = {};
  final Set<HttpClient> _clients = {};
  bool _closed = false;

  /// 只读取公开状态，不持有员工Cookie，不授权业务或管理员访问。
  Future<void> verify(FactoryHost host) async {
    await selectAddress(host);
  }

  /// 仅公开状态探测可尝试保存的其它地址；业务提交绝不自动重放。
  Future<String> selectAddress(FactoryHost host) async {
    if (_closed) throw StateError('Connection closed');
    Object? lastError;
    for (final address in host.addresses) {
      try {
        await _verifyAddress(host, address);
        return address;
      } on HandshakeException {
        rethrow;
      } on FormatException {
        rethrow;
      } on Object catch (error) {
        lastError = error;
        if (_closed) rethrow;
      }
    }
    throw lastError ?? const SocketException('Host unavailable');
  }

  Future<X509Certificate> _certificate(FactoryHost host, String address) async {
    final task = await _connect(address, host.httpsPort);
    _tasks.add(task);
    var pending = true;
    late Socket socket;
    try {
      socket = await task.socket
          .then((value) {
            if (!pending || _closed) {
              value.destroy();
              throw StateError('Connection closed');
            }
            return value;
          })
          .timeout(
            const Duration(seconds: 5),
            onTimeout: () {
              task.cancel();
              throw TimeoutException('Factory connection timeout');
            },
          );
    } finally {
      pending = false;
      _tasks.remove(task);
    }
    _sockets.add(socket);
    SecureSocket? secure;
    X509Certificate? certificate;
    var finished = false;
    try {
      if (_closed) throw StateError('Connection closed');
      try {
        secure =
            await SecureSocket.secure(
                  socket,
                  host: host.hostname,
                  context: SecurityContext(withTrustedRoots: false),
                  onBadCertificate: (value) {
                    certificate = value;
                    // 探测仅取公开证书并拒绝此握手，绝不在未验证连接上传输应用数据。
                    return false;
                  },
                )
                .then((value) {
                  if (finished || _closed) {
                    value.destroy();
                    throw StateError('Connection closed');
                  }
                  return value;
                })
                .timeout(const Duration(seconds: 5));
        certificate = secure.peerCertificate;
      } on HandshakeException {
        if (certificate == null) rethrow;
      }
      final value = certificate;
      if (_closed ||
          value == null ||
          sha256.convert(value.der).toString() != host.certificateSha256) {
        throw const HandshakeException('Factory certificate changed');
      }
      return value;
    } finally {
      finished = true;
      secure?.destroy();
      socket.destroy();
      _sockets.remove(socket);
    }
  }

  Future<Map<String, Object>> request(
    FactoryHost host,
    String address,
    Uri uri,
    String method,
    List<List<String>> headers,
    Uint8List body,
  ) async {
    if (!host.addresses.contains(address) ||
        !_sameOrigin(host, uri) ||
        !const {
          'GET',
          'HEAD',
          'POST',
          'PUT',
          'PATCH',
          'DELETE',
          'OPTIONS',
        }.contains(method) ||
        body.length > 64 * 1024 * 1024 ||
        headers.length > 128) {
      throw const FormatException('Invalid web request');
    }
    // 只转发原生网页请求，不定义员工登录API、不保存Cookie、不重试业务写入。
    return _exchange(
      host,
      address,
      uri,
      method,
      headers,
      body,
      64 * 1024 * 1024,
    );
  }

  bool _sameOrigin(FactoryHost host, Uri uri) =>
      uri.scheme == 'https' &&
      uri.host == host.hostname &&
      uri.port == host.httpsPort &&
      uri.userInfo.isEmpty &&
      !uri.hasFragment &&
      !uri.path.contains('\\');

  Future<void> _verifyAddress(FactoryHost host, String address) async {
    final result = await _exchange(
      host,
      address,
      host.statusUri,
      'GET',
      [
        [HttpHeaders.acceptHeader, 'application/json'],
      ],
      Uint8List(0),
      8192,
    );
    if (result['status'] != HttpStatus.ok) {
      throw const HttpException('Factory unavailable');
    }
    final json = jsonDecode(utf8.decode(result['body']! as Uint8List));
    if (json is! Map<String, dynamic> ||
        json['ok'] != true ||
        json['realtime_available'] != false ||
        !host.sameIdentity(FactoryHost.fromJson(json))) {
      throw const FormatException('Factory status identity mismatch');
    }
    // 状态页不能更新固定地址；网络地址变化不能被响应覆盖。
  }

  Future<Map<String, Object>> _exchange(
    FactoryHost host,
    String address,
    Uri uri,
    String method,
    List<List<String>> headers,
    Uint8List body,
    int limit,
  ) async {
    final certificate = await _certificate(host, address);
    if (_closed) throw StateError('Connection closed');
    final context = SecurityContext(withTrustedRoots: false)
      // Dart在iOS接收单张DER证书，其余平台接收PEM证书链。
      ..setTrustedCertificatesBytes(
        Platform.isIOS ? certificate.der : utf8.encode(certificate.pem),
      );
    // 自定义connectionFactory接管整个连接，必须先完成TLS再交给HttpClient。
    final client = HttpClient(context: context)
      ..connectionTimeout = const Duration(seconds: 5)
      ..findProxy = (_) => 'DIRECT';
    _clients.add(client);
    final owned = <Socket>{};
    client.connectionFactory = (uri, proxyHost, proxyPort) async {
      if (_closed ||
          !_sameOrigin(host, uri) ||
          proxyHost != null ||
          proxyPort != null) {
        throw const HandshakeException('Unexpected factory destination');
      }
      final task = await _connect(address, host.httpsPort);
      var cancelled = false;
      Socket? raw;
      SecureSocket? secure;
      final connected = task.socket
          .then((socket) {
            raw = socket;
            owned.add(socket);
            if (_closed || cancelled) {
              socket.destroy();
              throw StateError('Connection closed');
            }
            // 此处没有放行回调：受信证书仍须通过有效期、链和固定hostname验证。
            return SecureSocket.secure(
              socket,
              host: host.hostname,
              context: context,
            );
          })
          .then((socket) {
            secure = socket;
            owned.add(socket);
            final presented = socket.peerCertificate;
            if (_closed ||
                cancelled ||
                presented == null ||
                sha256.convert(presented.der).toString() !=
                    host.certificateSha256) {
              socket.destroy();
              throw const HandshakeException('Factory certificate changed');
            }
            return socket;
          });
      return ConnectionTask.fromSocket(connected, () {
        cancelled = true;
        task.cancel();
        raw?.destroy();
        secure?.destroy();
      });
    };
    try {
      return await (() async {
        final request = await client.openUrl(method, uri);
        request.followRedirects = false;
        client.autoUncompress = false;
        const removed = {
          'host',
          'connection',
          'content-length',
          'transfer-encoding',
          'proxy-authorization',
          'proxy-connection',
          'upgrade',
          'te',
          'trailer',
          'expect',
        };
        for (final header in headers) {
          if (header.length != 2 ||
              header.any(
                (value) =>
                    value.contains('\r') ||
                    value.contains('\n') ||
                    value.contains('\u0000'),
              )) {
            throw const FormatException('Invalid web headers');
          }
          if (!removed.contains(header[0].toLowerCase())) {
            request.headers.add(header[0], header[1]);
          }
        }
        request.contentLength = body.length;
        request.add(body);
        final response = await request.close();
        final presented = response.certificate;
        if (presented == null ||
            sha256.convert(presented.der).toString() !=
                host.certificateSha256) {
          throw const HandshakeException('Factory certificate changed');
        }
        if (response.contentLength > limit) {
          throw const FormatException('Response too large');
        }
        final bytes = <int>[];
        await for (final chunk in response) {
          if (bytes.length + chunk.length > limit) {
            throw const FormatException('Response too large');
          }
          bytes.addAll(chunk);
        }
        if (_closed) throw StateError('Connection closed');
        final responseHeaders = <List<String>>[];
        response.headers.forEach((name, values) {
          if (!const {
            'connection',
            'transfer-encoding',
            'keep-alive',
            'proxy-authenticate',
            'upgrade',
            'trailer',
          }.contains(name.toLowerCase())) {
            for (final value in values) {
              responseHeaders.add([name, value]);
            }
          }
        });
        return <String, Object>{
          'status': response.statusCode,
          'headers': responseHeaders,
          'body': Uint8List.fromList(bytes),
        };
      })().timeout(Duration(seconds: limit == 8192 ? 10 : 120));
    } finally {
      client.close(force: true);
      for (final socket in owned) {
        socket.destroy();
      }
      _clients.remove(client);
    }
  }

  void close() {
    _closed = true;
    for (final task in _tasks) {
      task.cancel();
    }
    for (final socket in _sockets) {
      socket.destroy();
    }
    for (final client in _clients) {
      client.close(force: true);
    }
    _sockets.clear();
    _tasks.clear();
    _clients.clear();
  }
}
