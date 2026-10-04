#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { runtimeTool } from './verify.mjs';

const source = process.argv[2];
if (!source) throw new Error('usage: build_assets.mjs LANGUAGE_SOURCE');
if (!process.env.TUYUFACTORY_DEPENDENCY_DIR) throw new Error('厂家资源构建缺少TUYUFACTORY_DEPENDENCY_DIR');
const nodeSource = await runtimeTool('node');
const yarnSource = await runtimeTool('yarn');

const bench = join(source, 'bench');
const frappe = join(bench, 'apps', 'frappe');
const erpnext = join(bench, 'apps', 'erpnext');
const assets = join(bench, 'sites', 'assets');
const node = process.platform === 'win32'
  ? join(source, 'node', 'node.exe')
  : join(source, 'node', 'bin', 'node');
// Yarn只在本次资源构建中使用，不进入运行包，也不依赖Node附带包管理器。
const yarnWork = join(source, '.yarn');
const yarn = join(yarnWork, yarnSource.root, 'bin', 'yarn.js');
const pathKey = Object.keys(process.env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH';
const childEnvironment = {
  ...process.env,
  FRAPPE_BENCH_ROOT: bench,
  NODE_OPTIONS: '--max_old_space_size=4096',
  YARN_CACHE_FOLDER: process.env.YARN_CACHE_FOLDER ||
    join(process.env.TUYUFACTORY_DEPENDENCY_DIR, 'package-managers', 'yarn'),
};
// 主调用直接运行 Yarn JS，Windows 不执行 .cmd；上游子进程仍能找到官方 Yarn 入口。
childEnvironment[pathKey] = [dirname(node), dirname(yarn), childEnvironment[pathKey]]
  .filter(Boolean).join(delimiter);

function required(value, message) {
  if (!value) throw new Error(message);
}

function run(file, args, cwd) {
  execFileSync(file, args, {
    cwd,
    stdio: 'inherit',
    env: childEnvironment,
  });
}

function version(file, args) {
  return execFileSync(file, args, {
    encoding: 'utf8',
    env: childEnvironment,
  }).trim();
}

function copyTree(from, to) {
  cpSync(from, to, {
    recursive: true,
    force: true,
    dereference: process.platform === 'win32',
  });
}

function removeBundleStyles(directory) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory)) {
    const item = join(directory, entry);
    const stat = lstatSync(item);
    if (stat.isDirectory()) removeBundleStyles(item);
    else if (entry.endsWith('.bundle.css')) rmSync(item, { force: true });
  }
}

for (const item of [node, join(frappe, 'yarn.lock'), join(erpnext, 'yarn.lock')]) {
  required(existsSync(item), `厂家端资源构建输入缺失：${item}`);
}
required(version(node, ['--version']) === `v${nodeSource.version}`, `厂家端资源构建 Node 版本必须为 ${nodeSource.version}`);
for (const app of [frappe, erpnext]) {
  required(existsSync(join(app, app === frappe ? 'frappe' : 'erpnext', 'public')),
    `厂家端应用公开资源目录缺失：${app}`);
}

async function materializeArchive(specification, destination) {
  if (existsSync(destination)) {
    required(!lstatSync(destination).isSymbolicLink() &&
      createHash('sha256').update(readFileSync(destination)).digest('hex') === specification.sha256,
    '厂家Yarn缓存摘要不符');
    return;
  }
  const pending = `${destination}.pending-${process.pid}`;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    rmSync(pending, { force: true });
    try {
      const response = await fetch(specification.url, { signal: AbortSignal.timeout(120_000) });
      required(response.ok, `厂家Yarn下载状态无效：${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      required(createHash('sha256').update(bytes).digest('hex') === specification.sha256,
        '厂家Yarn下载摘要不符');
      writeFileSync(pending, bytes, { flag: 'wx' });
      renameSync(pending, destination);
      return;
    } catch (error) {
      rmSync(pending, { force: true });
      if (attempt === 3) throw error;
    }
  }
}

// 排他创建后才拥有清理权限；Yarn版本和原件摘要来自产品锁。
mkdirSync(yarnWork);
try {
  const yarnArchive = join(yarnWork, yarnSource.filename);
  await materializeArchive(yarnSource, yarnArchive);
  run('tar', ['-xzf', yarnArchive, '-C', yarnWork], source);
  required(version(node, [yarn, '--version']) === yarnSource.version,
    `厂家端资源构建 Yarn 版本必须为 ${yarnSource.version}`);
  mkdirSync(childEnvironment.YARN_CACHE_FOLDER, { recursive: true });
  const network = process.env.TUYUFACTORY_OFFLINE === 'true' ? ['--offline'] : [];
  if (process.env.TUYUFACTORY_OFFLINE && !['true', 'false'].includes(process.env.TUYUFACTORY_OFFLINE)) {
    throw new Error('TUYUFACTORY_OFFLINE只接受true或false');
  }
  const yarnInstall = ['--cache-folder', childEnvironment.YARN_CACHE_FOLDER,
    'install', '--frozen-lockfile', '--non-interactive', '--network-timeout', '60000', ...network];
  run(node, [yarn, ...yarnInstall], frappe);
  run(node, [yarn, ...yarnInstall, '--ignore-scripts'], erpnext);

  rmSync(assets, { recursive: true, force: true });
  mkdirSync(assets, { recursive: true });
  writeFileSync(join(bench, 'sites', 'apps.txt'), 'frappe\nerpnext\n', 'utf8');
  copyTree(join(frappe, 'frappe', 'public'), join(assets, 'frappe'));
  copyTree(join(erpnext, 'erpnext', 'public'), join(assets, 'erpnext'));

  const publicModules = join(frappe, 'frappe', 'public', 'node_modules');
  required(!existsSync(publicModules), '厂家端资源构建发现未登记的 public/node_modules');
  if (process.platform === 'win32') {
    symlinkSync(join(frappe, 'node_modules'), publicModules, 'junction');
  } else {
    symlinkSync('../../node_modules', publicModules, 'dir');
  }

  try {
    removeBundleStyles(join(frappe, 'frappe', 'public', 'scss'));
    removeBundleStyles(join(erpnext, 'erpnext', 'public', 'scss'));
    run(node, ['esbuild', '--production', '--apps', 'frappe,erpnext'], frappe);

    const manifestPath = join(assets, 'assets.json');
    required(existsSync(manifestPath), '厂家端资源构建没有生成 assets.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    for (const key of ['login.bundle.css', 'desk.bundle.js', 'erpnext.bundle.js']) {
      required(typeof manifest[key] === 'string' && manifest[key].startsWith('/assets/'),
        `厂家端资源清单缺少：${key}`);
    }
  } finally {
    rmSync(publicModules, { recursive: true, force: true });
    removeBundleStyles(join(frappe, 'frappe', 'public', 'scss'));
    removeBundleStyles(join(erpnext, 'erpnext', 'public', 'scss'));
    for (const app of [frappe, erpnext]) {
      rmSync(join(app, 'node_modules'), { recursive: true, force: true });
      rmSync(join(app, '.git'), { recursive: true, force: true });
    }
  }
} finally {
  rmSync(yarnWork, { recursive: true, force: true });
}

console.log(`途遇厂家端浏览器资源构建通过：${assets}`);
