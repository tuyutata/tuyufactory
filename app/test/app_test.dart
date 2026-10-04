import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/services.dart';
import 'package:zxing2/qrcode.dart';
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tuyufactory/host/app.dart';
import 'package:tuyufactory/host/app_scope.dart';
import 'package:tuyufactory/host/native_runtime.dart';
import 'package:tuyufactory/host/runtime_model.dart';

void main() {
  setUp(() {
    _cameraAvailable = false;
    _cameraOpen = true;
    _frame = const {};
    _releases = 0;
    _devicePending = null;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(const MethodChannel('flutter_lite_camera'), (call) async {
        switch (call.method) {
          case 'getDeviceList':
            if (_devicePending != null) return _devicePending!.future;
            return _cameraAvailable ? ['test-camera'] : <String>[];
          case 'open': return _cameraOpen;
          case 'startPreview': return 1;
          case 'captureFrame': return _frame;
          case 'stopPreview': return null;
          case 'release': _releases++; return null;
        }
        throw StateError('Unexpected camera test method');
      });
  });
  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(const MethodChannel('flutter_lite_camera'), null);
  });
  testWidgets('启动完成前不显示就绪或管理员表单', (tester) async {
    final native = _NativeRuntime();
    final runtime = await _mount(tester, native);

    expect(native.startCalls, 1);
    expect(runtime.phase, FactoryRuntimePhase.starting);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(find.textContaining('正在初始化厂家数据库'), findsOneWidget);
    expect(find.textContaining('厂家本地系统已经就绪'), findsNothing);
    expect(find.byType(TextField), findsNothing);
    expect(native.administratorStateCalls, 0);

    native.startResult.complete(_ready);
    await tester.pumpAndSettle();
    expect(runtime.phase, FactoryRuntimePhase.ready);
    expect(find.byType(CircularProgressIndicator), findsNothing);
  });

  testWidgets('厂家主机展示原生接口返回的就绪组件与 HTTPS 入口', (tester) async {
    final native = _NativeRuntime()..startResult.complete(_ready);
    final runtime = await _mount(tester, native);
    await tester.pumpAndSettle();

    expect(find.text('途遇厂家端'), findsOneWidget);
    expect(find.text('postgresql'), findsOneWidget);
    expect(find.text('erpnext'), findsOneWidget);
    expect(find.text('已就绪'), findsNWidgets(2));
    expect(find.textContaining(_ready.httpsOrigin!), findsOneWidget);
    expect(runtime.runtimeMaterialized, isTrue);
    expect(runtime.administratorInitialized, isTrue);
    expect(native.administratorStateCalls, 1);
    expect(find.byType(TextField), findsNothing);
  });

  testWidgets('未初始化安装显示统一途遇管理员入口', (tester) async {
    final native = _NativeRuntime()
      ..initialized = false
      ..startResult.complete(_ready);
    final runtime = await _mount(tester, native);
    await tester.pumpAndSettle();

    expect(runtime.phase, FactoryRuntimePhase.needsAdministrator);
    expect(find.text('设置管理员'), findsOneWidget);
    expect(find.byKey(const ValueKey('administrator-initialization-challenge-qr')), findsOneWidget);
    expect(find.text('QR_V1 签名响应'), findsNothing);
    expect(find.byType(TextField), findsOneWidget);
    expect(native.challengeCalls, 1);
    expect(find.textContaining('摄像头不可用'), findsOneWidget);
    expect(find.textContaining('厂家本地系统已经就绪'), findsNothing);
    expect(native.initializeCalls, isEmpty);
  });

  testWidgets('启动异常显示实际错误，重试重新调用原生启动', (tester) async {
    final native = _NativeRuntime();
    final runtime = await _mount(tester, native);
    native.startResult.completeError(const FactoryNativeException('测试启动失败'));
    await tester.pumpAndSettle();

    expect(runtime.phase, FactoryRuntimePhase.failed);
    expect(find.text('测试启动失败'), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
    expect(find.textContaining('厂家本地系统已经就绪'), findsNothing);
    expect(native.administratorStateCalls, 0);

    native.startResult = Completer<NativeRuntimeSnapshot>();
    await tester.tap(find.widgetWithText(FilledButton, '重新启动'));
    await tester.pump();
    expect(native.startCalls, 2);
    expect(runtime.phase, FactoryRuntimePhase.starting);
    expect(find.text('测试启动失败'), findsNothing);

    native.startResult.complete(_ready);
    await tester.pumpAndSettle();
    expect(runtime.phase, FactoryRuntimePhase.ready);
    expect(find.textContaining('厂家本地系统已经就绪'), findsOneWidget);
  });

  for (final initialized in [true, false]) {
    for (final error in ['测试组件失败', null]) {
      testWidgets('未就绪快照保留失败并可重试：管理员=$initialized，错误=$error', (tester) async {
        final native = _NativeRuntime()..initialized = initialized;
        final runtime = await _mount(tester, native);
        // 组件快照失败与抛异常分别覆盖；已有入口或管理员也不能掩盖失败。
        native.startResult.complete(
          NativeRuntimeSnapshot(
            ready: false,
            runtimeMaterialized: true,
            httpsOrigin: _ready.httpsOrigin,
            components: [
              const NativeComponent(id: 'postgresql', status: 'READY'),
              NativeComponent(id: 'erpnext', status: 'FAILED', error: error),
            ],
          ),
        );
        await tester.pumpAndSettle();

        expect(runtime.phase, FactoryRuntimePhase.failed);
        expect(runtime.error, error);
        expect(runtime.components.map((component) => component.state), [
          FactoryComponentState.ready,
          FactoryComponentState.failed,
        ]);
        expect(runtime.components.last.error, error);
        expect(find.textContaining(error ?? '厂家本地系统启动失败。'), findsWidgets);
        final retry = find.widgetWithText(FilledButton, '重新启动');
        expect(retry, findsOneWidget);
        expect(find.textContaining('厂家本地系统已经就绪'), findsNothing);
        expect(find.byType(TextField), findsNothing);
        expect(native.administratorStateCalls, 0);
        await runtime.initializeAdministrator(response: 'test-payload');
        expect(native.initializeCalls, isEmpty);

        native.startResult = Completer<NativeRuntimeSnapshot>();
        await tester.ensureVisible(retry);
        await tester.pumpAndSettle();
        await tester.tap(retry);
        await tester.pump();
        expect(native.startCalls, 2);
        expect(runtime.phase, FactoryRuntimePhase.starting);
        expect(runtime.error, isNull);
        expect(native.administratorStateCalls, 0);
        expect(find.byType(TextField), findsNothing);

        native.startResult.complete(_ready);
        await tester.pumpAndSettle();
        expect(
          runtime.phase,
          initialized
              ? FactoryRuntimePhase.ready
              : FactoryRuntimePhase.needsAdministrator,
        );
        expect(native.administratorStateCalls, 1);
        expect(runtime.administratorInitialized, initialized);
        expect(runtime.error, isNull);
        expect(
          runtime.components.every(
            (component) => component.state == FactoryComponentState.ready,
          ),
          isTrue,
        );
        expect(find.textContaining('测试组件失败'), findsNothing);
        expect(find.textContaining('厂家本地系统启动失败。'), findsNothing);
        expect(find.widgetWithText(FilledButton, '重新启动'), findsNothing);
        expect(
          find.byType(TextField),
          initialized ? findsNothing : findsOneWidget,
        );
        expect(
          find.textContaining('厂家本地系统已经就绪'),
          initialized ? findsOneWidget : findsNothing,
        );
      });
    }
  }


  testWidgets('实际摄像头帧识别后转交原生接口，提交期间不重复，成功进入系统', (tester) async {
    _cameraAvailable = true;
    _frame = _qrFrame('test-signed-response');
    final native = _NativeRuntime()..initialized = false..startResult.complete(_ready);
    final runtime = await _mount(tester, native);
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const ValueKey('administrator-name-field')), ' 测试管理员 ');
    await _waitForScan(tester, native);
    expect(runtime.initializingAdministrator, isTrue);
    expect(tester.widget<TextButton>(find.byKey(const ValueKey('refresh-administrator-qr'))).onPressed, isNull);
    await runtime.initializeAdministrator(response: 'duplicate');
    expect(native.initializeCalls, [('test-signed-response', '测试管理员')]);
    expect(runtime.administratorChallenge, isNull);
    native.initializeResult.complete();
    await tester.pumpAndSettle();
    expect(runtime.phase, FactoryRuntimePhase.ready);
    expect(find.textContaining('厂家本地系统已经就绪'), findsOneWidget);
    expect(_releases, 1);
  });

  testWidgets('验签失败不泄漏响应，刷新新挑战后可再次扫描，空姓名传空值', (tester) async {
    _cameraAvailable = true;
    _frame = _qrFrame('test-rejected-response');
    final native = _NativeRuntime()..initialized = false..startResult.complete(_ready);
    final runtime = await _mount(tester, native);
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const ValueKey('administrator-name-field')), '   ');
    await _waitForScan(tester, native);
    native.initializeResult.completeError(const FactoryNativeException('raw-sensitive-test-response'));
    await tester.pumpAndSettle();
    expect(runtime.phase, FactoryRuntimePhase.needsAdministrator);
    expect(find.byKey(const ValueKey('signature-error')), findsOneWidget);
    expect(find.textContaining('raw-sensitive-test-response'), findsNothing);
    expect(native.initializeCalls, [('test-rejected-response', null)]);
    expect(runtime.administratorChallenge, isNull);
    await runtime.initializeAdministrator(response: 'replay');
    expect(native.initializeCalls, hasLength(1));
    native.initializeResult = Completer<void>();
    _frame = _qrFrame('test-next-response');
    final refresh = find.byKey(const ValueKey('refresh-administrator-qr'));
    await tester.ensureVisible(refresh);
    await tester.tap(refresh);
    await tester.pumpAndSettle();
    expect(native.challengeCalls, 2);
    await _waitForScan(tester, native, count: 2);
    native.initializeResult.complete();
    await tester.pumpAndSettle();
    expect(runtime.phase, FactoryRuntimePhase.ready);
  });

  testWidgets('无法打开相机及畸形帧不能初始化，刷新后可恢复', (tester) async {
    _cameraAvailable = true;
    _cameraOpen = false;
    final native = _NativeRuntime()..initialized = false..startResult.complete(_ready);
    final runtime = await _mount(tester, native);
    await tester.pumpAndSettle();
    expect(find.textContaining('摄像头不可用'), findsOneWidget);
    expect(native.initializeCalls, isEmpty);
    _cameraOpen = true;
    _frame = {'data': Uint8List(3), 'width': 9000, 'height': 1};
    final refresh = find.byKey(const ValueKey('refresh-administrator-qr'));
    await tester.ensureVisible(refresh);
    await tester.tap(refresh);
    await tester.pumpAndSettle();
    await tester.pump(const Duration(milliseconds: 700));
    expect(native.initializeCalls, isEmpty);
    _frame = _qrFrame('test-recovered-response');
    await _waitForScan(tester, native);
    native.initializeResult.complete();
    await tester.pumpAndSettle();
    expect(runtime.phase, FactoryRuntimePhase.ready);
  });

  testWidgets('挑战失败显示可恢复错误，不创建文本粘贴旁路', (tester) async {
    final native = _NativeRuntime()..initialized = false..challengeFails = true
      ..startResult.complete(_ready);
    await _mount(tester, native);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('signature-error')), findsOneWidget);
    expect(find.byType(TextField), findsOneWidget);
    native.challengeFails = false;
    final refresh = find.byKey(const ValueKey('refresh-administrator-qr'));
    await tester.ensureVisible(refresh);
    await tester.tap(refresh);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('administrator-initialization-challenge-qr')), findsOneWidget);
  });

  testWidgets('页面退出后迟到的相机启动必须释放设备', (tester) async {
    _devicePending = Completer<List<String>>();
    final native = _NativeRuntime()..initialized = false..startResult.complete(_ready);
    await _mount(tester, native);
    await tester.pump();
    await tester.pumpWidget(const SizedBox.shrink());
    _devicePending!.complete(['test-camera']);
    await tester.pumpAndSettle();
    expect(_releases, 1);
    expect(native.initializeCalls, isEmpty);
  });

  testWidgets('初始化中退出不再通知旧页面或开放业务', (tester) async {
    _cameraAvailable = true;
    _frame = _qrFrame('test-exit-response');
    final native = _NativeRuntime()..initialized = false..startResult.complete(_ready);
    await _mount(tester, native);
    await tester.pumpAndSettle();
    await _waitForScan(tester, native);
    await tester.pumpWidget(const SizedBox.shrink());
    native.initializeResult.complete();
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  for (final language in ['zh', 'en']) {
    for (final size in [const Size(1200, 900), const Size(640, 720)]) {
      testWidgets('扫码页双语和正方形布局 ' + language + size.toString(), (tester) async {
        final native = _NativeRuntime()..initialized = false..startResult.complete(_ready);
        await _mount(tester, native, locale: Locale(language));
        tester.view.physicalSize = size;
        await tester.pumpAndSettle();
        expect(find.text('设置管理员'), findsOneWidget);
        expect(find.text('Set administrator'), findsOneWidget);
        for(final key in ['signature-request-panel', 'signature-response-panel']) {
          final panel = tester.getSize(find.byKey(ValueKey(key)));
          expect(panel.width, closeTo(panel.height, 0.01));
        }
        expect(tester.takeException(), isNull);
      });
    }
  }

  for (final (locale, title, ready) in [
    (const Locale('zh'), '途遇厂家端', '厂家本地系统已经就绪。'),
    (const Locale('en'), 'TuyuFactory', 'The local factory system is ready.'),
    (const Locale('fr'), '途遇厂家端', '厂家本地系统已经就绪。'),
  ]) {
    testWidgets('主机文案随语言选择且未提供的语言回退中文：$locale', (tester) async {
      final native = _NativeRuntime()..startResult.complete(_ready);
      await _mount(tester, native, locale: locale);
      await tester.pumpAndSettle();
      expect(find.text(title), findsOneWidget);
      expect(find.textContaining(ready), findsOneWidget);
    });
  }
}

const _ready = NativeRuntimeSnapshot(
  ready: true,
  runtimeMaterialized: true,
  httpsOrigin: 'https://127.0.0.1:59443',
  components: [
    NativeComponent(id: 'postgresql', status: 'READY'),
    NativeComponent(id: 'erpnext', status: 'READY'),
  ],
);

Future<FactoryRuntimeModel> _mount(
  WidgetTester tester,
  _NativeRuntime native, {
  Locale locale = const Locale('zh'),
}) async {
  tester.view.physicalSize = const Size(1200, 1800);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  // 使用生产模型和页面，只在现有原生接口处注入结果，不加载动态库或数据库。
  final runtime = FactoryRuntimeModel(nativeRuntime: native, start: false);
  await tester.pumpWidget(
    TuyuFactoryScope(
      runtime: runtime,
      startCitizenSdk: false,
      child: TuyuFactoryApp(locale: locale),
    ),
  );
  addTearDown(() async {
    await tester.pumpWidget(const SizedBox.shrink());
    // 只验证现有释放会转交 stop，不声称生产异步停机已等待完成。
    expect(native.stopCalls, 1);
    expect(tester.takeException(), isNull);
  });
  unawaited(runtime.initialize());
  await tester.pump();
  return runtime;
}

final class _NativeRuntime implements FactoryNativeRuntime {
  @override
  Future<String> administratorChallenge() async {
    challengeCalls++;
    if (challengeFails) throw const FactoryNativeException('raw-challenge-error');
    return jsonEncode({'test_challenge': challengeCalls});
  }
  int challengeCalls = 0;
  bool challengeFails = false;
  @override
  Future<void> completeLogin(String response) async {}
  @override
  Future<GatewaySnapshot> employeeGatewaySnapshot() async =>
      const GatewaySnapshot(
        enabled: false,
        authenticated: false,
        instanceId: 'test-installation',
        hostname: 'factory.local',
        httpsPort: 59460,
        addresses: [],
        realtimeAvailable: false,
      );
  @override
  Future<GatewaySnapshot> enableEmployeeGateway() =>
      throw StateError('not expected');
  @override
  Future<GatewaySnapshot> disableEmployeeGateway() =>
      throw StateError('not expected');
  var startResult = Completer<NativeRuntimeSnapshot>();
  var initializeResult = Completer<void>();
  var initialized = true;
  var startCalls = 0;
  var administratorStateCalls = 0;
  var stopCalls = 0;
  final initializeCalls = <(String, String?)>[];

  @override
  Future<NativeRuntimeSnapshot> start(FactoryStartRequest request) {
    startCalls += 1;
    return startResult.future;
  }

  @override
  Future<AdministratorState> administratorState() async {
    administratorStateCalls += 1;
    return AdministratorState(
      initialized: initialized,
      total: initialized ? 1 : 0,
      active: initialized ? 1 : 0,
    );
  }

  @override
  Future<void> initializeAdministrator({
    required String response,
    String? name,
  }) {
    initializeCalls.add((response, name));
    return initializeResult.future;
  }

  @override
  Future<NativeRuntimeSnapshot> snapshot() =>
      throw StateError('本组启动和初始化测试不应请求刷新');

  @override
  Future<void> stop() async {
    stopCalls += 1;
  }
}

// 摄像头通道返回可解码RGB帧，验签仍通过原生接口替身隔离，不使用真实密钥。
bool _cameraAvailable = false;
bool _cameraOpen = true;
Map<String, Object?> _frame = const {};
int _releases = 0;
Completer<List<String>>? _devicePending;
Map<String, Object?> _qrFrame(String text) {
  final matrix = Encoder.encode(text, ErrorCorrectionLevel.m).matrix!;
  final size = (matrix.width + 8) * 6;
  final rgb = Uint8List(size * size * 3)..fillRange(0, size * size * 3, 255);
  for (var y = 0; y < matrix.height; y++) {
    for (var x = 0; x < matrix.width; x++) {
      if (matrix.get(x, y) != 1) continue;
      for (var dy = 0; dy < 6; dy++) {
        for (var dx = 0; dx < 6; dx++) {
          final offset = (((y + 4) * 6 + dy) * size + (x + 4) * 6 + dx) * 3;
          rgb[offset] = rgb[offset + 1] = rgb[offset + 2] = 0;
        }
      }
    }
  }
  return {'data': rgb, 'width': size, 'height': size};
}
Future<void> _waitForScan(WidgetTester tester, _NativeRuntime native, {int count = 1}) async {
  for(var i = 0; i < 100 && native.initializeCalls.length < count; i++) {
    await tester.pump(const Duration(milliseconds: 350));
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 10)));
  }
  await tester.pump();
  expect(native.initializeCalls, hasLength(count));
  expect(tester.takeException(), isNull);
}
