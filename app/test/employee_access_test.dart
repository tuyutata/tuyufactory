import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tuyufactory/host/employee_access_controller.dart';
import 'package:tuyufactory/host/employee_access_page.dart';
import 'package:tuyufactory/host/native_runtime.dart';
import 'package:tuyufactory/shared/l10n/app_localizations.dart';

void main() {
  test('未认证会话不能发起网关启停', () async {
    final native = TestNative();
    final controller = EmployeeAccessController(native);
    await controller.refresh();
    await controller.enable();
    await controller.disable();
    expect(native.enables, 0);
    expect(native.disables, 0);
    expect(controller.error, isNotNull);
    controller.dispose();
  });

  test('认证后启停转交真实接口，失败立即撤下旧权限', () async {
    final native = TestNative()..authenticated = true;
    final controller = EmployeeAccessController(native);
    await controller.refresh();
    await controller.enable();
    expect(controller.snapshot!.enabled, isTrue);
    await controller.disable();
    expect(controller.snapshot!.enabled, isFalse);
    native.error = '网关测试失败';
    await controller.enable();
    expect(controller.snapshot, isNull);
    expect(controller.error, contains('网关测试失败'));
    expect(native.enables, 2);
    controller.dispose();
  });

  test('并发点击仅接纳一次，销毁后不通知已释放页面', () async {
    final native = TestNative()..pending = Completer<GatewaySnapshot>();
    final controller = EmployeeAccessController(native);
    final first = controller.refresh();
    await controller.refresh();
    expect(native.refreshes, 1);
    controller.dispose();
    native.pending!.complete(native.value);
    await first;
  });

  test('登录必须先取挑战且提交后销毁挑战，错误不能重放', () async {
    final native = TestNative();
    final controller = EmployeeAccessController(native);
    await controller.login('{}');
    expect(native.logins, 0);
    await controller.createChallenge();
    native.error = '签名测试失败';
    await controller.login('{}');
    expect(controller.challenge, isNull);
    expect(controller.snapshot, isNull);
    await controller.login('{}');
    expect(native.logins, 1);
    controller.dispose();
  });

  for (final locale in ['zh', 'en']) {
    testWidgets('管理页显示真实状态与授权按钮：$locale', (tester) async {
      tester.view.physicalSize = const Size(900, 1200);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final native = TestNative();
      final controller = EmployeeAccessController(native);
      await tester.pumpWidget(
        MaterialApp(
          locale: Locale(locale),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: Scaffold(
            body: SingleChildScrollView(
              child: EmployeeAccessPage(controller: controller),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      final enable = locale == 'zh' ? '启用局域网访问' : 'Enable LAN access';
      final disable = locale == 'zh' ? '停止局域网访问' : 'Stop LAN access';
      expect(find.text(enable), findsNothing);
      native.authenticated = true;
      await controller.refresh();
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, enable));
      await tester.pumpAndSettle();
      expect(native.enables, 1);
      expect(find.text('https://factory.local:59460'), findsOneWidget);
      await tester.tap(find.widgetWithText(OutlinedButton, disable));
      await tester.pumpAndSettle();
      expect(native.disables, 1);
      expect(find.text('https://factory.local:59460'), findsNothing);
      await tester.pumpWidget(const SizedBox.shrink());
      controller.dispose();
      expect(tester.takeException(), isNull);
    });
  }
}

// 厂家原生接口的受控测试输入，不实现 SDK、账户策略或上游业务。
class TestNative implements FactoryNativeRuntime {
  bool authenticated = false;
  bool enabled = false;
  String? error;
  int enables = 0, disables = 0, refreshes = 0, logins = 0;
  Completer<GatewaySnapshot>? pending;
  GatewaySnapshot get value => GatewaySnapshot(
    enabled: enabled,
    authenticated: authenticated,
    instanceId: 'test-instance',
    hostname: 'factory.local',
    httpsPort: 59460,
    addresses: const ['192.0.2.10'],
    realtimeAvailable: false,
  );
  @override
  Future<GatewaySnapshot> employeeGatewaySnapshot() async {
    refreshes++;
    return pending?.future ?? value;
  }

  @override
  Future<GatewaySnapshot> enableEmployeeGateway() async {
    enables++;
    if (error != null) throw FactoryNativeException(error!);
    enabled = true;
    return value;
  }

  @override
  Future<GatewaySnapshot> disableEmployeeGateway() async {
    disables++;
    enabled = false;
    return value;
  }

  @override
  Future<String> administratorChallenge() async => '{}';
  @override
  Future<void> completeLogin(String response) async {
    logins++;
    if (error != null) throw FactoryNativeException(error!);
    authenticated = true;
  }

  @override
  Future<AdministratorState> administratorState() async =>
      const AdministratorState(initialized: true, total: 1, active: 1);
  @override
  Future<void> initializeAdministrator({
    required String response,
    String? name,
  }) async {}
  @override
  Future<NativeRuntimeSnapshot> snapshot() => throw StateError('unused');
  @override
  Future<NativeRuntimeSnapshot> start(FactoryStartRequest request) =>
      throw StateError('unused');
  @override
  Future<void> stop() async {}
}
