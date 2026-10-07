#!/usr/bin/env node
import { remoteEnvironment as productRemoteEnvironment } from './build.mjs';
if(process.env.GITHUB_ACTIONS==='true'&&String(process.env.GITHUB_WORKFLOW||'').startsWith('tuyufactory.'))Object.assign(process.env,productRemoteEnvironment());
// 厂家分机Windows依赖只读取本产品固定声明，在本轮源码外目录下载并验真。
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { lstat, mkdir, open, readFile, realpath, readdir, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const productRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contract = JSON.parse(readFileSync(new URL('./dependencies.json', import.meta.url), 'utf8'));
const execute = promisify(execFile);
function fail(message) { throw new Error('厂家Windows依赖：' + message); }
if (contract.schema !== 1 || contract.product !== 'tuyufactory-client' || contract.platform !== 'windows'
  || contract.sdk.version !== '1.0.3537.50' || contract.runtime.version !== '152.0.4191.62'
  || contract.sdk.url !== 'https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/1.0.3537.50/microsoft.web.webview2.1.0.3537.50.nupkg'
  || contract.runtime.url !== 'https://msedge.sf.dl.delivery.mp.microsoft.com/filestreamingservice/files/0a4a34d9-ccaa-4cef-98b4-58cb313fbfeb/Microsoft.WebView2.FixedVersionRuntime.152.0.4191.62.x64.cab'
  || contract.runtime.root !== 'Microsoft.WebView2.FixedVersionRuntime.152.0.4191.62.x64'
  || [contract.sdk, contract.runtime].some(x => !/^[0-9a-f]{64}$/u.test(x.sha256))) fail('唯一来源声明无效');

async function ordinaryDirectory(path) {
  if (!isAbsolute(path) || resolve(path) !== path || path === parse(path).root) fail('工作根必须是规范绝对路径');
  let current = parse(path).root;
  for (const part of relative(current, path).split(sep)) {
    current = join(current, part);
    const info = await lstat(current);
    if (!info.isDirectory() || info.isSymbolicLink()) fail('目录路径缺失或经过链接');
  }
  if (await realpath(path) !== path) fail('目录不是准确物理路径');
  return lstat(path);
}
async function taskWork(work, environment) {
  if (process.platform !== 'win32' || process.arch !== 'x64') fail('只允许Windows x64');
  const info = await ordinaryDirectory(work);
  if (!work.startsWith(join(productRoot, 'target', 'client-windows') + sep)
    || environment.TUYU_PRODUCT !== 'tuyufactory-client' || environment.TUYU_PLATFORM !== 'windows'
    || environment.TUYUFACTORY_WORK_DIR !== work) fail('工作根或产品平台身份不一致');
  if (environment.GITHUB_ACTIONS === 'true') {
    const temporary = await realpath(environment.RUNNER_TEMP);
    if (work !== join(temporary, 'tuyufactory-client-windows')
      || environment.GITHUB_REPOSITORY !== 'tuyutata/tuyufactory'
      || await realpath(environment.GITHUB_WORKSPACE) !== productRoot) fail('Runner来源与工作根不一致');
  } else if (environment.TUYUFACTORY_ROOT !== productRoot) fail('产品源码根不一致');
  return info;
}
const same = (a, b) => a.dev === b.dev && a.ino === b.ino;

// 排他创建候选；失败仅回收本次创建且身份未变的目录。
async function candidate(work, name, environment, action) {
  const owner = await taskWork(work, environment);
  const directory = join(work, name);
  await mkdir(directory, { mode: 0o700 });
  const owned = await lstat(directory);
  try {
    const value = await action(directory);
    if (!same(owner, await ordinaryDirectory(work))
      || !same(owned, await ordinaryDirectory(directory))) fail('任务或候选目录归属改变');
    return value;
  } catch (error) {
    if (!same(owner, await ordinaryDirectory(work))
      || !same(owned, await ordinaryDirectory(directory))) fail('目录归属改变，保留现场');
    await rm(directory, { recursive: true });
    throw error;
  }
}

// 官方HTTPS、无凭据、拒绝跳转；限量流式写入并比对声明摘要，不信任自报完整性。
async function download(source, directory) {
  const destination = join(directory, source.url.split('/').at(-1));
  const handle = await open(destination, 'wx', 0o600);
  try {
    const response = await fetch(source.url, {
      redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(180_000),
    });
    if (!response.ok || !response.body) fail('官方归档下载失败');
    const hash = createHash('sha256');
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 1024 ** 3) fail('归档超限');
      hash.update(chunk);
      let offset = 0;
      while (offset < chunk.length) {
        const written = await handle.write(chunk, offset, chunk.length - offset);
        if (written.bytesWritten <= 0) fail('归档写入未推进');
        offset += written.bytesWritten;
      }
    }
    if (size === 0 || hash.digest('hex') !== source.sha256) fail('归档摘要不符');
    await handle.sync();
    return destination;
  } finally { await handle.close(); }
}

