import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:tuyufactory/client/host_store.dart';
import 'package:tuyufactory/client/mdns_discovery.dart';
import 'package:tuyufactory/client/pinned_https_client.dart';

enum HostConnectionStatus {
  idle,
  discovering,
  awaitingTrust,
  connecting,
  ready,
  failed,
}

enum HostConnectionFailure {
  storage,
  discovery,
  noHost,
  multipleHosts,
  verification,
}

class HostConnection extends ChangeNotifier {
  HostConnection({
    HostStore? store,
    MdnsDiscovery? discovery,
    PinnedHttpsClient? client,
  }) : _store = store ?? HostStore(),
       _discovery = discovery ?? MdnsDiscovery(),
       _client = client ?? PinnedHttpsClient();

  final HostStore _store;
  final MdnsDiscovery _discovery;
  final PinnedHttpsClient _client;
  HostConnectionStatus status = HostConnectionStatus.idle;
  FactoryHost? host;
  HostConnectionFailure? failure;
  bool _disposed = false;
  Future<void>? _pending;
  Timer? _refresh;
  bool _monitoring = true;

  bool get busy => _pending != null;

  Future<void> start() => _run(() async {
    _set(HostConnectionStatus.connecting);
    failure = HostConnectionFailure.storage;
    final saved = await _store.load();
    if (_disposed) return;
    if (saved != null) {
      host = saved;
      failure = HostConnectionFailure.verification;
      await _client.verify(saved);
      if (!_disposed) _set(HostConnectionStatus.ready);
      return;
    }
    host = null;
    _set(HostConnectionStatus.discovering);
    failure = HostConnectionFailure.discovery;
    final candidates = await _discovery.discover();
    if (_disposed) return;
    if (candidates.length != 1) {
      failure = candidates.isEmpty
          ? HostConnectionFailure.noHost
          : HostConnectionFailure.multipleHosts;
      throw StateError('Exactly one factory required');
    }
    host = candidates.single;
    _set(HostConnectionStatus.awaitingTrust);
  });

  /// 用户核对主机屏幕的指纹后才进入连接；广播自身不构成信任。
  Future<void> trust() => _run(() async {
    final candidate = host;
    if (status != HostConnectionStatus.awaitingTrust || candidate == null) {
      return;
    }
    _set(HostConnectionStatus.connecting);
    failure = HostConnectionFailure.verification;
    await _client.verify(candidate);
    if (_disposed) return;
    failure = HostConnectionFailure.storage;
    await _store.save(candidate);
    if (!_disposed) _set(HostConnectionStatus.ready);
  });

  void cancelTrust() {
    if (busy || _disposed || status != HostConnectionStatus.awaitingTrust) {
      return;
    }
    host = null;
    _set(HostConnectionStatus.idle);
  }

  void setMonitoring(bool enabled) {
    _monitoring = enabled;
    _refresh?.cancel();
    if (enabled && !_disposed && status == HostConnectionStatus.ready) {
      unawaited(start());
    }
  }

  Future<void> _run(Future<void> Function() action) {
    if (_disposed) return Future.value();
    if (_pending case final pending?) return pending;
    _refresh?.cancel();
    // 先登记单飞操作再通知页面，防止监听器重入触发第二次保存。
    final completion = Completer<void>();
    _pending = completion.future;
    unawaited(() async {
      try {
        await action();
      } on Object {
        if (!_disposed) _set(HostConnectionStatus.failed);
      } finally {
        _pending = null;
        if (!_disposed) {
          notifyListeners();
          if (_monitoring && status == HostConnectionStatus.ready) {
            _refresh = Timer(
              const Duration(seconds: 15),
              () => unawaited(start()),
            );
          }
        }
        completion.complete();
      }
    }());
    return completion.future;
  }

  void _set(HostConnectionStatus value) {
    if (_disposed) return;
    status = value;
    if (value != HostConnectionStatus.failed) failure = null;
    notifyListeners();
  }

  @override
  void dispose() {
    if (_disposed) return;
    // App退出时先撤下网页连接；不能留下仍可写业务的原生窗口。
    status = HostConnectionStatus.idle;
    notifyListeners();
    _disposed = true;
    _refresh?.cancel();
    _discovery.close();
    _client.close();
    super.dispose();
  }
}
