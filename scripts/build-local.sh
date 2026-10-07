#!/usr/bin/env bash
# 本产品独立拥有本机编译、候选封装和失败条件；输入仅为源码外工作目录及公开工具入口。
set -euo pipefail
[[ $# -eq 3 && "$2" == /* && "$3" == /* ]] || { echo 'Build参数无效' >&2; exit 2; }
platform="$1"; export PROJECT_ROOT="$2"; export WORK_DIR="$3"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
: "${NODE:?缺少Node入口}" "${FLUTTER:?缺少Flutter入口}"
[[ "$WORK_DIR" == "$root/target/$platform/"* ]] || { echo 'Build输出不得进入源码' >&2; exit 1; }
case "$platform" in client-ios|client-android|client-macos|host-macos|host-windows|client-windows|host-linux-arm|host-linux-amd) ;; *) echo '产品Build平台无效' >&2; exit 2;; esac
# 在启动编译器前验证准确平台、规范工具与源码外输出；不接受别名路径、链接和旧候选。
unset NODE_OPTIONS NODE_PATH LD_PRELOAD DYLD_INSERT_LIBRARIES DYLD_LIBRARY_PATH
"$NODE" --input-type=module - "$root" "$PROJECT_ROOT" "$WORK_DIR" "$platform" <<'BUILD_INPUT'
import { lstatSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, parse, relative, resolve, sep } from 'node:path';
const [source, project, work, platform] = process.argv.slice(2);
const fail = () => { throw Error('产品Build输入或输出边界无效'); };
function canonical(value, kind) {
  if (!value || !isAbsolute(value) || resolve(value) !== value || value === parse(value).root) fail();
  const info = lstatSync(value);
  if (info.isSymbolicLink() || realpathSync(value) !== value
    || (kind === 'directory' ? !info.isDirectory() : !info.isFile() || !(info.mode & 0o111))) fail();
  return value;
}
const inside = (root, path) => {
  const r = relative(root, path); return r === '' || !isAbsolute(r) && r !== '..' && !r.startsWith('..' + sep);
};
for (const path of [source, project, work]) canonical(path, 'directory');
if (!inside(resolve(source, 'target'), work) || inside(work, source) || project === work || !inside(work, project)) fail();
for (const name of ['NODE', 'FLUTTER']) canonical(process.env[name], 'file');
const build = process.env.BUILD_DIR;
if (!build || !isAbsolute(build) || build !== resolve(build) || !inside(work, build)
  || inside(project, build) || build === work) fail();
let at = build;
while (!lstatSync(at, { throwIfNoEntry: false })) at = dirname(at);
canonical(at, 'directory');
const outputs = platform.endsWith('ios') ? ['ios.app.zip']
  : platform.endsWith('android') ? ['android.apk']
  : platform === 'client-macos' ? ['TuyuFactoryClient.app']
  : platform === 'host-macos' ? ['TuyuFactoryHost.app'] : [];
for (const name of outputs) if (lstatSync(resolve(work, name), { throwIfNoEntry: false })) fail();
if (platform.endsWith('android')) {
  canonical(process.env.GRADLE, 'file'); canonical(process.env.ANDROID_HOME, 'directory');
  canonical(process.env.JAVA_HOME, 'directory');
  const init = process.env.GRADLE_INIT_SCRIPT;
  if (!init || !isAbsolute(init) || resolve(init) !== init || realpathSync(init) !== init
    || !lstatSync(init).isFile() || lstatSync(init).isSymbolicLink()) fail();
}
if (platform.endsWith('macos')) for (const name of ['POD', 'XCODEBUILD', 'CODESIGN']) canonical(process.env[name], 'file');
if (platform === 'host-macos' || platform === 'host-windows' && source.endsWith('/tuyubooking')) {
  for (const name of ['CARGO', 'RUSTC']) canonical(process.env[name], 'file');
  if (dirname(process.env.CARGO) !== dirname(process.env.RUSTC)) fail();
}
BUILD_INPUT
export TUYUFACTORY_WORK_DIR="$WORK_DIR" TUYUFACTORY_BUILD_DIR="$BUILD_DIR"
cd "$PROJECT_ROOT"
source_root="$root/app"
case "$platform" in host-linux-*|client-linux-*) os=linux;; *) os="${platform##*-}";; esac
"$NODE" "$source_root/scripts/project.mjs" verify --source-root "$source_root" --work-root "$WORK_DIR" --output "$PROJECT_ROOT" --platform "$os"
# 候选必须是本轮普通输出；失败编译器留下的链接、空文件不能进入最终候选。
verify_candidate() {
  "$NODE" --input-type=module - "$WORK_DIR" "$1" "$2" <<'BUILD_CANDIDATE'
import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
const [work, file, kind] = process.argv.slice(2), rel = relative(work, file);
const info = lstatSync(file);
if (!isAbsolute(file) || resolve(file) !== file || !rel || isAbsolute(rel) || rel === '..'
  || rel.startsWith('..' + sep) || info.isSymbolicLink() || realpathSync(file) !== file
  || (kind === 'directory' ? !info.isDirectory() : !info.isFile() || !info.size)) throw Error('编译候选缺失或输出身份无效');
BUILD_CANDIDATE
}

