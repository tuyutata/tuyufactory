import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tuyufactory/client/host_connection.dart';
import 'package:tuyufactory/client/mdns_discovery.dart';
import 'package:tuyufactory/client/pinned_https_client.dart';
import 'package:tuyufactory/client/relay.dart';
import 'package:tuyufactory/client/web.dart';

const _instance = 'a9bbcb40-68ab-4898-8eba-388f571ba554';
const _hostname = 'tuyufactory-$_instance.local';
const _channel = MethodChannel('tuyufactory/web');
FactoryHost _host([String? fingerprint]) => FactoryHost.fromJson({
  'product_id': 'tuyufactory',
  'protocol': 'TUYU/1',
  'instance_id': _instance,
  'hostname': _hostname,
  'https_port': 59460,
  'addresses': ['192.168.56.10'],
  'certificate_sha256': fingerprint ?? sha256.convert([1, 2, 3]).toString(),
});

class _Overrides extends HttpOverrides {}

class _Connection extends HostConnection {
  _Connection() {
    host = _host();
    status = HostConnectionStatus.ready;
  }
  void offline() {
    status = HostConnectionStatus.failed;
    notifyListeners();
  }
}

class _Client extends PinnedHttpsClient {
  Completer<String>? pending;
  int selections = 0;
  int calls = 0;
  bool closed = false;
  @override
  Future<String> selectAddress(FactoryHost host) async {
    selections++;
    return pending?.future ?? host.addresses.single;
  }

  @override
  Future<Map<String, Object>> request(
    FactoryHost host,
    String address,
    Uri uri,
    String method,
    List<List<String>> headers,
    Uint8List body,
  ) async {
    calls++;
    return {'status': 200, 'headers': <List<String>>[], 'body': body};
  }

  @override
  void close() {
    closed = true;
    super.close();
  }
}

