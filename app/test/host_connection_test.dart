import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:citizen_sdk/citizen_sdk.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tuyufactory/client/connection_page.dart';
import 'package:tuyufactory/client/host_connection.dart';
import 'package:tuyufactory/client/host_store.dart';
import 'package:tuyufactory/client/mdns_discovery.dart';
import 'package:tuyufactory/client/pinned_https_client.dart';
import 'package:tuyufactory/shared/l10n/app_localizations.dart';

const _instance = 'a9bbcb40-68ab-4898-8eba-388f571ba554';
const _hostname = 'tuyufactory-$_instance.local';

// 仅撤销Flutter测试默认的HTTP 400替身，真实TLS仍使用生产校验路径。
class _HttpOverrides extends HttpOverrides {}

String get _python =>
    Platform.environment['TUYUFACTORY_TEST_PYTHON'] ??
    (Platform.isWindows ? 'python' : 'python3');
String get _openssl =>
    Platform.environment['TUYUFACTORY_TEST_OPENSSL'] ?? 'openssl';
String get _scripts =>
    '${File('test/host_connection_test.dart').resolveSymbolicLinksSync().replaceAll('\\', '/').split('/app/test/').first}/scripts';

FactoryHost _host({String? fingerprint}) => FactoryHost.fromJson({
  'product_id': 'tuyufactory',
  'protocol': 'TUYU/1',
  'instance_id': _instance,
  'hostname': _hostname,
  'https_port': 59460,
  'addresses': ['192.168.56.10'],
  'certificate_sha256': fingerprint ?? sha256.convert([1, 2, 3]).toString(),
});

class _Store extends HostStore {
  FactoryHost? saved;
  bool failLoad = false;
  bool failSave = false;
  int writes = 0;
  @override
  Future<FactoryHost?> load() async {
    if (failLoad) throw const FormatException('Invalid saved host');
    return saved;
  }

  @override
  Future<void> save(FactoryHost host) async {
    writes++;
    if (failSave) throw const FileSystemException('Storage unavailable');
    saved = host;
  }
}

class _Discovery extends MdnsDiscovery {
  List<FactoryHost> hosts = [_host()];
  int calls = 0;
  Completer<List<FactoryHost>>? pending;
  @override
  Future<List<FactoryHost>> discover({
    Duration timeout = const Duration(seconds: 3),
  }) async {
    calls++;
    return pending?.future ?? hosts;
  }
}

class _Client extends PinnedHttpsClient {
  int calls = 0;
  bool fail = false;
  Completer<void>? pending;
  @override
  Future<void> verify(FactoryHost host) async {
    calls++;
    if (fail) throw const HandshakeException('Identity changed');
    await pending?.future;
  }
}

Future<Directory> _temporary() async {
  final runner = Platform.environment['GITHUB_ACTIONS'] == 'true'
      ? Platform.environment['RUNNER_TEMP']
      : null;
  final path =
      Platform.environment['TUYUFACTORY_TEST_DIR'] ??
      (runner == null
          ? '${Directory.systemTemp.path}/tuyufactory-tests'
          : '$runner/tuyufactory-tests');
  final normalized = path?.replaceAll('\\', '/');
  final local = normalized != null && Directory(normalized).isAbsolute;
  final remote =
      normalized != null &&
      runner != null &&
      normalized.startsWith('${runner.replaceAll('\\', '/')}/');
  if (path == null ||
      normalized!.split('/').contains('..') ||
      (!local && !remote)) {
    throw StateError('Factory tests require their isolated work directory');
  }
  final directory = Directory(path);
  await directory.create(recursive: true);
  return directory.createTemp('case-');
}

Future<Uint8List> _advertisement(FactoryHost host, {int ttl = 120}) async {
  // 直接调用主机的生产公告编码器，避免测试与分机复制出同一个错误格式。
  final result = await Process.run(
    _python,
    [
      '-c',
      'import sys,json; sys.path.insert(0,sys.argv[3]); '
          'from employee_gateway import advertisement; sys.stdout.buffer.write(advertisement(json.loads(sys.argv[1]),int(sys.argv[2])))',
      jsonEncode(host.toJson()),
      '$ttl',
      _scripts,
    ],
    environment: {'PYTHONDONTWRITEBYTECODE': '1'},
    stdoutEncoding: null,
  );
  expect(result.exitCode, 0);
  return Uint8List.fromList(result.stdout as List<int>);
}

