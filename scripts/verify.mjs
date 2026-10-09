#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { closeSync, existsSync, lstatSync, openSync, readFileSync, readlinkSync, readdirSync, readSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveFirstPartyDependencies, verifyProject } from '../app/scripts/project.mjs';

// 工具版本、官方平台归档和摘要只由TuyuFactory产品锁决定。
export async function runtimeTool(id, platform = process.platform === 'darwin' ? 'macos' :
  process.platform === 'win32' ? 'windows' : process.env.TUYUFACTORY_PLATFORM) {
  const lock = JSON.parse(readFileSync(join(import.meta.dirname, 'runtime.lock.json'), 'utf8'));
  if (id === 'yarn') return {...lock.yarn, filename: 'yarn-1.22.22.tgz'};
  if (id !== 'node' || !lock.node?.archives?.[platform]) throw new Error('厂家运行时工具或平台未登记');
  const archive = lock.node.archives[platform];
  return {...archive, version: lock.node.version, filename: basename(new URL(archive.url).pathname)};
}

// 精确目标先于任何运行件执行；ARM和AMD64绝不能以“任一64位架构”互相放行。
export function linuxTarget(platform, host = process.platform, architecture = process.arch) {
  const targets = {
    'linux-arm': { architecture: 'arm64', machine: 183 },
    'linux-amd': { architecture: 'x64', machine: 62 },
  };
  const target = targets[platform];
  if (!Object.hasOwn(targets, platform) || host !== 'linux' || architecture !== target.architecture) {
    throw new Error(`厂家运行件目标与执行架构不一致：${platform}`);
  }
  return target;
}

export function verifyElf(header, platform, file) {
  const machine = platform === 'linux-arm' ? 183 : platform === 'linux-amd' ? 62 : null;
  if (machine === null || header.length < 64 || header.readUInt32BE(0) !== 0x7f454c46 ||
      header[4] !== 2 || header[5] !== 1 || header[6] !== 1 ||
      ![1, 2, 3].includes(header.readUInt16LE(16)) || header.readUInt16LE(18) !== machine ||
      header.readUInt32LE(20) !== 1 || header.readUInt16LE(52) !== 64) {
    throw new Error(`厂家运行件不是目标${platform}的有效ELF64：${file}`);
  }
}

export function verifyLink(root, file, target, resolved) {
  const inside = (value) => {
    const part = relative(root, value).replaceAll('\\', '/');
    return part !== '..' && !part.startsWith('../') && !isAbsolute(part);
  };
  if (isAbsolute(target) || !inside(resolve(file, '..', target)) || !inside(resolved)) {
    throw new Error(`厂家运行件链接越出运行包：${relative(root, file)}`);
  }
}

function fileHeader(file) {
  const fd = openSync(file, 'r');
  try {
    const header = Buffer.alloc(64);
    return header.subarray(0, readSync(fd, header, 0, header.length, 0));
  } finally { closeSync(fd); }
}

// 产品/平台闭集用于打包校验，不提供安装后的角色选择。
export function packageTarget(role, platform) {
  const platforms = { host: ['macos', 'windows', 'linux-arm', 'linux-amd'],
    client: ['macos', 'windows', 'ios', 'android'] };
  if (!Object.hasOwn(platforms, role) || !platforms[role].includes(platform)) {
    throw new Error('厂家安装目标必须是已登记的主机或client平台');
  }
  return { role, platform, applicationId: role === 'host' ? 'com.tuyufactory' : 'com.tuyufactory.client',
    architecture: ['windows', 'linux-amd'].includes(platform) ? 'x64' : 'arm64' };
}

export function packageInside(root, path) {
  const part = relative(root, path);
  return part !== '' && part !== '..' && !part.startsWith('..' + sep) && !isAbsolute(part);
}

// 验真实际二进制头；扩展名不能把其他平台程序伪装成目标运行件。
export function packageBinary(value, platform, name) {
  const fail = () => { throw new Error(`厂家包二进制架构或格式错误：${name}`); };
  if (platform.startsWith('linux-') || platform === 'android') {
    verifyElf(value, platform === 'android' ? 'linux-arm' : platform, name);
  } else if (platform === 'windows') {
    if (value.length < 64 || value.readUInt16LE(0) !== 0x5a4d) fail();
    const offset = value.readUInt32LE(0x3c);
    if (offset < 64 || offset + 26 > value.length || value.readUInt32LE(offset) !== 0x4550 ||
        value.readUInt16LE(offset + 4) !== 0x8664 || value.readUInt16LE(offset + 24) !== 0x20b) fail();
  } else if (platform === 'macos' || platform === 'ios') {
    // 只接受单一ARM64 Mach-O，不允许fat包混入Intel切片。
    if (value.length < 32 || value.readUInt32LE(0) !== 0xfeedfacf ||
        value.readUInt32LE(4) !== 0x100000c || ![2, 6, 8].includes(value.readUInt32LE(12))) fail();
    let offset = 32, system;
    const count = value.readUInt32LE(16), size = value.readUInt32LE(20);
    if (32 + size > value.length) fail();
    for (let index = 0; index < count; index++) {
      if (offset + 8 > 32 + size) fail();
      const command = value.readUInt32LE(offset), length = value.readUInt32LE(offset + 4);
      if (length < 8 || offset + length > 32 + size) fail();
      if (command === 0x32) { if (length < 24) fail(); system = value.readUInt32LE(offset + 8); }
      if (command === 0x24) system = 1;
      if (command === 0x25) system = 2;
      offset += length;
    }
    if (offset !== 32 + size || system !== (platform === 'macos' ? 1 : 2)) fail();
  } else fail();
}

function nativeFile(value, name) {
  return /\.(?:so(?:\.[\w.-]+)?|dylib|dll|exe|pyd|node)$/i.test(name) ||
    (value.length >= 4 && [0x7f454c46, 0xcffaedfe, 0xfeedfacf, 0xcafebabe, 0xbebafeca,
      0xfeedface, 0xcefaedfe, 0xcafebabf, 0xbfbafeca].includes(value.readUInt32BE(0))) ||
    (value.length >= 2 && value.readUInt16LE(0) === 0x5a4d);
}