export async function prepareWebView2SDK({ work, environment = process.env }) {
  return candidate(work, 'webview2-sdk', environment, async directory => {
    const path = await download(contract.sdk, directory);
    return Object.freeze({ path, sha256: contract.sdk.sha256, version: contract.sdk.version });
  });
}

// CAB在展开前核对路径、大小写、成员完整性和签名边界。
export function webView2CabFiles(bytes, root) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 68 || bytes.length > 1024 ** 3
    || bytes.toString('ascii', 0, 4) !== 'MSCF' || bytes.readUInt16LE(30) !== 4
    || bytes.readUInt16LE(36) !== 20 || bytes[38] !== 0 || bytes[39] !== 0
    || !/^Microsoft\.WebView2\.FixedVersionRuntime\.\d+\.\d+\.\d+\.\d+\.x64$/u.test(root)) {
    throw new Error('WebView2 CAB头或根目录无效');
  }
  const folders = bytes.readUInt16LE(26), count = bytes.readUInt16LE(28);
  let offset = bytes.readUInt32LE(16), total = 0;
  const signature = bytes.readUInt32LE(44), signatureSize = bytes.readUInt32LE(48);
  if (!folders || !count || count > 8192 || offset !== 60 + folders * 8
    || signature <= offset || signature + signatureSize !== bytes.length || signatureSize < 128) {
    throw new Error('WebView2 CAB文件表或签名边界无效');
  }
  const files = [], seen = new Set();
  for (let index = 0; index < count; index++) {
    if (offset + 16 >= signature) throw new Error('WebView2 CAB文件表被截断');
    const size = bytes.readUInt32LE(offset), folder = bytes.readUInt16LE(offset + 8);
    const end = bytes.indexOf(0, offset + 16);
    if (end < 0 || end >= signature || end - offset > 4096 || folder >= folders) throw new Error('WebView2 CAB文件条目无效');
    const path = bytes.toString('utf8', offset + 16, end).replaceAll('\\', '/');
    const parts = path.split('/');
    if (parts.length < 2 || parts[0] !== root || parts.some(part => !part || part === '.' || part === '..'
      || /[\x00-\x1f\x7f:<>"|?*\uFFFD]/u.test(part) || /[. ]$/u.test(part)
      || /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/iu.test(part)) || seen.has(path.toLowerCase())) {
      throw new Error('WebView2 CAB路径越界或冲突');
    }
    seen.add(path.toLowerCase()); total += size;
    if (total > 2 * 1024 ** 3) throw new Error('WebView2 CAB展开大小超限');
    files.push(Object.freeze({ path, size })); offset = end + 1;
  }
  const firstData = bytes.readUInt32LE(60);
  if (offset > firstData || firstData >= signature) throw new Error('WebView2 CAB数据与文件表重叠');
  for (const file of files) {
    const parts = file.path.split('/');
    for (let length = 1; length < parts.length; length++) {
      if (seen.has(parts.slice(0, length).join('/').toLowerCase())) throw new Error('WebView2 CAB文件与目录冲突');
    }
  }
  for (const name of ['msedgewebview2.exe', 'msedge.dll', 'icudtl.dat', 'resources.pak']) {
    if (!files.some(file => file.path === root + '/' + name && file.size > 0)) throw new Error('WebView2 CAB缺少完整运行件');
  }
  return Object.freeze(files);
}


