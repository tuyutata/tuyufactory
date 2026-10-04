#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import { linuxTarget, runtimeTool, verifyBinary, verifyTree } from './verify.mjs';

const [language, postgres, destination] = process.argv.slice(2);
if (!language || !postgres || !destination) {
  throw new Error('usage: materialize.mjs LANGUAGE_SOURCE POSTGRES_SOURCE DESTINATION');
}
if (existsSync(destination)) throw new Error(`厂家端运行包目标已经存在：${destination}`);

const scripts = import.meta.dirname;
const root = join(scripts, '..');
const lock = JSON.parse(readFileSync(join(scripts, 'runtime.lock.json'), 'utf8'));
const platform = process.env.TUYUFACTORY_PLATFORM;
const nodeSource = await runtimeTool('node', platform);
if (platform !== undefined || process.platform === 'linux') {
  linuxTarget(platform);
  if (!lock.platforms.includes(platform)) throw new Error('厂家Linux运行件目标未登记');
  // 在运行任何候选程序以及复制载荷之前拒绝混合架构与越界链接。
  verifyTree(language, platform);
  verifyTree(postgres, platform);
}
const python = process.platform === 'win32'
  ? join(language, 'python', 'python.exe')
  : join(language, 'python', 'bin', 'python3');
const node = process.platform === 'win32'
  ? join(language, 'node', 'node.exe')
  : join(language, 'node', 'bin', 'node');
const postgresExecutable = (name) => join(postgres, 'bin', process.platform === 'win32' ? `${name}.exe` : name);

function required(value, message) {
  if (!value) throw new Error(message);
}

function copyTree(from, to, options = {}) {
  required(existsSync(from), `厂家端运行包输入缺失：${from}`);
  cpSync(from, to, {
    recursive: true,
    force: true,
    preserveTimestamps: true,
    dereference: process.platform === 'win32',
    verbatimSymlinks: process.platform !== 'win32',
    ...options,
  });
}

function copySource(from, to) {
  copyTree(from, to, {
    filter: (item) => {
      const name = basename(item);
      return !['.git', 'node_modules', '__pycache__'].includes(name) && !name.endsWith('.pyc');
    },
  });
}

function visit(directory, operation) {
  if (!existsSync(directory)) return;
  for (const name of readdirSync(directory)) {
    const item = join(directory, name);
    operation(item, name);
    if (existsSync(item) && lstatSync(item).isDirectory()) visit(item, operation);
  }
}

for (const item of [
  python,
  node,
  postgresExecutable('postgres'),
  postgresExecutable('initdb'),
  postgresExecutable('pg_ctl'),
  postgresExecutable('psql'),
  join(language, 'bench', 'sites', 'assets', 'assets.json'),
  join(root, 'imported', 'frappe', 'LICENSE'),
  join(root, 'imported', 'erpnext', 'license.txt'),
]) required(existsSync(item), `厂家端运行包输入缺失：${item}`);

if (process.platform === 'linux') {
  for (const file of [python, node, ...['postgres', 'initdb', 'pg_ctl', 'psql'].map(postgresExecutable)]) {
    verifyBinary(file, platform);
  }
}

const frappeCommit = execFileSync('git', ['-C', join(root, 'imported', 'frappe'), 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const erpnextCommit = execFileSync('git', ['-C', join(root, 'imported', 'erpnext'), 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
required(frappeCommit === lock.frappe_commit, `厂家端 Frappe 提交不一致：${frappeCommit}`);
required(erpnextCommit === lock.erpnext_commit, `厂家端 ERPNext 提交不一致：${erpnextCommit}`);
required(execFileSync(python, ['--version'], { encoding: 'utf8' }).trim() === `Python ${lock.python}`,
  '厂家端 Python 版本不一致');
required(execFileSync(node, ['--version'], { encoding: 'utf8' }).trim() === `v${nodeSource.version}`,
  '厂家端 Node 版本不一致');
required(execFileSync(postgresExecutable('postgres'), ['--version'], { encoding: 'utf8' }).trim()
  === `postgres (PostgreSQL) ${lock.postgresql}`,
  '厂家端 PostgreSQL 版本不一致');

const business = join(destination, 'business');
mkdirSync(join(business, 'bench', 'apps'), { recursive: true });
mkdirSync(join(business, 'bench', 'sites'), { recursive: true });
mkdirSync(join(business, 'licenses'), { recursive: true });
copyTree(join(language, 'python'), join(business, 'python'));
copyTree(join(language, 'node'), join(business, 'node'));
if (existsSync(join(language, 'lib'))) copyTree(join(language, 'lib'), join(business, 'lib'));
else mkdirSync(join(business, 'lib'), { recursive: true });
copySource(join(root, 'imported', 'frappe'), join(business, 'bench', 'apps', 'frappe'));
copySource(join(root, 'imported', 'erpnext'), join(business, 'bench', 'apps', 'erpnext'));
copyTree(join(language, 'bench', 'sites', 'assets'), join(business, 'bench', 'sites', 'assets'));
copyTree(postgres, join(destination, 'postgresql'));
if (existsSync(join(language, 'licenses'))) {
  copyTree(join(language, 'licenses'), join(business, 'licenses', 'runtime'));
}

const packageRoots = [];
visit(join(business, 'python'), (item, name) => {
  if (name === 'site-packages' && lstatSync(item).isDirectory()) packageRoots.push(item);
});
for (const packageRoot of packageRoots) {
  for (const app of ['frappe', 'erpnext', 'hrms', 'kamra', 'ury']) {
    rmSync(join(packageRoot, app), { recursive: true, force: true });
    if (!['frappe', 'erpnext'].includes(app)) {
      for (const name of readdirSync(packageRoot)) {
        if (name.toLowerCase().startsWith(`${app}-`) && name.endsWith('.dist-info')) {
          rmSync(join(packageRoot, name), { recursive: true, force: true });
        }
      }
    }
  }
}

const manifestPath = join(business, 'bench', 'sites', 'assets', 'assets.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const blockedApps = ['hrms', 'kamra', 'ury'];
const filtered = Object.fromEntries(Object.entries(manifest).filter(([key, value]) => {
  const encoded = `${key} ${String(value)}`.toLowerCase();
  return !blockedApps.some((app) => encoded.includes(app));
}));
writeFileSync(manifestPath, `${JSON.stringify(filtered)}\n`, 'utf8');
for (const app of blockedApps) {
  rmSync(join(business, 'bench', 'sites', 'assets', app), { recursive: true, force: true });
}

for (const script of ['runtime_common.py', 'https_server.py', 'frappe_worker.py', 'factory_runtime.py', 'employee_gateway.py']) {
  const target = join(business, script);
  cpSync(join(scripts, script), target);
  try { chmodSync(target, 0o755); } catch {}
}
// 产物记录实际验真版本，源配置不复制第二份工具版本与归档摘要。
writeFileSync(join(business, 'runtime.lock.json'), `${JSON.stringify({...lock, node: nodeSource.version}, null, 2)}\n`, 'utf8');
cpSync(join(scripts, 'schema.sql'), join(destination, 'schema.sql'));
cpSync(join(root, 'imported', 'frappe', 'LICENSE'), join(business, 'licenses', 'frappe-MIT.txt'));
cpSync(join(root, 'imported', 'erpnext', 'license.txt'), join(business, 'licenses', 'erpnext-GPL-3.0.txt'));

execFileSync(process.execPath, [join(scripts, 'verify.mjs'), destination,
  ...(process.platform === 'linux' ? [platform] : [])], { stdio: 'inherit' });
console.log(`已物化途遇厂家端独立运行包：${destination}`);
