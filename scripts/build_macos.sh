#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DESTINATION="${1:?usage: build_macos.sh DESTINATION}"
# 原件输入在创建或清理任何本轮目录前验证；没有交付组件就保持源码与既有候选不变。
"${NODE:?缺少Node准确入口}" --input-type=module - "$ROOT" <<'COMPONENT_INPUTS'
import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, join, resolve, sep } from 'node:path';
const source = realpathSync(process.argv[2]);
for (const name of ['TUYU_OPENSSL_PREFIX', 'TUYU_LIBFFI_PREFIX', 'TUYU_PANGO_PREFIX']) {
  const path = process.env[name];
  if (!path || !isAbsolute(path) || resolve(path) !== path || realpathSync(path) !== path
    || !lstatSync(path).isDirectory() || path === source || (path.startsWith(source + sep) && !path.startsWith(join(source, 'target') + sep))
    || source.startsWith(path + sep)) throw Error('编译组件未交付或目录身份无效：' + name);
}
COMPONENT_INPUTS

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
WORK_ROOT="${TUYUFACTORY_WORK_DIR:-${TMPDIR:-$PRODUCT_TARGET_TEMP_ROOT}/tuyufactory/host/macos}"
BUILD="${TUYUFACTORY_BUILD_DIR:-$WORK_ROOT/build}"
SOURCES="$WORK_ROOT/sources"
LANGUAGE="$BUILD/language"
POSTGRES="$BUILD/postgresql"
BUILD_WORK="$BUILD"
DEPENDENCY_ROOT="${TUYUFACTORY_DEPENDENCY_DIR:-$WORK_ROOT/dependencies}"
export TUYUFACTORY_DEPENDENCY_DIR="$DEPENDENCY_ROOT"
DOWNLOADS="$DEPENDENCY_ROOT/factory-downloads"
PACKAGE_CACHE="$DEPENDENCY_ROOT/package-managers"
LANGUAGE_CACHE="$DEPENDENCY_ROOT/compiled/language-base"
POSTGRES_CACHE="$DEPENDENCY_ROOT/compiled/postgresql-base"
TOOLCHAIN_FINGERPRINT=""
TOOLCHAIN_FINGERPRINT="$({
  printf '%s\n' 'tuyufactory-macos-toolchain-v1'
  shasum -a 256 "$SCRIPT_DIR/runtime.lock.json" "$0"
} | shasum -a 256 | awk '{print $1}')"

[[ "$(uname -s)" == Darwin && "$(uname -m)" == arm64 ]] || {
  echo '厂家端 macOS 运行包只能在真实 macOS 主机生成' >&2
  exit 1
}
[[ ! -e "$DESTINATION" ]] || { echo "厂家端运行包目标已经存在：$DESTINATION" >&2; exit 1; }
"${PYTHON:?缺少Python准确入口}" - "$ROOT" "$WORK_ROOT" "$BUILD" "$DEPENDENCY_ROOT" "$DESTINATION" <<'CHECK_PATHS'
from pathlib import Path
import sys
source = Path(sys.argv[1]).resolve()
for value in sys.argv[2:]:
    raw, target = Path(value), Path(value).resolve()
    if not raw.is_absolute() or source / 'target' not in target.parents:
        raise SystemExit(f'TuyuFactory可写目录必须是本产品target内绝对路径：{value}')
CHECK_PATHS

cleanup() {
  for item in "$BUILD" "$SOURCES"; do
    [[ ! -e "$item" ]] || find "$item" -depth -delete 2>/dev/null || true
  done
}
trap cleanup EXIT
mkdir -p "$WORK_ROOT" "$SOURCES" "$DOWNLOADS" "$PACKAGE_CACHE" "$LANGUAGE" "$POSTGRES"
export npm_config_cache="$PACKAGE_CACHE/npm"
export YARN_CACHE_FOLDER="$PACKAGE_CACHE/yarn"
export PIP_CACHE_DIR="$PACKAGE_CACHE/pip"
# 厂家端三层原生组件使用同一最低系统版本，禁止继承 Runner 的测试 SDK 默认值。
export MACOSX_DEPLOYMENT_TARGET=26.0

LOCK_VALUES="$(node --input-type=module - "$SCRIPT_DIR/runtime.lock.json" <<'NODE'
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const lock = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const {runtimeTool} = await import(pathToFileURL(join(dirname(process.argv[2]), 'verify.mjs')));
const node = await runtimeTool('node', 'macos');
console.log([node.version, node.filename, node.root,
  ...[lock.sources.python_source, node, lock.sources.postgresql_source].flatMap(value => [value.url, value.sha256])].join('\t'));
