#!/usr/bin/env node
// CI_BUILD: incremental

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, realpathSync, rmSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';


// CitizenSDK准备逻辑固定属于本产品端，不再调用TUYU共享产品入口。
const prepareCitizenSdkSource = [
  "import {join} from 'node:path';",
  "import {pathToFileURL} from 'node:url';",
  "const [application,work]=process.argv.slice(2);",
  "const platform=\"linux-arm\",role=\"host\";",
  "const factory=process.env.TUYUFACTORY_ROOT;",
  "if(process.env.GITHUB_ACTIONS==='true' ? factory!==process.env.GITHUB_WORKSPACE : factory!=='/Users/rhett/tuyufactory') throw Error('厂家SDK源码工作区身份无效');",
  "if(process.env.TUYU_PRODUCT!=='tuyufactory-'+role || process.env.TUYU_PLATFORM!==platform || process.env.TUYUFACTORY_WORK_DIR!==work) throw Error('厂家SDK任务身份不一致');",
  "const source=join(factory,'app');",
  "const {prepareNativeProject}=await import(pathToFileURL(join(source,'scripts/project.mjs')));",
  "// 所有平台只装配Pub实际解析的当前SDK视图；产品工程入口负责源码、收据、构建、链接与失败回收。",
  "try { const result=await prepareNativeProject({source,work,output:application,platform},process.env); process.stdout.write(JSON.stringify({...result,TUYUFACTORY_WORK_DIR:work,TUYU_FACTORY_PRODUCT:role})); }",
  "catch(error) { process.stderr.write(error.message+'\\n'); process.exitCode=error.retainSdkStage || error.status===75 ? 75 : 1; }"
].join('\n');

function required(value, message) { if (!value) throw new Error(message); return value; }
function run(command, args, cwd) {
  const flutter = process.platform === 'win32' && command === 'flutter';
  if (flutter && args.some((value) => !/^[A-Za-z0-9_./=-]+$/u.test(value))) throw new Error('Windows Flutter 参数超出固定流程范围');
  execFileSync(flutter ? 'cmd.exe' : command, flutter ? ['/d', '/s', '/c', ['flutter', ...args].join(' ')] : args,
    { cwd, stdio: 'inherit', env: process.env });
}

