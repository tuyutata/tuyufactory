import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const root = path.dirname(fileURLToPath(import.meta.url));
const read = (file) => readFileSync(path.join(root, file), 'utf8');

test('Android只接受厂家分机入口、唯一身份和ARM64', () => {
  const gradle = read('app/build.gradle.kts');
  assert.match(gradle, /require\(targetFile\.canonicalFile == appRoot\.resolve\("lib\/main_client\.dart"\)\.canonicalFile\)/);
  assert.match(gradle, /applicationId = "com\.tuyufactory\.client"/);
  assert.match(gradle, /namespace = "com\.tuyufactory\.client"/);
  assert.match(gradle, /abiFilters \+= "arm64-v8a"/);
  assert.match(gradle, /minSdk = 24/);
  assert.match(gradle, /compileSdk = 36/);
  assert.match(gradle, /targetSdk = 36/);
  assert.match(gradle, /ndkVersion = "28\.2\.13676358"/);
  assert.doesNotMatch(gradle, /main_host|tuyufactory_native|PostgreSQL|frappe|erpnext|signingConfigs/);
});

test('源目录不生成构建输出，SDK只由公开插件注册', () => {
  const gradle = read('build.gradle.kts');
  assert.match(gradle, /System\.getenv\("TUYUFACTORY_BUILD_DIR"\)/);
  assert.match(gradle, /java\.io\.tmpdir/);
  assert.match(gradle, /!output\.toPath\(\)\.startsWith\(sourcePath\)/);
  assert.doesNotMatch(gradle, /\.\.\/\.\.\/build/);
  assert.match(read('app/src/main/MainActivity.kt'), /super\.configureFlutterEngine\(flutterEngine\)/);
  assert.match(read('app/src/main/MainActivity.kt'), /FlutterFragmentActivity/);
  assert.doesNotMatch(read('settings.gradle.kts'), /project\(":citizen_sdk"\)\.projectDir/);
});

test('SDK由Flutter标准插件清单唯一注册', () => {
  const settings = read('settings.gradle.kts');
  assert.match(settings, /System\.getenv\("TUYUFACTORY_PROJECT_ROOT"\)/);
  assert.match(settings, /settingsDir\.parentFile/);
  assert.match(settings, /resolve\("android\/local\.properties"\)/);
  assert.match(settings, /\.flutter-plugins-dependencies/);
  assert.doesNotMatch(settings, /dev\.flutter\.flutter-plugin-loader|System\.getProperty\("user\.dir"\)/);
  assert.doesNotMatch(settings, /sdkProject|sdkPackages|package_config\.json/);
});

test('手机平板权限不开放明文、备份、外部存储或任意文件', () => {
  const manifest = read('app/src/main/AndroidManifest.xml');
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
  assert.match(manifest, /android:allowBackup="false"/);
  assert.match(manifest, /CHANGE_WIFI_MULTICAST_STATE/);
  assert.match(manifest, /android:resizeableActivity="true"/);
  assert.match(manifest, /android:xlargeScreens="true"/);
  assert.match(manifest, /android\.hardware\.camera\.any" android:required="false"/);
  assert.doesNotMatch(manifest, /READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|MANAGE_EXTERNAL_STORAGE|screenOrientation/);
});

test('发现平台通道与Dart一致，生命周期移除回调并释放锁', () => {
  const activity = read('app/src/main/MainActivity.kt');
  const dart = read('../lib/client/mdns_discovery.dart');
  for (const method of ['tuyufactory/discovery', 'acquireMulticastLock', 'releaseMulticastLock']) {
    assert.ok(activity.includes(method) && dart.includes(method));
  }
  assert.match(activity, /setReferenceCounted\(false\)/);
  assert.match(activity, /override fun onStop\(\)/);
  assert.match(activity, /channel\?\.setMethodCallHandler\(null\)/);
  assert.match(activity, /discovery\.close\(\)/);
});

test('原生源码目录没有单子项包装层或构建残留', () => {
  const inspect = (directory) => {
    const children = readdirSync(directory, { withFileTypes: true });
    assert.ok(children.length >= 2, directory);
    for (const child of children) {
      assert.ok(!['.gradle', 'build', '.dart_tool', 'target'].includes(child.name));
      if (child.isDirectory()) inspect(path.join(directory, child.name));
    }
  };
  inspect(root);
});

test('Web只有固定同源和当前握手证书，不向网页提供SDK桥', () => {
  const web = read('app/src/main/Web.kt');
  const trust = read('app/src/main/Trust.kt');
  assert.match(web, /SslCertificate\.saveState\(error\.certificate\)/);
  assert.match(web, /identity\.certificate\(der\)/);
  assert.match(web, /shouldInterceptRequest/);
  assert.match(web, /MIXED_CONTENT_NEVER_ALLOW/);
  assert.match(web, /clearSslPreferences\(\)/);
  assert.match(web, /certificate\.notAfter\.time/);
  assert.match(trust, /MessageDigest\.isEqual\(actual, expected\)/);
  assert.match(trust, /certificate\.checkValidity\(now\)/);
  assert.match(trust, /certificate\.verify\(certificate\.publicKey\)/);
  assert.match(trust, /subjectAlternativeNames/);
  assert.match(trust, /criticalExtensionOIDs/);
  assert.doesNotMatch(web, /addJavascriptInterface|evaluateJavascript|DownloadManager|loadDataWithBaseURL/);
  const security = read('app/src/main/res/xml/network_security_config.xml');
  assert.match(security, /<domain includeSubdomains="false">127\.0\.0\.1<\/domain>/);
  assert.match(security, /<trust-anchors \/>/);
  assert.doesNotMatch(security, /<base-config|src="user"/);
});

test('文件、相机、下载和异步回调限制于用户选择和当前窗口', () => {
  const web = read('app/src/main/Web.kt');
  assert.match(web, /ACTION_OPEN_DOCUMENT/);
  assert.match(web, /ACTION_CREATE_DOCUMENT/);
  assert.match(web, /ACTION_IMAGE_CAPTURE/);
  assert.match(web, /checkServerTrusted/);
  assert.match(web, /identity\.verify\(chain\[0\]\)/);
  assert.match(web, /instanceFollowRedirects = false/);
  assert.match(web, /redirects\+\+ < 5/);
  assert.match(web, /require\(identity\.allows\(destinationUrl\)\)/);
  assert.match(web, /pending\.second != generation/);
  assert.match(web, /current == generation/);
  assert.match(web, /expected != identityGeneration/);
  assert.match(web, /64L \* 1024 \* 1024/);
  assert.match(read('app/src/main/res/xml/file_paths.xml'), /path="camera\/"/);
  const activity = read('app/src/main/MainActivity.kt');
  assert.match(activity, /invokeMethod\("closed", mapOf\("generation" to it\)\)/);
  assert.match(activity, /invokeMethod\("failed", mapOf\("generation" to it\)\)/);
});