NODE
)"
IFS=$'\t' read -r NODE_VERSION NODE_FILENAME NODE_ROOT PYTHON_URL PYTHON_SHA NODE_URL NODE_SHA POSTGRES_URL POSTGRES_SHA <<< "$LOCK_VALUES"
# 产品工具更新必须使原语言缓存失效，不能仅比较不含版本的产品引用。
TOOLCHAIN_FINGERPRINT="$(printf '%s\n' "$TOOLCHAIN_FINGERPRINT" "$NODE_VERSION" "$NODE_SHA" | shasum -a 256 | awk '{print $1}')"

fetch_locked() {
  local url="$1" expected="$2" destination="$3" pending="$3.pending.$$" attempt
  if [[ -f "$destination" && ! -L "$destination" ]]; then
    [[ "$(shasum -a 256 "$destination" | awk '{print $1}')" == "$expected" ]] \
      || { echo "厂家依赖缓存摘要不符：$destination" >&2; return 1; }
    return
  fi
  for attempt in 1 2 3; do
    rm -f -- "$pending"
    if curl --fail --location --silent --show-error --output "$pending" "$url" \
      && [[ "$(shasum -a 256 "$pending" | awk '{print $1}')" == "$expected" ]]; then
      mv "$pending" "$destination"; return
    fi
  done
  rm -f -- "$pending"
  echo "厂家依赖三次取得或摘要校验失败：$url" >&2
  return 1
}

# 运行库由调用方按固定来源交付，不查询Homebrew或系统安装位置。
OPENSSL_PREFIX="${TUYU_OPENSSL_PREFIX:?缺少验真的OpenSSL编译组件}"
LIBFFI_PREFIX="${TUYU_LIBFFI_PREFIX:?缺少验真的libffi编译组件}"
PANGO_PREFIX="${TUYU_PANGO_PREFIX:?缺少验真的Pango编译组件}"

PYTHON_ARCHIVE="$DOWNLOADS/Python-3.14.3.tgz"
NODE_ARCHIVE="$DOWNLOADS/$NODE_FILENAME"
POSTGRES_ARCHIVE="$DOWNLOADS/postgresql-17.11.tar.bz2"
fetch_locked "$PYTHON_URL" "$PYTHON_SHA" "$PYTHON_ARCHIVE"
fetch_locked "$NODE_URL" "$NODE_SHA" "$NODE_ARCHIVE"
fetch_locked "$POSTGRES_URL" "$POSTGRES_SHA" "$POSTGRES_ARCHIVE"

LANGUAGE_CACHE_HIT=0
if [[ -n "$LANGUAGE_CACHE" && -f "$LANGUAGE_CACHE/fingerprint" \
    && "$(cat "$LANGUAGE_CACHE/fingerprint")" == "$TOOLCHAIN_FINGERPRINT" \
    && -x "$LANGUAGE_CACHE/runtime/python/bin/python3" \
    && -x "$LANGUAGE_CACHE/runtime/node/bin/node" ]]; then
  find "$LANGUAGE" -depth -delete
  ditto "$LANGUAGE_CACHE/runtime" "$LANGUAGE"
  LANGUAGE_CACHE_HIT=1
fi
if [[ "$LANGUAGE_CACHE_HIT" != 1 ]]; then
  tar -xzf "$PYTHON_ARCHIVE" -C "$BUILD"
  (
    cd "$BUILD/Python-3.14.3"
    CPPFLAGS="-I$OPENSSL_PREFIX/include -I$LIBFFI_PREFIX/include" \
    LDFLAGS="-L$OPENSSL_PREFIX/lib -L$LIBFFI_PREFIX/lib" \
    ac_cv_func_dup3=no ac_cv_func_pipe2=no \
      ./configure --prefix="$LANGUAGE/python" --enable-shared \
        --with-ensurepip=install --with-openssl="$OPENSSL_PREFIX"
    make -j"$(sysctl -n hw.logicalcpu)"
    make install
  )
  mkdir -p "$LANGUAGE/licenses"
  cp "$BUILD/Python-3.14.3/LICENSE" "$LANGUAGE/licenses/Python-PSF.txt"
  tar -xzf "$NODE_ARCHIVE" -C "$BUILD"
  ditto "$BUILD/$NODE_ROOT" "$LANGUAGE/node"
  if [[ -n "$LANGUAGE_CACHE" ]]; then
    LANGUAGE_CACHE_NEXT="$LANGUAGE_CACHE.next.$$"
    rm -rf "$LANGUAGE_CACHE_NEXT"
    mkdir -p "$LANGUAGE_CACHE_NEXT"
    ditto "$LANGUAGE" "$LANGUAGE_CACHE_NEXT/runtime"
    printf '%s\n' "$TOOLCHAIN_FINGERPRINT" > "$LANGUAGE_CACHE_NEXT/fingerprint"
    rm -rf "$LANGUAGE_CACHE"
    mv "$LANGUAGE_CACHE_NEXT" "$LANGUAGE_CACHE"
  fi
