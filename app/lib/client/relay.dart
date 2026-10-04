import 'dart:async';
import 'dart:io';

import 'package:tuyufactory/client/mdns_discovery.dart';

/// 只搬运TLS密文：不解析HTTP、不持有证书私钥、不终止浏览器到主机的TLS。
class Relay {
  Relay({Future<Socket> Function(String, int)? connect})
    : _connect =
          connect ??
          ((address, port) => Socket.connect(
            address,
            port,
            timeout: const Duration(seconds: 5),
          ));

  final Future<Socket> Function(String, int) _connect;
  final Set<Socket> _sockets = {};
  ServerSocket? _server;
  bool _closed = false;
  bool _starting = false;
  int _active = 0;

  Future<Uri> start(FactoryHost host, String address) async {
    if (_closed ||
        _starting ||
        _server != null ||
        !host.addresses.contains(address)) {
      throw StateError('Relay unavailable');
    }
    _starting = true;
    late ServerSocket server;
    try {
      server = await ServerSocket.bind(
        InternetAddress.loopbackIPv4,
        0,
        shared: false,
      );
    } finally {
      _starting = false;
    }
    if (_closed) {
      await server.close();
      throw StateError('Relay closed');
    }
    _server = server;
    server.listen((socket) {
      if (_closed || _active >= 32) {
        socket.destroy();
        return;
      }
      _active++;
      unawaited(_forward(socket, address, host.httpsPort));
    }, onError: (Object _) => unawaited(close()));
    return Uri(scheme: 'https', host: '127.0.0.1', port: server.port);
  }

  Future<void> _forward(Socket local, String address, int port) async {
    Socket? remote;
    _sockets.add(local);
    try {
      remote = await _connect(address, port);
      _sockets.add(remote);
      if (_closed) return;
      // addStream按接收端背压转发；任一方向结束立即收回整个TLS通道。
      await Future.any([local.addStream(remote), remote.addStream(local)]);
    } on Object {
      // 传输失败由原生容器报告；这里不记录可能含业务内容的字节或异常。
    } finally {
      local.destroy();
      remote?.destroy();
      _sockets.remove(local);
      _sockets.remove(remote);
      _active--;
    }
  }

  Future<void> close() async {
    _closed = true;
    for (final socket in _sockets) {
      socket.destroy();
    }
    _sockets.clear();
    await _server?.close();
    _server = null;
  }
}
