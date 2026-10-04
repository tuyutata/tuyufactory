import 'package:citizen_sdk/src/crypto/account_codec.dart';
import 'dart:async';
import 'package:citizen_sdk/citizen_sdk.dart';
import 'package:citizen_sdk/src/platform/citizen_sdk_platform.dart';
import 'package:flutter/material.dart';
import 'package:tuyufactory/client/connection_page.dart';
import 'package:tuyufactory/client/host_connection.dart';
import 'package:tuyufactory/shared/l10n/app_localizations.dart';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  walletEntryWidgetTests();
  test('分机钱包入口先于业务页面，取消不报错，SDK更换拒绝旧结果', () {
    final source = File('lib/client/connection_page.dart').readAsStringSync();
    final app = File('lib/client/app.dart').readAsStringSync();
    expect(source, contains('if (profile == null || widget.sdkStarting) return _walletEntry()'));
    expect(source, contains('await sdk.wallet.getProfile()'));
    expect(source, contains('CitizenSdkErrorCode.cancelled'));
    expect(source, contains('CitizenSdkErrorCode.authenticationCancelled'));
    expect(source, contains('!identical(sdk, widget.sdk)'));
    expect(source, contains('widget.onWalletReady()'));
    expect(source, isNot(contains('error.toString()')));
    expect(source, contains("Image.asset('tuyu_logo.png'"));
    expect(source, contains('SingleChildScrollView'));
    expect(source, isNot(contains('TextField(')));
    expect(app, contains('if (profile != null) _connectWalletHost()'));
    expect(app, contains('onWalletReady: _connectWalletHost'));
  });

  test('厂家两端直接消费固定Git CitizenSDK', () {
    final originalScript = File('scripts/project.mjs').resolveSymbolicLinksSync();
    final manifest = File('${File(originalScript).parent.parent.path}/pubspec.yaml').readAsStringSync();
    expect(manifest, contains('https://github.com/crcfrcn/citizensdk.git'));
    expect(manifest, contains('52b83f8f33a9424f3a92161da4f183678263ab7c'));
    expect(manifest, matches(RegExp(r'path: \.')));
    // 原始声明保持Git来源，Pub消费视图仅存在本轮工程。
    final ignore = File('.gitignore');
    if (ignore.existsSync()) {
      expect(ignore.readAsStringSync(), contains('/pubspec_overrides.yaml'));
    }

    final host = File('lib/host/app_scope.dart').readAsStringSync();
    final client = File('lib/client/app.dart').readAsStringSync();
    for (final source in [host, client]) {
      expect(source, contains("package:citizen_sdk/citizen_sdk.dart"));
      expect(source, contains('CitizenSdk.open()'));
      expect(
        source.indexOf('.events.listen('),
        lessThan(source.indexOf('await sdk.start()')),
      );
      expect(source, contains('await sdk.getCapabilities()'));
      expect(source, contains('await sdk.stop()'));
      expect(source, contains('await sdk.close()'));
      expect(source, isNot(contains('CitizenSdkClient')));
      expect(source, isNot(contains('CitizenSdkRuntime')));
    }
    expect(File('lib/shared/citizen_sdk.dart').existsSync(), isFalse);
    expect(File('lib/shared/citizen_sdk_runtime.dart').existsSync(), isFalse);
  });

  test('钱包安全界面只经 SDK 公开 API 打开', () {
    final pages = [
      File('lib/host/factory_home_page.dart').readAsStringSync(),
      File('lib/client/connection_page.dart').readAsStringSync(),
    ];
    for (final source in pages) {
      expect(source, contains('.wallet.create'));
      expect(source, contains('.wallet.importWallet'));
      expect(source, contains('.wallet.addAccounts'));
      expect(source, isNot(matches(RegExp(r'mnemonic|privateKey|seedPhrase'))));
    }
  });

  test('macOS 与 Windows 的 Host Client 安装身份固定且互不覆盖', () {
    final host = File('macos/Runner/Configs/Host.xcconfig').readAsStringSync();
    final client = File(
      'macos/Runner/Configs/Client.xcconfig',
    ).readAsStringSync();
    expect(host, contains('TUYU_FACTORY_BUNDLE_IDENTIFIER = com.tuyufactory'));
    expect(client, contains('com.tuyufactory.client'));
    expect(host, contains('TUYU_FACTORY_PRODUCT_NAME = TuyuFactory'));
    expect(client, contains('TUYU_FACTORY_PRODUCT_NAME = TuyuFactoryClient'));
    final windowsFile = File('windows/CMakeLists.txt');
    if (windowsFile.existsSync()) {
      final windows = windowsFile.readAsStringSync();
      expect(windows, contains('set(BINARY_NAME "tuyufactory")'));
      expect(windows, contains('set(BINARY_NAME "tuyufactory_client")'));
      expect(windows, contains('CITIZENSDK_APPLICATION_ID "com.tuyufactory"'));
      expect(
        windows,
        contains('CITIZENSDK_APPLICATION_ID "com.tuyufactory.client"'),
      );
    }
  });

  test('macOS使用标准插件并由产品构建入口传入SDK框架', () {
    final podfile = File('macos/Podfile').readAsStringSync();
    final contract = File('sdk-dependencies.json').readAsStringSync();
    final preparer = File('../scripts/sdk-dependencies.mjs').readAsStringSync();
    expect(podfile, contains('flutter_install_all_macos_pods'));
    expect(podfile, isNot(contains('File.symlink')));
    expect(contract, contains('"local"'));
    expect(contract, contains('"git"'));
    expect(contract, contains('"public"'));
    expect(preparer, contains("command !== 'prepare'"));
  });
}