// 同平台 CI 和 Release 共用真实主机组装；Release 回调必须在本次目录回收前完成归档验真。
export function buildHost({ flow = 'ci', version, consume = () => {} } = {}) {
  required(flow === 'ci' || flow === 'release', '厂家主机构建流程无效');
  required(flow !== 'release' || /^(0|[1-9]\d*)\.(0|[1-9]\d{0,1})\.(0|[1-9]\d{0,1})$/.test(version || ''), '厂家主机正式版本无效');
  required(process.platform === 'linux' && process.arch === 'arm64', '途遇厂家主机端 LinuxARM 必须运行在真实 arm64');
  const root = realpathSync(process.cwd());
  const temp = realpathSync(required(process.env.RUNNER_TEMP, 'LinuxARM 缺少 Runner 临时目录'));
  const work = join(temp, 'tuyufactory-host-linux-arm');
  const scripts = join(root, 'scripts');
  // 产品运行包入口缺失必须在创建工作目录及编译前失败，不能交付仅有界面的空壳。
  required(existsSync(join(scripts, 'linux-arm/build.sh')), '途遇厂家主机端 LinuxARM 缺少产品运行包构建入口：tuyufactory/scripts/linux-arm/build.sh');
  const previous = { ...process.env };
  let owned = null;
  try {
    // 不清空既有任务。只有本进程排他创建成功后才取得该目录的清理权。
    mkdirSync(work); owned = lstatSync(work);
    Object.assign(process.env, {
      TUYUFACTORY_ROOT: root, TUYU_PRODUCT: 'tuyufactory-host', TUYU_PLATFORM: 'linux-arm',
      TUYUFACTORY_WORK_DIR: work,
      TUYU_FACTORY_PRODUCT: 'host', TUYUFACTORY_PLATFORM: 'linux-arm',
      TUYU_FACTORY_PRODUCT_NAME: 'TuyuFactory', TUYU_FACTORY_BUNDLE_IDENTIFIER: 'com.tuyufactory',
      TUYU_FACTORY_DISPLAY_NAME: '途遇厂家端', FLUTTER_TARGET: 'lib/main_host.dart',
    });
    if (flow === 'release') process.env.CARGO_INCREMENTAL = '0';
    // CI 保留受控已经隔离的 Cargo 增量目录；正式构建只使用本次工作目录。
    if (flow === 'release' || !process.env.CARGO_TARGET_DIR) process.env.CARGO_TARGET_DIR = join(work, 'cargo-target');
    run(process.execPath, [join(scripts, 'verify.mjs'), '--sources', root], root);
    run('cargo', ['fmt', '--all', '--check'], root);
    run('cargo', ['test', '--workspace', '--locked'], root);
    run('cargo', ['build', '--workspace', '--release', '--locked'], root);
    // Flutter 的可写工程仅属于本次任务；不把源码中的旧缓存、覆盖依赖或产物复制进去。
    const source = join(root, 'app');
    required(!existsSync(join(source, 'pubspec_overrides.yaml')), '厂家正式来源禁止本机依赖覆盖');
    const application = join(work, 'application');
    // 平台标准目录由本产品唯一入口在当前任务内装配。
    execFileSync(process.execPath, [join(source, 'scripts/project.mjs'), 'create',
      '--source-root', source, '--work-root', work, '--output', application, '--platform', 'linux-arm'],
      { env: process.env, stdio: ['ignore', 'ignore', 'inherit'] });
    run('flutter', ['pub', 'get', '--enforce-lockfile'], application);
    run(process.execPath, [join(scripts, 'verify.mjs'), '--sdk', application], root);
    const sdkEnvironment = JSON.parse(execFileSync(process.execPath,
      ['--input-type=module', '-', application, work],
      { cwd: root, env: process.env, encoding: 'utf8', input: prepareCitizenSdkSource,
        stdio: ['pipe', 'pipe', 'inherit'] }));
    Object.assign(process.env, sdkEnvironment);
    run('flutter', ['analyze', '--no-pub'], application);
    run('flutter', ['test', '--no-pub'], application);
    run('flutter', ['build', 'linux', '--release', '--no-pub', '--target', 'lib/main_host.dart', '--target-platform', 'linux-arm64', ...(version ? [`--build-name=${version}`] : [])], application);
    const runtime = join(work, 'runtime');
    run('bash', [join(scripts, 'linux-arm/build.sh'), runtime], root);
    const sourceBundle = join(application, 'build/linux/arm64/release/bundle');
    const library = join(process.env.CARGO_TARGET_DIR, 'release/libtuyufactory_native.so');
    required(existsSync(sourceBundle) && existsSync(library), '厂家主机完整原生构建输入缺失');
    const bundle = join(work, 'bundle');
    // 在私有组装目录装入真实 SDK 插件产物、厂家原生库及完整业务运行时。
    run(process.execPath, ['--input-type=module', '-e',
      'const {verifyTree} = await import(process.argv[1]); for (const root of process.argv.slice(2)) verifyTree(root);',
      pathToFileURL(join(scripts, 'verify.mjs')).href, sourceBundle, runtime], root);
    required(lstatSync(library).isFile() && !lstatSync(library).isSymbolicLink(), '厂家主机原生库不得为链接');
    cpSync(sourceBundle, bundle, { recursive: true, verbatimSymlinks: true, errorOnExist: true, force: false });
    cpSync(library, join(bundle, 'lib/libtuyufactory_native.so'), { errorOnExist: true, force: false });
    cpSync(runtime, join(bundle, 'runtime'), { recursive: true, verbatimSymlinks: true, errorOnExist: true, force: false });
    run(process.execPath, [join(scripts, 'verify.mjs'), '--package', bundle, 'host', 'linux-arm', flow === 'release' ? 'signed' : 'payload'], root);
    process.env.TUYUFACTORY_RUNTIME_ROOT = join(bundle, 'runtime');
    run('cargo', ['test', '--test', 'runtime_contract', 'materialized_runtime_initializes_account_and_restarts', '--locked', '--', '--ignored', '--exact'], root);
    consume(bundle, work);
  } catch (error) {
    // SDK安全回收失败时保留本次目录及策略证据，不由外层误删未确认的资源。
    if (error.status === 75) owned = null;
    throw error;
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
    if (owned) {
      const current = lstatSync(work);
      required(!current.isSymbolicLink() && current.isDirectory() && current.dev === owned.dev &&
        current.ino === owned.ino && realpathSync(work) === work && realpathSync(temp) === temp,
        '厂家任务目录归属发生变化，拒绝清理');
      rmSync(work, { recursive: true, force: true });
    }
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { buildHost(); }
  catch (error) { console.error(`途遇厂家主机端 LinuxARM CI 失败：${error.message}`); process.exitCode = 1; }
}