// 库存来源必须是实际遍历或解包结果；测试可传内存字节，不能把它写成正式验收回执。
export function verifyPackageFiles(role, platform, files, applicationId, executable) {
  const target = packageTarget(role, platform);
  if (applicationId !== target.applicationId) throw new Error('厂家安装身份与产品角色不一致');
  const entries = new Map();
  for (const [path, value] of files) {
    if (!path || /[\\:\x00-\x1f]/.test(path) || path.startsWith('/') || path.split('/').some(p => !p || p === '.' || p === '..') ||
        entries.has(path.toLowerCase())) throw new Error('厂家包路径不规范或大小写重名');
    const lower = path.toLowerCase();
    // Map只存文件头，避免把整个ERP/browser运行件常驻内存。
    entries.set(lower, Buffer.from(value.subarray(0, nativeFile(value, path) ?
      Math.max(4096, value.length >= 32 && value.readUInt32LE(0) === 0xfeedfacf ? 32 + value.readUInt32LE(20) : 0) : 0)));
    if (/(?:^|\/)(?:\.git|\.dart_tool|pubspec_overrides\.yaml|\.env|private\.json|host\.json)(?:\/|$)/.test(lower) ||
        /\.(?:key|p12|pfx|keystore)$/.test(lower)) throw new Error(`厂家包混入开发状态或秘密文件：${path}`);
    if (role === 'client' && (/(?:^|\/)(?:business|postgresql|frappe|erpnext|bench|schema\.sql|runtime\.lock\.json|factory_runtime\.py|employee_gateway\.py)(?:\/|$)/.test(lower) ||
        /(?:^|\/)(?:lib)?tuyufactory_native\.(?:so|dylib|dll)$/.test(lower))) {
      throw new Error(`厂家client混入主机组件：${path}`);
    }
    if (nativeFile(value, path)) {
      packageBinary(value, platform, path);
      // 同时识别改名后的厂家主机动态库；不误删CitizenSDK自己的存储或Host库。
      if (role === 'client' && value.includes(Buffer.from('tuyufactory_initialize_administrator'))) {
        throw new Error('厂家client混入主机导出接口');
      }
    }
  }
  const requireFile = (path) => {
    if (!entries.has(path.toLowerCase())) throw new Error(`厂家安装包缺少：${path}`);
  };
  requireFile(executable);
  packageBinary(entries.get(executable.toLowerCase()), platform, executable);
  const apple = ['macos', 'ios'].includes(platform);
  const prefix = platform === 'macos' ? 'Contents/' : '';
  const assets = apple ? `${prefix}Frameworks/App.framework/${platform === 'macos' ? 'Resources/' : ''}flutter_assets/` :
    platform === 'android' ? 'assets/flutter_assets/' : 'data/flutter_assets/';
  // SDK链信任三文件只消费chain正式路径；与SDK源码及Flutter声明保持一致。
  for (const name of ['manifest.json', 'chainspec.json', 'light_sync_state.json']) {
    requireFile(`${assets}packages/citizen_sdk/chain/${name}`);
  }
  const sdk = apple ? [`${prefix}Frameworks/CitizenSDK.framework/CitizenSDK`] :
    platform === 'android' ? ['lib/arm64-v8a/libcitizensdk.so', 'lib/arm64-v8a/libcitizensdk_jni.so'] :
    platform === 'windows' ? ['citizensdk.dll', 'citizensdk_host.dll', 'citizen_sdk_plugin.dll'] :
    ['lib/libcitizensdk.so', 'lib/libcitizensdk_host.so', 'lib/libcitizen_sdk_plugin.so'];
  for (const file of sdk) { requireFile(file); packageBinary(entries.get(file.toLowerCase()), platform, file); }
  if (role === 'host') {
    const runtime = platform === 'macos' ? 'Contents/Resources/runtime/' : 'runtime/';
    requireFile(platform === 'macos' ? 'Contents/Frameworks/libtuyufactory_native.dylib' :
      platform === 'windows' ? 'tuyufactory_native.dll' : 'lib/libtuyufactory_native.so');
    for (const file of ['schema.sql', 'business/runtime.lock.json', 'business/bench/apps/frappe/LICENSE',
      'business/bench/apps/erpnext/license.txt', 'business/bench/sites/assets/assets.json']) requireFile(runtime + file);
    for (const file of platform === 'windows' ? ['postgresql/bin/postgres.exe', 'business/python/python.exe', 'business/node/node.exe'] :
      ['postgresql/bin/postgres', 'business/python/bin/python3', 'business/node/bin/node']) {
      requireFile(runtime + file); packageBinary(entries.get((runtime + file).toLowerCase()), platform, file);
    }
  } else if (platform === 'windows') {
    for (const file of ['msedgewebview2.exe', 'msedge.dll', 'icudtl.dat', 'resources.pak']) requireFile('data/webview2/' + file);
  }
  return target;
}

export function* packageFiles(root) {
  const boundary = realpathSync(root);
  if (!lstatSync(boundary).isDirectory()) throw new Error('厂家包必须是已展开的安装目录');
  function* visit(directory, ancestors) {
    const actual = realpathSync(directory);
    if (ancestors.has(actual)) throw new Error('厂家包目录链接循环');
    const next = new Set([...ancestors, actual]);
    for (const name of readdirSync(directory)) {
      const path = join(directory, name), stat = lstatSync(path);
      if (stat.isSymbolicLink()) {
        verifyLink(boundary, path, readlinkSync(path), realpathSync(path));
        // Apple framework内部目录链接也遍历；祖先集合拒绝循环，不把合法别名漏出清单。
        if (lstatSync(realpathSync(path)).isDirectory()) yield* visit(path, next);
        else yield [relative(boundary, path).replaceAll('\\', '/'), readFileSync(path)];
      } else if (stat.isDirectory()) yield* visit(path, next);
      else if (stat.isFile()) yield [relative(boundary, path).replaceAll('\\', '/'), readFileSync(path)];
      else throw new Error('厂家安装包不能包含特殊文件');
    }
  }
  yield* visit(boundary, new Set());
}

