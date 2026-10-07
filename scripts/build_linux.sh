#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PACKAGING_DIR="$SCRIPT_DIR"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PLATFORM="${1:?usage: build_linux.sh PLATFORM DESTINATION}"
DESTINATION="${2:?usage: build_linux.sh PLATFORM DESTINATION}"
[[ "$#" -eq 2 ]] || { echo '厂家Linux构建参数数量错误' >&2; exit 1; }
case "$PLATFORM" in
  linux-arm) CPU=aarch64; NODE_ARCH=arm64; LOADER=ld-linux-aarch64.so.1 ;;
  linux-amd) CPU=x86_64; NODE_ARCH=x64; LOADER=ld-linux-x86-64.so.2 ;;
  *) echo '厂家Linux目标未登记' >&2; exit 1 ;;
esac
export TUYUFACTORY_PLATFORM="$PLATFORM"
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
WORK_ROOT="${TUYUFACTORY_WORK_DIR:-${TMPDIR:-$PRODUCT_TARGET_TEMP_ROOT}/tuyufactory/host/$PLATFORM}"
BUILD="${TUYUFACTORY_BUILD_DIR:-$WORK_ROOT/build}"
DEPENDENCY_ROOT="${TUYUFACTORY_DEPENDENCY_DIR:-$WORK_ROOT/dependencies}"
export TUYUFACTORY_DEPENDENCY_DIR="$DEPENDENCY_ROOT"
DOWNLOADS="$DEPENDENCY_ROOT/archives"
SOURCES="$WORK_ROOT/sources"
LANGUAGE="$BUILD/language"
POSTGRES="$BUILD/postgresql"

[[ "$(uname -s)" == Linux ]] || { echo '厂家端 Linux 运行包必须在 Linux 主机生成' >&2; exit 1; }
[[ "$(uname -m)" == "$CPU" ]] || { echo "厂家端 $PLATFORM 必须在真实 $CPU 主机生成" >&2; exit 1; }
# 写入和清理前校验准确任务边界，绝不覆盖旧工作树或已成功运行包。
node --input-type=module - "$WORK_ROOT" "$DESTINATION" "$PLATFORM" <<'NODE_WORK'
import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
const [work, destination, platform] = process.argv.slice(2);
const source = resolve(process.cwd());
function canonical(path) {
  if (!isAbsolute(path) || resolve(path) !== path) throw new Error('厂家任务路径不规范');
  for (let part = path; part !== dirname(part); part = dirname(part)) {
    if (existsSync(part) && (lstatSync(part).isSymbolicLink() || realpathSync(part) !== part)) {
      throw new Error('厂家任务路径不能经过符号链接');
    }
  }
}
canonical(work); canonical(destination);
if (!work.startsWith(source + '/target/')) throw new Error('厂家工作目录必须位于产品源码外');
if (!destination.startsWith(work + '/') || existsSync(destination)) throw new Error('厂家目标必须是当前任务内的新运行包');
for (const child of ['build', 'sources']) {
  const path = join(work, child);
  if (existsSync(path) || destination === path || destination.startsWith(path + '/')) {
    throw new Error('厂家构建不覆盖既有中间目录，运行包不得位于清理目录');
  }
}
NODE_WORK
for command_name in node curl sha256sum tar make gcc file readelf patchelf ldd dpkg-query cmp; do
  command -v "$command_name" >/dev/null || { echo "厂家端 Linux 构建命令缺失：$command_name" >&2; exit 1; }
done

BUILD_OWNED=0
SOURCES_OWNED=0
cleanup() {
  # 只删除本进程排他创建的中间目录；创建冲突不能清理另一任务内容。
  if [[ "$BUILD_OWNED" == 1 ]]; then find "$BUILD" -depth -delete; fi
  if [[ "$SOURCES_OWNED" == 1 ]]; then find "$SOURCES" -depth -delete; fi
}

LOCK_VALUES="$(node --input-type=module - "$PACKAGING_DIR/runtime.lock.json" "$PLATFORM" "$NODE_ARCH" <<'NODE'
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const lock = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const platform = process.argv[3], arch = process.argv[4];
const metadata = JSON.parse(readFileSync(join(dirname(process.argv[2]), platform, 'package.json'), 'utf8'));
const {runtimeTool} = await import(pathToFileURL(join(dirname(process.argv[2]), 'verify.mjs')));
const node = await runtimeTool('node', platform);
if (metadata.platform !== platform || metadata.cpuArchitecture !== (arch === 'arm64' ? 'aarch64' : 'x86_64') ||
    metadata.packageArchitecture !== (arch === 'arm64' ? 'arm64' : 'amd64')) throw new Error('厂家Linux入口与平台声明不一致');
