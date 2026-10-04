import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('主机和分机从各自唯一入口递归隔离本产品依赖', () {
    final sources = _sources();
    expect(sources.containsKey('main.dart'), isFalse);
    expect(
      sources['main_host.dart'],
      contains('runApp(const TuyuFactoryScope(child: TuyuFactoryApp()))'),
    );
    expect(sources['main_client.dart'], contains('runApp(const ClientApp())'));
    for (final path in [
      'main_host.dart',
      'main_client.dart',
      'client/app.dart',
    ]) {
      expect(
        sources[path],
        isNot(matches(r'fromEnvironment|Platform\.|main\(List')),
      );
    }
    final client = _reachable(sources, 'main_client.dart', 'client');
    final host = _reachable(sources, 'main_host.dart', 'host');
    expect(
      client,
      containsAll(['client/app.dart', 'client/connection_page.dart']),
    );
    expect(
      host,
      containsAll(['host/runtime_model.dart', 'host/native_runtime.dart']),
    );
    expect(
      client.intersection(host).every((path) => path.startsWith('shared/')),
      isTrue,
    );
    // 限制新分机依赖闭集，新增能力必须随真实集成另行更新合同。
    expect(
      client,
      unorderedEquals([
        'main_client.dart',
        'client/app.dart',
        'client/connection_page.dart',
        'client/host_connection.dart',
        'client/host_store.dart',
        'client/mdns_discovery.dart',
        'client/pinned_https_client.dart',
        'client/relay.dart',
        'client/web.dart',
        'shared/l10n/app_localizations.dart',
        'shared/l10n/app_localizations_zh.dart',
        'shared/l10n/app_localizations_en.dart',
      ]),
    );
  });

  test('新职责目录均有真实内容且不保留旧职责包装层', () {
    for (final directory in ['host', 'client', 'shared', 'shared/l10n']) {
      expect(
        Directory('lib/$directory').listSync().length,
        greaterThanOrEqualTo(2),
      );
    }
    for (final directory in ['app', 'core', 'features', 'l10n']) {
      expect(Directory('lib/$directory').existsSync(), isFalse);
    }
  });

  for (final directive in [
    "import '../host/runtime_model.dart';",
    "export '../host/runtime_model.dart';",
    "part '../host/runtime_model.dart';",
    "import 'safe.dart' if (dart.library.io) '../host/runtime_model.dart';",
    "export 'safe.dart' if (dart.library.io) '../host/runtime_model.dart';",
    "import 'package:tuyufactory/host/runtime_model.dart';",
    "import 'dart:ffi';",
    "import 'dart:io';",
    "import 'package:ffi/ffi.dart';",
    "import '../../outside.dart';",
    "import 'safe.dart'; import '../host/runtime_model.dart';",
    "export 'safe.dart'; export '../host/runtime_model.dart';",
  ]) {
    test('递归校验拒绝分机间接跨界：$directive', () {
      // 用内存源码检验校验器本身，不创建临时伪工程或加载主机。
      expect(
        () => _reachable(
          {
            'main_client.dart': "import 'client/app.dart';",
            'client/app.dart': "export 'bridge.dart';",
            'client/bridge.dart': directive,
            'client/safe.dart': '',
            'host/runtime_model.dart': '',
          },
          'main_client.dart',
          'client',
        ),
        throwsStateError,
      );
    });
  }

  test('递归校验处理共享依赖与环，缺失文件直接失败', () {
    final sources = {
      'main_client.dart': "import 'client/app.dart';",
      'client/app.dart': "export '../shared/common.dart';",
      'shared/common.dart': "import '../client/app.dart';",
    };
    expect(_reachable(sources, 'main_client.dart', 'client'), hasLength(3));
    sources.remove('shared/common.dart');
    expect(
      () => _reachable(sources, 'main_client.dart', 'client'),
      throwsStateError,
    );
  });
}

Map<String, String> _sources() => {
  for (final file in Directory(
    'lib',
  ).listSync(recursive: true).whereType<File>())
    if (file.path.endsWith('.dart'))
      file.path.substring(4).replaceAll('\\', '/'): file.readAsStringSync(),
};

Set<String> _reachable(Map<String, String> sources, String entry, String role) {
  final visited = <String>{};
  final pending = [entry];
  final directives = RegExp(
    r'''(?:^|(?<=;))\s*(?:import|export|part(?!\s+of\b))\s+([^;]+);''',
    multiLine: true,
  );
  final literals = RegExp(r'''['"]([^'"]+)['"]''');
  const clientPackages = {
    'citizen_sdk',
    'flutter',
    'flutter_localizations',
    'intl',
    'crypto',
    'path_provider',
  };
  const clientDartLibraries = {'dart:async', 'dart:ui'};
  while (pending.isNotEmpty) {
    final path = pending.removeLast();
    if (path != entry &&
        !path.startsWith('$role/') &&
        !path.startsWith('shared/')) {
      throw StateError('越过 $role 源码边界：$path');
    }
    if (!visited.add(path)) continue;
    final source = sources[path];
    if (source == null) throw StateError('依赖文件不存在：$path');
    // 扫描全部条件分支，不因本机编译平台而漏掉另一平台的 Host 导入。
    final code = source.replaceAll(
      RegExp(r'/\*[\s\S]*?\*/|^\s*//[^\n]*', multiLine: true),
      '',
    );
    for (final directive in directives.allMatches(code)) {
      for (final literal in literals.allMatches(directive.group(1)!)) {
        final target = literal.group(1)!;
        final uri = Uri.parse(target);
        if (uri.scheme == 'dart') {
          // 网络/公开信任资料仅准许在准确的连接模块使用IO；主机FFI仍全部禁止。
          const networkFiles = {
            'client/mdns_discovery.dart',
            'client/host_store.dart',
            'client/pinned_https_client.dart',
            'client/relay.dart',
            'client/web.dart',
          };
          const networkLibraries = {
            'dart:io',
            'dart:convert',
            'dart:typed_data',
          };
          if (role == 'client' &&
              !clientDartLibraries.contains(target) &&
              !(networkFiles.contains(path) &&
                  networkLibraries.contains(target))) {
            throw StateError('分机未登记的 Dart 系统依赖：$target');
          }
        } else if (target.startsWith('package:tuyufactory/')) {
          pending.add(target.substring('package:tuyufactory/'.length));
        } else if (uri.scheme == 'package') {
          if (role == 'client' &&
              !clientPackages.contains(uri.path.split('/').first)) {
            throw StateError('分机未登记的外部依赖：$target');
          }
        } else if (uri.hasScheme ||
            uri.hasAuthority ||
            uri.hasAbsolutePath ||
            uri.hasQuery ||
            uri.hasFragment) {
          throw StateError('非法源码依赖：$target');
        } else {
          pending.add(Uri(path: path).resolveUri(uri).path);
        }
      }
    }
  }
  return visited;
}
