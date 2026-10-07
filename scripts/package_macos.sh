#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_APP="${1:?usage: package_macos.sh APP NATIVE_LIBRARY RUNTIME OUTPUT}"
NATIVE_LIBRARY="${2:?usage: package_macos.sh APP NATIVE_LIBRARY RUNTIME OUTPUT}"
RUNTIME="${3:?usage: package_macos.sh APP NATIVE_LIBRARY RUNTIME OUTPUT}"
OUTPUT="${4:?usage: package_macos.sh APP NATIVE_LIBRARY RUNTIME OUTPUT}"
IDENTITY="${CODE_SIGN_IDENTITY:--}"
# 所有独立入口的工具临时状态归本产品target；宿主已交付的产品工作根继续归当前任务。
PRODUCT_TEMP_SCRIPT="${BASH_SOURCE[0]}"
while [[ -L "$PRODUCT_TEMP_SCRIPT" ]]; do
  PRODUCT_TEMP_LINK="$(readlink "$PRODUCT_TEMP_SCRIPT")"
  [[ "$PRODUCT_TEMP_LINK" == /* ]] || PRODUCT_TEMP_LINK="$(cd "$(dirname "$PRODUCT_TEMP_SCRIPT")" && pwd -P)/$PRODUCT_TEMP_LINK"
  PRODUCT_TEMP_SCRIPT="$PRODUCT_TEMP_LINK"
done
PRODUCT_TEMP_SOURCE="$(cd "$(dirname "$PRODUCT_TEMP_SCRIPT")/.." && pwd -P)"
PRODUCT_TARGET_TEMP_ROOT="$("${PRODUCT_NODE_BIN:-${NODE:-node}}" "$PRODUCT_TEMP_SOURCE/scripts/build.mjs" temporary-root "${PLATFORM:-${platform:-}}" 'host-macos')" || exit 1
if [[ -z "${PRODUCT_WORK_DIR:-}" && "${TMPDIR:-}" != "$PRODUCT_TEMP_SOURCE/target/"* ]]; then
  export TMPDIR="$PRODUCT_TARGET_TEMP_ROOT/"
fi
TUYUFACTORY_WORK_DIR="${TUYUFACTORY_WORK_DIR:-${TMPDIR:-$PRODUCT_TARGET_TEMP_ROOT}/tuyufactory/host/macos}"

[[ "$(uname -s)" == Darwin && "$(uname -m)" == arm64 ]] \
  || { echo '厂家端 macOS 包只能在真实 macOS 主机生成' >&2; exit 1; }
[[ -d "$SOURCE_APP" && -f "$SOURCE_APP/Contents/Info.plist" ]] \
  || { echo "厂家端 Flutter App 不存在：$SOURCE_APP" >&2; exit 1; }
[[ -f "$NATIVE_LIBRARY" ]] || { echo "厂家端原生库不存在：$NATIVE_LIBRARY" >&2; exit 1; }
[[ -f "$RUNTIME/business/runtime.lock.json" && -x "$RUNTIME/postgresql/bin/postgres" ]] \
  || { echo "厂家端独立运行包不存在：$RUNTIME" >&2; exit 1; }
[[ ! -e "$OUTPUT" ]] || { echo "厂家端 App 目标已经存在：$OUTPUT" >&2; exit 1; }

# 主机组装入口不能接收client壳；写入前验证准确工作根和新目标。
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$SOURCE_APP/Contents/Info.plist")" == com.tuyufactory ]] \
  || { echo '厂家主机打包入口拒绝分机安装身份' >&2; exit 1; }
node --input-type=module - "$SCRIPT_DIR/verify.mjs" "$TUYUFACTORY_WORK_DIR" "$OUTPUT" "$SOURCE_APP" "$RUNTIME" <<'NODE_PACKAGE'
import { pathToFileURL } from 'node:url';
import { lstatSync } from 'node:fs';
import { join } from 'node:path';
const {packageDestination, packageInside, verifyTree} = await import(pathToFileURL(process.argv[2]));
packageDestination(process.argv[3], process.argv[4], 'host', 'macos');
for (const input of process.argv.slice(5)) {
  if (lstatSync(input).isSymbolicLink() || packageInside(input, process.argv[4]) || packageInside(process.argv[4], input) || input === process.argv[4]) throw new Error('厂家打包输入与输出交叉');
  verifyTree(input);
}
for (const name of ['Contents', 'Contents/Frameworks', 'Contents/Resources']) {
  const path = join(process.argv[5], name);
  try { if (lstatSync(path).isSymbolicLink()) throw new Error('厂家包写入父目录不得为链接'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
NODE_PACKAGE

# 排他创建后才拥有清理权；签名和验真失败不能留下半包。
OUTPUT_OWNED=0
ENTITLEMENTS_OWNED=0
PACKAGE_COMPLETE=0
cleanup_package() {
  if [[ "$ENTITLEMENTS_OWNED" == 1 ]]; then /bin/rm -f "$APP_ENTITLEMENTS"; fi
  if [[ "$OUTPUT_OWNED" == 1 && "$PACKAGE_COMPLETE" != 1 ]]; then find "$OUTPUT" -depth -delete; fi
}
trap cleanup_package EXIT
mkdir "$OUTPUT"
OUTPUT_OWNED=1
ditto "$SOURCE_APP" "$OUTPUT"
mkdir -p "$OUTPUT/Contents/Frameworks" "$OUTPUT/Contents/Resources"
cp "$NATIVE_LIBRARY" "$OUTPUT/Contents/Frameworks/libtuyufactory_native.dylib"
install_name_tool -id '@rpath/libtuyufactory_native.dylib' \
  "$OUTPUT/Contents/Frameworks/libtuyufactory_native.dylib"
ditto "$RUNTIME" "$OUTPUT/Contents/Resources/runtime"

# 先签全部嵌套 Mach-O，再签最外层 App；PostgreSQL 子进程不能继承 App Sandbox。
sign_nested_code() {
  local file_path="$1" signing_output
  if ! signing_output="$(codesign --force --sign "$IDENTITY" --timestamp=none "$file_path" 2>&1)"; then
    printf '%s\n' "$signing_output" >&2
    return 1
  fi
}
while IFS= read -r file_path; do
  if file -b "$file_path" | grep -q 'Mach-O'; then
    sign_nested_code "$file_path"
  fi
done < <(find "$OUTPUT/Contents/Resources/runtime" "$OUTPUT/Contents/Frameworks" \
  -type f \( -perm -111 -o -name '*.dylib' -o -name '*.so' -o -name '*.node' \) \
  -print | LC_ALL=C sort)

# 权限文件随统一 Flutter 工程定位，主机打包不读取分机入口或重复资源。
APP_ENTITLEMENTS="$ROOT/app/macos/Runner/Release.entitlements"
if [[ "$IDENTITY" == - ]]; then
  APP_ENTITLEMENTS="$TUYUFACTORY_WORK_DIR/adhoc.entitlements"
  node --input-type=module - "$ROOT/app/macos/Runner/Release.entitlements" "$APP_ENTITLEMENTS" <<'NODE_ENTITLEMENTS'
import { copyFileSync, constants } from 'node:fs';
copyFileSync(process.argv[2], process.argv[3], constants.COPYFILE_EXCL);
NODE_ENTITLEMENTS
  ENTITLEMENTS_OWNED=1
  /usr/libexec/PlistBuddy -c \
    'Add :com.apple.security.cs.disable-library-validation bool true' \
    "$APP_ENTITLEMENTS"
fi
# 签名前使基础名称与最终物理包名一致，用户名称由包内语言资源提供。
bundle_name="$(basename "$OUTPUT" .app)"
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName $bundle_name" "$OUTPUT/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleName $bundle_name" "$OUTPUT/Contents/Info.plist"
codesign --force --sign "$IDENTITY" --timestamp=none --options runtime \
  --entitlements "$APP_ENTITLEMENTS" "$OUTPUT"
"$SCRIPT_DIR/verify_macos.sh" "$OUTPUT"
PACKAGE_COMPLETE=1
echo "已生成途遇厂家端 macOS App：$OUTPUT"
