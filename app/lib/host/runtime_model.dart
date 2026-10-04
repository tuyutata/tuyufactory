import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:tuyufactory/host/native_runtime.dart';
import 'package:tuyufactory/host/employee_access_controller.dart';

enum FactoryRuntimePhase {
  starting,
  ready,
  needsAdministrator,
  failed,
  stopped,
}

enum FactoryComponentState { starting, ready, failed, stopped }

class FactoryRuntimeComponent {
  const FactoryRuntimeComponent({
    required this.id,
    required this.state,
    this.error,
  });

  final String id;
  final FactoryComponentState state;
  final String? error;
}

class FactoryRuntimeModel extends ChangeNotifier {
  FactoryRuntimeModel({FactoryNativeRuntime? nativeRuntime, bool start = true})
    : _native = nativeRuntime ?? const FfiFactoryNativeRuntime() {
    if (start) unawaited(initialize());
  }

  factory FactoryRuntimeModel.testing({
    required FactoryRuntimePhase phase,
    required List<FactoryRuntimeComponent> components,
    bool runtimeMaterialized = false,
    bool administratorInitialized = false,
    String? httpsOrigin,
    String? error,
  }) {
    final model = FactoryRuntimeModel(start: false);
    model
      .._phase = phase
      .._components = components
      .._runtimeMaterialized = runtimeMaterialized
      .._administratorInitialized = administratorInitialized
      .._httpsOrigin = httpsOrigin
      .._error = error;
    return model;
  }

  final FactoryNativeRuntime _native;
  late final employeeAccess = EmployeeAccessController(_native);
  String? administratorChallenge;
  bool _disposed = false;
  int _operationGeneration = 0;

  Future<void> createAdministratorChallenge() async {
    if (_disposed || _phase != FactoryRuntimePhase.needsAdministrator ||
        _initializingAdministrator) return;
    final generation = _operationGeneration;
    _initializingAdministrator = true;
    administratorChallenge = null;
    _error = null;
    notifyListeners();
    try {
      final challenge = await _native.administratorChallenge();
      if (_disposed || generation != _operationGeneration) return;
      if (challenge.isEmpty) throw const FormatException('Empty challenge');
      administratorChallenge = challenge;
    } on Object {
      if (_disposed || generation != _operationGeneration) return;
      _error = '无法获取管理员二维码，请重试。';
    } finally {
      if (!_disposed && generation == _operationGeneration) {
        _initializingAdministrator = false;
        notifyListeners();
      }
    }
  }

  FactoryRuntimePhase _phase = FactoryRuntimePhase.starting;
  List<FactoryRuntimeComponent> _components = const [];
  bool _runtimeMaterialized = false;
  bool _administratorInitialized = false;
  bool _initializingAdministrator = false;
  Future<void>? _stopping;
  String? _httpsOrigin;
  String? _error;

  FactoryRuntimePhase get phase => _phase;
  List<FactoryRuntimeComponent> get components => _components;
  bool get runtimeMaterialized => _runtimeMaterialized;
  bool get administratorInitialized => _administratorInitialized;
  bool get initializingAdministrator => _initializingAdministrator;
  String? get httpsOrigin => _httpsOrigin;
  String? get error => _error;

  Future<void> initialize() async {
    if (_disposed) return;
    final generation = ++_operationGeneration;
    administratorChallenge = null;
    _initializingAdministrator = false;
    _phase = FactoryRuntimePhase.starting;
    _error = null;
    notifyListeners();
    try {
      final paths = _runtimePaths();
      final snapshot = await _native.start(
        FactoryStartRequest(
          installationDir: paths.installationDir,
          dataDir: paths.dataDir,
          runtimeDir: paths.runtimeDir,
          instanceName: 'TuyuFactory',
        ),
      );
      if (_disposed || generation != _operationGeneration) return;
      _apply(snapshot);
      // 管理员是否存在不能证明主机已就绪；未就绪时保留组件失败及其错误。
      if (snapshot.ready) {
        final state = await _native.administratorState();
        if (_disposed || generation != _operationGeneration) return;
        _administratorInitialized = state.initialized;
        _phase = state.initialized
            ? FactoryRuntimePhase.ready
            : FactoryRuntimePhase.needsAdministrator;
      }
    } catch (value) {
      if (_disposed || generation != _operationGeneration) return;
      _phase = FactoryRuntimePhase.failed;
      _error = value.toString();
    }
    notifyListeners();
  }