// 仅替换 SDK 测试传输；实际页面与 CitizenSdk 公开门面照常执行。
final class _WalletEntryPlatform implements CitizenSdkPlatform {
  final controller = StreamController<Object?>.broadcast();
  CitizenSdkErrorCode error = CitizenSdkErrorCode.cancelled;
  Completer<void>? pending;
  int calls = 0;
  int sessions = 0;
  bool succeed = false;
  bool commit = true;
  bool failRead = false;
  Object? profile;
  Object publicProfile(String origin) {
    final id = '0x' + List.filled(64, '1').join();
    return [0, origin, '0', id, id,
      [[0, id, citizenSs58FromAccountId(id), 'Test account', '0', true]]];
  }
  @override
  Stream<Object?> get events => controller.stream;
  @override
  Future<Object?> invoke(String method, List<Object?> arguments) async {
    if (method == 'open') return [1, 'wallet-entry-' + (++sessions).toString(), 0, ['created', 1]];
    final header = [1, arguments[1], arguments[2]];
    if (method == 'close') return [...header, ['disposed']];
    if (method == 'getWalletProfile') {
      if (failRead) throw CitizenSdkException(code: CitizenSdkErrorCode.storage,
        message: 'fixture-read-error', sessionId: arguments[1]! as String,
        requestSequence: arguments[2]! as int);
      return [...header, [profile]];
    }
    if (method == 'createWallet' || method == 'importWallet') {
      calls++;
      await pending?.future;
      if (succeed) {
        final result = publicProfile(method == 'importWallet' ? 'imported' : 'created');
        if (commit) profile = result;
        return [...header, [result]];
      }
      // SDK 要求错误精确关联当前请求，测试也遵守同一传输合同。
      throw CitizenSdkException(code: error, message: 'fixture-error-not-for-display',
        sessionId: arguments[1]! as String, requestSequence: arguments[2]! as int);
    }
    throw StateError('Unexpected SDK test method: ' + method);
  }
}

