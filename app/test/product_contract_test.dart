import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:tuyufactory/shared/secure_endpoint.dart';
import 'package:tuyufactory/shared/product.dart';

void main() {
  test('Android generated names use the AGP Variant API', () {
    final root = Platform.environment['TUYUFACTORY_ROOT'] ?? Directory.current.parent.path;
    final script = File('$root/app/android/app/build.gradle.kts').readAsStringSync();
    expect(script, contains('abstract class GenerateAppNameResources : DefaultTask'));
    expect(script, contains('generatedResources.set(appNameResources)'));
    expect(script, contains('androidComponents.onVariants'));
    expect(script, contains('addGeneratedSourceDirectory'));
    expect(script, contains('GenerateAppNameResources::generatedResources'));
    expect(script, isNot(contains('res.srcDir(appNameResources)')));
    expect(script, isNot(contains('android.sourceset.disallowProvider=false')));
  });

  test('Windows system names preserve separate technical identities', () {
    final root = Platform.environment['TUYUFACTORY_ROOT'] ?? Directory.current.parent.path;
    final runner = File('$root/app/windows/runner/main.cpp').readAsStringSync();
    expect(runner, contains('ApplicationDisplayName()'));
    expect(runner, contains('PKEY_AppUserModel_RelaunchDisplayNameResource'));
    expect(runner, contains('PKEY_AppUserModel_RelaunchCommand'));
    expect(runner, contains('IDS_TUYU_APPLICATION_NAME'));
    expect(runner, contains('SHSetLocalizedName'));
    expect(runner, contains('::_wcsicmp(expanded, executable.c_str()) != 0'));
    expect(runner, contains('FILE_ATTRIBUTE_REPARSE_POINT'));
    expect(runner, isNot(contains('CreateShortcut')));
    expect(File('$root/app/windows/runner/Runner.rc').readAsStringSync(), contains('#pragma code_page(65001)'));
  });

  test('安装名称按系统语言解析并保留产品身份', () {
    final root = Platform.environment['TUYUFACTORY_ROOT'];
    final app = root == null ? Directory.current.path : '$root/app';
    String source(String path) => File('$app/$path').readAsStringSync();
    for (final platform in ['ios', 'macos']) {
      final catalog = jsonDecode(source('$platform/Runner/InfoPlist.xcstrings'));
      for (final key in ['CFBundleDisplayName', 'CFBundleName']) {
        for (final entry in {'en': 'TuyuFactory', 'zh-Hans': '途遇厂家端', 'zh-Hant': '途遇厂家端'}.entries) {
          expect(catalog['strings'][key]['localizations'][entry.key]['stringUnit']['value'], entry.value);
        }
      }
      expect(source('$platform/Runner.pbxproj'), contains('InfoPlist.xcstrings'));
    }
    expect(source('android/app/src/main/AndroidManifest.xml'), contains('android:label="@string/app_name"'));
    final gradle = source('android/app/build.gradle.kts');
    expect(gradle, contains('generateAppNameResources'));
    expect(gradle, contains('app_en.arb'));
    expect(gradle, contains('app_zh.arb'));
    expect(gradle, contains('layout.buildDirectory.dir("generated/app-name/res")'));
    final windows = source('windows/runner/Runner.rc');
    expect(windows, contains('IDS_TUYU_APPLICATION_NAME "TuyuFactory"'));
    expect(windows, contains('IDS_TUYU_APPLICATION_NAME "途遇厂家端"'));
  });

  test('厂家端账户与现有主机安装身份保持不变', () {
    expect(TuyuFactoryProduct.id, 'tuyufactory');
    expect(TuyuFactoryProduct.technicalName, 'TuyuFactory');
    expect(TuyuFactoryProduct.displayName, '途遇厂家端');
    expect(TuyuFactoryProduct.hostApplicationId, 'com.tuyufactory');
    expect(TuyuFactoryProduct.clientApplicationId, 'com.tuyufactory.client');
  });

  test('安装目标准确包含主机四端和分机四端', () {
    // 比对完整组合，防止数量相同但产品、平台归属错误。
    expect(TuyuFactoryProduct.targets, {
      'host': ['macOS', 'Windows', 'LinuxARM', 'LinuxAMD'],
      'client': ['iOS', 'Android', 'macOS', 'Windows'],
    });
    expect(
      TuyuFactoryProduct.supportedPlatforms,
      unorderedEquals([
        'iOS',
        'Android',
        'macOS',
        'LinuxARM',
        'LinuxAMD',
        'Windows',
      ]),
    );
    expect(TuyuFactoryProduct.targets['client'], isNot(contains('LinuxARM')));
    expect(TuyuFactoryProduct.targets['client'], isNot(contains('LinuxAMD')));
  });

  test('目标表、平台列表及派生全集不可被调用方修改', () {
    expect(() => TuyuFactoryProduct.targets.clear(), throwsUnsupportedError);
    expect(
      () => TuyuFactoryProduct.targets['client']!.clear(),
      throwsUnsupportedError,
    );
    expect(
      () => TuyuFactoryProduct.supportedPlatforms.clear(),
      throwsUnsupportedError,
    );
    expect(
      TuyuFactoryProduct.targets.keys,
      unorderedEquals(['host', 'client']),
    );
    expect(TuyuFactoryProduct.supportedPlatforms, hasLength(6));
    expect(
      TuyuFactoryProduct.supportedPlatforms,
      unorderedEquals(
        TuyuFactoryProduct.targets.values
            .expand((platforms) => platforms)
            .toSet(),
      ),
    );
  });

  for (final address in [
    'https://factory.example.com',
    'https://factory.example.com:59443/app',
    'https://192.0.2.1:59443',
    'https://[2001:db8::1]:59443',
  ]) {
    test('接受 HTTPS 格式并完整保留地址：$address', () {
      // 示例地址仅用于纯解析，不发送网络请求或授予证书信任。
      final uri = SecureEndpoint.parse(address).uri;
      expect(uri, Uri.parse(address));
      expect(uri.scheme, 'https');
      expect(uri.host, isNotEmpty);
      expect(uri.userInfo, isEmpty);
    });
  }

  for (final address in [
    '',
    'factory.example.com',
    '/app',
    '//factory.example.com/app',
    'https://',
    'https:///app',
    'http://factory.example.com',
    'ws://factory.example.com',
    'wss://factory.example.com',
    'https://test-user@factory.example.com',
    'https://test-user:synthetic-password@factory.example.com',
  ]) {
    test('拒绝缺少主机、非 HTTPS 或含用户信息的地址：$address', () {
      // 这是 HTTPS 地址对象；WSS 必须由其自身连接职责处理。
      expect(() => SecureEndpoint.parse(address), throwsFormatException);
    });
  }

  test('HTTPS 地址解析不改写显式端口和路径', () {
    final uri = SecureEndpoint.parse(
      'https://factory.example.com:59443/app',
    ).uri;
    expect(uri.port, 59443);
    expect(uri.path, '/app');
  });
}