// 输出必须在准确产品/平台任务内，不能覆盖现存包或通过符号链接越出任务。
export function packageDestination(work, destination, role, platform, environment = process.env) {
  packageTarget(role, platform);
  const source = resolve(import.meta.dirname, '..');
  for (const path of [work, destination]) {
    if (!path || !isAbsolute(path) || resolve(path) !== path) throw new Error('厂家打包路径必须是规范绝对路径');
    for (let part = path; part !== dirname(part); part = dirname(part)) {
      try { if (lstatSync(part).isSymbolicLink()) throw new Error('厂家打包路径不能经过符号链接'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
  if (!packageInside(join(source, 'target'), work) || work === join(source, 'target') || !packageInside(work, destination)) {
    throw new Error('厂家打包必须使用本产品target工作目录');
  }
  try { lstatSync(destination); throw new Error('厂家打包不得覆盖现存目标'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

// 原声明与锁从完整厂家仓读取；Pub解析只接受本轮SDK只读视图，SDK原件仍为固定Git提交。
export function verifySdkDependency(application, environment = process.env) {
  if (!environment || typeof environment !== 'object' || Array.isArray(environment)) throw new Error('厂家SDK环境合同无效');
  const original = resolve(dirname(fileURLToPath(import.meta.url)), '../app');
  const work = environment.TUYUFACTORY_WORK_DIR, platform = environment.TUYU_PLATFORM;
  if (!work || !platform) throw new Error('厂家SDK缺少当前产品平台工作根');
  const dependencies = resolveFirstPartyDependencies(original, work);
  const provider = dependencies.citizen_sdk;
  const expected = join(application, '.source-packages/citizen_sdk');
  verifyProject({ source: original, work, output: application, platform });
  const configFile = join(application, '.dart_tool/package_config.json');
  const config = JSON.parse(readFileSync(configFile, 'utf8'));
  if (!Array.isArray(config.packages)) throw new Error('厂家SDK解析列表无效');
  const entries = config.packages.filter(value => value.name === 'citizen_sdk');
  if (entries.length !== 1) throw new Error('厂家SDK必须唯一解析');
  const uri = new URL(entries[0].rootUri, pathToFileURL(configFile));
  if (uri.protocol !== 'file:' || realpathSync(fileURLToPath(uri)) !== expected
    || !lstatSync(expected).isDirectory() || lstatSync(expected).isSymbolicLink()) throw new Error('厂家SDK解析不属于本轮源码视图');
  return provider.root;
}

// payload只允许构建候选的完整载荷检查；交付入口必须显式要求signed，不能把未签名CI当正式包。
export function packageSignature(signature) {
  if (!['payload', 'signed'].includes(signature)) throw new Error('必须明确选择payload或signed验真阶段');
  return signature;
}

export function verifyFactorySources(root) {
  const manifest = JSON.parse(readFileSync(join(root, 'tuyufactory.sources.json'), 'utf8'));
  const {components} = manifest;
  if (manifest.dependency_mode !== 'git_subtree') throw new Error('厂家上游必须由完整厂家产品仓直接持有');
  if (components.length !== 2 || components.map(item => item.path).sort().join(',') !== 'imported/erpnext,imported/frappe') throw new Error('厂家上游锁定范围无效');
  const gitmodules = (() => {
    const path = join(root, '.gitmodules');
    return existsSync(path) ? readFileSync(path, 'utf8') : '';
  })();
  for (const item of components) {
    if (!/^[a-f0-9]{40}$/.test(item.revision)) throw new Error('厂家上游提交无效');
    const source = join(root, item.path);
    if (!existsSync(source) || !lstatSync(source).isDirectory() || lstatSync(source).isSymbolicLink()) throw new Error('厂家上游源码目录无效');
    if (existsSync(join(source, '.git'))) throw new Error('厂家上游源码仍含嵌套Git元数据');
    if (gitmodules.includes(`path = ${item.path}`)) throw new Error('厂家上游源码仍登记为子模块');
    if (!Array.isArray(item.required_files) || item.required_files.length === 0 ||
        item.required_files.some(path => !existsSync(join(source, path)))) throw new Error('厂家上游源码必要文件缺失');
  }
}

export function verifySdkPlugin(application, platform, role, environment = process.env) {
  packageTarget(role,platform);
  if (!['windows','linux-arm','linux-amd'].includes(platform)) throw new Error('SDK CMake投影目标无效');
  const source = verifySdkDependency(application, environment);
  const work = environment.TUYUFACTORY_WORK_DIR;
  if (!work || !isAbsolute(work)) throw new Error('厂家SDK投影缺少产品工作目录');
  const projection = join(application,'.source-packages/citizen_sdk');
  const managed = join(resolve(application), platform === 'windows' ? 'windows' : 'linux', 'flutter/ephemeral/.plugin_symlinks');
  if (!packageInside(work,realpathSync(managed))) throw new Error('SDK插件链接父目录必须位于当前任务，禁止写产品源码');
  // 当前任务唯一投影，不能接受调用方任意覆盖前缀；同源配置每次CMake装配都回读。
  if (realpathSync(projection) !== projection) throw new Error('SDK投影不属于厂家当前任务');
  const directory = platform === 'windows' ? 'windows' : 'linux';
  const native = join(work,'sdk-native/output',platform === 'windows' ? 'Windows' : `linux/${platform === 'linux-arm' ? 'LinuxARM' : 'LinuxAMD'}`);
  const compare = (original, target, installed) => {
    for (const name of readdirSync(original)) {
      const from=join(original,name),to=join(target,name),stat=lstatSync(from);
      if (stat.isDirectory()) compare(from,to,installed);
      else if (!stat.isFile() || !existsSync(to) || !readFileSync(from).equals(readFileSync(to)) ||
        (installed && (lstatSync(to).isSymbolicLink() || !packageInside(projection,realpathSync(to))))) throw new Error('SDK实际插件源码或安装件不属于本次同源构建');
    }
  };
  if (!readFileSync(join(source,directory,'CMakeLists.txt')).equals(readFileSync(join(projection,directory,'CMakeLists.txt')))) throw new Error('SDK CMake入口漂移');
  for (const name of ['cmake','src']) compare(join(source,directory,name),join(projection,directory,name),false);
  compare(native,join(projection,directory),true);
  return projection;
}

export async function verifyPackage(root, role, platform, {signature} = {}) {
  packageSignature(signature);
  const target = packageTarget(role, platform);
  if (platform === 'android') throw new Error('Android须通过build_client.mjs校验实际APK，不能把目录视为安装包');
  let identity, executable;
  if (['macos', 'ios'].includes(platform)) {
    if (process.platform !== 'darwin') throw new Error('Apple安装包必须在macOS验真');
    const prefix = platform === 'macos' ? 'Contents/' : '';
    const plist = JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', join(root, prefix, 'Info.plist')], {encoding: 'utf8'}));
    identity = plist.CFBundleIdentifier;
    if (typeof plist.CFBundleExecutable !== 'string' || !/^[A-Za-z0-9_]+$/.test(plist.CFBundleExecutable)) throw new Error('Apple可执行文件身份无效');
    executable = `${prefix}${platform === 'macos' ? 'MacOS/' : ''}${plist.CFBundleExecutable}`;
    if (platform === 'ios' && (!plist.UIDeviceFamily?.includes(1) || !plist.UIDeviceFamily?.includes(2) ||
        !plist.NSBonjourServices?.includes('_tuyufactory._tcp') || !plist.NSLocalNetworkUsageDescription)) throw new Error('厂家iOS缺少手机平板或局域网权限声明');
    if (signature === 'signed') execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', root], {stdio: 'pipe'});
  } else {
    if (platform === 'windows' ? process.platform !== 'win32' || process.arch !== 'x64' : !linuxTarget(platform)) throw new Error('安装包必须在准确目标系统验真');
    executable = platform === 'windows' ? (role === 'client' ? 'tuyufactory_client.exe' : 'tuyufactory.exe') : 'tuyufactory';
    const binary = readFileSync(join(root, executable));
    // 从真实原生编译结果核对固定身份，不接受调用者自报身份。
    if (platform === 'windows') {
      const appId = role === 'host' ? 'TUYU.TuyuFactory.Host' : 'TUYU.TuyuFactory.Client';
      if (!binary.includes(Buffer.from(appId + '\0', 'utf16le'))) throw new Error('Windows主程序缺少准确AppUserModelID');
      const plugin = readFileSync(join(root, 'citizen_sdk_plugin.dll'));
      const expected = Buffer.from(target.applicationId + '\0');
      if (!plugin.includes(expected) && !plugin.includes(Buffer.from(target.applicationId + '\0', 'utf16le'))) throw new Error('Windows SDK插件缺少准确应用身份');
    } else if (!binary.includes(Buffer.from(target.applicationId + '\0'))) throw new Error('原生主程序缺少准确产品身份');
    identity = target.applicationId;
  }
  verifyPackageFiles(role, platform, packageFiles(root), identity, executable);
  if (role === 'host') await verifyRuntime(join(root, platform === 'macos' ? 'Contents/Resources/runtime' : 'runtime'), platform.startsWith('linux-') ? platform : undefined);
  return target;
}

export function verifyBinary(file, platform) {
  verifyElf(fileHeader(file), platform, file);
}

export function verifyTree(root, platform) {
  const boundary = realpathSync(root);
  const visit = (directory) => {
    for (const name of readdirSync(directory)) {
      const file = join(directory, name);
      const stat = lstatSync(file);
      if (stat.isSymbolicLink()) {
        const target = readlinkSync(file);
        // realpath也拒绝断链和循环；不跟随目录链接递归。
        verifyLink(boundary, file, target, realpathSync(file));
      } else if (stat.isDirectory()) visit(file);
      else if (stat.isFile() && platform?.startsWith('linux-')) {
        const header = fileHeader(file);
        if ((header.length >= 4 && header.readUInt32BE(0) === 0x7f454c46) || /\.so(?:\.|$)/u.test(name)) {
          verifyElf(header, platform, relative(boundary, file));
        }
      } else if (!stat.isFile()) throw new Error(`厂家运行件包含特殊文件：${relative(boundary, file)}`);
    }
  };
  visit(boundary);
}

export async function verifyRuntime(root, platform) {
if (!root) throw new Error('usage: verify.mjs RUNTIME_ROOT');
if (platform !== undefined || process.platform === 'linux') linuxTarget(platform);
const lock = JSON.parse(readFileSync(join(import.meta.dirname, 'runtime.lock.json'), 'utf8'));
const nodeSource = await runtimeTool('node', platform);
if (process.platform === 'linux' && !lock.platforms.includes(platform)) throw new Error('厂家Linux目标未登记');
const executable = (path) => process.platform === 'win32' ? `${path}.exe` : path;
const required = [
  executable('postgresql/bin/postgres'), executable('postgresql/bin/initdb'),
  executable('postgresql/bin/pg_ctl'), executable('postgresql/bin/psql'),
  process.platform === 'win32' ? 'business/python/python.exe' : 'business/python/bin/python3',
  process.platform === 'win32' ? 'business/node/node.exe' : 'business/node/bin/node',
  ...(process.platform === 'darwin' ? ['business/lib/libssl.3.dylib'] : []),
  'business/bench/apps/frappe/LICENSE', 'business/bench/apps/erpnext/license.txt',
  'business/bench/sites/assets/assets.json', 'business/factory_runtime.py',
  'business/frappe_worker.py', 'business/https_server.py', 'business/runtime_common.py', 'business/employee_gateway.py',
  'business/runtime.lock.json', 'schema.sql',
];
for (const path of required) {
  if (!existsSync(join(root, path))) throw new Error(`厂家端运行包缺少：${path}`);
}
for (const source of Object.values(lock.sources)) {
  if (!source.url.startsWith('https://')) throw new Error(`厂家端运行包来源不是 HTTPS：${source.url}`);
  if (!/^[0-9a-f]{64}$/u.test(source.sha256)) throw new Error(`厂家端运行包来源摘要无效：${source.url}`);
}
for (const app of ['hrms', 'kamra', 'ury']) {
  if (existsSync(join(root, 'business/bench/apps', app))) {
    throw new Error(`厂家端运行包混入商家应用：${app}`);
  }
}
const assets = readFileSync(join(root, 'business/bench/sites/assets/assets.json'), 'utf8').toLowerCase();
for (const app of ['hrms', 'kamra', 'ury']) {
  if (assets.includes(app)) throw new Error(`厂家端资源清单混入商家应用：${app}`);
}
verifyTree(root, platform);
// 主程序即使被替换为脚本也必须拒绝，不让伪造的--version输出冒充正确运行件。
if (process.platform === 'linux') {
  for (const file of required.slice(0, 6)) verifyBinary(join(root, file), platform);
}
const postgres = execFileSync(join(root, executable('postgresql/bin/postgres')), ['--version'], { encoding: 'utf8' }).trim();
if (postgres !== `postgres (PostgreSQL) ${lock.postgresql}`) throw new Error(`PostgreSQL 版本错误：${postgres}`);
const python = execFileSync(join(root, process.platform === 'win32' ? 'business/python/python.exe' : 'business/python/bin/python3'), ['--version'], { encoding: 'utf8' }).trim();
if (python !== `Python ${lock.python}`) throw new Error(`Python 版本错误：${python}`);
const node = execFileSync(join(root, process.platform === 'win32' ? 'business/node/node.exe' : 'business/node/bin/node'), ['--version'], { encoding: 'utf8' }).trim();
if (node !== `v${nodeSource.version}`) throw new Error(`Node 版本错误：${node}`);
const receipt = JSON.parse(readFileSync(join(root, 'business/runtime.lock.json'), 'utf8'));
if (receipt.node !== nodeSource.version) throw new Error('厂家运行包Node验真回执与产品锁版本不一致');

const binaries = [
  join(root, executable('postgresql/bin/postgres')),
  join(root, process.platform === 'win32' ? 'business/python/python.exe' : 'business/python/bin/python3'),
  join(root, process.platform === 'win32' ? 'business/node/node.exe' : 'business/node/bin/node'),
];
if (process.platform === 'darwin') {
  for (const path of binaries) {
    const architecture = execFileSync('lipo', ['-archs', path], { encoding: 'utf8' }).trim();
    if (architecture !== 'arm64') throw new Error(`厂家端 Mach-O 不是纯 ARM64：${relative(root, path)}`);
  }
} else if (process.platform === 'win32') {
  for (const path of binaries) {
    const value = readFileSync(path);
    if (value.length < 64 || value.readUInt16LE(0) !== 0x5a4d) throw new Error(`厂家端 PE 文件无效：${relative(root, path)}`);
    const header = value.readUInt32LE(0x3c);
    if (header + 6 > value.length || value.readUInt32LE(header) !== 0x00004550 || value.readUInt16LE(header + 4) !== 0x8664) {
      throw new Error(`厂家端 PE 不是 x86-64：${relative(root, path)}`);
    }
  }
}
console.log(`途遇厂家端运行包验证通过：${root}`);
}

if (!(process.env.NODE_TEST_CONTEXT && process.argv.length === 2) && process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv[2] === '--package') {
    if (process.argv.length !== 7) throw new Error('usage: verify.mjs --package ROOT ROLE PLATFORM payload|signed');
    await verifyPackage(process.argv[3], process.argv[4], process.argv[5], {signature:process.argv[6]});
  } else if (process.argv[2] === '--sdk') {
    if (process.argv.length !== 4) throw new Error('usage: verify.mjs --sdk APPLICATION');
    process.stdout.write(verifySdkDependency(process.argv[3]));
  } else if (process.argv[2] === '--sources') {
    if (process.argv.length !== 4) throw new Error('usage: verify.mjs --sources FACTORY_ROOT');
    verifyFactorySources(process.argv[3]);
  } else if (process.argv[2] === '--sdk-plugin') {
    if (process.argv.length !== 6) throw new Error('usage: verify.mjs --sdk-plugin APPLICATION PLATFORM ROLE');
    process.stdout.write(verifySdkPlugin(...process.argv.slice(3)));
  } else if (process.argv[2] === '--elf-tree') {
    linuxTarget(process.argv[4]);
    verifyTree(process.argv[3], process.argv[4]);
  } else await verifyRuntime(process.argv[2], process.argv[3]);
}

// 正式实现结束；仅直接使用 node --test 执行本文件时注册以下回归。
if (process.env.NODE_TEST_CONTEXT && process.argv.length === 2 && !process.execArgv.some(value=>/^(?:-e|--eval(?:=|$)|--input-type(?:=|$))/u.test(value)) && process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL((await import('node:path')).resolve(process.argv[1])).href) {
const { remoteEnvironment:productRemoteEnvironment } = await import('./build.mjs');
if(process.env.GITHUB_ACTIONS==='true'&&String(process.env.GITHUB_WORKFLOW||'').startsWith('tuyufactory.'))Object.assign(process.env,productRemoteEnvironment());
const {default:assert} = await import('node:assert/strict');
const { readFileSync, realpathSync } = await import('node:fs');
const { resolve, join } = await import('node:path');
const { testRoot } = await import('./build.mjs');
const tmpdir=()=>testRoot('client-macos');
const { spawnSync } = await import('node:child_process');
const { crc32 } = await import('node:zlib');
const {default:test} = await import('node:test');

let apkFiles,bundleIdentity;
test.before(async()=>{({apkFiles,bundleIdentity}=await import('./build_client.mjs'));});

// 只在内存构造格式合同字节，不生成或声称已生成任何平台安装包。
function binary(platform) {
  const value = Buffer.alloc(256);
  if (platform === 'windows') {
    value.writeUInt16LE(0x5a4d); value.writeUInt32LE(64, 0x3c);
    value.writeUInt32LE(0x4550, 64); value.writeUInt16LE(0x8664, 68); value.writeUInt16LE(0x20b, 88);
  } else if (['ios', 'macos'].includes(platform)) {
    value.writeUInt32LE(0xfeedfacf); value.writeUInt32LE(0x100000c, 4); value.writeUInt32LE(2, 12);
    value.writeUInt32LE(1, 16); value.writeUInt32LE(24, 20); value.writeUInt32LE(0x32, 32);
    value.writeUInt32LE(24, 36); value.writeUInt32LE(platform === 'ios' ? 2 : 1, 40);
  } else {
    value.writeUInt32BE(0x7f454c46); value[4] = 2; value[5] = 1; value[6] = 1;
    value.writeUInt16LE(3, 16); value.writeUInt16LE(platform === 'linux-amd' ? 62 : 183, 18);
    value.writeUInt32LE(1, 20); value.writeUInt16LE(64, 52);
  }
  return value;
}

function fixture(role, platform) {
  const entries = new Map(), target = packageTarget(role, platform), data = Buffer.from('{}');
  const add = path => entries.set(path, /\.(so|dll|exe|dylib)$/.test(path) ? binary(platform) : data);
  const prefix = platform === 'macos' ? 'Contents/' : '';
  const executable = platform === 'macos' ? `Contents/MacOS/${role === 'host' ? 'TuyuFactory' : 'TuyuFactoryClient'}` :
    platform === 'ios' ? 'Runner' : platform === 'android' ? 'lib/arm64-v8a/libapp.so' :
    platform === 'windows' ? `tuyufactory${role === 'client' ? '_client' : ''}.exe` : 'tuyufactory';
  entries.set(executable, binary(platform));
  const apple = ['macos', 'ios'].includes(platform);
  const assets = apple ? `${prefix}Frameworks/App.framework/${platform === 'macos' ? 'Resources/' : ''}flutter_assets/` :
    platform === 'android' ? 'assets/flutter_assets/' : 'data/flutter_assets/';
  for (const file of ['manifest.json', 'chainspec.json', 'light_sync_state.json']) add(`${assets}packages/citizen_sdk/chain/${file}`);
  for (const file of apple ? [`${prefix}Frameworks/CitizenSDK.framework/CitizenSDK`] :
    platform === 'android' ? ['lib/arm64-v8a/libcitizensdk.so', 'lib/arm64-v8a/libcitizensdk_jni.so'] :
    platform === 'windows' ? ['citizensdk.dll', 'citizensdk_host.dll', 'citizen_sdk_plugin.dll'] :
    ['lib/libcitizensdk.so', 'lib/libcitizensdk_host.so', 'lib/libcitizen_sdk_plugin.so']) entries.set(file, binary(platform));
  if (role === 'host') {
    const runtime = platform === 'macos' ? 'Contents/Resources/runtime/' : 'runtime/';
    add(platform === 'macos' ? 'Contents/Frameworks/libtuyufactory_native.dylib' : platform === 'windows' ? 'tuyufactory_native.dll' : 'lib/libtuyufactory_native.so');
    for (const file of ['schema.sql', 'business/runtime.lock.json', 'business/bench/apps/frappe/LICENSE', 'business/bench/apps/erpnext/license.txt', 'business/bench/sites/assets/assets.json']) add(runtime + file);
    for (const file of platform === 'windows' ? ['postgresql/bin/postgres.exe', 'business/python/python.exe', 'business/node/node.exe'] :
      ['postgresql/bin/postgres', 'business/python/bin/python3', 'business/node/bin/node']) entries.set(runtime + file, binary(platform));
  } else if (platform === 'windows') {
    for (const file of ['msedgewebview2.exe', 'msedge.dll', 'icudtl.dat', 'resources.pak']) add('data/webview2/' + file);
  }
  return {entries, target, executable, check: (values = entries, identity = target.applicationId) => verifyPackageFiles(role, platform, values, identity, executable)};
}

for (const [role, platforms] of Object.entries({host: ['macos','windows','linux-arm','linux-amd'], client: ['macos','windows','ios','android']})) {
  for (const platform of platforms) {
    test(`${role}/${platform}：准确组件通过，每个必需组件缺失拒绝`, () => {
      const f = fixture(role, platform);
      assert.doesNotThrow(() => f.check());
      // 新包必须消费SDK唯一chain目录；旧资源目录不能替代必需文件。
      const oldAssets = new Map([...f.entries].map(([path, bytes]) => [
        path.replace('packages/citizen_sdk/chain/', 'packages/citizen_sdk/assets/citizenchain/'), bytes,
      ]));
      assert.throws(() => f.check(oldAssets), /缺少/);
      for (const path of f.entries.keys()) {
        const missing = new Map(f.entries); missing.delete(path);
        assert.throws(() => f.check(missing), /缺少/);
      }
      assert.throws(() => f.check(f.entries, role === 'host' ? 'com.tuyufactory.client' : 'com.tuyufactory'), /身份/);
    });
    test(`${role}/${platform}：每个原生组件错架构和截断均拒绝`, () => {
      const f = fixture(role, platform);
      for (const [path, bytes] of f.entries) {
        if (bytes.length !== 256) continue;
        for (const wrong of [binary(platform === 'windows' ? 'macos' : 'windows'), bytes.subarray(0, 8)]) {
          const entries = new Map(f.entries); entries.set(path, wrong);
          assert.throws(() => f.check(entries));
        }
      }
    });
  }
}

test('client拒绝主机目录、改名的导出库；完整SDK自身数据库允许保留', () => {
  for (const platform of ['macos','windows','ios','android']) {
    const f = fixture('client', platform);
    for (const path of ['runtime/postgresql/data/file', 'business/node/node.exe', 'business/python/bin/python3', 'other/frappe/code.py', 'any/schema.sql', 'factory_runtime.py', 'tuyufactory_native.dll']) {
      assert.throws(() => f.check([...f.entries, [path, Buffer.from('{}')]]), /主机/);
    }
    const renamed = Buffer.concat([binary(platform), Buffer.from('tuyufactory_initialize_administrator')]);
    assert.throws(() => f.check([...f.entries, ['innocent', renamed]]), /主机/);
    assert.doesNotThrow(() => f.check([...f.entries, ['sdk/light-node/state.db', Buffer.from('{}')]]));
  }
});

test('包路径、大小写碰撞、开发覆盖和秘密文件一律拒绝', () => {
  const f = fixture('client', 'windows');
  for (const path of ['../outside','/absolute','a\\b','a//b','./file','.git/config','pubspec_overrides.yaml','dev/private.key','CITIZENSDK.DLL']) {
    assert.throws(() => f.check([...f.entries, [path, Buffer.alloc(0)]]));
  }
});

test('角色与平台闭集无默认值；Apple设备与模拟器同架构也不能互换', () => {
  for (const [role, platform] of [['','macos'],['host','ios'],['client','linux-arm'],['client','linux-amd'],['__proto__','macos'],['host','windows-x86-64']]) assert.throws(() => packageTarget(role, platform));
  assert.throws(() => packageBinary(binary('macos'), 'ios', 'wrong-platform'));
  const simulator = binary('ios'); simulator.writeUInt32LE(7, 40);
  assert.throws(() => packageBinary(simulator, 'ios', 'simulator'));
  const f = fixture('client', 'macos');
  for (const magic of [0xfeedface,0xcefaedfe,0xcafebabf,0xbfbafeca,0xcafebabe,0xbebafeca]) {
    const wrong = Buffer.alloc(256); wrong.writeUInt32BE(magic);
    assert.throws(() => f.check([...f.entries, ['renamed-binary', wrong]]));
  }
});

test('Windows原生运行包允许产品直接调用并使用产品目录', () => {
  const source = readFileSync(new URL('./build_windows_x86_64.ps1', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /env:CI -ne|未登记本机构建入口/u);
  assert.match(source, /TUYUFACTORY_WORK_DIR/u);
  assert.match(source, /TUYUFACTORY_BUILD_DIR/u);
  assert.match(source, /TUYUFACTORY_DEPENDENCY_DIR/u);
  assert.match(source, /attempt -le 3/u);
});

test('输出只要求位于当前产品源码外工作目录', () => {
  const work = join(realpathSync(tmpdir()), 'tuyufactory-test', 'client', 'macos');
  assert.doesNotThrow(() => packageDestination(
    work, work + '/uncreated.app', 'client', 'macos', {},
  ));
  // 系统临时根若经符号链接，原始路径必须拒绝，不能削弱生产校验。
  if (tmpdir() !== realpathSync(tmpdir())) {
    const linked = join(tmpdir(), 'tuyufactory-test', 'client', 'macos');
    assert.throws(() => packageDestination(linked, linked + '/uncreated.app', 'client', 'macos', {}), /符号链接/);
  }
  for (const output of [
    resolve(import.meta.dirname, '..', 'app'),
    work,
    work + '/../escape',
  ]) {
    assert.throws(() => packageDestination(work, output, 'client', 'macos', {}));
  }
});

// 构造无落盘ZIP供真实解析函数检验长度、越界和内容，不生成伪APK文件。
function zip(name, value = Buffer.from('test')) {
  const filename = Buffer.from(name), local = Buffer.alloc(30), central = Buffer.alloc(46), end = Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50); local.writeUInt32LE(value.length,18); local.writeUInt32LE(value.length,22); local.writeUInt16LE(filename.length,26);
  central.writeUInt32LE(0x02014b50); central.writeUInt32LE(value.length,20); central.writeUInt32LE(value.length,24); central.writeUInt16LE(filename.length,28);
  local.writeUInt32LE(crc32(value),14); central.writeUInt32LE(crc32(value),16);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1,8); end.writeUInt16LE(1,10); end.writeUInt32LE(central.length+filename.length,12); end.writeUInt32LE(local.length+filename.length+value.length,16);
  return Buffer.concat([local,filename,value,central,filename,end]);
}

test('真实APK ZIP解析：正确内容、截断、路径穿越、加密和超限', () => {
  const valid = zip('assets/file');
  assert.equal([...apkFiles(valid)][0][1].toString(), 'test');
  for (const name of ['../escape','/absolute','a\\b']) assert.throws(() => [...apkFiles(zip(name))]);
  for (const length of [0,21,valid.length-1]) assert.throws(() => [...apkFiles(valid.subarray(0,length))]);
  for (const [offset, value] of [[8,1],[24,0x7fffffff],[42,0xffffffff]]) {
    const wrong = Buffer.from(valid), central = valid.readUInt32LE(valid.length-6);
    if (offset === 8) wrong.writeUInt16LE(value, central+offset); else wrong.writeUInt32LE(value, central+offset);
    assert.throws(() => [...apkFiles(wrong)]);
  }
});

test('ZIP损坏CRC、非法文件类型及逃逸链接拒绝，Apple内部相对链接允许', () => {
  const corrupted=zip('asset'); corrupted[35]^=1;
  assert.throws(()=>[...apkFiles(corrupted)]);
  for(const target of ['/outside','../../outside','C:\\outside']) {
    const value=zip('app/link',Buffer.from(target)), at=value.readUInt32LE(value.length-6);
    value.writeUInt32LE(0xa0000000,at+38);
    assert.throws(()=>[...apkFiles(value,{links:true})]);
  }
  const good=zip('App.app/Versions/Current',Buffer.from('A')), at=good.readUInt32LE(good.length-6);
  good.writeUInt32LE(0xa0000000,at+38);
  assert.equal([...apkFiles(good,{links:true})][0][2],true);
  assert.throws(()=>[...apkFiles(good)]);
  good.writeUInt32LE(0x20000000,at+38);
  assert.throws(()=>[...apkFiles(good,{links:true})]);
});

test('AAB读取官方protobuf清单，拒绝重复身份、主机身份和截断字段', () => {
  const field=(id,value)=>Buffer.concat([Buffer.from([id*8+2,value.length]),value]);
  const text=(id,value)=>field(id,Buffer.from(value));
  const attribute=value=>field(4,Buffer.concat([text(2,'package'),text(3,value)]));
  const node=attributes=>field(1,Buffer.concat([text(3,'manifest'),...attributes]));
  const bytes=node([attribute('com.tuyufactory.client')]);
  assert.equal(bundleIdentity(bytes),'com.tuyufactory.client');
  const f=fixture('client','android');
  assert.throws(()=>f.check(f.entries,bundleIdentity(node([attribute('com.tuyufactory')]))),/身份/);
  assert.throws(()=>bundleIdentity(node([attribute('com.tuyufactory.client'),attribute('com.tuyufactory.client')])));
  for(const length of [0,1,bytes.length-1]) assert.throws(()=>bundleIdentity(bytes.subarray(0,length)));
  for(const value of ['',undefined,'unsigned','release']) assert.throws(()=>packageSignature(value));
  assert.equal(packageSignature('payload'),'payload'); assert.equal(packageSignature('signed'),'signed');
});

test('上游锁核对subtree目录、必要文件和子模块残留', () => {
  const source=readFileSync(new URL('verify.mjs',import.meta.url),'utf8');
  const body=source.slice(source.indexOf('export function verifyFactorySources('),source.indexOf('\nexport function verifySdkPlugin')).replace('export function','function');
  const revision='a'.repeat(40), components=['imported/erpnext','imported/frappe'].map(path=>({path,revision,required_files:['license']}));
  for(const failure of ['', 'mode','missing','metadata','registered','required']) {
    const files=new Set(['/factory/tuyufactory.sources.json','/factory/.gitmodules','/factory/imported/erpnext','/factory/imported/frappe','/factory/imported/erpnext/license','/factory/imported/frappe/license']);
    if(failure==='missing')files.delete('/factory/imported/frappe');
    if(failure==='metadata')files.add('/factory/imported/frappe/.git');
    if(failure==='required')files.delete('/factory/imported/frappe/license');
    const check=new Function('readFileSync','join','existsSync','lstatSync',body+';return verifyFactorySources;')(
      path=>path==='/factory/tuyufactory.sources.json'?JSON.stringify({dependency_mode:failure==='mode'?'git_submodule':'git_subtree',components}):failure==='registered'?'path = imported/frappe':'',
      (...parts)=>parts.join('/').replaceAll('//','/'),path=>files.has(path),()=>({isDirectory:()=>true,isSymbolicLink:()=>false}));
    if(failure)assert.throws(()=>check('/factory'));else assert.doesNotThrow(()=>check('/factory'));
  }
});

test('Apple候选与正式包走同一载荷校验，只有正式阶段强制真实codesign', async () => {
  const source=readFileSync(new URL('verify.mjs',import.meta.url),'utf8');
  const body=source.slice(source.indexOf('export async function verifyPackage('),source.indexOf('\nexport function verifyBinary')).replace('export async function','async function');
  const f=fixture('client','ios');
  for(const signature of ['payload','signed']) {
    const commands=[];
    const runner=new Function('packageSignature','packageTarget','execFileSync','join','verifyPackageFiles','packageFiles','process',body+';return verifyPackage;')(
      packageSignature,packageTarget,(file,args)=>{commands.push(file);if(file.includes('plutil'))return JSON.stringify({CFBundleIdentifier:'com.tuyufactory.client',CFBundleExecutable:'Runner',UIDeviceFamily:[1,2],NSBonjourServices:['_tuyufactory._tcp'],NSLocalNetworkUsageDescription:'用途'});},
      (...parts)=>parts.join('/'),verifyPackageFiles,()=>f.entries,{platform:'darwin'});
    await runner('/App.app','client','ios',{signature});
    assert.equal(commands.includes('/usr/bin/codesign'),signature==='signed');
  }
});

test('厂家SDK仅有同一Git锁定来源与本轮Pub视图', () => {
  const manifest = readFileSync(new URL('../app/pubspec.yaml', import.meta.url), 'utf8');
  const lock = readFileSync(new URL('../app/pubspec.lock', import.meta.url), 'utf8');
  for (const content of [manifest, lock]) {
    assert.match(content, /https:\/\/github\.com\/crcfrcn\/citizensdk\.git/u);
    assert.match(content, /52b83f8f33a9424f3a92161da4f183678263ab7c/u);
  }
  const preparer = readFileSync(new URL('./sdk-dependencies.mjs', import.meta.url), 'utf8');
  assert.match(preparer, /createProject/u);
  assert.match(preparer, /--enforce-lockfile/u);
  assert.match(preparer, /contract\.source\.ref/u);
  assert.doesNotMatch(preparer, /mode === '(?:local|public)'/u);
  const project = readFileSync(new URL('../app/scripts/project.mjs', import.meta.url), 'utf8');
  assert.match(project, /assertFlutterSourceView/u);
  assert.match(project, /prepareNativeProject/u);
  assert.match(project, /error\.retainSdkStage \|\| error\.status === 75/u);
});

test('Linux真实CMake解释入口和平台匹配，不调用编译器也不生成文件', () => {
  const source = readFileSync(new URL('../app/linux/flutter/CMakeLists.txt', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('# 读取Flutter'), source.indexOf('# TODO:'));
  for (const [entry, cpu, platform, ok] of [['lib/main_host.dart','aarch64','linux-arm64',true], ['lib/main_host.dart','x86_64','linux-x64',true],
    ['lib/main_client.dart','aarch64','linux-arm64',false], ['lib/main_host.dart','aarch64','linux-x64',false],['','aarch64','linux-arm64',false]]) {
    const script = `function(check)\nset(PROJECT_DIR /task/app)\nset(FLUTTER_TARGET "${entry}")\nset(CMAKE_SYSTEM_PROCESSOR ${cpu})\nset(FLUTTER_TARGET_PLATFORM ${platform})\n${body}\nendfunction()\ncheck()\n`;
    const result = spawnSync('cmake', ['-P','/dev/stdin'], {input:script, encoding:'utf8'});
    assert.equal(result.status === 0, ok, result.stderr);
  }
});

test('厂家client源码递归不引用主机FFI，平台身份和主机包入口保持严格', () => {
  const root = new URL('../app/lib/', import.meta.url), pending = ['main_client.dart'], seen = new Set();
  while (pending.length) {
    const path = pending.pop(); if (seen.has(path)) continue; seen.add(path);
    assert.ok(path === 'main_client.dart' || path.startsWith('client/') || path.startsWith('shared/'));
    const source = readFileSync(new URL(path, root), 'utf8').replace(/\/\*[\s\S]*?\*\/|^\s*\/\/[^\n]*/gm, '');
    assert.doesNotMatch(source, /(?:import|export).*['"](?:dart:ffi|package:ffi\/)/);
    for (const directive of source.matchAll(/(?:import|export|part(?!\s+of))\s+([^;]+);/g)) {
      for (const literal of directive[1].matchAll(/['"]([^'"]+)['"]/g)) {
        const value = literal[1];
        if (value.startsWith('package:tuyufactory/')) pending.push(value.slice('package:tuyufactory/'.length));
        else if (!value.includes(':')) pending.push(new URL(value, new URL(path, root)).pathname.slice(root.pathname.length));
      }
    }
  }
  assert.ok(seen.has('client/app.dart'));
  const verify = readFileSync(new URL('verify_macos.sh', import.meta.url), 'utf8');
  assert.match(verify, /--package "\$APP" host macos/);
});

test('真实client组装控制流：来源失败不写入，复制和终检失败仅删除本次目标', () => {
  const source = readFileSync(new URL('build_client.mjs', import.meta.url), 'utf8');
  const script = `
const {default:assert} = await import('node:assert/strict');
const {SourceTextModule,SyntheticModule,createContext} = await import('node:vm');
const source=${JSON.stringify(source)};
for(const failure of ['', 'destination', 'sdk', 'input', 'mkdir', 'copy', 'output', 'replaced']) {
 const events=[], work='/task/client', input=work+'/input', output=work+'/output';
 const context=createContext({process:{argv:[],env:{}},Buffer,URL});
 async function synthetic(values){const m=new SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});await m.link(()=>{});await m.evaluate();return m;}
 const fs={closeSync(){},openSync(){throw Error('unexpected');},writeFileSync(){},readFileSync(){throw Error('unexpected');},
  lstatSync(){return {dev:1,ino:failure==='replaced'&&events.includes('copy')?2:1,isSymbolicLink:()=>false};},realpathSync:path=>path,
  mkdirSync(path){events.push('mkdir');if(failure==='mkdir')throw Error('occupied');},
  cpSync(from,to){assert.equal(from,input);assert.equal(to,output);events.push('copy');if(['copy','replaced'].includes(failure))throw Error('copy');},
  rmSync(path){assert.equal(path,output);events.push('remove');}};
 const verify={packageTarget(){},packageSignature(){},packageInside:(root,path)=>path.startsWith(root+'/'),packageDestination(){if(failure==='destination')throw Error('destination');},
  verifySdkDependency(){if(failure==='sdk')throw Error('sdk');},verifyPackageFiles(){throw Error('unexpected');},
  async verifyPackage(path){events.push(path===input?'input':'output');if(failure===(path===input?'input':'output'))throw Error('invalid');}};
 const module=new SourceTextModule(source,{context,initializeImportMeta(meta){meta.url='file:///product/build_client.mjs';}});
 await module.link(async name=>synthetic(name==='node:fs'?fs:name==='./verify.mjs'?verify:await import(name)));
 await module.evaluate();
 const run=()=>module.namespace.buildClient('macos',input,output,'/application',{TUYUFACTORY_WORK_DIR:work},'signed');
 if(failure)await assert.rejects(run);else assert.equal(await run(),output);
 assert.equal(events.includes('remove'),['copy','output'].includes(failure));
 if(['destination','sdk','input'].includes(failure))assert.ok(!events.includes('mkdir'));
}
`;
  const result = spawnSync(process.execPath, ['--experimental-vm-modules','--input-type=module','-'], {input:script, encoding:'utf8'});
  assert.equal(result.status, 0, result.stderr);
});

test('真实SDK来源只接受产品锁定Git原件及当前Pub视图', () => {
  const source = readFileSync(new URL('verify.mjs', import.meta.url), 'utf8');
  const dependency = source.slice(source.indexOf('export function verifySdkDependency('),
    source.indexOf('\nexport function packageSignature'));
  assert.match(dependency, /resolveFirstPartyDependencies\(original, work\)/u);
  assert.match(dependency, /verifyProject\(\{ source: original, work, output: application, platform \}\)/u);
  assert.match(dependency, /\.source-packages\/citizen_sdk/u);
  assert.match(dependency, /entries\.length !== 1/u);
  assert.doesNotMatch(dependency, /contract\.modes|pubspec_overrides|\/Users\//u);
});

test('Windows真实路径后代判断和EXE/SDK分离身份校验', () => {
  const source = readFileSync(new URL('verify.mjs', import.meta.url), 'utf8');
  const f = fixture('client', 'windows');
  f.entries.set(f.executable, Buffer.concat([binary('windows'),Buffer.from('TUYU.TuyuFactory.Client\0','utf16le')]));
  f.entries.set('citizen_sdk_plugin.dll', Buffer.concat([binary('windows'),Buffer.from('com.tuyufactory.client\0')]));
  const serialized = [...f.entries].map(([path,value])=>[path,value.toString('base64')]);
  const script = `
const {default:assert} = await import('node:assert/strict');
const {win32} = await import('node:path');
const {SourceTextModule,SyntheticModule,createContext} = await import('node:vm');
const files=new Map(${JSON.stringify(serialized)}.map(([path,value])=>[path,Buffer.from(value,'base64')]));
const root='D:\\\\product\\\\target\\\\client-windows\\\\test\\\\fixture', output=root+'\\\\output';
let identityFailure=false;
const context=createContext({process:{argv:[],env:{},platform:'win32',arch:'x64'},Buffer,URL,console});
async function synthetic(values){const m=new SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});await m.link(()=>{});await m.evaluate();return m;}
const fs={...await import('node:fs'),realpathSync:p=>p,
 lstatSync(path){if(path===output){const error=Error('absent');error.code='ENOENT';throw error;}return {isSymbolicLink:()=>false,isDirectory:()=>!files.has(win32.relative(root,path).replaceAll('\\\\','/')),isFile:()=>files.has(win32.relative(root,path).replaceAll('\\\\','/'))};},
 readFileSync(path){const name=win32.relative(root,path).replaceAll('\\\\','/');if(identityFailure&&name==='citizen_sdk_plugin.dll')return Buffer.from('com.tuyufactory\\0');return files.get(name);},
 readdirSync(path){const prefix=win32.relative(root,path).replaceAll('\\\\','/');const base=prefix?prefix+'/':'';return [...new Set([...files.keys()].filter(p=>p.startsWith(base)).map(p=>p.slice(base.length).split('/')[0]))];}};
const module=new SourceTextModule(${JSON.stringify(source)},{context,initializeImportMeta(meta){meta.url='file:///D:/product/scripts/verify.mjs';meta.dirname='D:/product/scripts';}});
await module.link(async name=>synthetic(name==='node:fs'?fs:name==='node:path'?win32:name==='../app/scripts/project.mjs'?await import(${JSON.stringify(new URL('../app/scripts/project.mjs', import.meta.url).href)}):await import(name)));
await module.evaluate();
module.namespace.packageDestination(root,output,'client','windows',{GITHUB_ACTIONS:'true',RUNNER_TEMP:'D:\\\\runner\\\\temp'});
await module.namespace.verifyPackage(root,'client','windows',{signature:'payload'});
identityFailure=true;await assert.rejects(()=>module.namespace.verifyPackage(root,'client','windows',{signature:'payload'}),/SDK插件/);
`;
  const result = spawnSync(process.execPath,['--experimental-vm-modules','--input-type=module','-'],{input:script,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});

// 字符串内脚本也必须交给Node解析，外层语法检查不能覆盖其错误。
for (const platform of ['android', 'ios', 'macos', 'windows']) {
  test(`client/${platform}：SDK准备脚本无重复声明`, () => {
    const source = readFileSync(new URL(`client/ci/${platform}/index.mjs`, import.meta.url), 'utf8');
    const match = source.match(/const prepareCitizenSdkSource = (\[[\s\S]*?\])\.join\(/);
    assert.ok(match);
    const script = JSON.parse(match[1]).join('\n');
    const result = spawnSync(process.execPath, ['--input-type=module', '--check'], {input: script, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
  });
}

// 导入真实CI模块且核对Release的实际相对入口，不能用存在的流程身份代替模块可加载性。
test('厂家桌面Release只导入本角色平台实际CI入口，Windows依赖模块可加载', async () => {
  for (const [role, platforms] of [['client', ['macos', 'windows']], ['host', ['macos', 'windows', 'linux-arm', 'linux-amd']]]) {
    for (const platform of platforms) {
      const ci = await import(new URL('./' + role + '/ci/' + platform + '/index.mjs', import.meta.url));
      assert.equal(typeof ci[role === 'host' ? 'buildHost' : 'buildCandidate'], 'function');
      const release = readFileSync(new URL('./' + role + '/release/' + platform + '/index.mjs', import.meta.url), 'utf8');
      assert.ok(release.includes("from '../../ci/" + platform + "/index.mjs'"));
      assert.ok(!release.includes("from './ci.mjs'"));
    }
  }
  const dependency = await import(new URL('./dependencies.mjs', import.meta.url));
  assert.equal(typeof dependency.prepareWebView2SDK, 'function');
  assert.equal(typeof dependency.prepareWebView2, 'function');
});

// 检查内嵌正文，防止外层JSON字符串语法正确却不能实际执行。
test('厂家八个CI Job的Flutter与分机工作目录登记正文可解析', () => {
  const jobs = [
    ['client','android'],['client','ios'],['client','macos'],['client','windows'],
    ['host','linux-amd'],['host','linux-arm'],['host','macos'],['host','windows'],
  ];
  for (const [role, platform] of jobs) {
    const source = readFileSync(new URL(role+'/ci/'+platform+'/factory-'+role+'-'+platform+'/execute.mjs', import.meta.url), 'utf8');
    const marker = 'const workflowSteps = Object.freeze(';
    const start = source.indexOf(marker) + marker.length;
    const end = source.indexOf('\n});', start) + 2;
    const steps = JSON.parse(source.slice(start, end));
    for (const step of Object.values(steps)) {
      const pattern = /(?:^|\n)[^\n]*\bnode\b[^\n]*<<\s*['"]?([A-Za-z_][A-Za-z_0-9]*)['"]?[^\n]*\n/gu;
      for (const match of step.source.matchAll(pattern)) {
        const begin = match.index + match[0].length;
        const ending = new RegExp('^' + match[1] + '\\s*$', 'mu').exec(step.source.slice(begin));
        assert.ok(ending, role+'/'+platform+'缺少正文结束标记');
        const code = step.source.slice(begin, begin + ending.index);
        const result = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: code, encoding: 'utf8' });
        assert.equal(result.status, 0, role+'/'+platform+': '+result.stderr);
      }
    }
  }
});

}
