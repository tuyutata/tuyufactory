import 'dart:convert';
import 'dart:ffi';
import 'dart:io';
import 'dart:isolate';

import 'package:ffi/ffi.dart';

typedef _NativeNoInput = Pointer<Utf8> Function();
typedef _DartNoInput = Pointer<Utf8> Function();
typedef _NativeWithInput = Pointer<Utf8> Function(Pointer<Utf8>);
typedef _DartWithInput = Pointer<Utf8> Function(Pointer<Utf8>);
typedef _NativeFree = Void Function(Pointer<Utf8>);
typedef _DartFree = void Function(Pointer<Utf8>);

final class FactoryStartRequest {
  const FactoryStartRequest({
    required this.installationDir,
    required this.dataDir,
    required this.runtimeDir,
    required this.instanceName,
  });

  final String installationDir;
  final String dataDir;
  final String runtimeDir;
  final String instanceName;

  Map<String, Object?> toJson() => {
    'installation_dir': installationDir,
    'data_dir': dataDir,
    'runtime_dir': runtimeDir,
    'instance_name': instanceName,
  };
}

final class NativeComponent {
  const NativeComponent({required this.id, required this.status, this.error});

  factory NativeComponent.fromJson(Map<String, Object?> json) =>
      NativeComponent(
        id: json['id'] as String,
        status: json['status'] as String,
        error: json['error'] as String?,
      );

  final String id;
  final String status;
  final String? error;
}

final class NativeRuntimeSnapshot {
  const NativeRuntimeSnapshot({
    required this.ready,
    required this.runtimeMaterialized,
    required this.components,
    this.httpsOrigin,
  });

  factory NativeRuntimeSnapshot.fromJson(
    Map<String, Object?> json,
  ) => NativeRuntimeSnapshot(
    ready: json['ready'] == true,
    runtimeMaterialized: json['runtime_materialized'] == true,
    httpsOrigin: json['https_origin'] as String?,
    components: (json['components'] as List<Object?>)
        .map(
          (value) =>
              NativeComponent.fromJson((value as Map).cast<String, Object?>()),
        )
        .toList(growable: false),
  );

  final bool ready;
  final bool runtimeMaterialized;
  final String? httpsOrigin;
  final List<NativeComponent> components;
}

final class AdministratorState {
  const AdministratorState({
    required this.initialized,
    required this.total,
    required this.active,
  });

  factory AdministratorState.fromJson(Map<String, Object?> json) =>
      AdministratorState(
        initialized: json['initialized'] == true,
        total: json['total'] as int,
        active: json['active'] as int,
      );

  final bool initialized;
  final int total;
  final int active;
}

final class GatewaySnapshot {
  const GatewaySnapshot({
    required this.enabled,
    required this.authenticated,
    required this.instanceId,
    required this.hostname,
    required this.httpsPort,
    required this.addresses,
    this.certificateSha256,
    this.error,
    required this.realtimeAvailable,
  });

  factory GatewaySnapshot.fromJson(Map<String, Object?> value) =>
      GatewaySnapshot(
        enabled: value['enabled'] as bool,
        authenticated: value['authenticated'] as bool,
        instanceId: value['instance_id'] as String,
        hostname: value['hostname'] as String,
        httpsPort: value['https_port'] as int,
        addresses: (value['addresses'] as List).cast<String>(),
        certificateSha256: value['certificate_sha256'] as String?,
        error: value['error'] as String?,
        realtimeAvailable: value['realtime_available'] as bool,
      );

  final bool enabled;
  final bool authenticated;
  final String instanceId;
  final String hostname;
  final int httpsPort;
  final List<String> addresses;
  final String? certificateSha256;
  final String? error;
  final bool realtimeAvailable;
}

abstract interface class FactoryNativeRuntime {
  Future<NativeRuntimeSnapshot> start(FactoryStartRequest request);
  Future<NativeRuntimeSnapshot> snapshot();
  Future<AdministratorState> administratorState();
  Future<void> initializeAdministrator({
    required String response,
    String? name,
  });
  Future<String> administratorChallenge();
  Future<void> completeLogin(String response);
  Future<GatewaySnapshot> employeeGatewaySnapshot();
  Future<GatewaySnapshot> enableEmployeeGateway();
  Future<GatewaySnapshot> disableEmployeeGateway();
  Future<void> stop();
}

final class FfiFactoryNativeRuntime implements FactoryNativeRuntime {
  const FfiFactoryNativeRuntime();

  @override
  Future<NativeRuntimeSnapshot> start(FactoryStartRequest request) =>
      Isolate.run(
        () => NativeRuntimeSnapshot.fromJson(
          _map(
            _invokeWithInput('tuyufactory_start', jsonEncode(request.toJson())),
          ),
        ),
      );

  @override
  Future<NativeRuntimeSnapshot> snapshot() => Isolate.run(
    () => NativeRuntimeSnapshot.fromJson(
      _map(_invokeWithoutInput('tuyufactory_runtime_snapshot')),
    ),
  );