if (!lock.platforms.includes(platform)) throw new Error('厂家运行时目标未登记');
const sources = [lock.sources.python_source, node, lock.sources.postgresql_source].map(value => {
  if (!value || !value.url.startsWith('https://') || !/^[a-f0-9]{64}$/.test(value.sha256)) throw new Error('厂家依赖缺少可信来源或摘要');
  return value;
});
for (const version of [lock.python, node.version, lock.postgresql]) {
  if (!/^\d+\.\d+\.\d+$/.test(version) && !/^\d+\.\d+$/.test(version)) throw new Error('厂家运行时版本格式错误');
}
console.log([lock.python, node.version, lock.postgresql, node.filename, node.root,
  ...sources.flatMap(value => [value.url, value.sha256])].join('\t'));
NODE
)"
IFS=$'\t' read -r PYTHON_VERSION NODE_VERSION POSTGRES_VERSION NODE_FILENAME NODE_ROOT PYTHON_URL PYTHON_SHA NODE_URL NODE_SHA POSTGRES_URL POSTGRES_SHA <<< "$LOCK_VALUES"

fetch_locked() {
  local url="$1" expected="$2" destination="$3" pending="$3.pending.$$" attempt
  if [[ -f "$destination" && ! -L "$destination" ]]; then
    [[ "$(sha256sum "$destination" | awk '{print $1}')" == "$expected" ]] \
      || { echo "厂家依赖缓存摘要不符：$destination" >&2; return 1; }
    return
  fi
  for attempt in 1 2 3; do
    rm -f -- "$pending"
    if curl --fail --location --silent --show-error --output "$pending" "$url" \
      && [[ "$(sha256sum "$pending" | awk '{print $1}')" == "$expected" ]]; then
      mv "$pending" "$destination"; return
    fi
  done
  rm -f -- "$pending"
  echo "厂家依赖三次取得或摘要校验失败：$url" >&2
  return 1
}

trap cleanup EXIT
mkdir -p "$WORK_ROOT"
mkdir -p "$DOWNLOADS"
mkdir "$BUILD"
BUILD_OWNED=1
mkdir "$SOURCES"
SOURCES_OWNED=1
mkdir -p "$LANGUAGE" "$POSTGRES"

PYTHON_ARCHIVE="$DOWNLOADS/Python-$PYTHON_VERSION.tgz"
NODE_ARCHIVE="$DOWNLOADS/$NODE_FILENAME"
POSTGRES_ARCHIVE="$DOWNLOADS/postgresql-$POSTGRES_VERSION.tar.bz2"
fetch_locked "$PYTHON_URL" "$PYTHON_SHA" "$PYTHON_ARCHIVE"
fetch_locked "$NODE_URL" "$NODE_SHA" "$NODE_ARCHIVE"
fetch_locked "$POSTGRES_URL" "$POSTGRES_SHA" "$POSTGRES_ARCHIVE"

tar -xzf "$PYTHON_ARCHIVE" -C "$BUILD"
(
  cd "$BUILD/Python-$PYTHON_VERSION"
  ./configure --prefix="$LANGUAGE/python" --enable-shared --with-ensurepip=install
  make -j"$(getconf _NPROCESSORS_ONLN)"
  make install
)
PYTHON="$LANGUAGE/python/bin/python3"
LD_LIBRARY_PATH="$LANGUAGE/python/lib" "$PYTHON" --version 2>&1 | grep -Fxq "Python $PYTHON_VERSION"

tar -xJf "$NODE_ARCHIVE" -C "$BUILD"
cp -a "$BUILD/$NODE_ROOT" "$LANGUAGE/node"
"$LANGUAGE/node/bin/node" --version | grep -Fxq "v$NODE_VERSION"
export PATH="$LANGUAGE/node/bin:$PATH"

mkdir -p "$LANGUAGE/bench/apps" "$LANGUAGE/bench/sites" "$LANGUAGE/lib" "$LANGUAGE/licenses"
cp "$BUILD/Python-$PYTHON_VERSION/LICENSE" "$LANGUAGE/licenses/Python-PSF.txt"
cp "$LANGUAGE/node/LICENSE" "$LANGUAGE/licenses/Node-MIT.txt"
for app in frappe erpnext; do
  cp -a "$ROOT/imported/$app" "$LANGUAGE/bench/apps/$app"
  find "$LANGUAGE/bench/apps/$app" -name .git -depth -delete
  find "$LANGUAGE/bench/apps/$app" -type d -name node_modules -depth -delete
done
LD_LIBRARY_PATH="$LANGUAGE/python/lib" "$PYTHON" - "$LANGUAGE/bench/apps/frappe/pyproject.toml" <<'PY'
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
export PYTHONNOUSERSITE=1 PIP_CACHE_DIR="$BUILD/pip" LD_LIBRARY_PATH="$LANGUAGE/python/lib"
# Python依赖由上游pyproject和产品缓存决定；离线模式必须显式选择。
unset PIP_NO_CACHE_DIR UV_NO_CACHE
export PIP_CACHE_DIR="$DEPENDENCY_ROOT/package-managers/pip"
export UV_CACHE_DIR="$DEPENDENCY_ROOT/package-managers/uv"
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
"$LANGUAGE/node/bin/node" "$PACKAGING_DIR/build_assets.mjs" "$LANGUAGE"