Future<Object?> _native(String method, [Object? arguments]) async {
  final done = Completer<Object?>();
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .handlePlatformMessage(
        _channel.name,
        _channel.codec.encodeMethodCall(MethodCall(method, arguments)),
        (reply) {
          try {
            done.complete(
              reply == null ? null : _channel.codec.decodeEnvelope(reply),
            );
          } on Object catch (error) {
            done.completeError(error);
          }
        },
      );
  return done.future;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final nativeCalls = <MethodCall>[];
  setUp(() {
    nativeCalls.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(_channel, (call) async {
          nativeCalls.add(call);
          return null;
        });
  });
  tearDown(
    () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(_channel, null),
  );

  test('容器只接公开身份，同一时间只打开一次；原生关闭释放传输', () async {
    final connection = _Connection();
    final client = _Client();
    final web = FactoryWeb(connection, client: () => client, windows: true);
    addTearDown(() {
      web.dispose();
      connection.dispose();
    });
    await Future.wait([web.open(), web.open()]);
    expect(web.opened, isTrue);
    expect(client.selections, 1);
    final data = (nativeCalls.single.arguments as Map).cast<String, Object?>();
    expect(data, {
      ...connection.host!.toJson(),
      'origin': connection.host!.statusUri.origin,
      'generation': 1,
    });
    expect(data.keys, isNot(contains('sid')));
    final body = Uint8List.fromList([0, 128, 255]);
    final response = await _native('request', {
      'generation': 1,
      'url': '${data['origin']}/login',
      'method': 'POST',
      'headers': <List<String>>[],
      'body': body,
    });
    expect((response as Map)['body'], body);
    expect(client.calls, 1);
    await expectLater(
      _native('request', {'generation': 0}),
      throwsA(isA<PlatformException>()),
    );
    expect(client.calls, 1);
    await expectLater(_native('sign'), throwsA(isA<PlatformException>()));
    await _native('closed', {'generation': 0});
    expect(web.opened, isTrue);
    await _native('closed', {'generation': 1});
    expect(web.opened, isFalse);
    expect(client.closed, isTrue);
    await expectLater(
      _native('request', {}),
      throwsA(isA<PlatformException>()),
    );
  });

  test('主机断线与App销毁都关闭原生窗口；SDK状态不参与授权', () async {
    final connection = _Connection();
    final client = _Client();
    final web = FactoryWeb(connection, client: () => client, windows: true);
    await web.open();
    connection.offline();
    await Future<void>.delayed(Duration.zero);
    expect(web.opened, isFalse);
    expect(client.closed, isTrue);
    expect(nativeCalls.last.method, 'close');
    expect(nativeCalls.last.arguments, {'generation': 1});
    web.dispose();
    connection.dispose();
  });

  test('旧窗口晚到的打开结果只关闭旧代次，不关闭已经重新打开的窗口', () async {
    final connection = _Connection();
    final first = Completer<void>();
    final web = FactoryWeb(connection, client: _Client.new, windows: true);
    addTearDown(() {
      web.dispose();
      connection.dispose();
    });
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(_channel, (call) async {
          nativeCalls.add(call);
          if (call.method == 'open' &&
              (call.arguments as Map)['generation'] == 1) {
            await first.future;
          }
          return null;
        });
    final pending = web.open();
    await Future<void>.delayed(Duration.zero);
    await web.close();
    await web.open();
    expect(web.opened, isTrue);
    first.complete();
    await pending;
    expect(web.opened, isTrue);
    expect(nativeCalls.last.method, 'close');
    expect(nativeCalls.last.arguments, {'generation': 1});
    connection.dispose();
    await Future<void>.delayed(Duration.zero);
    expect(web.opened, isFalse);
    expect(nativeCalls.last.arguments, {'generation': 3});
  });

  test('打开未完成即退出，晚到验证不得打开原生页面或留下连接', () async {
    final connection = _Connection();
    final client = _Client()..pending = Completer<String>();
    final web = FactoryWeb(connection, client: () => client, windows: true);
    final pending = web.open();
    web.dispose();
    client.pending!.complete('192.168.56.10');
    await pending;
    expect(nativeCalls.where((call) => call.method == 'open'), isEmpty);
    expect(client.closed, isTrue);
    connection.dispose();
  });

  test('原生打开失败与错误通知不暴露员工数据，可明确重试', () async {
    final connection = _Connection();
    final web = FactoryWeb(connection, client: _Client.new, windows: true);
    addTearDown(() {
      web.dispose();
      connection.dispose();
    });
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(_channel, (call) async {
          if (call.method == 'open') {
            throw PlatformException(code: 'unavailable');
          }
          return null;
        });
    await web.open();
    expect(web.failed, isTrue);
    expect(web.opening, isFalse);
    expect(web.opened, isFalse);
    await _native('failed', {'generation': 1});
    expect(web.failed, isTrue);
  });

  test('真实TLS：二进制POST、重复Cookie响应、HTTP拒绝和跳转保持原样；跨源/错误指纹不发请求', () async {
    await HttpOverrides.runWithHttpOverrides(() async {
      final tls = await _Tls.create();
      addTearDown(tls.close);
      final client = PinnedHttpsClient(
        connect: (_, _) => Socket.startConnect('127.0.0.1', tls.server.port),
      );
      addTearDown(client.close);
      final body = Uint8List.fromList(
        List.generate(4096, (index) => index % 256),
      );
      final result = await client.request(
        tls.host,
        tls.host.addresses.single,
        tls.host.statusUri.replace(path: '/login'),
        'POST',
        [
          ['Content-Type', 'application/octet-stream'],
          ['Cookie', 'user_id=Guest'],
          ['X-Frappe-CSRF-Token', 'test-only'],
        ],
        body,
      );
      expect(result['status'], 200);
      expect(result['body'], body);
      expect(
        (result['headers']! as List<List<String>>).where(
          (header) => header[0].toLowerCase() == 'set-cookie',
        ),
        hasLength(2),
      );
      expect(tls.headers!.value('Cookie'), 'user_id=Guest');
      expect(tls.headers!.value('X-Frappe-CSRF-Token'), 'test-only');
      expect(tls.headers!.value('Host'), '$_hostname:59460');
      for (final status in [302, 403, 500]) {
        tls.status = status;
        final response = await client.request(
          tls.host,
          tls.host.addresses.single,
          tls.host.statusUri.replace(path: '/app'),
          'GET',
          [],
          Uint8List(0),
        );
        expect(response['status'], status);
      }
      final count = tls.requests;
      for (final uri in [
        Uri.parse('https://other.invalid/login'),
        tls.host.statusUri.replace(userInfo: 'user'),
        tls.host.statusUri.replace(port: 443),
      ]) {
        await expectLater(
          client.request(
            tls.host,
            tls.host.addresses.single,
            uri,
            'POST',
            [],
            body,
          ),
          throwsFormatException,
        );
      }
      await expectLater(
        client.request(
          _host(),
          tls.host.addresses.single,
          tls.host.statusUri,
          'POST',
          [],
          body,
        ),
        throwsA(isA<HandshakeException>()),
      );
      expect(tls.requests, count);
    }, _Overrides());
  });

  test('真实TLS密文穿过回环转发，原始主机证书不变；关闭后端口不可用', () async {
    await HttpOverrides.runWithHttpOverrides(() async {
      final tls = await _Tls.create();
      addTearDown(tls.close);
      final relay = Relay(
        connect: (address, port) {
          expect(address, tls.host.addresses.single);
          expect(port, 59460);
          return Socket.connect('127.0.0.1', tls.server.port);
        },
      );
      final origin = await relay.start(tls.host, tls.host.addresses.single);
      expect(origin.host, '127.0.0.1');
      expect(origin.scheme, 'https');
      final client = PinnedHttpsClient(
        connect: (_, _) => Socket.startConnect(origin.host, origin.port),
      );
      addTearDown(client.close);
      final result = await client.request(
        tls.host,
        tls.host.addresses.single,
        tls.host.statusUri.replace(path: '/login'),
        'POST',
        [],
        Uint8List.fromList([9, 8, 7]),
      );
      expect(result['body'], [9, 8, 7]);
      expect(tls.requests, 1);
      await relay.close();
      await expectLater(
        Socket.connect(origin.host, origin.port),
        throwsA(isA<SocketException>()),
      );
      await expectLater(
        relay.start(tls.host, tls.host.addresses.single),
        throwsStateError,
      );
    }, _Overrides());
  });
}