void main() {
  test('首次唯一发现先等用户核对，信任成功才保存；随后不再发现', () async {
    final store = _Store();
    final discovery = _Discovery();
    final client = _Client();
    final connection = HostConnection(
      store: store,
      discovery: discovery,
      client: client,
    );
    addTearDown(connection.dispose);
    await connection.start();
    expect(connection.status, HostConnectionStatus.awaitingTrust);
    expect(client.calls, 0);
    expect(store.writes, 0);
    await connection.trust();
    expect(connection.status, HostConnectionStatus.ready);
    expect(store.writes, 1);
    await connection.start();
    expect(discovery.calls, 1);
    expect(client.calls, 2);
  });

  for (final count in [0, 2]) {
    test('发现$count台不选择、不连接、不写入', () async {
      final store = _Store();
      final discovery = _Discovery()..hosts = List.filled(count, _host());
      final client = _Client();
      final connection = HostConnection(
        store: store,
        discovery: discovery,
        client: client,
      );
      addTearDown(connection.dispose);
      await connection.start();
      expect(connection.status, HostConnectionStatus.failed);
      expect(store.writes, 0);
      expect(client.calls, 0);
    });
  }

  test('取消信任不保存、不连接，可重新发现', () async {
    final store = _Store();
    final client = _Client();
    final connection = HostConnection(
      store: store,
      discovery: _Discovery(),
      client: client,
    );
    addTearDown(connection.dispose);
    await connection.start();
    connection.cancelTrust();
    await connection.trust();
    expect(connection.status, HostConnectionStatus.idle);
    expect(store.writes, 0);
    expect(client.calls, 0);
    await connection.start();
    expect(connection.status, HostConnectionStatus.awaitingTrust);
  });

  test('固定主机故障及资料损坏不重新发现，不覆盖；恢复只验证原身份', () async {
    final store = _Store()..saved = _host();
    final discovery = _Discovery();
    final client = _Client()..fail = true;
    final connection = HostConnection(
      store: store,
      discovery: discovery,
      client: client,
    );
    addTearDown(connection.dispose);
    await connection.start();
    expect(connection.status, HostConnectionStatus.failed);
    store.failLoad = true;
    await connection.start();
    expect(connection.status, HostConnectionStatus.failed);
    expect(discovery.calls, 0);
    expect(store.writes, 0);
    store.failLoad = false;
    client.fail = false;
    await connection.start();
    expect(connection.status, HostConnectionStatus.ready);
    expect(discovery.calls, 0);
  });

  test('证书验证和保存失败均不能出现已连接成功', () async {
    final store = _Store();
    final client = _Client()..fail = true;
    final connection = HostConnection(
      store: store,
      discovery: _Discovery(),
      client: client,
    );
    addTearDown(connection.dispose);
    await connection.start();
    await connection.trust();
    expect(store.writes, 0);
    expect(connection.status, HostConnectionStatus.failed);
    client.fail = false;
    store.failSave = true;
    await connection.start();
    await connection.trust();
    expect(connection.status, HostConnectionStatus.failed);
    expect(store.saved, isNull);
  });

  test('并发操作单飞，退出后晚到发现不通知、不写入', () async {
    final store = _Store();
    final discovery = _Discovery()..pending = Completer();
    final connection = HostConnection(
      store: store,
      discovery: discovery,
      client: _Client(),
    );
    var notifications = 0;
    connection.addListener(() => notifications++);
    final first = connection.start();
    final second = connection.start();
    expect(identical(first, second), isTrue);
    await Future<void>.delayed(Duration.zero);
    connection.dispose();
    final before = notifications;
    discovery.pending!.complete([_host()]);
    await first;
    expect(notifications, before);
    expect(store.writes, 0);
    await connection.start();
    connection.dispose();
  });

  test('信任握手未完成时退出，禁止晚到保存', () async {
    final store = _Store();
    final client = _Client()..pending = Completer();
    final connection = HostConnection(
      store: store,
      discovery: _Discovery(),
      client: client,
    );
    await connection.start();
    final trust = connection.trust();
    connection.dispose();
    client.pending!.complete();
    await trust;
    expect(store.writes, 0);
  });

  test('真实文件保存回读、拒绝覆盖、拒绝损坏与符号链接', () async {
    final directory = await _temporary();
    addTearDown(() => directory.delete(recursive: true));
    final store = HostStore(directory: () async => directory);
    expect(await store.load(), isNull);
    await store.save(_host());
    expect((await store.load())!.toJson(), _host().toJson());
    await expectLater(store.save(_host()), throwsStateError);
    final file = File('${directory.path}/host.json');
    await file.writeAsString('[]');
    await expectLater(store.load(), throwsFormatException);
    await file.delete();
    await Link(file.path).create('${directory.path}/absent');
    await expectLater(store.load(), throwsFormatException);
    await expectLater(store.save(_host()), throwsStateError);
    expect(await File('${directory.path}/host.json.tmp').exists(), isFalse);
  });

  test('身份值对象拒绝错误产品、实例、端口、主机名、指纹及公网地址', () {
    for (final entry in <String, Object>{
      'product_id': 'tuyubooking',
      'instance_id': 'invalid',
      'hostname': 'wrong.local',
      'https_port': 443,
      'certificate_sha256': 'invalid',
      'addresses': ['8.8.8.8'],
    }.entries) {
      expect(
        () =>
            FactoryHost.fromJson({..._host().toJson(), entry.key: entry.value}),
        throwsFormatException,
      );
    }
    expect(
      () => FactoryHost.fromJson({
        ..._host().toJson(),
        'addresses': ['127.0.0.1'],
      }),
      throwsFormatException,
    );
  });

  test('读取真实Python公告、告别、截断、无关来源和随机畸形包', () async {
    final bytes = await _advertisement(_host());
    final hosts = MdnsDiscovery.parse(bytes, '192.168.56.10');
    expect(hosts.single.toJson(), _host().toJson());
    expect(
      MdnsDiscovery.parse(
        await _advertisement(_host(), ttl: 0),
        '192.168.56.10',
      ),
      isEmpty,
    );
    expect(MdnsDiscovery.parse(bytes, '192.168.56.11'), isEmpty);
    expect(MdnsDiscovery.parse(bytes, '8.8.8.8'), isEmpty);
    for (var length = 0; length < bytes.length; length++) {
      expect(
        MdnsDiscovery.parse(
          Uint8List.sublistView(bytes, 0, length),
          '192.168.56.10',
        ),
        isEmpty,
      );
    }
    final random = Random(22);
    for (var i = 0; i < 500; i++) {
      expect(
        MdnsDiscovery.parse(
          Uint8List.fromList(
            List.generate(random.nextInt(1024), (_) => random.nextInt(256)),
          ),
          '192.168.56.10',
        ),
        isEmpty,
      );
    }
  });

  test('同一DNS包的多个实例分别关联，不混用SRV/TXT/A记录', () async {
    const instance = '986f4479-10c3-4011-ae60-06c103fbbf31';
    final other = FactoryHost.fromJson({
      ..._host().toJson(),
      'instance_id': instance,
      'hostname': 'tuyufactory-$instance.local',
    });
    final first = await _advertisement(_host());
    final second = await _advertisement(other);
    final combined = Uint8List.fromList([...first, ...second.sublist(12)]);
    ByteData.sublistView(combined).setUint16(
      6,
      ByteData.sublistView(first).getUint16(6) +
          ByteData.sublistView(second).getUint16(6),
    );
    expect(
      MdnsDiscovery.parse(
        combined,
        '192.168.56.10',
      ).map((host) => host.instanceId),
      unorderedEquals([_instance, instance]),
    );
    final cyclic = Uint8List.fromList(first);
    cyclic[12] = 0xc0;
    cyclic[13] = 12;
    expect(MdnsDiscovery.parse(cyclic, '192.168.56.10'), isEmpty);
    expect(
      MdnsDiscovery.parse(MdnsDiscovery.query(), '192.168.56.10'),
      isEmpty,
    );
  });

  test('保存中断产生的临时占用不覆盖；超大资料读取失败关闭', () async {
    final directory = await _temporary();
    addTearDown(() => directory.delete(recursive: true));
    final store = HostStore(directory: () async => directory);
    final temporary = File('${directory.path}/host.json.tmp');
    await temporary.writeAsString('occupied');
    await expectLater(store.save(_host()), throwsA(isA<FileSystemException>()));
    expect(await temporary.readAsString(), 'occupied');
    expect(await store.load(), isNull);
    final file = File('${directory.path}/host.json');
    await file.writeAsString(List.filled(8193, 'x').join());
    await expectLater(store.load(), throwsFormatException);
  });

  test('真实TLS：指纹与主机名同时验证，错误身份/重定向/超大状态拒绝', () async {
    await HttpOverrides.runWithHttpOverrides(() async {
      final directory = await _temporary();
      addTearDown(() => directory.delete(recursive: true));
      Future<(HttpServer, FactoryHost)> server(
        String hostname, {
        bool serverAuth = true,
      }) async {
        final prefix =
            '${directory.path}/${hostname == _hostname ? 'host' : 'wrong'}-${serverAuth ? 'server' : 'missing'}';
        final cert = '$prefix/tls/localhost.crt';
        final key = '$prefix/tls/localhost.key';
        await Directory('$prefix/tls').create(recursive: true);
        final result = serverAuth
            ? await Process.run(
                _python,
                [
                  '-c',
                  'import sys; from pathlib import Path; sys.path.insert(0,sys.argv[3]); '
                      'from runtime_common import ensure_certificate; '
                      'certificate,key=ensure_certificate(Path(sys.argv[1]),sys.argv[2]); '
                      'original=certificate.read_bytes(); '
                      'ensure_certificate(Path(sys.argv[1]),sys.argv[2]); '
                      'assert certificate.read_bytes()==original',
                  prefix,
                  hostname,
                  _scripts,
                ],
                environment: {'PYTHONDONTWRITEBYTECODE': '1'},
              )
            : await Process.run(_openssl, [
                'req',
                '-config',
                '/dev/null',
                '-x509',
                '-newkey',
                'rsa:2048',
                '-nodes',
                '-keyout',
                key,
                '-out',
                cert,
                '-days',
                '1',
                '-subj',
                '/CN=$hostname',
                '-addext',
                'subjectAltName=DNS:$hostname',
              ]);
        expect(result.exitCode, 0);
        final der = await Process.run(_openssl, [
          'x509',
          '-in',
          cert,
          '-outform',
          'DER',
        ], stdoutEncoding: null);
        expect(der.exitCode, 0);
        final host = _host(
          fingerprint: sha256.convert(der.stdout as List<int>).toString(),
        );
        final context = SecurityContext()
          ..useCertificateChain(cert)
          ..usePrivateKey(key);
        final server = await HttpServer.bindSecure(
          InternetAddress.loopbackIPv4,
          0,
          context,
        );
        addTearDown(() => server.close(force: true));
        return (server, host);
      }

      final (valid, host) = await server(_hostname);
      var requests = 0;
      var mode = 'ok';
      valid.listen((request) async {
        requests++;
        expect(request.uri.path, '/tuyu/status');
        expect(
          request.headers.value(HttpHeaders.hostHeader),
          '$_hostname:59460',
        );
        expect(request.headers.value(HttpHeaders.cookieHeader), isNull);
        if (mode == 'redirect') {
          request.response.statusCode = 302;
          request.response.headers.set(
            HttpHeaders.locationHeader,
            'https://example.org/',
          );
        } else {
          request.response.write(
            mode == 'large'
                ? List.filled(9000, 'x').join()
                : jsonEncode({
                    ...host.toJson(),
                    'ok': true,
                    'realtime_available': false,
                    if (mode == 'identity') 'instance_id': 'different',
                  }),
          );
        }
        await request.response.close();
      }, onError: (Object _) {});
      PinnedHttpsClient clientFor(HttpServer server) => PinnedHttpsClient(
        connect: (address, port) {
          expect(address, '192.168.56.10');
          expect(port, 59460);
          return Socket.startConnect(
            InternetAddress.loopbackIPv4.address,
            server.port,
          );
        },
      );
      final client = clientFor(valid);
      addTearDown(client.close);
      await client.verify(host);
      expect(requests, 1);
      await client.verify(host);
      expect(requests, 2);
      await expectLater(
        client.verify(_host()),
        throwsA(isA<HandshakeException>()),
      );
      expect(requests, 2); // 指纹不匹配在任何应用请求之前失败。
      for (final value in ['identity', 'redirect', 'large']) {
        mode = value;
        await expectLater(client.verify(host), throwsA(isA<Exception>()));
      }
      final (wrong, wrongHost) = await server('wrong.local');
      var wrongRequests = 0;
      wrong.listen((request) {
        wrongRequests++;
        request.response.close();
      }, onError: (Object _) {});
      final wrongClient = clientFor(wrong);
      addTearDown(wrongClient.close);
      // 即使信任该证书的指纹，错误SAN仍然由TLS拒绝，不能仅凭摘要放行。
      await expectLater(
        wrongClient.verify(wrongHost),
        throwsA(isA<HandshakeException>()),
      );
      expect(wrongRequests, 0);
      if (Platform.isMacOS) {
        final (missing, missingHost) = await server(
          _hostname,
          serverAuth: false,
        );
        var missingRequests = 0;
        missing.listen((request) {
          missingRequests++;
          request.response.close();
        }, onError: (Object _) {});
        final missingClient = clientFor(missing);
        addTearDown(missingClient.close);
        await expectLater(
          missingClient.verify(missingHost),
          throwsA(isA<HandshakeException>()),
        );
        expect(missingRequests, 0);
      }
      client.close();
      await expectLater(client.verify(host), throwsStateError);
    }, _HttpOverrides());
  });

  for (final locale in ['zh', 'en']) {
    testWidgets('信任确认、取消与安全连接页面：$locale，窄屏无溢出', (tester) async {
      tester.view.physicalSize = const Size(320, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final store = _Store();
      final client = _Client();
      final connection = HostConnection(
        store: store,
        discovery: _Discovery(),
        client: client,
      );
      addTearDown(connection.dispose);
      await connection.start();
      await tester.pumpWidget(
        MaterialApp(
          locale: Locale(locale),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: ConnectionPage(
            connection: connection,
            sdk: null,
            capabilities: null,
            // 本用例验证钱包已经就绪之后的主机连接页面。
            profile: CitizenWalletProfile(
              walletIndex: 0,
              masterAccountId: '0x${List.filled(64, '1').join()}',
              origin: CitizenWalletOrigin.created,
              createdAtMillis: BigInt.zero,
              activeAccountId: '0x${List.filled(64, '1').join()}',
              accounts: const [],
            ),
            sdkStarting: false,
            sdkError: null,
            onRetrySdk: () async {},
            onWalletReady: () {},
          ),
        ),
      );
      await tester.pumpAndSettle();
      final cancel = find.text(locale == 'zh' ? '暂不信任' : 'Do not trust yet');
      await tester.ensureVisible(cancel);
      await tester.pumpAndSettle();
      await tester.tap(cancel);
      await tester.pumpAndSettle();
      expect(connection.status, HostConnectionStatus.idle);
      expect(store.writes, 0);
      await connection.start();
      await tester.pumpAndSettle();
      final confirm = find.text(
        locale == 'zh' ? '已核对一致，信任并连接' : 'Details match: trust and connect',
      );
      await tester.ensureVisible(confirm);
      await tester.pumpAndSettle();
      await tester.tap(confirm);
      await tester.pumpAndSettle();
      expect(store.writes, 1);
      expect(connection.status, HostConnectionStatus.ready);
      client.fail = true;
      await tester.pump(const Duration(seconds: 15));
      await tester.pumpAndSettle();
      expect(connection.status, HostConnectionStatus.failed);
      expect(connection.failure, HostConnectionFailure.verification);
      expect(store.writes, 1);
      client.fail = false;
      await connection.start();
      await tester.pumpAndSettle();
      expect(connection.status, HostConnectionStatus.ready);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      connection.dispose();
    });
  }
}
