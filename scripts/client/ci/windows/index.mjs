#!/usr/bin/env node
// CI_BUILD: incremental
// TUYUFACTORY_CLIENT_ENTRY_CONTRACT: 同一构建入口供CI载荷检查和Release签名前构建复用。
import { execFileSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, lstatSync, mkdirSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { join, resolve, relative, isAbsolute, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { prepareWebView2SDK, prepareWebView2 } from '../../../dependencies.mjs';


// CitizenSDK准备逻辑固定属于本产品端，不再调用TUYU共享产品入口。
const prepareCitizenSdkSource = [
  "import {join} from 'node:path';",
  "import {pathToFileURL} from 'node:url';",
  "const [application,work]=process.argv.slice(2);",
  "const platform=\"windows\",role=\"client\";",
  "const factory=process.env.TUYUFACTORY_ROOT;",
  "if(process.env.GITHUB_ACTIONS==='true' ? factory!==process.env.GITHUB_WORKSPACE : factory!=='/Users/rhett/tuyufactory') throw Error('厂家SDK源码工作区身份无效');",
  "if(process.env.TUYU_PRODUCT!=='tuyufactory-'+role || process.env.TUYU_PLATFORM!==platform || process.env.TUYUFACTORY_WORK_DIR!==work) throw Error('厂家SDK任务身份不一致');",
  "const source=join(factory,'app');",
  "const {prepareNativeProject}=await import(pathToFileURL(join(source,'scripts/project.mjs')));",
  "// 所有平台只装配Pub实际解析的当前SDK视图；产品工程入口负责源码、收据、构建、链接与失败回收。",
  "try { const result=await prepareNativeProject({source,work,output:application,platform},process.env); process.stdout.write(JSON.stringify({...result,TUYUFACTORY_WORK_DIR:work,TUYU_FACTORY_PRODUCT:role})); }",
  "catch(error) { process.stderr.write(error.message+'\\n'); process.exitCode=error.retainSdkStage || error.status===75 ? 75 : 1; }"
].join('\n');

const platform = 'windows';
function required(value, message) { if (!value) throw new Error(message); }
function inside(parent, child) { const path = relative(parent, child); return Boolean(path) && path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path); }
export function run(file, args, cwd, environment) {
  const flutter = process.platform === 'win32' && file === 'flutter';
  if (flutter && args.some(value => !/^[A-Za-z0-9_./=-]+$/u.test(value))) throw new Error('Windows Flutter参数越过固定范围');
  execFileSync(flutter ? 'cmd.exe' : file, flutter ? ['/d', '/s', '/c', ['flutter', ...args].join(' ')] : args,
    { cwd, env: environment, stdio: 'inherit' });
}

// 清理权来自本进程创建时的设备号/索引；路径相同不表示仍属于本任务。
export function cleanCandidate(result) {
  const {work, identity} = result;
  required(work === join(realpathSync(process.env.RUNNER_TEMP), 'tuyufactory-client-' + platform), '清理任务路径不匹配');
  const status = lstatSync(work);
  required(status.isDirectory() && !status.isSymbolicLink() && realpathSync(work) === work
    && String(status.dev) + ':' + String(status.ino) === identity, '任务目录归属已变化，保留现场');

  rmSync(work, { recursive: true, force: false });
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
  required(output === join(parent, 'tuyufactory-client-windows-release'), 'Release资产目录身份无效');
  return parent;
}

export function claimRelease(root, output) {
  const parent = releaseDirectory(root, output);
  const status = lstatSync(parent);
  required(status.isDirectory() && !status.isSymbolicLink() && realpathSync(parent) === parent, 'Release父目录不能经过链接');
  mkdirSync(output);
  const owned = lstatSync(output);
  return String(owned.dev) + ':' + String(owned.ino);
}
export function cleanRelease(root, output, identity) {
  releaseDirectory(root, output);
  required(/^[0-9]+:[0-9]+$/.test(identity || ''), 'Release清理归属无效');
  const owned = lstatSync(output);
  required(owned.isDirectory() && !owned.isSymbolicLink() && realpathSync(output) === output
    && String(owned.dev) + ':' + String(owned.ino) === identity, 'Release目录归属已变化，保留现场');
  rmSync(output, {recursive:true, force:false});
}

export async function buildCandidate(version) {
  required(process.platform === 'win32' && process.arch === 'x64', '厂家分机windows必须使用准确原生Runner');
  const root = realpathSync(process.cwd()), sourceApp = join(root, 'app');
  required(existsSync(join(sourceApp, 'lib/main_client.dart')) && existsSync(join(sourceApp, platform)), '厂家分机缺少明确入口或平台工程');
  required(process.env.RUNNER_TEMP && isAbsolute(process.env.RUNNER_TEMP), '缺少Runner任务目录');
  const temporary = realpathSync(process.env.RUNNER_TEMP);
  const work = join(temporary, 'tuyufactory-client-' + platform);
  // 每次进程排他拥有当前任务，不覆盖已有候选或另一个流程的目录。
  mkdirSync(work);
  const status = lstatSync(work), identity = String(status.dev) + ':' + String(status.ino);
  let source;
  const app = join(work, 'application');
  const environment = { ...process.env, TUYUFACTORY_ROOT: root, TUYU_PRODUCT: 'tuyufactory-client', TUYU_PLATFORM: platform,
    TUYUFACTORY_WORK_DIR: work, FLUTTER_TARGET: 'lib/main_client.dart',
    TUYU_FACTORY_PRODUCT: 'client', TUYU_FACTORY_PRODUCT_NAME: 'TuyuFactoryClient',
    TUYU_FACTORY_BUNDLE_IDENTIFIER: 'com.tuyufactory.client' };
  try {
    // Runner仅使用当前任务的可写工程；CitizenSDK仍由Pub解析同一锁定Git原件。
    // 不复制源码树中的缓存/生成物；CI只通过受控既有链接复用构建中间件。
    const cacheLink = join(sourceApp, 'build');
    const cache = existsSync(cacheLink) ? realpathSync(cacheLink) : null;
    if (cache) required(!version && lstatSync(cacheLink).isSymbolicLink() && inside(join(temporary, 'ci-cache'), cache), '源码存在非受控CI输出，拒绝接管');
    // 平台标准目录由本产品唯一入口在当前任务内装配。
    execFileSync(process.execPath, [join(sourceApp, 'scripts/project.mjs'), 'create',
      '--source-root', sourceApp, '--work-root', work, '--output', app, '--platform', 'windows'],
      { env: process.env, stdio: ['ignore', 'ignore', 'inherit'] });
    const build = join(app, 'build');
    if (cache) symlinkSync(cache, build, process.platform === 'win32' ? 'junction' : 'dir');
    else {
      mkdirSync(join(work, 'flutter-build'));
      symlinkSync(join(work, 'flutter-build'), build, process.platform === 'win32' ? 'junction' : 'dir');
    }
    run('flutter', ['pub', 'get', '--enforce-lockfile'], app, environment);
    const prepared = JSON.parse(execFileSync(process.execPath,
      ['--input-type=module', '-', app, work],
      { cwd: root, env: environment, encoding: 'utf8', input: prepareCitizenSdkSource,
        stdio: ['pipe', 'pipe', 'inherit'] }));
    Object.assign(environment, prepared);
    run('flutter', ['analyze', '--no-pub'], app, environment);
    run('flutter', ['test', '--no-pub'], app, environment);
    const runtime = await prepareWebView2({ work, environment });
    // 开发SDK是产品依赖；产品流程只提交坐标，版本、来源和摘要只读取本产品锁文件。
    const webView2Sdk = await prepareWebView2SDK({ work, environment });
    environment.TUYUFACTORY_WEBVIEW2_PACKAGE = webView2Sdk.path;
    environment.TUYUFACTORY_WEBVIEW2_SHA256 = webView2Sdk.sha256;
    const args = ['build', 'windows', '--release', '--no-pub', '--target', 'lib/main_client.dart'];
    if (version) args.push('--build-name=' + version);
    run('flutter', args, app, environment);
    const built = realpathSync(join(build, 'windows/x64/runner/Release'));
    const scripts = join(root, 'scripts');
    const { verifyPackage, packageFiles } = await import(pathToFileURL(join(scripts, 'verify.mjs')).href);
    // 浏览器仅加入本次组装树，增量编译缓存不承载正式Runtime。
    for (const entry of packageFiles(built)) void entry;
    // 先检查完整产物才复制离开增量缓存，组装器只接受真实位于本任务内的来源。
    source = join(work, 'bundle');
    cpSync(built, source, { recursive: true, force: false, errorOnExist: true, verbatimSymlinks: true });
    const browser = join(source, 'data/webview2');
    required(!existsSync(browser), 'Flutter编译结果不应携带另一运行时');
    cpSync(runtime, browser, { recursive: true, force: false, errorOnExist: true });
    await verifyPackage(source, 'client', platform, { signature: 'payload' });
    const { buildClient } = await import(pathToFileURL(join(scripts, 'build_client.mjs')).href);
    const candidate = join(work, 'candidate');
    await buildClient(platform, source, candidate, app, environment, 'payload');
    return { root, app, work, source, candidate, environment, identity };
  } catch (error) {
    // 只删除本函数创建的任务目录，不碰缓存来源、源码或历史成功资产。
    if (error.status !== 75 && !error.retainSdkStage) cleanCandidate({root, work, identity});
    throw error;
  }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  let result, retained = false;
  try {
    if (process.argv[2] === 'claim-release') {
      required(process.argv.length === 3 && process.env.GITHUB_ENV, 'Release占有只允许受控动作');
      const identity = claimRelease(realpathSync(process.cwd()), process.env.RELEASE_DIR);
      appendFileSync(process.env.GITHUB_ENV, 'TUYUFACTORY_RELEASE_ID=' + identity + '\n');
    } else if (process.argv[2] === 'cleanup') {
      required(process.argv.length === 3 && /^[0-9]+:[0-9]+$/.test(process.env.TUYUFACTORY_WORK_ID || ''), '缺少本次任务清理凭据');
      if (process.env.TUYUFACTORY_CLEAN_RELEASE === 'true' && process.env.TUYUFACTORY_RELEASE_ID)
        cleanRelease(realpathSync(process.cwd()), process.env.RELEASE_DIR, process.env.TUYUFACTORY_RELEASE_ID);
      cleanCandidate({root:realpathSync(process.cwd()), work:process.env.TUYUFACTORY_WORK_DIR,
        identity:process.env.TUYUFACTORY_WORK_ID});
    } else {
      const version = process.argv[2] === 'build-release' ? process.env.SOFTWARE_VERSION : undefined;
      if (process.argv.length > 2 && !version) throw new Error('只允许准确的build-release及软件版本');
      result = await buildCandidate(version);
      if (version) {
        required(process.env.GITHUB_ENV, 'Release跨步骤必须由GitHub环境登记本次目录归属');
        appendFileSync(process.env.GITHUB_ENV, 'TUYUFACTORY_WORK_ID=' + result.identity + '\n');
        retained = true;
      }
    }
  } catch (error) { console.error('厂家分机windows构建失败：' + error.message); process.exitCode = 1; }
  finally { if (result && !retained) cleanCandidate(result); }
}