build_android() {
  local target="${1:-lib/main.dart}"
  local source_root="${PROJECT_ROOT:?缺少Flutter产品源码根}"
  local gradle properties flutter_sdk flutter_version dart_defines android_sdk java_home
  # 直接使用调用方验真的Gradle入口，不执行Wrapper或下载第二份分发包。
  gradle="${GRADLE:?缺少Gradle入口}"
  properties="$PROJECT_ROOT/android/local.properties"
  flutter_sdk="$(cd "$(dirname "$FLUTTER")/.." && pwd -P)"
  android_sdk="${ANDROID_HOME:?缺少Android SDK}"
  java_home="${JAVA_HOME:?缺少Java Home}"
  [[ -x "$gradle" ]] || { echo 'Android产品缺少已验真的Gradle执行器' >&2; return 1; }
  flutter_version="$("$FLUTTER" --version --machine)"
  dart_defines="$(printf '%s' "$flutter_version" | "$NODE" --input-type=module -e '
import { readFileSync } from "node:fs";
const value = JSON.parse(readFileSync(0, "utf8"));
const fields = [["FLUTTER_VERSION", "frameworkVersion"], ["FLUTTER_CHANNEL", "channel"],
  ["FLUTTER_GIT_URL", "repositoryUrl"], ["FLUTTER_FRAMEWORK_REVISION", "frameworkRevision"],
  ["FLUTTER_ENGINE_REVISION", "engineRevision"], ["FLUTTER_DART_VERSION", "dartSdkVersion"]];
if (fields.some(([, key]) => typeof value[key] !== "string" || !value[key].length
  || value[key].length > 4096 || /[\r\n\0]/u.test(value[key]))) throw Error("Flutter版本字段缺失或无效");
process.stdout.write(fields.map(([name, key]) => Buffer.from(name + "=" + value[key]).toString("base64")).join(","));
')"
  [[ -n "$dart_defines" ]] || { echo 'Android产品无法生成Flutter版本定义' >&2; exit 1; }
  (
    cd "$source_root/android"
    ANDROID_HOME="$android_sdk" ANDROID_SDK_ROOT="$android_sdk" JAVA_HOME="$java_home" PATH="$java_home/bin:$PATH" \
    FLUTTER_GRADLE_ROOT="$flutter_sdk/packages/flutter_tools/gradle" \
    FLUTTER_ROOT="$flutter_sdk" "$gradle" --no-daemon --stacktrace --no-problems-report \
      --init-script "${GRADLE_INIT_SCRIPT:?缺少Gradle缓存初始化脚本}" \
      --project-cache-dir "$WORK_DIR/work/gradle-project" \
      -Ptarget-platform=android-arm64 -Ptarget="$target" -Pbase-application-name=android.app.Application \
      -Pdart-defines="$dart_defines" -Pdart-obfuscation=false -Ptrack-widget-creation=true \
      -Ptree-shake-icons=true assembleRelease
  )
}