/// 组件服务只回送传输字节，不冒充ERPNext登录或数据库验收。
class _Tls {
  _Tls(this.root, this.server, this.host) {
    server.listen((request) async {
      requests++;
      headers = request.headers;
      final bytes = await request.fold<List<int>>(
        [],
        (all, part) => all..addAll(part),
      );
      request.response.statusCode = status;
      request.response.headers.add(
        'Set-Cookie',
        'user_id=Guest; Path=/; Secure',
      );
      request.response.headers.add(
        'Set-Cookie',
        'sid=; Max-Age=0; Path=/; Secure; HttpOnly',
      );
      if (status == 302) {
        request.response.headers.set('Location', 'https://other.invalid/');
      }
      request.response.add(bytes);
      await request.response.close();
    }, onError: (Object _) {});
  }
  final Directory root;
  final HttpServer server;
  final FactoryHost host;
  int requests = 0;
  int status = 200;
  HttpHeaders? headers;

  static Future<_Tls> create() async {
    final runner = Platform.environment['GITHUB_ACTIONS'] == 'true'
        ? Platform.environment['RUNNER_TEMP']
        : null;
    final parent =
        Platform.environment['TUYUFACTORY_TEST_DIR'] ??
        (runner == null
            ? '${Directory.systemTemp.path}/tuyufactory-tests'
            : '$runner/tuyufactory-tests');
    final normalized = parent?.replaceAll('\\', '/');
    final local = normalized != null && Directory(normalized).isAbsolute;
    final remote =
        normalized != null &&
        runner != null &&
        normalized.startsWith('${runner.replaceAll('\\', '/')}/');
    if (parent == null ||
        (!local && !remote) ||
        normalized.split('/').any((part) => part == '..' || part == '.')) {
      throw StateError('Test work directory required');
    }
    await Directory(parent).create(recursive: true);
    final root = await Directory(parent).createTemp('web-');
    final scripts =
        '${File('test/web_test.dart').resolveSymbolicLinksSync().replaceAll('\\', '/').split('/app/test/').first}/scripts';
    final result = await Process.run(
      Platform.environment['TUYUFACTORY_TEST_PYTHON'] ??
          (Platform.isWindows ? 'python' : 'python3'),
      [
        '-c',
        'import sys; from pathlib import Path; sys.path.insert(0,sys.argv[3]); '
            'from runtime_common import ensure_certificate; '
            'ensure_certificate(Path(sys.argv[1]),sys.argv[2])',
        root.path,
        _hostname,
        scripts,
      ],
      environment: {'PYTHONDONTWRITEBYTECODE': '1'},
    );
    if (result.exitCode != 0) {
      await root.delete(recursive: true);
      throw StateError('Certificate test setup failed');
    }
    final cert = File('${root.path}/tls/localhost.crt');
    final pem = await cert.readAsString();
    final der = base64.decode(
      pem.replaceAll(RegExp(r'-----[^\n]+-----|\s'), ''),
    );
    final context = SecurityContext()
      ..useCertificateChain(cert.path)
      ..usePrivateKey('${root.path}/tls/localhost.key');
    final server = await HttpServer.bindSecure(
      InternetAddress.loopbackIPv4,
      0,
      context,
    );
    return _Tls(root, server, _host(sha256.convert(der).toString()));
  }

  Future<void> close() async {
    await server.close(force: true);
    await root.delete(recursive: true);
  }
}