async function inventory(root) {
  const result = [];
  async function walk(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name), name = prefix + entry.name;
      const info = await lstat(path);
      if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile())
        || await realpath(path) !== path) fail('展开存在链接或特殊文件');
      result.push({ path: name, directory: info.isDirectory() });
      if (info.isDirectory()) await walk(path, name + '/');
    }
  }
  await walk(root);
  return result;
}

export async function prepareWebView2({ work, environment = process.env, run = execute }) {
  return candidate(work, 'webview2', environment, async directory => {
    const source = contract.runtime;
    const archive = await download(source, directory);
    const files = webView2CabFiles(await readFile(archive), source.root);
    const unpack = join(directory, 'payload');
    await mkdir(unpack, { mode: 0o700 });
    const root = join(unpack, source.root);
    const env = { ...environment, TUYUFACTORY_WEBVIEW2_ARCHIVE: archive,
      TUYUFACTORY_WEBVIEW2_ROOT: root, TUYUFACTORY_WEBVIEW2_VERSION: source.version };
    const options = { cwd: directory, env, timeout: 120_000, maxBuffer: 1024 * 1024 };
    // 固定摘要之外，微软原生签名、文件版本和PE x64架构逐项验真。
    const signature = " $ErrorActionPreference='Stop'; $s=Get-AuthenticodeSignature -LiteralPath $env:TUYUFACTORY_WEBVIEW2_ARCHIVE; if ($s.Status -ne 'Valid' -or $s.SignerCertificate.Subject -notmatch '(?:^|, )O=Microsoft Corporation(?:,|$)') { throw 'WebView2 Microsoft signature invalid' }";
    await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', signature], options);
    await run('expand.exe', [archive, '-F:*', unpack], options);
    const actual = await inventory(unpack);
    if (actual.filter(x => !x.directory).length !== files.length) fail('展开成员数量不一致');
    for (const file of files) {
      const path = join(unpack, ...file.path.split('/'));
      const info = await lstat(path);
      if (!actual.some(x => !x.directory && x.path === file.path)
        || !info.isFile() || info.isSymbolicLink() || info.size !== file.size
        || await realpath(path) !== path) fail('展开文件不符');
      if (/\.(?:exe|dll)$/iu.test(path)) {
        const bytes = await readFile(path);
        const offset = bytes.length >= 64 ? bytes.readUInt32LE(60) : -1;
        if (offset < 64 || offset + 26 > bytes.length || bytes.toString('ascii', 0, 2) !== 'MZ'
          || bytes.toString('binary', offset, offset + 4) !== 'PE\0\0'
          || bytes.readUInt16LE(offset + 4) !== 0x8664 || bytes.readUInt16LE(offset + 24) !== 0x20b) fail('原生架构不是Windows x64');
      }
    }
    const binarySignatures = "$ErrorActionPreference='Stop'; foreach($name in @('msedgewebview2.exe','msedge.dll')) { $p=Join-Path $env:TUYUFACTORY_WEBVIEW2_ROOT $name; $s=Get-AuthenticodeSignature -LiteralPath $p; if ($s.Status -ne 'Valid' -or $s.SignerCertificate.Subject -notmatch '(?:^|, )O=Microsoft Corporation(?:,|$)') { throw 'WebView2 binary signature invalid' }; $v=(Get-Item -LiteralPath $p).VersionInfo; if ((@($v.FileMajorPart,$v.FileMinorPart,$v.FileBuildPart,$v.FilePrivatePart) -join '.') -ne $env:TUYUFACTORY_WEBVIEW2_VERSION) { throw 'WebView2 binary version mismatch' } }";
    await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', binarySignatures], options);
    return root;
  });
}
