#!/usr/bin/env node
// RELEASE_BUILD: full; CARGO_INCREMENTAL=0

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildHost } from '../../ci/linux-arm/index.mjs';

const identity = Object.freeze({ product: 'tuyufactory', platform: 'host-linux-arm', prefix: 'tuyufactory-host-linux-arm-v', ciTitle: '途遇厂家端 · 主机 LinuxARM · CI', workflow: 'tuyufactory.host-linux-arm.release', artifact: 'tuyufactory-host-linux-arm.tar.gz' });
const root = process.cwd(); const output = process.env.RELEASE_DIR;
function required(value, message) { if (!value) throw new Error(message); }
function run(file, args, cwd = root) { execFileSync(file, args, { cwd, stdio: 'inherit', env: process.env }); }
function json(args) { return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', env: process.env })); }
function parseVersion(value) { const match = /^(0|[1-9]\d*)\.(0|[1-9]\d{0,1})\.(0|[1-9]\d{0,1})$/.exec(value || ''); required(match, 'LinuxARM 软件版本无效'); return match.slice(1).map(Number); }
function base() { const value = { repository: process.env.GITHUB_REPOSITORY, source: process.env.SOURCE_SHA, ciRunID: process.env.CI_RUN_ID }; required(value.repository === 'tuyutata/tuyufactory', '途遇厂家仓库身份无效'); required(/^[0-9a-f]{40}$/.test(value.source || ''), 'LinuxARM Release 源提交无效'); required(/^[1-9][0-9]*$/.test(value.ciRunID || ''), 'LinuxARM CI Run ID 无效'); return value; }
function inputs() { releaseDirectory(realpathSync(root), output); required(output, 'LinuxARM Release 缺少受控资产目录'); const value = { ...base(), version: process.env.SOFTWARE_VERSION, tag: process.env.VERSION_TAG }; parseVersion(value.version); required(value.tag === `${identity.prefix}${value.version}`, 'LinuxARM Tag 无效'); return value; }
function verify(value) { required(process.platform === 'linux' && process.arch === 'arm64', 'LinuxARM Release 必须运行在 ARM64'); required(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() === value.source, 'LinuxARM 源码提交不一致'); const info = json(['api', `repos/${value.repository}/actions/runs/${value.ciRunID}`]); required(String(info?.id) === value.ciRunID && info?.head_sha === value.source && info?.head_branch === 'main' && info?.event === 'workflow_dispatch' && info?.status === 'completed' && info?.conclusion === 'success' && String(info?.display_title || '') === identity.ciTitle && String(info?.path || '').endsWith('/tuyufactory-host-linux-arm-ci.yml'), 'LinuxARM CI Run 身份不一致'); }
function hash(path) { return createHash('sha256').update(readFileSync(path)).digest('hex'); }
function context(value) { writeFileSync('release-context.json', `${JSON.stringify({ repository: value.repository, product_id: identity.product, platform: identity.platform, software_flow: 'release', software_version: value.version, version_tag: value.tag, source_sha: value.source, ci_run_id: Number(value.ciRunID), workflow: identity.workflow }, null, 2)}\n`); }
// 归档列表是解包前置条件；拒绝绝对路径、目录穿越、重复成员和控制字符。
export function archiveEntries(listing) {
  const names = new Set();
  for (const raw of listing.split('\n')) {
    if (!raw) continue;
    const name = raw.replace(/\/$/u, '');
    required(name && !/[\\\\\x00-\x1f\x7f]/u.test(name) && !name.startsWith('/') && !/^[A-Za-z]:/u.test(name), '厂家正式归档路径无效');
    required(name.split('/').every((part) => part && part !== '.' && part !== '..'), '厂家正式归档路径越界');
    required(!names.has(name.toLowerCase()), '厂家正式归档含重复或大小写冲突成员');
    names.add(name.toLowerCase());
  }
  required(names.size > 0, '厂家正式归档为空');
  return names;
}

// 比对最终归档重新展开的每个文件、权限及链接，防止打包工具漏件或改变有效载荷。
function snapshot(directory) {
  const result = [];
  function walk(path) {
    for (const name of readdirSync(path).sort()) {
      const item = join(path, name), stat = lstatSync(item), key = relative(directory, item).replaceAll('\\', '/');
      required(!/[\\\\\x00-\x1f\x7f]/u.test(name) && name !== '.' && name !== '..', '厂家组装包文件名不可安全归档');
      if (stat.isSymbolicLink()) result.push([key, 'link', readlinkSync(item)]);
      else if (stat.isDirectory()) { result.push([key, 'directory']); walk(item); }
      else { required(stat.isFile(), '厂家正式归档含特殊文件'); result.push([key, 'file', stat.mode & 0o777, hash(item)]); }
    }
  }
  walk(directory);
  return JSON.stringify(result);
}

// 正式资产仅在本次Runner临时根；源码、祖先、别名或其它产品平台目录均拒绝。
export function releaseDirectory(root, output) {
  required(realpathSync(root) === root, 'Release源码根必须为规范物理目录');
  required(process.env.RUNNER_TEMP && isAbsolute(process.env.RUNNER_TEMP), 'Release缺少Runner临时根');
  const parent = realpathSync(process.env.RUNNER_TEMP);
  const status = lstatSync(parent);
  const contains = (left, right) => {
    const value = relative(left, right);
    return value === '' || (value !== '..' && !value.startsWith('..' + sep) && !isAbsolute(value));
  };
  required(status.isDirectory() && !status.isSymbolicLink() && realpathSync(parent) === parent
    && !contains(root, parent) && !contains(parent, root), 'Release临时根与源码交叠或经过链接');
  required(output === join(parent, 'tuyufactory-host-linux-arm-release'), 'Release资产目录身份无效');
  return parent;
}

function build(value) {
  verify(value);
  const sourceRoot = realpathSync(root);
  const parent = releaseDirectory(sourceRoot, output);
  let owned = null;
  let complete = false;
  try {
    // 已有成功资产绝不在开始时清空；本次创建成功后才有失败清理权。
    mkdirSync(output); owned = lstatSync(output);
    buildHost({ flow: 'release', version: value.version, consume(bundle, work) {
      const originalSnapshot = snapshot(bundle);
      const asset = join(output, identity.artifact);
      run('tar', ['-C', work, '-czf', asset, basename(bundle)]);
      const archiveHash = hash(asset);
      const entries = archiveEntries(execFileSync('tar', ['-tf', asset], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));
      const bundleName = basename(bundle).toLowerCase();
      required([...entries].every((name) => name === bundleName || name.startsWith(bundleName + '/')), '厂家正式归档包含包外成员');
      const unpacked = join(work, 'archive-check');
      mkdirSync(unpacked);
      required(hash(asset) === archiveHash, '厂家正式归档在验证中发生变化');
      run('tar', ['-xf', asset, '-C', unpacked]);
      const unpackedBundle = join(unpacked, basename(bundle));
      run(process.execPath, [join(root, 'scripts/verify.mjs'), '--package', unpackedBundle, 'host', 'linux-arm', 'signed']);
      required(originalSnapshot === snapshot(unpackedBundle), '厂家正式归档回读与组装包不一致');
      required(hash(asset) === archiveHash, '厂家正式归档在回读后发生变化');
      const manifest = { product_id: identity.product, platform: identity.platform, software_version: value.version, git_commit_sha: value.source, ci_run_id: Number(value.ciRunID), assets: [{ name: identity.artifact, sha256: archiveHash }] };
      const manifestPath = join(output, 'release-manifest.json');
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
      writeFileSync(join(output, 'SHA256SUMS'), `${[`${archiveHash}  ${identity.artifact}`, `${hash(manifestPath)}  release-manifest.json`].sort().join('\n')}\n`, { flag: 'wx' });
    } });
    complete = true;
  } finally {
    if (owned && !complete) {
      const current = lstatSync(output);
      required(!current.isSymbolicLink() && current.isDirectory() && current.dev === owned.dev &&
        current.ino === owned.ino && realpathSync(output) === resolve(output) && realpathSync(parent) === parent,
        '厂家失败资产目录归属发生变化，拒绝清理');
      rmSync(output, { recursive: true, force: true });
    }
  }
}
function publish(value) { verify(value); const assets = [identity.artifact, 'release-manifest.json', 'SHA256SUMS'].map((name) => join(output, name)); assets.forEach((path) => required(existsSync(path), `LinuxARM Release 资产缺失：${path}`)); required(spawnSync('gh', ['release', 'view', value.tag, '--repo', value.repository], { stdio: 'ignore' }).status !== 0, 'LinuxARM 正式 Release 已存在'); run('gh', ['release', 'create', value.tag, '--repo', value.repository, '--target', value.source, '--latest=false', '--title', `途遇厂家主机端 LinuxARM ${value.version}`, '--notes', `SOURCE_SHA:${value.source}`, ...assets]); }
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
try { const command = process.argv[2]; const value = inputs(); if (command === 'verify-release-source') verify(value); else if (command === 'write-context') context(value); else if (command === 'build-release') build(value); else if (command === 'publish-release') publish(value); else throw new Error(`LinuxARM Release 子命令未登记：${command || '(empty)'}`); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