fi
PYTHON="$LANGUAGE/python/bin/python3"
"$PYTHON" --version 2>&1 | grep -qx 'Python 3.14.3'
"$LANGUAGE/node/bin/node" --version | grep -Fxq "v$NODE_VERSION"
export PATH="$LANGUAGE/node/bin:$PATH"

mkdir -p "$LANGUAGE/bench/apps" "$LANGUAGE/bench/sites" "$LANGUAGE/lib" "$LANGUAGE/licenses"
[[ -f "$LANGUAGE/licenses/Python-PSF.txt" ]] \
  || { echo '厂家端Python许可证缓存不完整' >&2; exit 1; }
cp "$LANGUAGE/node/LICENSE" "$LANGUAGE/licenses/Node-MIT.txt"
for app in frappe erpnext; do
  rsync -a --delete --exclude .git --exclude node_modules \
    "$ROOT/imported/$app/" "$LANGUAGE/bench/apps/$app/"
done
"$PYTHON" - "$LANGUAGE/bench/apps/frappe/pyproject.toml" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
value = path.read_text(encoding="utf-8")
for dependency in ('    "PyMySQL==1.1.2",\n', '    "mysqlclient==2.2.7",\n'):
    if dependency not in value:
        raise SystemExit(f"厂家端 Frappe 数据库依赖行缺失：{dependency.strip()}")
    value = value.replace(dependency, "")
path.write_text(value, encoding="utf-8")
PY
export PYTHONNOUSERSITE=1
# Python依赖由上游pyproject和产品缓存决定；离线模式必须显式选择。
unset PIP_NO_CACHE_DIR UV_NO_CACHE
export PIP_CACHE_DIR="$PACKAGE_CACHE/pip"
export UV_CACHE_DIR="$PACKAGE_CACHE/uv"
mkdir -p "$PIP_CACHE_DIR" "$UV_CACHE_DIR"
PIP_NETWORK_ARGS=()
case "${TUYUFACTORY_OFFLINE:-false}" in
  true) PIP_NETWORK_ARGS+=(--no-index) ;;
  false) ;;
  *) echo 'TUYUFACTORY_OFFLINE只接受true或false' >&2; exit 1 ;;
esac
"$PYTHON" -m pip install --disable-pip-version-check --cache-dir "$PIP_CACHE_DIR" \
  "${PIP_NETWORK_ARGS[@]}" "$LANGUAGE/bench/apps/frappe"
"$PYTHON" -m pip install --disable-pip-version-check --cache-dir "$PIP_CACHE_DIR" \
  "${PIP_NETWORK_ARGS[@]}" "$LANGUAGE/bench/apps/erpnext"
"$PYTHON" -m pip freeze | LC_ALL=C sort > "$LANGUAGE/licenses/python-packages.txt"
"$LANGUAGE/node/bin/node" "$SCRIPT_DIR/build_assets.mjs" "$LANGUAGE"

POSTGRES_CACHE_HIT=0
if [[ -n "$POSTGRES_CACHE" && -f "$POSTGRES_CACHE/fingerprint" \
    && "$(cat "$POSTGRES_CACHE/fingerprint")" == "$TOOLCHAIN_FINGERPRINT" \
    && -x "$POSTGRES_CACHE/runtime/bin/postgres" ]]; then
  find "$POSTGRES" -depth -delete
  ditto "$POSTGRES_CACHE/runtime" "$POSTGRES"
  POSTGRES_CACHE_HIT=1
fi
if [[ "$POSTGRES_CACHE_HIT" != 1 ]]; then
  tar -xjf "$POSTGRES_ARCHIVE" -C "$BUILD"
  (
    cd "$BUILD/postgresql-17.11"
    CPPFLAGS="-I$OPENSSL_PREFIX/include" LDFLAGS="-L$OPENSSL_PREFIX/lib" \
      ./configure --prefix="$POSTGRES" --datadir="$POSTGRES/share/postgresql" \
        --without-icu --without-readline --with-openssl
    make -j"$(sysctl -n hw.logicalcpu)"
    make install
  )
  mkdir -p "$POSTGRES/licenses"
  cp "$BUILD/postgresql-17.11/COPYRIGHT" "$POSTGRES/licenses/PostgreSQL-COPYRIGHT"
  if [[ -n "$POSTGRES_CACHE" ]]; then
    POSTGRES_CACHE_NEXT="$POSTGRES_CACHE.next.$$"
    rm -rf "$POSTGRES_CACHE_NEXT"
    mkdir -p "$POSTGRES_CACHE_NEXT"
    ditto "$POSTGRES" "$POSTGRES_CACHE_NEXT/runtime"
    printf '%s\n' "$TOOLCHAIN_FINGERPRINT" > "$POSTGRES_CACHE_NEXT/fingerprint"
    rm -rf "$POSTGRES_CACHE"
    mv "$POSTGRES_CACHE_NEXT" "$POSTGRES_CACHE"
  fi
