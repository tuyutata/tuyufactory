import 'package:flutter/foundation.dart';
import 'package:tuyufactory/host/native_runtime.dart';

/// 只保存本机基础设施状态；授权与账户策略由 Rust 的唯一账户依赖负责。
class EmployeeAccessController extends ChangeNotifier {
  EmployeeAccessController(this.native);

  final FactoryNativeRuntime native;
  GatewaySnapshot? snapshot;
  bool busy = false;
  String? error;
  String? challenge;
  bool _disposed = false;

  Future<void> refresh() => _run(() async {
    snapshot = await native.employeeGatewaySnapshot();
  });

  Future<void> enable() => _run(() async {
    if (snapshot?.authenticated != true) {
      throw StateError('Administrator authentication required');
    }
    snapshot = await native.enableEmployeeGateway();
  });

  Future<void> disable() => _run(() async {
    if (snapshot?.authenticated != true) {
      throw StateError('Administrator authentication required');
    }
    snapshot = await native.disableEmployeeGateway();
  });

  Future<void> createChallenge() => _run(() async {
    challenge = null;
    challenge = await native.administratorChallenge();
  });

  Future<void> login(String response) => _run(() async {
    if (challenge == null) throw StateError('Administrator challenge required');
    // 挑战是一次性的；失败后也必须重新取得挑战，不能重放签名。
    challenge = null;
    await native.completeLogin(response.trim());
    snapshot = await native.employeeGatewaySnapshot();
  });

  Future<void> _run(Future<void> Function() operation) async {
    if (busy || _disposed) return;
    busy = true;
    error = null;
    notifyListeners();
    try {
      await operation();
    } on Object catch (caught) {
      error = caught.toString();
      // 失败响应不能保留此前“已认证”的页面权限。
      snapshot = null;
    } finally {
      busy = false;
      if (!_disposed) notifyListeners();
    }
  }

  @override
  void dispose() {
    _disposed = true;
    challenge = null;
    super.dispose();
  }
}