  @override
  Future<AdministratorState> administratorState() => Isolate.run(
    () => AdministratorState.fromJson(
      _map(_invokeWithoutInput('tuyufactory_administrator_state')),
    ),
  );

  @override
  Future<void> initializeAdministrator({
    required String response,
    String? name,
  }) => Isolate.run(() {
    _map(
      _invokeWithInput(
        'tuyufactory_initialize_administrator',
        jsonEncode({'response': _decodeResponse(response), 'name': name}),
      ),
    );
  });

  @override
  Future<void> stop() => Isolate.run(() {
    _map(_invokeWithoutInput('tuyufactory_stop'));
  });

  @override
  Future<String> administratorChallenge() => Isolate.run(
    () => jsonEncode(
      _map(_invokeWithoutInput('tuyufactory_administrator_challenge')),
    ),
  );

  @override
  Future<void> completeLogin(String response) => Isolate.run(() {
    _map(
      _invokeWithInput(
        'tuyufactory_complete_login',
        jsonEncode(_decodeResponse(response)),
      ),
    );
  });

  @override
  Future<GatewaySnapshot> employeeGatewaySnapshot() => Isolate.run(
    () => GatewaySnapshot.fromJson(
      _map(_invokeWithoutInput('tuyufactory_employee_gateway_snapshot')),
    ),
  );

  @override
  Future<GatewaySnapshot> enableEmployeeGateway() => Isolate.run(
    () => GatewaySnapshot.fromJson(
      _map(_invokeWithoutInput('tuyufactory_enable_employee_gateway')),
    ),
  );

  @override
  Future<GatewaySnapshot> disableEmployeeGateway() => Isolate.run(
    () => GatewaySnapshot.fromJson(
      _map(_invokeWithoutInput('tuyufactory_disable_employee_gateway')),
    ),
  );
}

Object _decodeResponse(String response) {
  try {
    return jsonDecode(response) as Object;
  } on Object {
    // FormatException 默认会带原始输入；签名响应不得作为错误正文显示或记录。
    throw const FactoryNativeException('管理员签名响应格式无效');
  }
}

final class FactoryNativeException implements Exception {
  const FactoryNativeException(this.message);

  final String message;

  @override
  String toString() => message;
}

Map<String, Object?> _map(String encoded) {
  final value = jsonDecode(encoded);
  if (value is! Map) {
    throw const FormatException('厂家端原生响应不是 JSON 对象');
  }
  final envelope = value.cast<String, Object?>();
  if (envelope['ok'] != true) {
    final error = envelope['error'];
    final errorMap = error is Map
        ? error.cast<String, Object?>()
        : const <String, Object?>{};
    final message = errorMap['message'];
    final localized = message is Map
        ? message.cast<String, Object?>()
        : const <String, Object?>{};
    throw FactoryNativeException('${localized['zh_cn'] ?? '途遇厂家端本地服务不可用'}');
  }
  final data = envelope['data'];
  if (data is! Map) {
    throw const FormatException('厂家端原生响应数据不是 JSON 对象');
  }
  return data.cast<String, Object?>();
}

String _invokeWithoutInput(String symbol) {
  final library = _openLibrary();
  final call = library.lookupFunction<_NativeNoInput, _DartNoInput>(symbol);
  return _takeString(library, call());
}

String _invokeWithInput(String symbol, String payload) {
  final library = _openLibrary();
  final call = library.lookupFunction<_NativeWithInput, _DartWithInput>(symbol);
  final input = payload.toNativeUtf8();
  try {
    return _takeString(library, call(input));
  } finally {
    malloc.free(input);
  }
}

String _takeString(DynamicLibrary library, Pointer<Utf8> pointer) {
  if (pointer == nullptr) {
    throw const FormatException('厂家端原生响应为空');
  }
  final free = library.lookupFunction<_NativeFree, _DartFree>(
    'tuyufactory_string_free',
  );
  try {
    return pointer.toDartString();
  } finally {
    free(pointer);
  }
}

DynamicLibrary _openLibrary() {
  final executable = File(Platform.resolvedExecutable).parent;
  final names = switch (Platform.operatingSystem) {
    'macos' => [
      '${executable.path}/../Frameworks/libtuyufactory_native.dylib',
      'libtuyufactory_native.dylib',
    ],
    'linux' => [
      '${executable.path}/lib/libtuyufactory_native.so',
      'libtuyufactory_native.so',
    ],
    'windows' => [
      '${executable.path}\\tuyufactory_native.dll',
      'tuyufactory_native.dll',
    ],
    _ => const <String>[],
  };
  for (final name in names) {
    try {
      final library = DynamicLibrary.open(name);
      library.lookup<NativeFunction<_NativeNoInput>>('tuyufactory_start');
      return library;
    } on ArgumentError {
      // 继续检查当前平台的下一个正式打包位置。
    }
  }
  throw UnsupportedError('当前安装包没有携带途遇厂家端原生运行库');
}
