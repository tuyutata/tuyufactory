import 'dart:convert';
import 'dart:typed_data';

import 'package:citizen_sdk/account_codec.dart';

import 'dart:async';

import 'package:citizen_sdk/citizen_sdk.dart';
import 'package:citizen_sdk/platform/citizen_sdk_platform.dart';
import 'package:flutter/material.dart';
import 'package:tuyufactory/client/connection_page.dart';
import 'package:tuyufactory/shared/product.dart';
import 'package:tuyufactory/client/host_connection.dart';
import 'package:tuyufactory/shared/l10n/app_localizations.dart';

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  walletEntryWidgetTests();
  test('分机钱包入口先于业务页面，取消不报错，SDK更换拒绝旧结果', () {
    final source = File('lib/client/connection_page.dart').readAsStringSync();
    final app = File('lib/client/app.dart').readAsStringSync();
    expect(
      source,
      contains('if (!walletReady(widget.walletState) || widget.sdkStarting)'),
    );
    expect(app, contains('sdk.wallet.getState().result'));
    expect(
      File('lib/shared/product.dart').readAsStringSync(),
      contains('CitizenSdkErrorCode.cancelled'),
    );
    expect(
      File('lib/shared/product.dart').readAsStringSync(),
      contains('CitizenSdkErrorCode.authenticationCancelled'),
    );
    expect(source, contains('!identical(sdk, widget.sdk)'));
    expect(source, contains('await widget.onWalletReady()'));
    expect(source, isNot(contains('error.toString()')));
    expect(source, contains("'tuyu_logo.png'"));
    expect(source, contains('SingleChildScrollView'));
    expect(source, isNot(contains('_walletProfile')));
    expect(
      app,
      contains('if (walletReady(_walletState)) _connectWalletHost()'),
    );
    expect(app, contains('onWalletReady: _refreshWalletAndConnect'));
  });

  test('厂家两端直接消费固定Git CitizenSDK', () {
    final originalScript = File('scripts/project.mjs')
        .resolveSymbolicLinksSync();
    final manifest = File(
      '${File(originalScript).parent.parent.path}/pubspec.yaml',
    ).readAsStringSync();
    expect(manifest, contains('https://github.com/crcfrcn/citizensdk.git'));
    final lock = File('${File(originalScript).parent.parent.path}/pubspec.lock')
        .readAsStringSync();
    final sha = RegExp(r'ref: ([a-f0-9]{40})').firstMatch(manifest)!.group(1)!;
    expect(
      RegExp(r'resolved-ref: "?([a-f0-9]{40})"?')
          .allMatches(lock)
          .single
          .group(1),
      sha,
    );
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
      expect(source, contains('CitizenSdk.open(credentialProvider:'));
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

  test('厂家主机和分机只共用一个钱包界面，状态与派生只归SDK', () {
    final source = File('lib/client/connection_page.dart').readAsStringSync();
    final host = File('lib/host/factory_home_page.dart').readAsStringSync();
    final wallet = File('lib/shared/product.dart').readAsStringSync();
    expect(wallet, contains('sdk.wallet.prepareCreation('));
    expect(wallet, contains('sdk.wallet.addNextAccount('));
    expect(host, contains('showWalletDialog('));
    for (final text in [source, host]) {
      expect(text, isNot(contains('wallet.getProfile(')));
      expect(text, isNot(contains('wallet.create(')));
      expect(text, isNot(contains('fold<int>')));
      expect(text, isNot(contains('_walletProfile')));
    }
  });

  test('macOS 与 Windows 的 Host Client 安装身份固定且互不覆盖', () {
    final host = File('macos/Runner/Configs/Host.xcconfig').readAsStringSync();
    final client = File('macos/Runner/Configs/Client.xcconfig')
        .readAsStringSync();
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

  test('macOS使用标准插件与产品锁定SDK声明', () {
    final podfile = File('macos/Podfile').readAsStringSync();
    final project = File('scripts/project.mjs').readAsStringSync();
    expect(podfile, contains('flutter_install_all_macos_pods'));
    expect(podfile, isNot(contains('File.symlink')));
    expect(project, contains('api.consume'));
    expect(project, contains('CITIZENSDK_PACKAGE'));
    expect(project, isNot(contains('localSdkMode')));
  });
}

// 仅模拟公开SDK通道；合成文本不是助记词，不冒充Core密码学或设备认证。
final class _WalletEntryPlatform implements CitizenSdkPlatform {
  final controller = StreamController<Object?>.broadcast();
  final calls = <String>[];
  final cancelled = <String>{};
  CitizenSdkErrorCode? failure;
  Completer<void>? pending;
  Completer<void>? backupPending;
  int releaseFailures = 0;
  bool committed = true,
      failRead = false,
      passwordValid = true,
      mnemonicValid = true;
  bool recovering = false, cleanupPending = false;
  bool cancellable = true;
  Object? profile;
  int sessions = 0,
      commitCalls = 0,
      releaseCalls = 0,
      reads = 0,
      validations = 0;
  Uint8List? backupRaw;
  Object publicProfile(String origin) {
    final id = '0x${'11' * 32}';
    return [
      0,
      origin,
      '0',
      id,
      id,
      [
        [0, id, citizenSs58FromAccountId(id), 'Fixture account', '0', true],
      ],
      'Fixture wallet',
    ];
  }

  List<Object?> state() {
    final id = '0x${'11' * 32}';
    return [
      '1',
      profile,
      profile == null
          ? <Object?>[]
          : [
              [
                'hot',
                0,
                0,
                id,
                citizenSs58FromAccountId(id),
                'Fixture account',
                '0',
                true,
              ],
            ],
      recovering || cleanupPending
          ? 2
          : profile == null
          ? 0
          : 1,
      cleanupPending,
      profile == null ? null : 0,
      <Object?>[],
    ];
  }

  @override
  Stream<Object?> get events => controller.stream;
  @override
  Future<Object?> invoke(String method, List<Object?> values) async {
    expect(values.first, 2);
    calls.add(method);
    if (method == 'open') {
      return [
        2,
        'wallet-session-${++sessions}',
        0,
        ['created', 1],
      ];
    }
    final header = [2, values[1], values[2]], key = '${values[1]}:${values[2]}';
    CitizenSdkException error(CitizenSdkErrorCode code) => CitizenSdkException(
      code: code,
      message: 'fixture-error-not-for-display',
      method: method,
      sessionId: values[1]! as String,
      requestSequence: values[2]! as int,
    );
    if (method == 'close') {
      return [
        ...header,
        ['disposed'],
      ];
    }
    if (method == 'getWalletState') {
      reads++;
      if (failRead) throw error(CitizenSdkErrorCode.storage);
      return [
        ...header,
        [state()],
      ];
    }
    if (method == 'validateWalletPassword') {
      return [
        ...header,
        [passwordValid ? 0 : 5, null],
      ];
    }
    if (method == 'validateWalletMnemonic') {
      validations++;
      return [
        ...header,
        [mnemonicValid ? 0 : 2, null],
      ];
    }
    if (method == 'cancelOperation') {
      if (!cancellable) {
        return [
          ...header,
          [false],
        ];
      }
      cancelled.add('${values[1]}:${values[3]}');
      if (pending != null && !pending!.isCompleted) pending!.complete();
      return [
        ...header,
        [true],
      ];
    }
    if (method == 'releasePreparedWallet') {
      releaseCalls++;
      if (releaseFailures > 0) {
        releaseFailures--;
        throw error(CitizenSdkErrorCode.busy);
      }
      return [...header, <Object?>[]];
    }
    if (method == 'copyRecoveryPhrase') {
      await backupPending?.future;
      backupRaw = Uint8List.fromList(utf8.encode('synthetic backup only'));
      return [
        ...header,
        [backupRaw],
      ];
    }
    if ([
      'prepareWalletCreation',
      'importWallet',
      'addNextWalletAccount',
      'commitWalletCreation',
    ].contains(method)) {
      await pending?.future;
      if (cancelled.contains(key)) throw error(CitizenSdkErrorCode.cancelled);
      if (failure != null) throw error(failure!);
      if (method == 'prepareWalletCreation') {
        return [
          ...header,
          ['prepared-${values[1]}'],
        ];
      }
      if (method == 'commitWalletCreation') commitCalls++;
      final result = publicProfile(
        method == 'importWallet' ? 'imported' : 'created',
      );
      if (committed) profile = result;
      return [
        ...header,
        [result],
      ];
    }
    throw StateError('Unconfigured SDK fixture method: $method');
  }
}

void walletEntryWidgetTests() {
  late _WalletEntryPlatform platform;
  late CitizenSdk sdk;
  final opened = <CitizenSdk>[];
  CitizenWalletState? initialState;
  late HostConnection connection;
  setUp(() async {
    platform = _WalletEntryPlatform();
    CitizenSdkPlatform.instance = platform;
    sdk = await CitizenSdk.open();
    opened.add(sdk);
    initialState = await sdk.wallet.getState().result;
    connection = HostConnection();
  });
  tearDown(() async {
    if (platform.pending != null && !platform.pending!.isCompleted) {
      platform.pending!.complete();
    }
    if (platform.backupPending != null &&
        !platform.backupPending!.isCompleted) {
      platform.backupPending!.complete();
    }
    for (final sdk in opened.reversed) {
      await sdk.close();
    }
    opened.clear();
    CitizenSdkPlatform.instance = null;
    connection.dispose();
    await platform.controller.close();
  });
  Widget page(String language) => MaterialApp(
    locale: Locale(language),
    supportedLocales: AppLocalizations.supportedLocales,
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    home: StatefulBuilder(
      builder: (context, setState) => ConnectionPage(
        connection: connection,
        sdk: sdk,
        capabilities: CitizenCapabilitySnapshot(
          revision: BigInt.zero,
          statuses: [
            for (final name in CitizenCapabilityName.values)
              CitizenCapabilityStatus(
                name: name,
                supported: true,
                available: true,
                enabled: true,
                ready: true,
                reason: CitizenCapabilityReason.none,
              ),
          ],
        ),
        walletState: initialState,
        sdkStarting: false,
        sdkError: null,
        onRetrySdk: () async {},
        onWalletReady: () async {
          try {
            final state = await sdk.wallet.getState().result;
            setState(() => initialState = state);
          } on Object {
            setState(() => initialState = null);
            rethrow;
          }
        },
      ),
    ),
  );
  Finder ready() => find.text('添加账户');
  Future<void> openAction(WidgetTester tester, String action) async {
    await tester.ensureVisible(find.byKey(ValueKey(action)));
    await tester.tap(find.byKey(ValueKey(action)));
    await tester.pumpAndSettle();
  }

  Future<void> submit(WidgetTester tester, {bool restore = false}) async {
    if (restore) {
      await tester.enterText(
        find.byKey(const ValueKey('wallet-mnemonic')),
        'synthetic recovery text',
      );
    }
    await tester.ensureVisible(find.byKey(const ValueKey('wallet-submit')));
    await tester.tap(find.byKey(const ValueKey('wallet-submit')));
    await tester.pumpAndSettle();
  }

  Future<void> confirm(WidgetTester tester) async {
    await tester.tap(find.byKey(const ValueKey('wallet-confirm')));
    await tester.pump();
    await submit(tester);
  }

  testWidgets('创建必须备份确认后才真实提交，随后释放准备资源', (tester) async {
    await tester.pumpWidget(page('zh'));
    await tester.pumpAndSettle();
    expect(find.byType(TextField), findsNothing);
    await openAction(tester, 'create-wallet');
    await submit(tester);
    expect(find.byKey(const ValueKey('wallet-backup')), findsOneWidget);
    expect(platform.commitCalls, 0);
    expect(ready(), findsNothing);
    expect(
      tester
          .widget<FilledButton>(find.byKey(const ValueKey('wallet-submit')))
          .onPressed,
      isNull,
    );
    expect(platform.backupRaw, everyElement(0));
    await confirm(tester);
    expect(ready(), findsOneWidget);
    expect(platform.commitCalls, 1);
    expect(platform.releaseCalls, 1);
    expect(
      platform.calls.where((x) => x == 'prepareWalletCreation'),
      hasLength(1),
    );
  });
  testWidgets('导入只使用SDK校验和一次真实操作，回读后放行业务', (tester) async {
    await tester.pumpWidget(page('zh'));
    await tester.pumpAndSettle();
    await openAction(tester, 'import-wallet');
    await submit(tester, restore: true);
    expect(ready(), findsOneWidget);
    expect(platform.validations, 1);
    expect(platform.calls.where((x) => x == 'importWallet'), hasLength(1));
    expect(
      (await sdk.wallet.getState().result).hotProfile!.origin,
      CitizenWalletOrigin.imported,
    );
  });
  testWidgets('SDK校验失败不提交，输入不进入错误文案', (tester) async {
    platform.mnemonicValid = false;
    await tester.pumpWidget(page('zh'));
    await tester.pumpAndSettle();
    await openAction(tester, 'import-wallet');
    await submit(tester, restore: true);
    expect(platform.calls, isNot(contains('importWallet')));
    expect(ready(), findsNothing);
    expect(
      find.text('synthetic recovery text'),
      findsOneWidget,
    ); // 仅用户自己输入框内可见。
    expect(find.textContaining('校验要求'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('wallet-cancel')));
    await tester.pumpAndSettle();
    expect(find.text('synthetic recovery text'), findsNothing);
  });
  testWidgets('附加密码由SDK校验，不合格时不准备钱包', (tester) async {
    platform.passwordValid = false;
    await tester.pumpWidget(page('zh'));
    await tester.pumpAndSettle();
    await openAction(tester, 'create-wallet');
    await submit(tester);
    expect(platform.calls, isNot(contains('prepareWalletCreation')));
    expect(find.textContaining('附加密码不符合'), findsOneWidget);
  });
  testWidgets('备份界面取消只归还资源，不创建或删除钱包', (tester) async {
    await tester.pumpWidget(page('zh'));
    await tester.pumpAndSettle();
    await openAction(tester, 'create-wallet');
    await submit(tester);
    await tester.tap(find.byKey(const ValueKey('wallet-cancel')));
    await tester.pumpAndSettle();
    expect(platform.releaseCalls, 1);
    expect(platform.commitCalls, 0);
    expect(ready(), findsNothing);
    expect(platform.calls, isNot(contains('deleteWallet')));
    expect(find.byKey(const ValueKey('wallet-backup')), findsNothing);
  });
  testWidgets('取消进行中的准备等待真实终态，不放行迟到结果', (tester) async {
    platform.pending = Completer<void>();
    await tester.pumpWidget(page('zh'));
    await tester.pumpAndSettle();
    await openAction(tester, 'create-wallet');
    await tester.tap(find.byKey(const ValueKey('wallet-submit')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('wallet-cancel')));
    await tester.pumpAndSettle();
    expect(platform.calls, contains('cancelOperation'));
    expect(platform.commitCalls, 0);
    expect(find.byKey(const ValueKey('wallet-backup')), findsNothing);
    expect(ready(), findsNothing);
  });
  testWidgets('未提交的SDK结果不能绕过真实目录回读', (tester) async {
    platform.committed = false;
    await tester.pumpWidget(page('zh'));
    await tester.pumpAndSettle();
    await openAction(tester, 'create-wallet');
    await submit(tester);
    await confirm(tester);
    expect(platform.commitCalls, 1);
    expect(ready(), findsNothing);
    expect(find.byKey(const ValueKey('create-wallet')), findsOneWidget);
  });
  testWidgets('真实提交后目录读取失败仍不放行业务', (tester) async {
    await tester.pumpWidget(page('zh'));
    await tester.pumpAndSettle();
    await openAction(tester, 'create-wallet');
    await submit(tester);
    platform.failRead = true;
    await confirm(tester);
    expect(ready(), findsNothing);
    expect(find.textContaining('fixture-read-error'), findsNothing);
    expect(find.textContaining('fixture-error-not-for-display'), findsNothing);
  });
  for (final code in [
    CitizenSdkErrorCode.cancelled,
    CitizenSdkErrorCode.authenticationCancelled,
  ]) {
    testWidgets('SDK取消不显示真实失败：${code.name}', (tester) async {
      platform.failure = code;
      await tester.pumpWidget(page('zh'));
      await tester.pumpAndSettle();
      await openAction(tester, 'create-wallet');
      await submit(tester);
      expect(find.byKey(const ValueKey('wallet-submit')), findsNothing);
      expect(find.textContaining('钱包操作失败'), findsNothing);
      expect(ready(), findsNothing);
    });
  }
  testWidgets('真实失败可重试且不回显SDK原始异常', (tester) async {
    platform.failure = CitizenSdkErrorCode.storage;
    await tester.pumpWidget(page('zh'));
    await tester.pumpAndSettle();
    await openAction(tester, 'create-wallet');
    await submit(tester);
    expect(find.textContaining('钱包操作失败'), findsOneWidget);
    expect(find.textContaining('fixture-error-not-for-display'), findsNothing);
    platform.failure = null;
    await submit(tester);
    await confirm(tester);
    expect(ready(), findsOneWidget);
  });
  testWidgets('重复点击只出现一个弹窗并提交一次', (tester) async {
    await tester.pumpWidget(page('zh'));
    await tester.pumpAndSettle();
    final button = tester.widget<FilledButton>(
      find.byKey(const ValueKey('create-wallet')),
    );
    button.onPressed!();
    button.onPressed!();
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('wallet-submit')), findsOneWidget);
    await submit(tester);
    await confirm(tester);
    expect(platform.commitCalls, 1);
  });
  testWidgets('页面销毁期间真实操作被取消，禁止迟到导航', (tester) async {
    platform.pending = Completer<void>();
    await tester.pumpWidget(page('zh'));
    await tester.pumpAndSettle();
    await openAction(tester, 'create-wallet');
    await tester.tap(find.byKey(const ValueKey('wallet-submit')));
    await tester.pump();
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
    expect(platform.commitCalls, 0);
    expect(platform.calls, contains('cancelOperation'));
    expect(tester.takeException(), isNull);
  });
  testWidgets('SDK替换关闭旧备份资源，不推进新实例', (tester) async {
    await tester.pumpWidget(page('zh'));
    await tester.pumpAndSettle();
    await openAction(tester, 'create-wallet');
    await submit(tester);
    sdk = await CitizenSdk.open();
    opened.add(sdk);
    await tester.pumpWidget(page('zh'));
    await tester.pumpAndSettle();
    expect(platform.releaseCalls, 1);
    expect(platform.commitCalls, 0);
    expect(find.byKey(const ValueKey('wallet-backup')), findsNothing);
    expect(ready(), findsNothing);
  });
  testWidgets('现有真实钱包无需重复创建', (tester) async {
    platform.profile = platform.publicProfile('created');
    initialState = await sdk.wallet.getState().result;
    await tester.pumpWidget(page('zh'));
    await tester.pumpAndSettle();
    expect(ready(), findsOneWidget);
    expect(platform.calls, isNot(contains('prepareWalletCreation')));
  });
  for (final pending in ['recovering', 'cleanup']) {
    testWidgets('SDK恢复或清理状态不能冒充空钱包：$pending', (tester) async {
      platform.recovering = pending == 'recovering';
      platform.cleanupPending = pending == 'cleanup';
      initialState = await sdk.wallet.getState().result;
      await tester.pumpWidget(page('zh'));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('create-wallet')), findsNothing);
      expect(ready(), findsNothing);
    });
  }

  testWidgets('备份复制在途时取消等待资源交付并释放，不提前关闭', (tester) async {
    platform.backupPending = Completer<void>();
    await tester.pumpWidget(page('zh'));
    await tester.pumpAndSettle();
    await openAction(tester, 'create-wallet');
    await tester.tap(find.byKey(const ValueKey('wallet-submit')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('wallet-cancel')));
    await tester.pump();
    expect(find.byKey(const ValueKey('wallet-cancel')), findsOneWidget);
    expect(platform.releaseCalls, 0);
    platform.backupPending!.complete();
    await tester.pumpAndSettle();
    expect(platform.releaseCalls, 1);
    expect(platform.commitCalls, 0);
    expect(find.byKey(const ValueKey('wallet-backup')), findsNothing);
  });
  testWidgets('准备资源归还失败保留所有权，重试归还后才关闭', (tester) async {
    platform.releaseFailures = 1;
    await tester.pumpWidget(page('zh'));
    await tester.pumpAndSettle();
    await openAction(tester, 'create-wallet');
    await submit(tester);
    await tester.tap(find.byKey(const ValueKey('wallet-cancel')));
    await tester.pumpAndSettle();
    expect(platform.releaseCalls, 1);
    expect(find.byKey(const ValueKey('wallet-cancel')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('wallet-cancel')));
    await tester.pumpAndSettle();
    expect(platform.releaseCalls, 2);
    expect(platform.commitCalls, 0);
    expect(find.byKey(const ValueKey('wallet-cancel')), findsNothing);
  });

  testWidgets('取消未被SDK接纳时等待真实终态，显式回读才进入业务', (tester) async {
    await tester.pumpWidget(page('zh'));
    await tester.pumpAndSettle();
    await openAction(tester, 'create-wallet');
    await submit(tester);
    await tester.tap(find.byKey(const ValueKey('wallet-confirm')));
    await tester.pump();
    platform.pending = Completer<void>();
    platform.cancellable = false;
    await tester.tap(find.byKey(const ValueKey('wallet-submit')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('wallet-cancel')));
    await tester.pump();
    expect(find.byKey(const ValueKey('wallet-cancel')), findsOneWidget);
    platform.pending!.complete();
    await tester.pumpAndSettle();
    expect(platform.commitCalls, 1);
    expect(ready(), findsNothing);
    await tester.tap(find.byKey(const ValueKey('retry-wallet-check')));
    await tester.pumpAndSettle();
    expect(ready(), findsOneWidget);
    expect(platform.commitCalls, 1);
  });

  testWidgets('凭据只临时交付，不发起钱包变更或保存输入', (tester) async {
    final cancelled = Completer<void>();
    Future<Uint8List?>? result;
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('zh'),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        home: Builder(
          builder: (context) => Scaffold(
            body: FilledButton(
              onPressed: () {
                result = requestWalletCredential(
                  context,
                  CitizenCredentialChallenge(
                    hostOperationId: BigInt.one,
                    keyPurpose: 'fixture',
                    cancelled: cancelled.future,
                  ),
                );
              },
              child: const Text('fixture-credential'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('fixture-credential'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('wallet-credential')),
      'fixture-only',
    );
    await tester.tap(find.text('继续'));
    await tester.pumpAndSettle();
    final bytes = await result!;
    expect(utf8.decode(bytes!), 'fixture-only');
    bytes.fillRange(0, bytes.length, 0);
    expect(find.byKey(const ValueKey('wallet-credential')), findsNothing);
    expect(platform.calls, isNot(contains('prepareWalletCreation')));
    cancelled.complete();
    await tester.pump();
  });
  testWidgets('SDK撤销凭据挑战时关闭原弹窗并返回取消', (tester) async {
    final cancelled = Completer<void>();
    Future<Uint8List?>? result;
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('zh'),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        home: Builder(
          builder: (context) => Scaffold(
            body: FilledButton(
              onPressed: () {
                result = requestWalletCredential(
                  context,
                  CitizenCredentialChallenge(
                    hostOperationId: BigInt.one,
                    keyPurpose: 'fixture',
                    cancelled: cancelled.future,
                  ),
                );
              },
              child: const Text('fixture-credential'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('fixture-credential'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('wallet-credential')),
      'fixture-only',
    );
    cancelled.complete();
    await tester.pumpAndSettle();
    expect(await result!, isNull);
    expect(find.byKey(const ValueKey('wallet-credential')), findsNothing);
    expect(tester.takeException(), isNull);
  });

  for (final language in ['zh', 'en']) {
    for (final size in [const Size(320, 640), const Size(640, 320)]) {
      testWidgets('双语首屏及钱包输入适应手机：$language $size', (tester) async {
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        await tester.pumpWidget(page(language));
        await tester.pumpAndSettle();
        expect(find.byType(TextField), findsNothing);
        await openAction(tester, 'import-wallet');
        expect(find.byKey(const ValueKey('wallet-mnemonic')), findsOneWidget);
        expect(tester.takeException(), isNull);
        await tester.ensureVisible(find.byKey(const ValueKey('wallet-cancel')));
        await tester.tap(find.byKey(const ValueKey('wallet-cancel')));
        await tester.pumpAndSettle();
      });
    }
  }
  testWidgets('追加账户由SDK选择序号，主机与分机使用同一个操作', (tester) async {
    platform.profile = platform.publicProfile('created');
    initialState = await sdk.wallet.getState().result;
    await tester.pumpWidget(page('zh'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('添加账户'));
    await tester.pumpAndSettle();
    await submit(tester, restore: true);
    expect(
      platform.calls.where((x) => x == 'addNextWalletAccount'),
      hasLength(1),
    );
    expect(platform.calls, isNot(contains('addWalletAccounts')));
  });
}