  Future<void> initializeAdministrator({
    required String response,
    String? name,
  }) async {
    if (_disposed || _phase != FactoryRuntimePhase.needsAdministrator ||
        _initializingAdministrator || administratorChallenge == null ||
        response.trim().isEmpty) {
      return;
    }
    final generation = _operationGeneration;
    // 每次挑战只接收一帧响应；成败都必须重新请求，禁止复用旧摄像头结果。
    administratorChallenge = null;
    _initializingAdministrator = true;
    _error = null;
    notifyListeners();
    try {
      await _native.initializeAdministrator(
        response: response.trim(),
        name: name?.trim().isEmpty == true ? null : name?.trim(),
      );
      if (_disposed || generation != _operationGeneration) return;
      _administratorInitialized = true;
      _phase = FactoryRuntimePhase.ready;
    } on Object {
      if (_disposed || generation != _operationGeneration) return;
      _error = '管理员验证失败，请刷新二维码重试。';
    } finally {
      if (!_disposed && generation == _operationGeneration) {
        _initializingAdministrator = false;
        notifyListeners();
      }
    }
  }

  Future<void> refresh() async {
    if (_disposed) return;
    try {
      _apply(await _native.snapshot());
    } catch (value) {
      _phase = FactoryRuntimePhase.failed;
      _error = value.toString();
      notifyListeners();
    }
  }

  /// 正常退出必须等待厂家运行时停止完成，不能只依赖 [dispose] 的异步兜底。
  Future<void> stop() => _stopping ??= _stop();

  Future<void> _stop() async {
    if (_phase == FactoryRuntimePhase.stopped) return;
    _operationGeneration++;
    administratorChallenge = null;
    try {
      await _native.stop();
      _phase = FactoryRuntimePhase.stopped;
      notifyListeners();
    } on Object {
      _stopping = null;
      rethrow;
    }
  }

  void _apply(NativeRuntimeSnapshot snapshot) {
    _runtimeMaterialized = snapshot.runtimeMaterialized;
    _httpsOrigin = snapshot.httpsOrigin;
    _components = snapshot.components
        .map(
          (component) => FactoryRuntimeComponent(
            id: component.id,
            state: switch (component.status) {
              'READY' => FactoryComponentState.ready,
              'FAILED' => FactoryComponentState.failed,
              'STOPPED' => FactoryComponentState.stopped,
              _ => FactoryComponentState.starting,
            },
            error: component.error,
          ),
        )
        .toList(growable: false);
    if (!snapshot.ready) {
      _phase = FactoryRuntimePhase.failed;
      _error = snapshot.components
          .map((component) => component.error)
          .whereType<String>()
          .firstOrNull;
    }
  }

  @override
  void notifyListeners() {
    // 原生停机和启动可能晚于页面销毁结束，不再通知已释放的订阅者。
    if (!_disposed) super.notifyListeners();
  }

  @override
  void dispose() {
    if (_disposed) return;
    _disposed = true;
    _operationGeneration++;
    administratorChallenge = null;
    employeeAccess.dispose();
    if (_phase != FactoryRuntimePhase.stopped) {
      // 强制销毁不可等待；可取消的桌面退出由 Scope 显式等待 [stop]。
      unawaited(stop().onError((_, _) {}));
    }
    super.dispose();
  }
}

final class _RuntimePaths {
  const _RuntimePaths({
    required this.installationDir,
    required this.dataDir,
    required this.runtimeDir,
  });

  final String installationDir;
  final String dataDir;
  final String runtimeDir;
}

_RuntimePaths _runtimePaths() {
  final executableDir = File(Platform.resolvedExecutable).parent;
  if (Platform.isMacOS) {
    final contents = executableDir.parent;
    final dataHome = Platform.environment['HOME'];
    if (dataHome == null || dataHome.isEmpty) {
      throw const FileSystemException('macOS 用户数据目录不可用');
    }
    return _RuntimePaths(
      installationDir: contents.path,
      runtimeDir: '${contents.path}/Resources/runtime',
      dataDir: '$dataHome/Library/Application Support/TuyuFactory',
    );
  }
  if (Platform.isLinux) {
    final home = Platform.environment['HOME'];
    final dataHome =
        Platform.environment['XDG_DATA_HOME'] ??
        (home == null ? null : '$home/.local/share');
    if (dataHome == null || dataHome.isEmpty) {
      throw const FileSystemException('Linux 用户数据目录不可用');
    }
    return _RuntimePaths(
      installationDir: executableDir.path,
      runtimeDir: '${executableDir.path}/runtime',
      dataDir: '$dataHome/TuyuFactory',
    );
  }
  if (Platform.isWindows) {
    final dataHome = Platform.environment['LOCALAPPDATA'];
    if (dataHome == null || dataHome.isEmpty) {
      throw const FileSystemException('Windows 用户数据目录不可用');
    }
    return _RuntimePaths(
      installationDir: executableDir.path,
      runtimeDir: '${executableDir.path}\\runtime',
      dataDir: '$dataHome\\TuyuFactory',
    );
  }
  throw UnsupportedError('途遇厂家端不支持当前桌面平台');
}
