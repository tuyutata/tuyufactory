#!/usr/bin/env bash
set -euo pipefail
# 正式AMD64入口固定目标，调用唯一Linux实现，不允许调用者覆盖架构。
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec bash "$SCRIPT_DIR/../build_linux.sh" linux-amd "$@"
