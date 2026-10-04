#!/usr/bin/env python3
"""验证厂家端打包脚本的参数、私有文件与进程故障边界。"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from runtime_common import read_config, write_private_json


class RuntimeHelpersTest(unittest.TestCase):
    def node_contract(self, script: str) -> None:
        # 直接执行生产验证函数；ELF负向字节只在内存中，不伪造已编译运行件。
        result = subprocess.run(
            [os.environ.get("TUYUFACTORY_TEST_NODE", "node"), "--experimental-vm-modules", "--input-type=module", "-"],
            input="import assert from 'node:assert/strict';\n"
                  "import {linuxTarget, verifyElf, verifyLink} from './verify.mjs';\n" + script,
            cwd=ROOT, capture_output=True, text=True, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_linux_target_is_exact_and_never_accepts_other_host(self) -> None:
        self.node_contract("""
for (const [target, arch, machine] of [['linux-arm','arm64',183],['linux-amd','x64',62]]) {
  assert.equal(linuxTarget(target, 'linux', arch).machine, machine);
  for (const host of ['darwin','win32','freebsd']) assert.throws(() => linuxTarget(target,host,arch));
  for (const wrong of ['ia32', 'riscv64', arch === 'x64' ? 'arm64' : 'x64']) {
    assert.throws(() => linuxTarget(target,'linux',wrong));
  }
}
for (const value of [undefined, '', 'linux-arm64', 'LinuxAMD', '__proto__', 'toString']) {
  assert.throws(() => linuxTarget(value,'linux','x64'));
}
""")

    def test_linux_elf_normal_wrong_and_truncated_headers(self) -> None:
        self.node_contract("""
for (const [target, machine] of [['linux-arm',183],['linux-amd',62]]) {
  const header=Buffer.alloc(64);
  header.writeUInt32BE(0x7f454c46); header[4]=2; header[5]=1; header[6]=1;
  header.writeUInt16LE(3,16); header.writeUInt16LE(machine,18);
  header.writeUInt32LE(1,20); header.writeUInt16LE(64,52);
  assert.doesNotThrow(() => verifyElf(header,target,'library.so'));
  assert.throws(() => verifyElf(header,target === 'linux-arm' ? 'linux-amd' : 'linux-arm','wrong.so'));
  for (const length of [0,3,4,20,63]) assert.throws(() => verifyElf(header.subarray(0,length),target,'short'));
  for (const [offset,value] of [[0,0],[4,1],[5,2],[6,0],[16,0],[18,0],[20,0],[52,0]]) {
    const wrong=Buffer.from(header); wrong[offset]=value;
    assert.throws(() => verifyElf(wrong,target,'invalid'));
  }
  assert.throws(() => verifyElf(header,'linux-arm64','unregistered'));
}
""")

    def test_runtime_links_reject_lexical_and_resolved_escape(self) -> None:
        self.node_contract("""