case "$platform" in
  client-ios)
    "$FLUTTER" build ios --release --target lib/main_client.dart
    candidate="$BUILD_DIR/ios/iphoneos/Runner.app"; "$NODE" "$root/scripts/verify.mjs" --package "$candidate" client ios payload
    verify_candidate "$candidate" directory
    ditto -c -k --sequesterRsrc --keepParent "$candidate" "$WORK_DIR/ios.app.zip"
    
    ;;
  client-android)
    build_android lib/main_client.dart
    app="$PROJECT_ROOT"
    verify_candidate "$BUILD_DIR/app/outputs/flutter-apk/app-release.apk" file
    "$NODE" "$root/scripts/build_client.mjs" android "$BUILD_DIR/app/outputs/flutter-apk/app-release.apk" "$WORK_DIR/android.apk" "$app" payload
    
    ;;
  client-macos)
    app="$PROJECT_ROOT"
    "$FLUTTER" build macos --release --config-only --target lib/main_client.dart; (cd macos && "$POD" install)
    derived="$WORK_DIR/client-xcode"
    "$XCODEBUILD" -workspace macos/Runner.xcworkspace -scheme Runner -configuration Release -derivedDataPath "$derived" -destination 'platform=macOS,arch=arm64' ARCHS=arm64 ONLY_ACTIVE_ARCH=YES TUYU_FACTORY_PRODUCT_NAME=TuyuFactoryClient TUYU_FACTORY_BUNDLE_IDENTIFIER=com.tuyufactory.client TUYU_FACTORY_DISPLAY_NAME=途遇厂家分机
    candidate="$derived/Build/Products/Release/TuyuFactoryClient.app"; "$CODESIGN" --force --sign - --timestamp=none "$candidate/Contents/Frameworks/CitizenSDK.framework"; "$CODESIGN" --force --sign - --timestamp=none --options runtime --entitlements "$app/macos/Runner/Release.entitlements" "$candidate"; "$CODESIGN" --verify --deep --strict "$candidate"
    "$NODE" "$root/scripts/build_client.mjs" macos "$candidate" "$WORK_DIR/TuyuFactoryClient.app" "$app" signed
    ;;
  host-macos)
    app="$PROJECT_ROOT"; runtime="$WORK_DIR/runtime"; cargo_root="$WORK_DIR/work/cargo"
    TUYU_LOCAL_BUILD=1 TUYUFACTORY_WORK_DIR="$WORK_DIR" "$root/scripts/build_macos.sh" "$runtime"
    CARGO_TARGET_DIR="$cargo_root" "$CARGO" build --manifest-path "$root/Cargo.toml" --workspace --release --locked
    cd "$app"
    "$FLUTTER" build macos --release --config-only --target lib/main_host.dart; (cd macos && "$POD" install)
    derived="$WORK_DIR/host-xcode"
    "$XCODEBUILD" -workspace macos/Runner.xcworkspace -scheme Runner -configuration Release -derivedDataPath "$derived" -destination 'platform=macOS,arch=arm64' ARCHS=arm64 ONLY_ACTIVE_ARCH=YES TUYU_FACTORY_PRODUCT_NAME=TuyuFactory TUYU_FACTORY_BUNDLE_IDENTIFIER=com.tuyufactory TUYU_FACTORY_DISPLAY_NAME=途遇厂家端
    app_candidate="$derived/Build/Products/Release/TuyuFactory.app"; output="$WORK_DIR/TuyuFactoryHost.app"
    TUYUFACTORY_WORK_DIR="$WORK_DIR" "$root/scripts/package_macos.sh" "$app_candidate" "$cargo_root/release/libtuyufactory_native.dylib" "$runtime" "$output"
    "$root/scripts/verify_macos.sh" "$output"
    ;;
  host-windows)
    "$FLUTTER" build bundle --release --target lib/main_host.dart --target-platform windows-x64
    ;;
  client-windows)
    "$FLUTTER" build bundle --release --target lib/main_client.dart --target-platform windows-x64
    ;;
  host-linux-arm)
    "$FLUTTER" build bundle --release --target lib/main_host.dart --target-platform linux-arm64
    ;;
  host-linux-amd)
    "$FLUTTER" build bundle --release --target lib/main_host.dart --target-platform linux-x64
    ;;
  *) echo '产品Build平台无效' >&2; exit 2;;
esac
