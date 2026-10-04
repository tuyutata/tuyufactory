#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP="${1:?usage: verify_macos.sh APP}"
RUNTIME="$APP/Contents/Resources/runtime"
NATIVE="$APP/Contents/Frameworks/libtuyufactory_native.dylib"
EXECUTABLE="$APP/Contents/MacOS/TuyuFactory"

for path in "$EXECUTABLE" "$NATIVE" "$RUNTIME/postgresql/bin/postgres" \
  "$RUNTIME/business/python/bin/python3" "$RUNTIME/business/node/bin/node"; do
  [[ -f "$path" ]] || { echo "厂家端 App 缺少运行文件：$path" >&2; exit 1; }
  [[ "$(lipo -archs "$path")" == arm64 ]] \
    || { echo "厂家端 App 不是纯 ARM64：$path" >&2; exit 1; }
done
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Contents/Info.plist")" \
    == com.tuyufactory ]] || { echo '厂家端 Bundle ID 无效' >&2; exit 1; }
nm -gU "$NATIVE" | grep -q '_tuyufactory_start$'
nm -gU "$NATIVE" | grep -q '_tuyufactory_initialize_administrator$'
node "$SCRIPT_DIR/verify.mjs" "$RUNTIME"
codesign --verify --deep --strict "$APP"
# 同一整包验证器覆盖完整SDK、Flutter及主机组件，不只检查几个主程序。
node "$SCRIPT_DIR/verify.mjs" --package "$APP" host macos signed
if codesign -d --entitlements :- "$APP" 2>&1 | grep -q 'com.apple.security.app-sandbox'; then
  echo '厂家端直接分发 App 不得启用 App Sandbox' >&2
  exit 1
fi
echo "途遇厂家端 macOS App 验证通过：$APP"