assert.doesNotThrow(() => verifyLink('/bundle','/bundle/bin/python','../lib/python','/bundle/lib/python'));
for (const [target, resolved] of [
  ['/bundle/lib/python','/bundle/lib/python'], ['../../outside','/outside'],
  ['../lib/python','/other/python'], ['../lib/python','/bundle-other/python']
]) assert.throws(() => verifyLink('/bundle','/bundle/bin/python',target,resolved));
""")

    def test_linux_entries_consume_one_builder_and_real_metadata(self) -> None:
        for platform, cpu, package in [("linux-arm", "aarch64", "arm64"), ("linux-amd", "x86_64", "amd64")]:
            metadata = json.loads((ROOT / platform / "package.json").read_text())
            self.assertEqual(metadata["platform"], platform)
            self.assertEqual(metadata["cpuArchitecture"], cpu)
            self.assertEqual(metadata["packageArchitecture"], package)
            entry = (ROOT / platform / "build.sh").read_text()
            self.assertIn(f'exec bash "$SCRIPT_DIR/../build_linux.sh" {platform} "$@"', entry)
            self.assertNotIn("make install", entry)
        builder = (ROOT / "build_linux.sh").read_text()
        self.assertIn("platform, 'package.json'", builder)
        self.assertIn('[[ "$(uname -m)" == "$CPU" ]]', builder)
        self.assertIn('"$LOADER"|libc.so.*', builder)
        self.assertIn('node "$PACKAGING_DIR/verify.mjs" --elf-tree "$tree" "$PLATFORM"', builder)
        self.assertNotIn("Machine:.*AArch64", builder)

    def test_linux_bad_arguments_fail_before_work_creation(self) -> None:
        result = subprocess.run(
            ["bash", str(ROOT / "build_linux.sh"), "linux-client", "/invalid-output"],
            capture_output=True, text=True, check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("目标未登记", result.stderr)
        for platform in ("linux-arm", "linux-amd"):
            result = subprocess.run(["bash", str(ROOT / platform / "build.sh")],
                                    capture_output=True, text=True, check=False)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("usage:", result.stderr)

    def test_linux_cleanup_and_materialization_are_fail_closed(self) -> None:
        builder = (ROOT / "build_linux.sh").read_text()
        self.assertLess(builder.index("NODE_WORK\n"), builder.index('mkdir -p "$WORK_ROOT"'))
        for token in ['BUILD_OWNED=0', 'SOURCES_OWNED=0', 'mkdir "$BUILD"', 'mkdir "$SOURCES"',
                      'realpathSync(part) !== part', 'destination.startsWith(work',
                      "existsSync(path)", 'tuyufactory-host/']:
            self.assertIn(token, builder)
        self.assertNotIn('find "$WORK_ROOT"', builder)
        source = (ROOT / "materialize.mjs").read_text()
        self.assertLess(source.index("linuxTarget(platform)"), source.index("const business ="))
        self.assertLess(source.index("verifyBinary(file, platform)"), source.index("execFileSync(python"))

    def test_private_json_is_atomic_and_readable(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "private.json"
            write_private_json(path, {"ready": True})
            self.assertEqual(read_config(path), {"ready": True})
            if os.name != "nt":
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)

    def test_node_and_yarn_are_owned_by_the_product_lock(self) -> None:
        lock = json.loads((ROOT / "runtime.lock.json").read_text())
        self.assertEqual(lock["node"]["version"], "25.2.1")
        self.assertEqual(set(lock["node"]["archives"]), {"macos", "linux-arm", "linux-amd", "windows"})
        self.assertEqual(lock["yarn"]["version"], "1.22.22")
        for value in [*lock["node"]["archives"].values(), lock["yarn"]]:
            self.assertTrue(value["url"].startswith("https://"))
            self.assertRegex(value["sha256"], r"^[0-9a-f]{64}$")

    def test_product_dependency_preparers_do_not_read_external_flow_roots(self) -> None:
        names = ("verify.mjs", "build_macos.sh", "build_linux.sh",
                 "build_windows_x86_64.ps1", "build_assets.mjs")
        for name in names:
            content = (ROOT / name).read_text()
            self.assertNotIn("flows/dependencies.mjs", content)
        self.assertIn("attempt <= 3", (ROOT / "build_assets.mjs").read_text())
        self.assertIn("for attempt in 1 2 3", (ROOT / "build_macos.sh").read_text())
        self.assertIn("for attempt in 1 2 3", (ROOT / "build_linux.sh").read_text())

    def test_runtime_rejects_missing_arguments(self) -> None:
        result = subprocess.run(
            [sys.executable, str(ROOT / "factory_runtime.py")],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("--config", result.stderr)

    def test_runtime_lock_has_only_factory_apps(self) -> None:
        value = json.loads((ROOT / "runtime.lock.json").read_text(encoding="utf-8"))
        self.assertEqual(value["required_apps"], ["frappe", "erpnext"])
        self.assertFalse(value["network_install_allowed"])
        self.assertEqual(value["postgresql"], "17.11")
        self.assertEqual(value["platforms"], ["macos", "linux-arm", "linux-amd", "windows-x86-64"])
        for source in value["sources"].values():
            self.assertTrue(source["url"].startswith("https://"))
            self.assertRegex(source["sha256"], r"^[0-9a-f]{64}$")


if __name__ == "__main__":
    unittest.main()