fi

is_macho() { file -b "$1" | grep -q 'Mach-O'; }
native_candidates() {
  find "$1" -type f \( -perm -111 -o -name '*.dylib' -o -name '*.so' -o -name '*.so.*' \) \
    | LC_ALL=C sort
}

copy_dependency() {
  local source_file="$1" dependency="$2" library_dir="$3"
  local source_dir dependency_path dependency_name resolved resolved_name
  source_dir="$(dirname "$source_file")"
  case "$dependency" in
    "$OPENSSL_PREFIX"/*|"$LIBFFI_PREFIX"/*|"$PANGO_PREFIX"/*) dependency_path="$dependency" ;;
    @loader_path/*) dependency_path="$source_dir/${dependency#@loader_path/}" ;;
    *) return ;;
  esac
  [[ -e "$dependency_path" ]] || { echo "厂家端 Mach-O 依赖缺失：$dependency_path" >&2; exit 1; }
  dependency_name="$(basename "$dependency_path")"
  resolved="$(realpath "$dependency_path")"
  resolved_name="$(basename "$resolved")"
  if [[ ! -f "$library_dir/$resolved_name" ]]; then
    cp "$resolved" "$library_dir/$resolved_name"
    chmod u+w "$library_dir/$resolved_name"
    while IFS= read -r nested; do copy_dependency "$resolved" "$nested" "$library_dir"; done \
      < <(otool -L "$resolved" | awk 'NR > 1 {print $1}')
  fi
  if [[ "$dependency_name" != "$resolved_name" && ! -e "$library_dir/$dependency_name" ]]; then
    ln -s "$resolved_name" "$library_dir/$dependency_name"
  fi
}

relocate_tree() {
  local tree="$1" library_dir="$2" file_path dependency relative target
  mkdir -p "$library_dir"
  while IFS= read -r file_path; do
    is_macho "$file_path" || continue
    while IFS= read -r dependency; do copy_dependency "$file_path" "$dependency" "$library_dir"; done \
      < <(otool -L "$file_path" | awk 'NR > 1 {print $1}')
  done < <(native_candidates "$tree")

  while IFS= read -r file_path; do
    is_macho "$file_path" || continue
    chmod u+w "$file_path"
    while IFS= read -r dependency; do
      case "$dependency" in
        "$OPENSSL_PREFIX"/*|"$LIBFFI_PREFIX"/*|"$PANGO_PREFIX"/*)
          relative="$($PYTHON -c 'import os,sys; print(os.path.relpath(sys.argv[1], sys.argv[2]))' \
            "$library_dir/$(basename "$dependency")" "$(dirname "$file_path")")"
          install_name_tool -change "$dependency" "@loader_path/$relative" "$file_path"
          ;;
        "$tree"/*)
          target="$dependency"
          relative="$($PYTHON -c 'import os,sys; print(os.path.relpath(sys.argv[1], sys.argv[2]))' \
            "$target" "$(dirname "$file_path")")"
          install_name_tool -change "$dependency" "@loader_path/$relative" "$file_path"
          ;;
      esac
    done < <(otool -L "$file_path" | awk 'NR > 1 {print $1}')
    if [[ "$file_path" == *.dylib ]]; then
      install_name_tool -id "@loader_path/$(basename "$file_path")" "$file_path"
    fi
    # 路径改写会使原动态库签名失效；先恢复构建签名，最终 App 再执行整包签名。
    codesign --force --sign - "$file_path"
  done < <(native_candidates "$tree")

  if native_candidates "$tree" | while IFS= read -r file_path; do \
    if is_macho "$file_path"; then printf '%s\n' "$file_path"; fi; \
    done | \
    while IFS= read -r file_path; do otool -L "$file_path"; done | \
    awk '/^[[:space:]]+\// {print $1}' | \
    grep -F -e "$OPENSSL_PREFIX/" -e "$LIBFFI_PREFIX/" -e "$PANGO_PREFIX/" -e "$WORK_ROOT/" >/dev/null; then
    echo "厂家端 Mach-O 仍引用构建主机路径：$tree" >&2
    exit 1
  fi
}

relocate_tree "$LANGUAGE" "$LANGUAGE/lib"
relocate_tree "$POSTGRES" "$POSTGRES/lib"
"$LANGUAGE/node/bin/node" "$SCRIPT_DIR/materialize.mjs" "$LANGUAGE" "$POSTGRES" "$DESTINATION"
echo "途遇厂家端 macOS 运行包构建通过：$DESTINATION"
