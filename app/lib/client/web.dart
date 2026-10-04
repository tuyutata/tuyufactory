import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:tuyufactory/client/host_connection.dart';
import 'package:tuyufactory/client/mdns_discovery.dart';
import 'package:tuyufactory/client/pinned_https_client.dart';
import 'package:tuyufactory/client/relay.dart';

/// 原生容器只接收公开主机资料；此通道没有SDK对象、钱包或签名方法。
class FactoryWeb extends ChangeNotifier {
  FactoryWeb(
    this.connection, {
    PinnedHttpsClient Function()? client,
    Relay Function()? relay,
    bool? windows,
  }) : _newClient = client ?? PinnedHttpsClient.new,
       _newRelay = relay ?? Relay.new,
       _windows = windows ?? Platform.isWindows {
    _channel.setMethodCallHandler(_handle);
    connection.addListener(_connectionChanged);
  }

  final HostConnection connection;
  final MethodChannel _channel = const MethodChannel('tuyufactory/web');
  final PinnedHttpsClient Function() _newClient;
  final Relay Function() _newRelay;
  final bool _windows;
  PinnedHttpsClient? _client;
  Relay? _relay;
  FactoryHost? _host;
  String? _address;
  int _generation = 0;
  int _requests = 0;
  bool _disposed = false;
  bool opening = false;
  bool opened = false;
  bool failed = false;

  Future<void> open() async {
    if (_disposed ||
        opening ||
        opened ||
        connection.status != HostConnectionStatus.ready) {
      return;
    }
    final host = connection.host;
    if (host == null) return;
    final generation = ++_generation;
    opening = true;
    failed = false;
    notifyListeners();
    final client = _client = _newClient();
    Relay? relay;
    try {
      final address = await client.selectAddress(host);
      if (!_current(generation, host)) return;
      _host = host;
      _address = address;
      final origin = _windows
          ? host.statusUri.origin
          : (await (relay = _relay = _newRelay()).start(host, address)).origin;
      if (!_current(generation, host)) return;
      await _channel.invokeMethod<void>('open', {
        ...host.toJson(),
        'origin': origin,
        'generation': generation,
      });
      if (!_current(generation, host)) {
        await _channel.invokeMethod<void>('close', {'generation': generation});
        return;
      }
      opened = true;
    } on Object {
      if (!_disposed && generation == _generation) {
        failed = true;
        await close();
      }
    } finally {
      if (!opened || generation != _generation) {
        client.close();
        await relay?.close();
      }
      if (!_disposed && generation == _generation) {
        opening = false;
        notifyListeners();
      }
    }
  }

  bool _current(int generation, FactoryHost host) =>
      !_disposed &&
      generation == _generation &&
      (connection.status == HostConnectionStatus.ready ||
          connection.status == HostConnectionStatus.connecting) &&
      connection.host?.sameIdentity(host) == true;

  void _connectionChanged() {
    if ((connection.status != HostConnectionStatus.ready &&
            connection.status != HostConnectionStatus.connecting) ||
        (_host != null && connection.host?.sameIdentity(_host!) != true)) {
      unawaited(close());
    }
  }

  Future<Object?> _handle(MethodCall call) async {
    final arguments = call.arguments;
    if (arguments is! Map || arguments['generation'] != _generation) {
      // 旧窗口的关闭通知、下载或POST不能作用于新窗口。
      if (call.method == 'closed' || call.method == 'failed') return null;
      throw PlatformException(code: 'web_unavailable');
    }
    if (call.method == 'closed' || call.method == 'failed') {
      if (call.method == 'failed') failed = true;
      await close(notifyNative: false);
      return null;
    }
    final host = _host;
    final address = _address;
    final client = _client;
    if (call.method != 'request' ||
        !_windows ||
        _disposed ||
        (!opening && !opened) ||
        host == null ||
        address == null ||
        client == null ||
        (connection.status != HostConnectionStatus.ready &&
            connection.status != HostConnectionStatus.connecting) ||
        _requests >= 32) {
      throw PlatformException(code: 'web_unavailable');
    }
    final generation = _generation;
    _requests++;
    try {
      final data = (call.arguments as Map).cast<String, Object?>();
      final uri = Uri.parse(data['url']! as String);
      final body = data['body'] as Uint8List? ?? Uint8List(0);
      final headers = (data['headers']! as List)
          .map((entry) => (entry as List).cast<String>())
          .toList();
      final response = await client.request(
        host,
        address,
        uri,
        data['method']! as String,
        headers,
        body,
      );
      if (!_current(generation, host)) throw StateError('Web closed');
      return response;
    } on Object {
      // MethodChannel错误只能包含公开短码，不回显URL、Cookie或员工提交内容。
      throw PlatformException(code: 'web_request_failed');
    } finally {
      _requests--;
    }
  }

  Future<void> close({bool notifyNative = true}) async {
    final generation = _generation;
    ++_generation;
    opening = false;
    opened = false;
    _client?.close();
    _client = null;
    final relay = _relay;
    _relay = null;
    _host = null;
    _address = null;
    await relay?.close();
    if (notifyNative && generation > 0) {
      try {
        await _channel.invokeMethod<void>('close', {'generation': generation});
      } on Object {
        // 即使原生关闭失败，固定连接也已断开，不能继续发送业务请求。
        failed = true;
      }
    }
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    if (_disposed) return;
    _disposed = true;
    connection.removeListener(_connectionChanged);
    _channel.setMethodCallHandler(null);
    unawaited(close());
    super.dispose();
  }
}