void walletEntryWidgetTests() {
  late _WalletEntryPlatform platform;
  late CitizenSdk sdk;
  int walletReady = 0;
  int retries = 0;
  CitizenWalletProfile? initialProfile;
  late HostConnection connection;
  setUp(() async {
    walletReady = 0;
    retries = 0;
    initialProfile = null;
    platform = _WalletEntryPlatform();
    CitizenSdkPlatform.instance = platform;
    sdk = await CitizenSdk.open();
    connection = HostConnection();
  });
  tearDown(() async {
    connection.dispose();
    await sdk.close();
    
    CitizenSdkPlatform.instance = null;
    await platform.controller.close();
  });
  Widget page(String language, {bool starting = false, bool unavailable = false}) => MaterialApp(
    locale: Locale(language), supportedLocales: const [Locale('zh'), Locale('en')],
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    home: ConnectionPage(connection: connection, sdk: unavailable ? null : sdk,
      capabilities: CitizenCapabilitySnapshot(revision: BigInt.zero, statuses: [
        for (final name in CitizenCapabilityName.values)
          CitizenCapabilityStatus(name: name, supported: true, available: true,
            enabled: true, ready: true, reason: CitizenCapabilityReason.none),
       ]), profile: initialProfile, sdkStarting: starting, sdkError: null,
      onRetrySdk: () async { retries++; }, onWalletReady: () { walletReady++; }),
  );

  // 生产页面真实处理公开资料；仅磁盘位置和SDK传输由测试隔离。
  Future<void> waitForReady(WidgetTester tester) async {
    for (var i = 0; i < 100 && find.text('添加账户').evaluate().isEmpty; i++) {
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 10)));
      await tester.pump();
    }
    expect(find.text('添加账户'), findsOneWidget);
    expect(tester.takeException(), isNull);
  }
  for(final operation in ['create-wallet', 'import-wallet']) {
    testWidgets('wallet entry success ' + operation, (tester) async {
      platform.succeed = true;
      await tester.pumpWidget(page('zh'));
      await tester.pumpAndSettle();
      final action = find.byKey(ValueKey(operation));
      await tester.ensureVisible(action);
      await tester.tap(action);
      await waitForReady(tester);
      expect(platform.calls, 1);
      expect((await sdk.wallet.getProfile())!.origin,
        operation == 'create-wallet' ? CitizenWalletOrigin.created : CitizenWalletOrigin.imported);
      expect(walletReady, 1);
      expect(find.byKey(const ValueKey('create-wallet')), findsNothing);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }
  testWidgets('wallet entry existing committed profile skips setup', (tester) async {
    platform.profile = platform.publicProfile('created');
    initialProfile = await sdk.wallet.getProfile();
    await tester.pumpWidget(page('zh'));
    await waitForReady(tester);
    expect(platform.calls, 0);
    expect(find.byKey(const ValueKey('create-wallet')), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets('wallet entry uncommitted operation cannot enter business', (tester) async {
    platform.succeed = true;
    platform.commit = false;
    await tester.pumpWidget(page('zh'));
    await tester.pumpAndSettle();
    final action = find.byKey(const ValueKey('create-wallet'));
    await tester.ensureVisible(action);
    await tester.tap(action);
    await tester.pumpAndSettle();
    expect(find.text('添加账户'), findsNothing);
    expect(find.byKey(const ValueKey('create-wallet')), findsOneWidget);
    expect(walletReady, 0);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets('wallet entry committed operation with failed read stays closed', (tester) async {
    platform.succeed = true;
    await tester.pumpWidget(page('zh'));
    await tester.pumpAndSettle();
    platform.failRead = true;
    final action = find.byKey(const ValueKey('create-wallet'));
    await tester.ensureVisible(action);
    await tester.tap(action);
    await tester.pumpAndSettle();
    expect(find.text('添加账户'), findsNothing);
    expect(find.text('钱包操作失败，请重试。'), findsOneWidget);
    expect(find.textContaining('fixture-read-error'), findsNothing);
    expect(walletReady, 0);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets('wallet entry SDK starting failure retry and recovery', (tester) async {
    await tester.pumpWidget(page('zh', starting: true, unavailable: true));
    await tester.pump();
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(find.byKey(const ValueKey('create-wallet')), findsNothing);
    await tester.pumpWidget(page('zh', unavailable: true));
    await tester.pumpAndSettle();
    final retry = find.byKey(const ValueKey('retry-citizen-sdk'));
    await tester.ensureVisible(retry);
    await tester.tap(retry);
    expect(retries, 1);
    await tester.pumpWidget(page('zh'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('create-wallet')), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets('wallet entry disposal during operation ignores late result', (tester) async {
    platform.pending = Completer<void>();
    await tester.pumpWidget(page('zh'));
    await tester.pumpAndSettle();
    tester.widget<FilledButton>(find.byKey(const ValueKey('create-wallet'))).onPressed!();
    await tester.pump();
    await tester.pumpWidget(const SizedBox.shrink());
    platform.pending!.complete();
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  for (final language in ['zh', 'en']) {
    for (final size in [const Size(320, 640), const Size(640, 320)]) {
      testWidgets('wallet entry ' + language + ' ' + size.toString(), (tester) async {
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        await tester.pumpWidget(page(language));
        await tester.pumpAndSettle();
        expect(find.text('途遇厂家端'), findsOneWidget);
        expect(find.text('TuyuFactory'), findsOneWidget);
        expect(find.byType(TextField), findsNothing);
        await tester.ensureVisible(find.byKey(const ValueKey('import-wallet')));
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
      });
    }
  }
  for (final code in [CitizenSdkErrorCode.cancelled, CitizenSdkErrorCode.authenticationCancelled]) {
    testWidgets('wallet entry cancellation ' + code.name, (tester) async {
      platform.error = code;
      await tester.pumpWidget(page('zh'));
      await tester.pumpAndSettle();
      final action = find.byKey(ValueKey(code == CitizenSdkErrorCode.cancelled ? 'create-wallet' : 'import-wallet'));
      await tester.ensureVisible(action);
      await tester.tap(action);
      await tester.pumpAndSettle();
      expect(platform.calls, 1);
      expect(find.byKey(const ValueKey('create-wallet')), findsOneWidget);
      expect(find.text('钱包操作失败，请重试。'), findsNothing);
      expect(find.textContaining('fixture-error'), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }
  testWidgets('wallet entry failure remains retryable without raw errors', (tester) async {
    platform.error = CitizenSdkErrorCode.storage;
    await tester.pumpWidget(page('zh'));
    await tester.pumpAndSettle();
    final action = find.byKey(const ValueKey('create-wallet'));
    await tester.ensureVisible(action);
    await tester.tap(action);
    await tester.pumpAndSettle();
    expect(find.text('钱包操作失败，请重试。'), findsOneWidget);
    expect(find.textContaining('fixture-error'), findsNothing);
    
    expect(find.byKey(const ValueKey('create-wallet')), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets('wallet entry duplicate click uses one SDK operation', (tester) async {
    platform.pending = Completer<void>();
    await tester.pumpWidget(page('en'));
    await tester.pumpAndSettle();
    final button = tester.widget<FilledButton>(find.byKey(const ValueKey('create-wallet')));
    button.onPressed!();
    button.onPressed!();
    await tester.pump();
    expect(platform.calls, 1);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    platform.pending!.complete();
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('create-wallet')), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets('wallet entry ignores late failure from replaced SDK', (tester) async {
    platform.pending = Completer<void>();
    platform.error = CitizenSdkErrorCode.storage;
    await tester.pumpWidget(page('en'));
    await tester.pumpAndSettle();
    tester.widget<FilledButton>(find.byKey(const ValueKey('create-wallet'))).onPressed!();
    await tester.pump();
    final old = sdk;
    sdk = await CitizenSdk.open();
    await tester.pumpWidget(page('en'));
    await tester.pump();
    platform.pending!.complete();
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('create-wallet')), findsOneWidget);
    expect(find.text('The wallet operation failed. Try again.'), findsNothing);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    await old.close();
  });
}
