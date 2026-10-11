#!/usr/bin/env node
// 正式版本身份由本仓自动化解析，独立于本机编译。
// 本仓本目标的完整自动化只由同名Workflow调用；版本与产物均在GitHub生成。
import { createHash } from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
import { appendFileSync, copyFileSync, createReadStream, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { closeSync, cpSync, openSync, realpathSync, chmodSync } from 'node:fs';
import { posix, sep } from 'node:path';
import { crc32, inflateRawSync } from 'node:zlib';

export async function factoryRelease(release,platform,readTag){
 if(!automationTarget(platform))fail('厂家未声明该运行包发布入口');
 const prefix=owner.product+'-'+platform+'-v',name=release?.tag_name;
 if(typeof name!=='string'||!name.startsWith(prefix))return null;
 const end=name.substring(prefix.length),runMarker=end.lastIndexOf('-r'),attemptMarker=end.lastIndexOf('-a');
 const version=end.substring(0,runMarker),run=end.substring(runMarker+2,attemptMarker),attempt=end.substring(attemptMarker+2);
 if(runMarker<0||attemptMarker<runMarker||!/^\d+\.\d+\.\d+$/u.test(version)||!/^[1-9]\d*$/u.test(run)||!/^[1-9]\d*$/u.test(attempt))fail('厂家主分机发布版本坐标损坏');
 if(!Number.isSafeInteger(Number(run))||!Number.isSafeInteger(Number(attempt)))fail('厂家构建运行编号越界');
 const source=await readTag(name);
 if(source?.ref!==`refs/tags/${name}`||source.object?.type!=='commit'||!/^[a-f0-9]{40}$/u.test(source.object.sha||''))fail('厂家运行包Tag没有准确源码');
 return {version,tag:name,run_id:Number(run),run_attempt:Number(attempt),source_sha:source.object.sha};
}
function automationTarget(platform){
 if(typeof platform!=='string'||!/^[-a-z0-9]+$/u.test(platform))return false;
 return existsSync(join(root,'.github/workflows/release-'+platform+'.mjs'))&&existsSync(join(root,'.github/workflows/release-'+platform+'.yml'));
}

export const owner = Object.freeze({"product": "tuyufactory", "platform": "client-android", "repository": "tuyutata/tuyufactory", "version_source": {"kind": "pubspec", "path": "app/pubspec.yaml"}, "required_assets": ["tuyufactory-unsigned-client-android.apk", "tuyufactory-unsigned-client-android.aab", "tuyufactory-unsigned-client-android.json"], "asset_locations": ["$RELEASE_WORK/unsigned"], "asset_patterns": ["tuyufactory-unsigned-client-android.apk", "tuyufactory-unsigned-client-android.aab", "tuyufactory-unsigned-client-android.json"], "required_patterns": ["tuyufactory-unsigned-client-android.apk", "tuyufactory-unsigned-client-android.aab", "tuyufactory-unsigned-client-android.json"]});
const commands = Object.freeze({
  "7": {
    "shell": "bash",
    "source": "set -euo pipefail\nsdkmanager \"platforms;android-36\" \"build-tools;37.0.1\" \"platform-tools\" \"cmdline-tools;22.0\" \"ndk;28.2.13676358\" \"cmake;3.31.6\"\ntools=\"$ANDROID_HOME/build-tools/37.0.1\"\nndk_root=\"$ANDROID_HOME/ndk/28.2.13676358\"\ntest -x \"$tools/apksigner\" && test -f \"$ndk_root/source.properties\"\ngrep -Eq '^Pkg\\.Revision[[:space:]]*=[[:space:]]*28\\.2\\.13676358$' \"$ndk_root/source.properties\"\n{\n  printf 'TUYUFACTORY_ANDROID_BUILD_TOOLS=%s\\n' \"$tools\"\n  printf 'ANDROID_NDK_HOME=%s\\n' \"$ndk_root\"\n  printf 'ANDROID_NDK_ROOT=%s\\n' \"$ndk_root\"\n} >> \"$GITHUB_ENV\"\nprintf '%s\\n%s\\n' \"$tools\" \"$ANDROID_HOME/cmdline-tools/22.0/bin\" >> \"$GITHUB_PATH\""
  },
  "8": {
    "shell": "bash",
    "source": "set -euo pipefail\numask 077\nwork=\"$TUYUFACTORY_WORK_DIR/signing\"\nmkdir \"$work\"\ntrap 'rm -rf \"$work\"' EXIT\nmkdir \"$RELEASE_DIR/payload\"\npython3 - \"$work\" <<'PY'\nimport base64, os, pathlib, re, sys\nroot = pathlib.Path(sys.argv[1]); fields = {}\nfor raw in os.environ.get(\"APP_KEY\", \"\").splitlines():\n    line = raw.strip()\n    if not line or line.startswith(\"#\"): continue\n    name, sep, value = line.partition(\"=\")\n    if not sep or name.strip() in fields or not value.strip(): raise SystemExit(\"APP_KEY 行格式无效\")\n    fields[name.strip()] = value.strip()\nif set(fields) - {\"keystore\", \"password\", \"alias\", \"keyPassword\"}: raise SystemExit(\"APP_KEY 包含未登记字段\")\nalias = fields.get(\"alias\", \"upload\")\nif not re.fullmatch(r\"[A-Za-z0-9._-]{1,128}\", alias): raise SystemExit(\"APP_KEY alias 无效\")\ntry: key = base64.b64decode(fields[\"keystore\"], validate=True); password = fields[\"password\"]\nexcept (KeyError, ValueError) as exc: raise SystemExit(\"APP_KEY 缺少有效签名材料\") from exc\nif not 1024 <= len(key) <= 32 * 1024 * 1024: raise SystemExit(\"APP_KEY keystore 大小无效\")\n(root / \"release.keystore\").write_bytes(key); (root / \"password\").write_text(password)\n(root / \"key-password\").write_text(fields.get(\"keyPassword\", password)); (root / \"alias\").write_text(alias)\nPY\nexport TUYU_ANDROID_STORE_PASSWORD=\"$(cat \"$work/password\")\"\nexport TUYU_ANDROID_KEY_PASSWORD=\"$(cat \"$work/key-password\")\"\nalias=\"$(cat \"$work/alias\")\"\napksigner=\"$TUYUFACTORY_ANDROID_BUILD_TOOLS/apksigner\"\n\"$apksigner\" sign --ks \"$work/release.keystore\" --ks-pass env:TUYU_ANDROID_STORE_PASSWORD --key-pass env:TUYU_ANDROID_KEY_PASSWORD --v4-signing-enabled false --ks-key-alias \"$alias\" --out \"$TUYUFACTORY_WORK_DIR/signed.apk\" \"$TUYUFACTORY_WORK_DIR/candidate.apk\"\ncp \"$TUYUFACTORY_WORK_DIR/signed.apk\" \"$TUYUFACTORY_WORK_DIR/tuyufactory-client.apk\"\nnode .github/workflows/release-client-android.mjs verify --mobile \"$TUYUFACTORY_WORK_DIR/tuyufactory-client.apk\" android signed\ncp \"$TUYUFACTORY_WORK_DIR/tuyufactory-client.apk\" \"$RELEASE_DIR/payload/tuyufactory-client.apk\"\ncp \"$TUYUFACTORY_WORK_DIR/application/build/app/outputs/bundle/release/app-release.aab\" \"$RELEASE_DIR/payload/tuyufactory-client.aab\"\nsignature_cleanup=0\nzip -d \"$RELEASE_DIR/payload/tuyufactory-client.aab\" 'META-INF/*.SF' 'META-INF/*.RSA' 'META-INF/*.DSA' 'META-INF/*.EC' >/dev/null || signature_cleanup=$?\ntest \"$signature_cleanup\" = 0 || test \"$signature_cleanup\" = 12\njarsigner -keystore \"$work/release.keystore\" -storepass:env TUYU_ANDROID_STORE_PASSWORD -keypass:env TUYU_ANDROID_KEY_PASSWORD \"$RELEASE_DIR/payload/tuyufactory-client.aab\" \"$alias\"\n\"$apksigner\" verify --verbose \"$RELEASE_DIR/payload/tuyufactory-client.apk\"\njarsigner -verify \"$RELEASE_DIR/payload/tuyufactory-client.aab\"\nnode .github/workflows/release-client-android.mjs verify --mobile \"$RELEASE_DIR/payload/tuyufactory-client.aab\" android signed\ntest \"$(apkanalyzer manifest application-id \"$RELEASE_DIR/payload/tuyufactory-client.apk\")\" = com.tuyufactory.client\n(cd \"$RELEASE_DIR/payload\" && zip -X \"$RELEASE_DIR/tuyufactory-client-android.zip\" tuyufactory-client.apk tuyufactory-client.aab)\nunzip -tqq \"$RELEASE_DIR/tuyufactory-client-android.zip\"\ntest \"$(unzip -Z1 \"$RELEASE_DIR/tuyufactory-client-android.zip\" | LC_ALL=C sort)\" = \"$(printf 'tuyufactory-client.aab\\ntuyufactory-client.apk')\""
  },
  "5": {
    "shell": "bash",
    "source": "# 安装后先验真，再统一准备目标平台缓存与受控修订。\nflutter --version --machine >/dev/null\nplatform=\"android\"\nflutter --version >/dev/null\n# 原生SDK消费与厂家Flutter同一已验真的工具原件；不取Runner默认版本。\nnode --input-type=module <<'NODE_FLUTTER_ROOT'\nimport {appendFileSync, existsSync, realpathSync} from 'node:fs';\nimport {join} from 'node:path';\nif (!process.env.FLUTTER_ROOT || /[\\r\\n\\0]/.test(process.env.FLUTTER_ROOT)) throw new Error('厂家缺少已验真的Flutter根');\nconst root = realpathSync(process.env.FLUTTER_ROOT);\nif (!existsSync(join(root, 'bin/flutter'))) throw new Error('厂家Flutter工具原件缺失');\nappendFileSync(process.env.GITHUB_ENV, 'CITIZENSDK_FLUTTER_ROOT=' + root + '\\nFLUTTER_ROOT=' + root + '\\n');\nNODE_FLUTTER_ROOT"
  },
  "1": {
    "shell": "bash",
    "source": "# 仅登记本产品平台资产目录；不占有或覆盖已有候选。\nnode --input-type=module <<'NODE_RELEASE_DIR'\nimport {appendFileSync, existsSync, lstatSync, realpathSync} from 'node:fs';\nimport {isAbsolute, join, relative, sep} from 'node:path';\nconst value = process.env.RUNNER_TEMP;\nif (!value || !isAbsolute(value) || /[\\r\\n\\0]/.test(value)) throw new Error('Release缺少准确Runner临时根');\nconst temporary = realpathSync(value), source = realpathSync(process.env.GITHUB_WORKSPACE);\nconst contains = (left, right) => {\n  const value = relative(left, right);\n  return value === '' || (value !== '..' && !value.startsWith('..' + sep) && !isAbsolute(value));\n};\nconst status = lstatSync(temporary);\nif (!status.isDirectory() || status.isSymbolicLink() || contains(source, temporary)\n    || contains(temporary, source)) throw new Error('Release临时根与源码交叠或经过链接');\nconst output = join(temporary, 'tuyufactory-client-android-release');\nif (existsSync(output)) throw new Error('Release资产目标已存在，拒绝覆盖');\nappendFileSync(process.env.GITHUB_ENV, 'RELEASE_DIR=' + output + '\\n');\nNODE_RELEASE_DIR"
  },
  "6": {
    "shell": "bash",
    "source": "node --input-type=module <<'NODE'\nimport {appendFileSync, realpathSync} from 'node:fs';\nimport {join} from 'node:path';\nconst platform = 'android';\nconst work = join(realpathSync(process.env.RUNNER_TEMP), 'tuyufactory-client-' + platform);\nappendFileSync(process.env.GITHUB_ENV, 'TUYUFACTORY_WORK_DIR=' + work + '\\nFLUTTER_TARGET=lib/main_client.dart\\nTUYU_FACTORY_PRODUCT=client\\n');\nNODE"
  },
  "10": {
    "shell": "bash",
    "source": "set -euo pipefail\nplatform=android\nnode \"$GITHUB_WORKSPACE/.github/workflows/release-client-android.mjs\" action checks cleanup"
  },
  "9": {
    "shell": "bash",
    "source": "node <<'NODE'\nconst { createHash } = require('node:crypto'); const fs = require('node:fs'); const root = process.env.RELEASE_DIR;\nconst hash = (name) => createHash('sha256').update(fs.readFileSync(`${root}/${name}`)).digest('hex');\nconst asset = 'tuyufactory-client-android.zip';\nconst manifest = { product_id: 'tuyufactory', platform: 'client-android', software_version: process.env.SOFTWARE_VERSION, git_commit_sha: process.env.SOURCE_SHA, producer_run_id: Number(process.env.PRODUCER_RUN_ID), package_name: 'com.tuyufactory.client', assets: [{ name: asset, sha256: hash(asset) }] };\nfs.writeFileSync(`${root}/release-manifest.json`, `${JSON.stringify(manifest, null, 2)}\\n`);\nfs.writeFileSync(`${root}/SHA256SUMS`, `${hash(asset)}  ${asset}\\n${hash('release-manifest.json')}  release-manifest.json\\n`);\nNODE"
  },
  "3": {
    "shell": "bash",
    "source": "set -euo pipefail\nnode .github/workflows/release-client-android.mjs verify --sources \"$GITHUB_WORKSPACE\""
  },
  "4": {
    "shell": "bash",
    "source": "printf 'version=3.47.2\n' >> \"$GITHUB_OUTPUT\""
  },
  "2": {
    "shell": "bash",
    "source": "set -euo pipefail\ntest -f app/lib/main_client.dart || { echo '途遇厂家分机端缺少产品入口：app/lib/main_client.dart' >&2; exit 1; }\nplatform=android\ntest -d \"app/$platform\" || { echo \"途遇厂家分机端缺少产品平台工程：$platform\" >&2; exit 1; }"
  }
});
const actions = Object.freeze({
  "checks": {
    "source": "#!/usr/bin/env node\n// CI_BUILD: incremental\n// TUYUFACTORY_CLIENT_ENTRY_CONTRACT: 同一构建入口供CI载荷检查和Release签名前构建复用。\nimport { execFileSync } from 'node:child_process';\nimport { appendFileSync, cpSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs';\nimport { join, resolve, relative, isAbsolute, sep } from 'node:path';\nimport { pathToFileURL } from 'node:url';\n\n\n// CitizenSDK准备逻辑固定属于本产品端，不再调用TUYU共享产品入口。\nconst prepareCitizenSdkSource = [\n  \"import {join} from 'node:path';\",\n  \"import {pathToFileURL} from 'node:url';\",\n  \"const [application,work]=process.argv.slice(2);\",\n  \"const platform=\\\"android\\\",role=\\\"client\\\";\",\n  \"const factory=process.env.TUYUFACTORY_ROOT;\",\n  \"if(process.env.GITHUB_ACTIONS!=='true'||factory!==process.env.GITHUB_WORKSPACE) throw Error('厂家SDK源码工作区身份无效');\",\n  \"if(process.env.TUYU_PRODUCT!=='tuyufactory-'+role || process.env.TUYU_PLATFORM!==platform || process.env.TUYUFACTORY_WORK_DIR!==work) throw Error('厂家SDK任务身份不一致');\",\n  \"const source=join(factory,'app');\",\n  \"const {prepareNativeProject}=await import(pathToFileURL(join(source,'scripts/project.mjs')));\",\n  \"// 所有平台只装配Pub实际解析的当前SDK视图；产品工程入口负责源码、收据、构建、链接与失败回收。\",\n  \"try { const result=await prepareNativeProject({source,work,output:application,platform},process.env); process.stdout.write(JSON.stringify({...result,TUYUFACTORY_WORK_DIR:work,TUYU_FACTORY_PRODUCT:role})); }\",\n  \"catch(error) { process.stderr.write(error.message+'\\\\n'); process.exitCode=error.retainSdkStage || error.status===75 ? 75 : 1; }\"\n].join('\\n');\n\nconst platform = 'android';\nfunction required(value, message) { if (!value) throw new Error(message); }\nfunction inside(parent, child) { const path = relative(parent, child); return Boolean(path) && path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path); }\nfunction run(file, args, cwd, environment) {\n  const flutter = process.platform === 'win32' && file === 'flutter';\n  if (flutter && args.some(value => !/^[A-Za-z0-9_./=-]+$/u.test(value))) throw new Error('Windows Flutter参数越过固定范围');\n  execFileSync(flutter ? 'cmd.exe' : file, flutter ? ['/d', '/s', '/c', ['flutter', ...args].join(' ')] : args,\n    { cwd, env: environment, stdio: 'inherit' });\n}\n\n// 清理权来自本进程创建时的设备号/索引；路径相同不表示仍属于本任务。\nfunction cleanCandidate(result) {\n  const {work, identity} = result;\n  required(work === join(realpathSync(process.env.RUNNER_TEMP), 'tuyufactory-client-' + platform), '清理任务路径不匹配');\n  const status = lstatSync(work);\n  required(status.isDirectory() && !status.isSymbolicLink() && realpathSync(work) === work\n    && String(status.dev) + ':' + String(status.ino) === identity, '任务目录归属已变化，保留现场');\n\n  rmSync(work, { recursive: true, force: false });\n}\n\n// 正式资产仅在本次Runner临时根；源码、祖先、别名或其它产品平台目录均拒绝。\nfunction releaseDirectory(root, output) {\n  required(realpathSync(root) === root, 'Release源码根必须为规范物理目录');\n  required(process.env.RUNNER_TEMP && isAbsolute(process.env.RUNNER_TEMP), 'Release缺少Runner临时根');\n  const parent = realpathSync(process.env.RUNNER_TEMP);\n  const status = lstatSync(parent);\n  const contains = (left, right) => {\n    const value = relative(left, right);\n    return value === '' || (value !== '..' && !value.startsWith('..' + sep) && !isAbsolute(value));\n  };\n  required(status.isDirectory() && !status.isSymbolicLink() && realpathSync(parent) === parent\n    && !contains(root, parent) && !contains(parent, root), 'Release临时根与源码交叠或经过链接');\n  required(output === join(parent, 'tuyufactory-client-android-release'), 'Release资产目录身份无效');\n  return parent;\n}\n\nfunction claimRelease(root, output) {\n  const parent = releaseDirectory(root, output);\n  const status = lstatSync(parent);\n  required(status.isDirectory() && !status.isSymbolicLink() && realpathSync(parent) === parent, 'Release父目录不能经过链接');\n  mkdirSync(output);\n  const owned = lstatSync(output);\n  return String(owned.dev) + ':' + String(owned.ino);\n}\nfunction cleanRelease(root, output, identity) {\n  releaseDirectory(root, output);\n  required(/^[0-9]+:[0-9]+$/.test(identity || ''), 'Release清理归属无效');\n  const owned = lstatSync(output);\n  required(owned.isDirectory() && !owned.isSymbolicLink() && realpathSync(output) === output\n    && String(owned.dev) + ':' + String(owned.ino) === identity, 'Release目录归属已变化，保留现场');\n  rmSync(output, {recursive:true, force:false});\n}\n\nasync function buildCandidate(version) {\n  required(process.platform === 'linux' && process.arch === 'x64', '厂家分机android必须使用准确原生Runner');\n  const root = realpathSync(process.cwd()), sourceApp = join(root, 'app');\n  required(existsSync(join(sourceApp, 'lib/main_client.dart')) && existsSync(join(sourceApp, platform)), '厂家分机缺少明确入口或平台工程');\n  required(process.env.RUNNER_TEMP && isAbsolute(process.env.RUNNER_TEMP), '缺少Runner任务目录');\n  const temporary = realpathSync(process.env.RUNNER_TEMP);\n  const work = join(temporary, 'tuyufactory-client-' + platform);\n  // 每次进程排他拥有当前任务，不覆盖已有候选或另一个流程的目录。\n  mkdirSync(work);\n  const status = lstatSync(work), identity = String(status.dev) + ':' + String(status.ino);\n  let source;\n  const app = join(work, 'application');\n  const environment = { ...process.env, TUYUFACTORY_ROOT: root, TUYU_PRODUCT: 'tuyufactory-client', TUYU_PLATFORM: platform,\n    TUYUFACTORY_WORK_DIR: work, FLUTTER_TARGET: 'lib/main_client.dart',\n    TUYU_FACTORY_PRODUCT: 'client', TUYU_FACTORY_PRODUCT_NAME: 'TuyuFactoryClient',\n    TUYU_FACTORY_BUNDLE_IDENTIFIER: 'com.tuyufactory.client' };\n  try {\n    // Runner仅使用当前任务的可写工程；CitizenSDK仍由Pub解析同一锁定Git原件。\n    // 不复制源码树中的缓存/生成物；CI只通过受控既有链接复用构建中间件。\n    const cacheLink = join(sourceApp, 'build');\n    const cache = existsSync(cacheLink) ? realpathSync(cacheLink) : null;\n    if (cache) required(!version && lstatSync(cacheLink).isSymbolicLink() && inside(join(temporary, 'ci-cache'), cache), '源码存在非受控CI输出，拒绝接管');\n    // 平台标准目录由本产品唯一入口在当前任务内装配。\n    execFileSync(process.execPath, [join(sourceApp, 'scripts/project.mjs'), 'create',\n      '--source-root', sourceApp, '--work-root', work, '--output', app, '--platform', 'android'],\n      { env: process.env, stdio: ['ignore', 'ignore', 'inherit'] });\n    const build = join(app, 'build');\n    if (cache) symlinkSync(cache, build, process.platform === 'win32' ? 'junction' : 'dir');\n    else {\n      mkdirSync(join(work, 'flutter-build'));\n      symlinkSync(join(work, 'flutter-build'), build, process.platform === 'win32' ? 'junction' : 'dir');\n    }\n    run('flutter', ['pub', 'get', '--enforce-lockfile'], app, environment);\n    const prepared = JSON.parse(execFileSync(process.execPath,\n      ['--input-type=module', '-', app, work],\n      { cwd: root, env: environment, encoding: 'utf8', input: prepareCitizenSdkSource,\n        stdio: ['pipe', 'pipe', 'inherit'] }));\n    Object.assign(environment, prepared);\n    run('flutter', ['analyze', '--no-pub'], app, environment);\n    run('flutter', ['test', '--no-pub'], app, environment);\n    const args = ['build', 'apk', '--release', '--no-pub', '--target', 'lib/main_client.dart', '--target-platform', 'android-arm64'];\n    if (version) args.push('--build-name=' + version);\n    run('flutter', args, app, environment);\n    if (version) run('flutter', ['build', 'appbundle', '--release', '--no-pub', '--target', 'lib/main_client.dart', '--target-platform', 'android-arm64', '--build-name=' + version], app, environment);\n    const built = realpathSync(join(build, 'app/outputs/flutter-apk/app-release.apk'));\n    const scripts = join(root, 'scripts');\n    const { verifyPackageFiles } = await import(pathToFileURL(join(root, '.github/workflows/release-client-android.mjs')).href);\n    const { apkFiles } = await import(pathToFileURL(join(root, '.github/workflows/release-client-android.mjs')).href);\n    const packageName = execFileSync('apkanalyzer', ['manifest', 'application-id', built], {env:environment, encoding:'utf8'}).trim();\n    verifyPackageFiles('client', platform, apkFiles(readFileSync(built)), packageName, 'lib/arm64-v8a/libapp.so');\n    // 先检查完整产物才复制离开增量缓存，组装器只接受真实位于本任务内的来源。\n    source = join(work, 'client.apk');\n    cpSync(built, source, { recursive: true, force: false, errorOnExist: true, verbatimSymlinks: true });\n    const { buildClient } = await import(pathToFileURL(join(root, '.github/workflows/release-client-android.mjs')).href);\n    const candidate = join(work, 'candidate.apk');\n    await buildClient(platform, source, candidate, app, environment, 'payload');\n    return { root, app, work, source, candidate, environment, identity };\n  } catch (error) {\n    if (error.status !== 75 && !error.retainSdkStage) cleanCandidate({root, work, identity});\n    throw error;\n  }\n}\n\n// GitHub 只执行未签名候选构建与现场认领；正式签名始终由本仓本机发布入口执行。\nconst command = process.argv[2];\nif (command === 'build-release') await buildCandidate(process.env.SOFTWARE_VERSION);\nelse if (command === 'claim-release') claimRelease(realpathSync(process.cwd()), process.env.RELEASE_DIR);\nelse throw new Error('厂家未声明的自动化操作');\n",
    "shell": "node"
  }
});
const shaPattern = /^[0-9a-f]{40}$/u;
const fail = message => { throw new Error(message); };
const root = fileURLToPath(new URL('../../', import.meta.url));
const workflowPath = `.github/workflows/release-${owner.platform}.yml`;
const prefix = `${owner.product}-${owner.platform}-v`;

export function context(environment = process.env) {
  const number = name => {
    const value = environment[name];
    if (!/^[1-9][0-9]*$/u.test(value || '') || !Number.isSafeInteger(Number(value))) fail('GitHub运行坐标无效');
    return Number(value);
  };
  if (environment.GITHUB_ACTIONS !== 'true' || environment.GITHUB_REPOSITORY !== owner.repository
    || environment.GITHUB_REF !== 'refs/heads/main' || environment.GITHUB_EVENT_NAME !== 'workflow_dispatch'
    || !shaPattern.test(environment.GITHUB_SHA || '')
    || environment.GITHUB_WORKFLOW_REF !== `${owner.repository}/${workflowPath}@refs/heads/main`) fail('所属GitHub运行身份无效');
  return { repository: owner.repository, product_id: owner.product, platform: owner.platform,
    source_sha: environment.GITHUB_SHA, run_id: number('GITHUB_RUN_ID'),
    run_number: number('GITHUB_RUN_NUMBER'), run_attempt: number('GITHUB_RUN_ATTEMPT'), workflow: workflowPath };
}

export async function request(path, { method = 'GET', body, raw = false, size, fetch: send = globalThis.fetch } = {}) {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token || /[\s\u0000-\u001f\u007f]/u.test(token)) fail('缺少GitHub任务令牌');
  const url = path.startsWith('https://') ? new URL(path) : new URL(`https://api.github.com/repos/${owner.repository}/${path}`);
  if (!['api.github.com', 'uploads.github.com'].includes(url.hostname) || url.protocol !== 'https:' || url.username || url.password || !url.pathname.startsWith(`/repos/${owner.repository}/`)) fail('GitHub接口地址无效');
  const headers = { Authorization: `Bearer ${token}`, Accept: raw ? 'application/octet-stream' : 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2026-03-10', 'User-Agent': owner.product };
  if (body !== undefined) headers['Content-Type'] = body?.pipe ? 'application/octet-stream' : 'application/json';
  if(body?.pipe){if(!Number.isSafeInteger(size)||size<=0)fail('资产上传长度无效');headers['Content-Length']=String(size);}
  let response = await send(url, { method, headers, redirect: raw ? 'manual' : 'error', signal: AbortSignal.timeout(300_000),
    ...(body === undefined ? {} : { body: body?.pipe ? body : JSON.stringify(body), ...(body?.pipe ? { duplex: 'half' } : {}) }) });
  if(raw&&response.status===302){
    const location=new URL(response.headers.get('location'));
    if(location.protocol!=='https:'||location.username||location.password)fail('正式资产回读地址无效');
    response=await send(location,{method:'GET',redirect:'error',credentials:'omit',signal:AbortSignal.timeout(300_000)});
  }
  if (response.status === 404) return null;
  if (!response.ok) fail(`GitHub接口失败：${response.status}，操作未确认`);
  if (raw) return response;
  return response.status === 204 ? {} : response.json();
}

export async function pages(path, field = null, api = request) {
  const rows = [];
  for (let page = 1; ; page++) {
    const data = await api(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    const values = field ? data?.[field] : data;
    if (!Array.isArray(values)) fail('GitHub分页数据无效');
    rows.push(...values);
    if (values.length < 100) return rows;
  }
}

function seedVersion() {
  const source = owner.version_source;
  if (source.kind === 'sequence') return '0.0.0';
  const text = readFileSync(join(root, source.path), 'utf8');
  if (source.kind === 'json') return String(JSON.parse(text).version);
  if (source.kind === 'spec') {
    const matches = [...text.matchAll(/^\s*spec_version:\s*(\d+)\s*,\s*$/gm)];
    if (matches.length !== 1) fail('Runtime版本真源不唯一');
    return matches[0][1];
  }
  if (source.kind === 'cargo') {
    const value = /^\[package\][\s\S]*?^version\s*=\s*"(\d+\.\d+\.\d+)"/mu.exec(text)?.[1];
    if (!value) fail('本仓Cargo版本真源无效');
    return value;
  }
  const value = /^version:\s*(\d+\.\d+\.\d+)(?:\+\d+)?\s*$/mu.exec(text)?.[1];
  if (!value) fail('本仓软件版本真源无效');
  return value;
}

export function nextVersion(seed, versions, protocol = false, runNumber = 1) {
  if (protocol) {
    if (!/^\d+$/u.test(seed) || versions.some(value => !/^\d+$/u.test(value))) fail('协议版本无效');
    const value = Math.max(Number(seed), ...versions.map(Number)) + (versions.length ? 1 : 0);
    if (!Number.isSafeInteger(value) || value < 1 || value > 0xffffffff) fail('协议版本越界');
    return String(value);
  }
  const parse = value => {
    const match = /^(0|[1-9]\d*)\.(0|[1-9]\d?)\.(0|[1-9]\d?)$/u.exec(value);
    if (!match) fail('软件版本无效');
    const parts=match.slice(1).map(Number);if(parts.some(value=>!Number.isSafeInteger(value)))fail('软件版本越界');return parts;
  };
  const values = [seed, ...versions].map(parse).sort((a,b) => a[0]-b[0] || a[1]-b[1] || a[2]-b[2]);
  let [major, minor, patch] = values.at(-1);
  if (versions.length) { if (++patch > 99) { patch = 0; if (++minor > 99) { minor = 0; major++; } } }
  if(!Number.isSafeInteger(runNumber)||runNumber<1)fail('版本运行序号无效');
  const initial=parse(seed),floor=BigInt(initial[0])*10000n+BigInt(initial[1])*100n+BigInt(initial[2])+BigInt(runNumber-1);
  const historical=BigInt(major)*10000n+BigInt(minor)*100n+BigInt(patch);
  if(floor>historical){major=Number(floor/10000n);minor=Number(floor/100n%100n);patch=Number(floor%100n);}
  if(![major,minor,patch].every(Number.isSafeInteger))fail('软件版本越界');
  return `${major}.${minor}.${patch}`;
}

function output(name, value, file = process.env.GITHUB_OUTPUT) {
  if (!file || /[\r\n]/u.test(String(value))) fail('GitHub步骤输出无效');
  appendFileSync(file, `${name}=${value}\n`);
}

export async function prepare() {
  const identity = context();
  const releases = await pages('releases');
  const versions = [];
  for (const release of releases) {
    if (release.draft || release.prerelease || !String(release.tag_name).startsWith(prefix)) continue;
    const notes = (await factoryRelease(release,owner.platform,tag=>request('git/ref/tags/'+encodeURIComponent(tag))));
    if (!notes || notes.platform !== owner.platform) continue;
    const run = await request(`actions/runs/${notes.run_id}`);
    if (run?.status === 'completed' && run.conclusion === 'success' && run.path === workflowPath) versions.push(notes.version);
  }
  const version = nextVersion(seedVersion(), versions, owner.version_source.kind === 'spec', identity.run_number);
  const tag = `${prefix}${version}-r${identity.run_id}-a${identity.run_attempt}`;
  for (const [name,value] of Object.entries({version, tag, source_sha:identity.source_sha,
    run_id:identity.run_id, run_attempt:identity.run_attempt, run_number:identity.run_number})) output(name,value);
}

function runVersion() {
  const identity = context();
  const version = process.env.RELEASE_VERSION;
  const tag = process.env.RELEASE_TAG;
  nextVersion(version, [], owner.version_source.kind === 'spec');
  if (tag !== `${prefix}${version}-r${identity.run_id}-a${identity.run_attempt}`) fail('本次版本与Tag不一致');
  return {...identity, version, tag};
}

export function job() {
  const identity = runVersion();
  if (execFileSync('git', ['rev-parse','HEAD'], {cwd:root,encoding:'utf8'}).trim() !== identity.source_sha) fail('检出源码不符');
  const work = join(process.env.RUNNER_TEMP, owner.product, owner.platform, String(identity.run_id), String(identity.run_attempt), process.env.GITHUB_JOB);
  mkdirSync(work,{recursive:true});
  const variables = {RELEASE_WORK:work, RELEASE_ASSETS_DIR:join(work,'assets'), SOURCE_SHA:identity.source_sha,
    SOFTWARE_VERSION:identity.version, VERSION_TAG:identity.tag, BUILD_NUMBER:String(identity.run_number),
    CARGO_HOME:join(work,'cargo-home'), CARGO_TARGET_DIR:join(work,'cargo'), PUB_CACHE:join(work,'pub'),
    GRADLE_USER_HOME:join(work,'gradle'), npm_config_cache:join(work,'npm'), XDG_CACHE_HOME:join(work,'cache'),
    TMPDIR:join(work,'tmp'), TMP:join(work,'tmp'), TEMP:join(work,'tmp')};
  for (const path of ['cargo-home','cargo','pub','gradle','npm','cache','tmp','assets']) mkdirSync(join(work,path),{recursive:true});
  for (const [name,value] of Object.entries(variables)) { process.env[name]=value; output(name,value,process.env.GITHUB_ENV); }
}

// 原签名与正式清单脚本仍归本产品唯一实现；GitHub步骤禁止执行，只交付本机签名接口。
export function localSigningSources() {
  const sign=commands['8'],manifest=commands['9'];
  if(sign?.shell!=='bash'||manifest?.shell!=='bash')throw Error('本仓本机签名脚本缺失');
  return {sign:sign.source,manifest:manifest.source};
}

export function step(key) {
  runVersion();
  if(key==='8'||key==='9')fail('正式签名与清单只能在本机执行');
  const value = commands[key];
  if (!value || !['bash','pwsh'].includes(value.shell)) fail('本目标构建步骤无效');
  const directory = join(process.env.RELEASE_WORK,'commands');mkdirSync(directory,{recursive:true});
  const file = join(directory, value.shell === 'pwsh' ? 'step.ps1' : 'step.sh');
  writeFileSync(file, value.shell === 'bash' ? 'set -euo pipefail\n'+value.source : "$ErrorActionPreference = 'Stop'\n"+value.source,{mode:0o700});
  const result = spawnSync(value.shell === 'pwsh' ? 'pwsh' : 'bash', value.shell === 'pwsh' ? ['-NoProfile','-File',file] : [file],
    {cwd:process.cwd(),env:process.env,stdio:'inherit'});
  rmSync(file,{force:true});
  if (result.error || result.status !== 0) fail(`本仓构建步骤失败：${key}`);
}

export function action(name, args) {
  runVersion();
  const value = actions[name];if (!value) fail('本目标动作无效');
  const directory = join(process.env.RELEASE_WORK,'commands');mkdirSync(directory,{recursive:true});
  const file = join(directory,value.shell === 'bash'?'action.sh':'action.mjs');
  const source=value.source.replace(/__PRODUCT_URL__([^'"\s]+)__END_URL__/gu,(_,path)=>pathToFileURL(join(root,path)).href);
  writeFileSync(file,source,{mode:0o700});
  const result=spawnSync(value.shell==='bash'?'bash':process.execPath,[file,...args],{cwd:root,env:process.env,stdio:'inherit'});
  rmSync(file,{force:true});if(result.error||result.status!==0)fail(`本仓动作失败：${name}`);
}

function regular(path) {
  const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size<=0)fail('正式产物不是非空普通文件');return stat;
}
async function digestFile(path) { const hash=createHash('sha256');for await(const bytes of createReadStream(path))hash.update(bytes);return hash.digest('hex'); }
function assetName(name) { if(!name||name!==basename(name)||/[\u0000-\u001f\u007f]/u.test(name))fail('正式资产文件名无效');return name; }

export async function collect(paths) {
  const identity=runVersion(),destination=process.env.RELEASE_ASSETS_DIR;
  if(!destination||!paths.length)fail('本仓没有完整产物');mkdirSync(destination,{recursive:true});
  const files=[];
  for(const path of paths){const file=resolve(path),stat=regular(file),name=assetName(basename(file));
    if(files.some(row=>row.name===name))fail('正式资产重名');
    const target=join(destination,name);if(file!==target)copyFileSync(file,target);
    files.push({name,size:stat.size,sha256:await digestFile(target)});
  }
  if(owner.required_assets.some(name=>!files.some(row=>row.name===name)))fail('本目标必要产物缺失');
  const metadata={schema:1,...identity,assets:files};
  writeFileSync(join(destination,'automation.json'),JSON.stringify(metadata,null,2)+'\n');
  output('assets',destination);return metadata;
}

export async function collectProduced() {
  const paths=[],seen=new Set();
  const expand=value=>value.replace(/\$\{([A-Z_]+)\}|\$([A-Z_]+)/gu,(_,a,b)=>process.env[a||b]||'');
  for(const location of owner.asset_locations){
    const path=expand(location);if(!path||!existsSync(path))continue;
    const candidates=lstatSync(path).isDirectory()?readdirSync(path).map(name=>join(path,name)):[path];
    for(const candidate of candidates){if(!lstatSync(candidate).isFile()||seen.has(resolve(candidate)))continue;
      const name=basename(candidate);if(!owner.asset_patterns.some(pattern=>new RegExp('^'+pattern.replace(/[.+?^${}()|[\]\\]/gu,'\\$&').replaceAll('*','.*')+'$','u').test(name)))continue;
      seen.add(resolve(candidate));paths.push(candidate);
    }
  }
  if(owner.required_patterns.some(pattern=>!paths.some(path=>new RegExp('^'+pattern.replace(/[.+?^${}()|[\]\\]/gu,'\\$&').replaceAll('*','.*')+'$','u').test(basename(path)))))fail('本目标完整正式资产缺失');
  return collect(paths);
}



// CI只收集未签名候选；正式签名材料绝不进入GitHub任务。
export async function unsigned() {
  const identity=runVersion(),project=resolve(join(process.env.TUYUFACTORY_WORK_DIR||'', 'application'));
  if(!isAbsolute(project)||!lstatSync(project).isDirectory()||realpathSync(project)!==project)fail('未签名工程目录无效');
  const directory=join(process.env.RELEASE_WORK,'unsigned');
  if(existsSync(directory))fail('未签名候选目录已存在');
  mkdirSync(directory,{mode:0o700});
  const stem=owner.product+'-unsigned-'+owner.platform,inputs=[];
  if(owner.platform.endsWith('android')) {
    for(const [relative,name] of [
      ['build/app/outputs/flutter-apk/app-release.apk',stem+'.apk'],
      ['build/app/outputs/bundle/release/app-release.aab',stem+'.aab']]) {
      const source=join(project,relative);regular(source);
      const target=join(directory,name);copyFileSync(source,target);inputs.push(target);
    }
  } else if(owner.platform.endsWith('ios')) {
    const app=join(project,'build/ios/iphoneos/Runner.app');
    if(!lstatSync(app).isDirectory()||realpathSync(app)!==app)fail('iOS未签名应用无效');
    const archive=join(directory,stem+'.zip');
    const result=spawnSync('/usr/bin/ditto',['-c','-k','--keepParent',app,archive],{stdio:'ignore'});
    if(result.error||result.status!==0)fail('iOS未签名应用封装失败');
    regular(archive);inputs.push(archive);
  } else fail('本仓未声明的移动平台');
  const assets=[];for(const path of inputs)assets.push({name:basename(path),size:regular(path).size,sha256:await digestFile(path)});
  const manifest=join(directory,stem+'.json');
  writeFileSync(manifest,JSON.stringify({schema:1,product_id:owner.product,platform:owner.platform,repository:owner.repository,
    version:identity.version,tag:identity.tag,source_sha:identity.source_sha,run_id:identity.run_id,
    run_attempt:identity.run_attempt,run_number:identity.run_number,workflow:workflowPath,assets},null,2)+'\n',{flag:'wx',mode:0o600});
  return collectProduced();
}

function ownedRun(run) {
  // 每个目标只处理自身现行Workflow；文件缺失不能证明历史任务归属。
  return Number.isSafeInteger(run?.id)&&run.id>0&&run.path===workflowPath
    &&run.head_branch==='main'&&run.event==='workflow_dispatch'
    &&(!run.repository||run.repository.full_name===owner.repository);
}

export function cleanupPlan(runs,current,result) {
  if(!['success','failed'].includes(result)||!ownedRun(current)||!Number.isFinite(Date.parse(current.created_at)))fail('清理所属任务身份无效');
  const earlier=run=>Date.parse(run.created_at)<Date.parse(current.created_at)
    ||Date.parse(run.created_at)===Date.parse(current.created_at)&&run.id<current.id;
  return runs.filter(run=>ownedRun(run)&&run.id!==current.id&&run.status==='completed'&&earlier(run)
    &&(run.conclusion==='success'?'success':'failed')===result).sort((a,b)=>a.id-b.id);
}

async function remove(path,api) { await api(path,{method:'DELETE'});const readPath=path.replace(/^git\/refs\//u,'git/ref/');if(await api(readPath)!==null)fail('删除回查仍存在，清理失败'); }
async function removeRunRelease(run,releases,api) {
  for(const release of releases){
    const metadata=(await factoryRelease(release,owner.platform,tag=>api('git/ref/tags/'+encodeURIComponent(tag))));
    if(!metadata||metadata.run_id!==run.id)continue;
    if(metadata.source_sha!==run.head_sha)fail('正式Release与所属Run不一致');
    const tag=metadata.tag;
    const again=await api(`actions/runs/${run.id}`);
    if(again&&again.id!==Number(process.env.GITHUB_RUN_ID)
      &&(again.status!=='completed'||again.run_attempt!==run.run_attempt||again.conclusion!==run.conclusion))fail('所属任务已变化，停止清理');
    await remove(`releases/${release.id}`,api);
    const beforeTag=await api(`actions/runs/${run.id}`);
    if(beforeTag&&beforeTag.id!==Number(process.env.GITHUB_RUN_ID)
      &&(beforeTag.status!=='completed'||beforeTag.run_attempt!==run.run_attempt||beforeTag.conclusion!==run.conclusion))fail('所属任务已变化，停止清理');
    await remove(`git/refs/tags/${encodeURIComponent(tag)}`,api);
  }
}
export async function cleanup(result,identity=context(),api=request) {
  const current=await api(`actions/runs/${identity.run_id}`);
  const plan=cleanupPlan(await pages('actions/runs','workflow_runs',api),current,result);
  const releases=await pages('releases',null,api),removed=[];
  for(const row of plan){const run=await api(`actions/runs/${row.id}`);if(!run){removed.push(row.id);continue;}
    if(run.run_attempt!==row.run_attempt||cleanupPlan([run],current,result).length!==1)continue;
    await removeRunRelease(run,releases,api);
    // 失败若只形成Tag也按它的准确Run坐标处理，不能留下同类孤立产物。
    const tags=await api(`git/matching-refs/tags/${prefix}`);
    if(!Array.isArray(tags))fail('所属Tag集合无效');
    for(const reference of tags){
      const tag=String(reference.ref||'').slice('refs/tags/'.length);
      if(!String(reference.ref||'').startsWith('refs/tags/'+prefix)
        ||!new RegExp(`-r${run.id}-a[1-9][0-9]*$`,'u').test(tag)||Number(tag.slice(tag.lastIndexOf('-a')+2))>run.run_attempt)continue;
      if(reference.object?.type!=='commit'||reference.object.sha!==run.head_sha)fail('所属Tag来源已改变，停止清理');
      const again=await api(`actions/runs/${run.id}`);
      if(!again||cleanupPlan([again],current,result).length!==1)fail('所属任务已改变，停止清理');
      await remove(`git/refs/tags/${encodeURIComponent(tag)}`,api);
    }
    for(const asset of await pages(`actions/runs/${run.id}/artifacts`,'artifacts',api)){
      if(!Number.isSafeInteger(asset.id)||asset.id<=0)fail('所属Artifact坐标无效');
      const again=await api(`actions/runs/${run.id}`);if(!again||again.status!=='completed'||again.run_attempt!==run.run_attempt||again.conclusion!==run.conclusion)fail('历史任务已变化，停止清理');
      await remove(`actions/artifacts/${asset.id}`,api);
    }
    const final=await api(`actions/runs/${run.id}`);
    if(final&&(final.run_attempt!==run.run_attempt||cleanupPlan([final],current,result).length!==1))fail('历史任务状态改变，停止清理');
    if(final)await remove(`actions/runs/${run.id}`,api);removed.push(run.id);
  }
  return removed;
}

export function precedingResult(needs) {
  if(!needs||typeof needs!=='object'||Array.isArray(needs)||!Object.keys(needs).length)fail('前置任务结果缺失');
  return Object.values(needs).every(value=>value?.result==='success')?'success':'failed';
}
async function discardCurrent(identity,api) {
  for(const release of await pages('releases',null,api)){
    const metadata=(await factoryRelease(release,owner.platform,tag=>api('git/ref/tags/'+encodeURIComponent(tag))));
    if(metadata?.run_id===identity.run_id&&metadata.run_attempt===identity.run_attempt)
      await removeRunRelease({id:identity.run_id,head_sha:identity.source_sha},[release],api);
  }
  const tag=identity.tag;
  if(tag&&tag.startsWith(prefix)&&tag.endsWith(`-r${identity.run_id}-a${identity.run_attempt}`)){
    const path=`git/refs/tags/${encodeURIComponent(tag)}`;
    if(await api(path.replace(/^git\/refs\//u,'git/ref/'))!==null)await remove(path,api);
  }
}
export async function finish(needs=JSON.parse(process.env.RELEASE_NEEDS||'null'),api=request,identity=context()) {
  const result=precedingResult(needs),errors=[];
  const attempt=async action=>{try{return await action();}catch(error){errors.push(error);return null;}};
  let removed;
  if(result==='success') {
    removed=await attempt(()=>cleanup('success',identity,api));
    if(errors.length) {
      await attempt(()=>discardCurrent(identity,api));
      await attempt(()=>cleanup('failed',identity,api));
    }
  } else {
    // 本次撤销失败也必须尝试清理同目标旧失败；各项真实错误均保留。
    await attempt(()=>discardCurrent(identity,api));
    removed=await attempt(()=>cleanup('failed',identity,api));
  }
  if(errors.length)throw new AggregateError(errors,'本目标最后处理失败：'+errors.map(error=>error.message).join('；'));
  if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,`本目标${result==='success'?'成功':'失败'}；已清理同类旧Run：${removed.join('、')||'无'}。\n`);
  if(result==='failed')fail('前置任务未全部成功');
}

// 本目标实际构建与组包接口。
async function productCommand() { return false; }


// 本流程自行验真本产品源码、运行件和安装包。
const verifyInternals=await(async()=>{
const {execFileSync}=await import('node:child_process');
const {closeSync,existsSync,lstatSync,openSync,readFileSync,readlinkSync,readdirSync,readSync,realpathSync}=await import('node:fs');
const {basename,dirname,isAbsolute,join,relative,resolve,sep}=await import('node:path');
const {fileURLToPath,pathToFileURL}=await import('node:url');
const {resolveFirstPartyDependencies,verifyProject}=await import('../../app/scripts/project.mjs');


// 工具版本、官方平台归档和摘要只由TuyuFactory产品锁决定。
async function runtimeTool(id, platform = process.platform === 'darwin' ? 'macos' :
  process.platform === 'win32' ? 'windows' : process.env.TUYUFACTORY_PLATFORM) {
  const lock = JSON.parse(readFileSync(join(import.meta.dirname, '../../native/runtime.lock.json'), 'utf8'));
  if (id === 'yarn') return {...lock.yarn, filename: 'yarn-1.22.22.tgz'};
  if (id !== 'node' || !lock.node?.archives?.[platform]) throw new Error('厂家运行时工具或平台未登记');
  const archive = lock.node.archives[platform];
  return {...archive, version: lock.node.version, filename: basename(new URL(archive.url).pathname)};
}

// 精确目标先于任何运行件执行；ARM和AMD64绝不能以“任一64位架构”互相放行。
function linuxTarget(platform, host = process.platform, architecture = process.arch) {
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

function verifyElf(header, platform, file) {
  const machine = platform === 'linux-arm' ? 183 : platform === 'linux-amd' ? 62 : null;
  if (machine === null || header.length < 64 || header.readUInt32BE(0) !== 0x7f454c46 ||
      header[4] !== 2 || header[5] !== 1 || header[6] !== 1 ||
      ![1, 2, 3].includes(header.readUInt16LE(16)) || header.readUInt16LE(18) !== machine ||
      header.readUInt32LE(20) !== 1 || header.readUInt16LE(52) !== 64) {
    throw new Error(`厂家运行件不是目标${platform}的有效ELF64：${file}`);
  }
}

function verifyLink(root, file, target, resolved) {
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
function packageTarget(role, platform) {
  const platforms = { host: ['macos', 'windows', 'linux-arm', 'linux-amd'],
    client: ['macos', 'windows', 'ios', 'android'] };
  if (!Object.hasOwn(platforms, role) || !platforms[role].includes(platform)) {
    throw new Error('厂家安装目标必须是已登记的主机或client平台');
  }
  return { role, platform, applicationId: role === 'host' ? 'com.tuyufactory' : 'com.tuyufactory.client',
    architecture: ['windows', 'linux-amd'].includes(platform) ? 'x64' : 'arm64' };
}

function packageInside(root, path) {
  const part = relative(root, path);
  return part !== '' && part !== '..' && !part.startsWith('..' + sep) && !isAbsolute(part);
}

// 验真实际二进制头；扩展名不能把其他平台程序伪装成目标运行件。
function packageBinary(value, platform, name) {
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
function verifyPackageFiles(role, platform, files, applicationId, executable) {
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

function* packageFiles(root) {
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
function packageDestination(work, destination, role, platform, environment = process.env) {
  packageTarget(role, platform);
  const source = resolve(import.meta.dirname, '../..');
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
function verifySdkDependency(application, environment = process.env) {
  if (!environment || typeof environment !== 'object' || Array.isArray(environment)) throw new Error('厂家SDK环境合同无效');
  const original = resolve(dirname(fileURLToPath(import.meta.url)), '../../app');
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
function packageSignature(signature) {
  if (!['payload', 'signed'].includes(signature)) throw new Error('必须明确选择payload或signed验真阶段');
  return signature;
}

function verifyFactorySources(root) {
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

function verifySdkPlugin(application, platform, role, environment = process.env) {
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

async function verifyPackage(root, role, platform, {signature} = {}) {
  packageSignature(signature);
  const target = packageTarget(role, platform);
  if (platform === 'android') throw new Error('Android须通过release-client-android.mjs client-copy校验实际APK，不能把目录视为安装包');
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

function verifyBinary(file, platform) {
  verifyElf(fileHeader(file), platform, file);
}

function verifyTree(root, platform) {
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

async function verifyRuntime(root, platform) {
if (!root) throw new Error('usage: verify.mjs RUNTIME_ROOT');
if (platform !== undefined || process.platform === 'linux') linuxTarget(platform);
const lock = JSON.parse(readFileSync(join(import.meta.dirname, '../../native/runtime.lock.json'), 'utf8'));
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

async function runVerifyCLI(values){
 const argv=["node","verify",...values];
  if (argv[2] === '--package') {
    if (argv.length !== 7) throw new Error('usage: verify.mjs --package ROOT ROLE PLATFORM payload|signed');
    await verifyPackage(argv[3], argv[4], argv[5], {signature:argv[6]});
  } else if (argv[2] === '--mobile') {
    // 本机签名读取已验真自动化字节，不依赖 CI 构建现场的 SDK 工程收据。
    if (argv.length !== 6 || argv[4] !== 'android' || argv[5] !== 'signed') throw new Error('厂家本机签名验真参数无效');
    const source = argv[3];
    if (source.endsWith('.apk')) await inspect(source, 'android', 'signed');
    else if (source.endsWith('.aab')) {
      const result = execFileSync('jarsigner', ['-J-Duser.language=en', '-J-Duser.country=US', '-verify', '-verbose', source], {encoding:'utf8'});
      if (!result.includes('jar verified.') || /unsigned entries|jar is unsigned|treated as unsigned/i.test(result)) throw new Error('AAB 签名未覆盖全部载荷');
      const entries = [...apkFiles(readFileSync(source))];
      const manifest = entries.find(([name]) => name === 'base/manifest/AndroidManifest.xml');
      if (!manifest || entries.some(([name]) => !/^(base\/|META-INF\/|BUNDLE-METADATA\/|BundleConfig.pb$)/.test(name))) throw new Error('AAB 模块范围无效');
      verifyPackageFiles('client', 'android', entries.map(([name,bytes]) => [name.startsWith('base/') ? name.slice(5) : name, bytes]), bundleIdentity(manifest[1]), 'lib/arm64-v8a/libapp.so');
    } else throw new Error('厂家本机签名产物类型无效');
  } else if (argv[2] === '--sdk') {
    if (argv.length !== 4) throw new Error('usage: verify.mjs --sdk APPLICATION');
    process.stdout.write(verifySdkDependency(argv[3]));
  } else if (argv[2] === '--sources') {
    if (argv.length !== 4) throw new Error('usage: verify.mjs --sources FACTORY_ROOT');
    verifyFactorySources(argv[3]);
  } else if (argv[2] === '--sdk-plugin') {
    if (argv.length !== 6) throw new Error('usage: verify.mjs --sdk-plugin APPLICATION PLATFORM ROLE');
    process.stdout.write(verifySdkPlugin(...argv.slice(3)));
  } else if (argv[2] === '--elf-tree') {
    linuxTarget(argv[4]);
    verifyTree(argv[3], argv[4]);
  } else await verifyRuntime(argv[2], argv[3]);
}


return {runtimeTool,linuxTarget,verifyElf,verifyLink,packageTarget,packageInside,packageBinary,verifyPackageFiles,packageFiles,packageDestination,verifySdkDependency,packageSignature,verifyFactorySources,verifySdkPlugin,verifyPackage,verifyBinary,verifyTree,verifyRuntime,runVerifyCLI};
})();
export const {runtimeTool,linuxTarget,verifyElf,verifyLink,packageTarget,packageInside,packageBinary,verifyPackageFiles,packageFiles,packageDestination,verifySdkDependency,packageSignature,verifyFactorySources,verifySdkPlugin,verifyPackage,verifyBinary,verifyTree,verifyRuntime}=verifyInternals;
// 自动化仅能回收本轮私有候选；Build的清理实现不参与GitHub流程。
export function cleanAutomationCandidate(path,options){
 const work=process.env.TUYUFACTORY_WORK_DIR;
 if(!work||!isAbsolute(work)||resolve(path)!==path||!path.startsWith(resolve(work)+sep))throw Error('自动化候选清理路径越界');
 rmSync(path,options);
}
// 只组装/验证已有client编译结果；不调用Flutter、SDK构建、签名、CI或发布。
// 正式APK必须完整验签后原样复制；payload只是候选阶段，不能据此发布或安装。
export function* apkFiles(archive, {links = false} = {}) {
  let end = -1;
  for (let offset = archive.length - 22; offset >= Math.max(0, archive.length - 65557); offset--) {
    if (archive.readUInt32LE(offset) === 0x06054b50 && offset + 22 + archive.readUInt16LE(offset + 20) === archive.length) { end = offset; break; }
  }
  if (end < 0 || archive.readUInt16LE(end + 4) || archive.readUInt16LE(end + 6)) throw new Error('APK不是单卷ZIP');
  const count = archive.readUInt16LE(end + 10), size = archive.readUInt32LE(end + 12);
  let offset = archive.readUInt32LE(end + 16), total = 0;
  if (!count || count === 65535 || count !== archive.readUInt16LE(end + 8) || offset + size !== end) throw new Error('APK中央目录无效或不支持ZIP64');
  const limit = offset, seen = new Set(), spans = [];
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || archive.readUInt32LE(offset) !== 0x02014b50) throw new Error('APK目录项损坏');
    const flags = archive.readUInt16LE(offset + 8), method = archive.readUInt16LE(offset + 10);
    const compressed = archive.readUInt32LE(offset + 20), length = archive.readUInt32LE(offset + 24);
    const nameLength = archive.readUInt16LE(offset + 28), extra = archive.readUInt16LE(offset + 30), comment = archive.readUInt16LE(offset + 32);
    const local = archive.readUInt32LE(offset + 42), attributes = archive.readUInt32LE(offset + 38);
    if (offset + 46 + nameLength + extra + comment > end || flags & 1 || ![0, 8].includes(method) ||
        ![0,0x8000,0x4000,0xa000].includes((attributes >>> 16) & 0xf000) ||
        (!links && ((attributes >>> 16) & 0xf000) === 0xa000) || length > 512 * 1024 * 1024 || (total += length) > 2 * 1024 * 1024 * 1024) throw new Error('APK包含加密、链接、超限或不支持的内容');
    const nameBytes = archive.subarray(offset + 46, offset + 46 + nameLength), name = nameBytes.toString('utf8');
    if (!name || !Buffer.from(name).equals(nameBytes) || /[\\:\x00-\x1f]/.test(name) || name.startsWith('/') || name.includes('//') || name.split('/').some(p => p === '.' || p === '..') || seen.has(name.toLowerCase())) throw new Error('APK路径越界或重复');
    seen.add(name.toLowerCase());
    if (local + 30 > limit || archive.readUInt32LE(local) !== 0x04034b50 || archive.readUInt16LE(local + 8) !== method || archive.readUInt16LE(local + 6) !== flags) throw new Error('APK本地头与中央目录不一致');
    const localName = archive.readUInt16LE(local + 26), start = local + 30 + localName + archive.readUInt16LE(local + 28);
    if (start + compressed > limit || !archive.subarray(local + 30, local + 30 + localName).equals(nameBytes)) throw new Error('APK文件范围错误');
    if (spans.some(([begin,end]) => local < end && start + compressed > begin)) throw new Error('ZIP文件范围重叠');
    spans.push([local,start + compressed]);
    const input = archive.subarray(start, start + compressed);
    const value = method === 0 ? input : inflateRawSync(input, {maxOutputLength: Math.max(1, length)});
    if (value.length !== length) throw new Error('APK展开长度不符');
    if (crc32(value) !== archive.readUInt32LE(offset + 16)) throw new Error('ZIP内容CRC不符');
    const link = ((attributes >>> 16) & 0xf000) === 0xa000;
    if (link) {
      const target = value.toString('utf8'), destination = posix.normalize(posix.join(posix.dirname(name), target));
      if (!Buffer.from(target).equals(value) || !target || /[\\:\x00-\x1f]/.test(target) || target.startsWith('/') || destination === '..' || destination.startsWith('../')) throw new Error('ZIP链接越界');
    }
    if (!name.endsWith('/')) yield [name, value, link];
    offset += 46 + nameLength + extra + comment;
  }
  if (offset !== end) throw new Error('APK目录大小不符');
}

async function inspect(source, platform, signature) {
  if (platform !== 'android') return verifyPackage(source, 'client', platform, {signature});
  if (signature === 'signed') execFileSync('apksigner', ['verify', '--verbose', source], {stdio: 'pipe'});
  const identity = execFileSync('apkanalyzer', ['manifest', 'application-id', source], {encoding: 'utf8'}).trim();
  return verifyPackageFiles('client', platform, apkFiles(readFileSync(source)), identity, 'lib/arm64-v8a/libapp.so');
}

export async function buildClient(platform, source, output, application, environment = process.env, signature) {
  packageTarget('client', platform);
  packageSignature(signature);
  const work = environment.TUYUFACTORY_WORK_DIR;
  packageDestination(work, output, 'client', platform, environment);
  if (!source || resolve(source) !== source || source === output || packageInside(source, output) || packageInside(output, source) ||
      lstatSync(source).isSymbolicLink() || realpathSync(source) !== source || !packageInside(work, source)) throw new Error('client输入必须是当前任务内独立的准确编译结果');
  verifySdkDependency(application, environment);
  await inspect(source, platform, signature);
  // 目标排他占有后才获得清理权限；失败绝不删除来源和已存在的成功产物。
  let fd = platform === 'android' ? openSync(output, 'wx', 0o644) : undefined;
  if (platform !== 'android') mkdirSync(output);
  const owned = lstatSync(output);
  try {
    if (fd !== undefined) writeFileSync(fd, readFileSync(source));
    else cpSync(source, output, {recursive: true, force: false, errorOnExist: true, verbatimSymlinks: true});
    await inspect(output, platform, signature);
  } catch (error) {
    if (fd !== undefined) { closeSync(fd); fd = undefined; }
    const current = lstatSync(output);
    if (current.isSymbolicLink() || current.dev !== owned.dev || current.ino !== owned.ino) throw new Error('client失败输出归属已变化，保留现场');
    cleanAutomationCandidate(output, {recursive: true, force: true});
    throw error;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  return output;
}

// AAB 使用官方 aapt.pb.XmlNode，不把压缩包字符串匹配当作安装身份。
// 字段来源：AOSP frameworks/base/tools/aapt2/Resources.proto。
export function bundleIdentity(bytes) {
  const fields = value => {
    const output = new Map(); let at = 0;
    const integer = () => { let result = 0, shift = 0; for (;;) {
      if (at >= value.length || shift > 49) throw new Error('AAB protobuf截断或溢出');
      const byte = value[at++]; result += (byte & 127) * 2 ** shift;
      if (!(byte & 128)) return result; shift += 7;
    }};
    while (at < value.length) {
      const tag = integer(), field = Math.floor(tag / 8), wire = tag & 7;
      if (!field || ![0,1,2,5].includes(wire)) throw new Error('AAB protobuf字段无效');
      let data;
      if (wire === 0) { integer(); continue; }
      const size = wire === 2 ? integer() : wire === 1 ? 8 : 4;
      if (at + size > value.length) throw new Error('AAB protobuf字段越界');
      data = value.subarray(at, at + size); at += size;
      if (wire === 2) output.set(field, [...(output.get(field) ?? []), data]);
    }
    return output;
  };
  const one = (map, id) => { const values = map.get(id); if (values?.length !== 1) throw new Error('AAB清单字段缺失或重复'); return values[0]; };
  const element = fields(one(fields(bytes), 1));
  if (one(element, 3).toString() !== 'manifest') throw new Error('AAB根节点不是manifest');
  const attributes = (element.get(4) ?? []).map(fields).filter(item => one(item, 2).toString() === 'package');
  if (attributes.length !== 1 || attributes[0].get(1)?.some(value => value.length)) throw new Error('AAB缺少唯一package属性');
  return one(attributes[0], 3).toString('utf8');
}

export async function verifyClientArtifact(platform, source, application, signature, environment = process.env) {
  packageTarget('client', platform); packageSignature(signature); verifySdkDependency(application, environment);
  const work = environment.TUYUFACTORY_WORK_DIR;
  const release = environment.GITHUB_ACTIONS === 'true' && environment.GITHUB_WORKSPACE ? join(environment.GITHUB_WORKSPACE,'.release',`tuyufactory-client-${platform}`) : null;
  if (!work || (!packageInside(work, source) && !(release && packageInside(release,source))) || lstatSync(source).isSymbolicLink() || realpathSync(source) !== source) throw new Error('最终资产必须属于当前厂家任务或准确Release目录');
  if (platform === 'android' && source.endsWith('.apk')) return inspect(source, platform, signature);
  const entries = [...apkFiles(readFileSync(source), {links:platform === 'macos'})];
  const links = entries.filter(([, , link]) => link).map(([name])=>name);
  if (entries.some(([name])=>links.some(link=>name.startsWith(link+'/')))) throw new Error('ZIP文件不得通过目录链接写入');
  if (platform === 'android' && source.endsWith('.aab')) {
    if (signature === 'signed') {
      const result = execFileSync('jarsigner', ['-J-Duser.language=en', '-J-Duser.country=US', '-verify', '-verbose', source], {encoding:'utf8'});
      if (!result.includes('jar verified.') || /unsigned entries|jar is unsigned|treated as unsigned/i.test(result)) throw new Error('AAB签名未覆盖全部载荷');
    }
    const manifest = entries.find(([name]) => name === 'base/manifest/AndroidManifest.xml');
    if (!manifest || entries.some(([name]) => !/^(base\/|META-INF\/|BUNDLE-METADATA\/|BundleConfig.pb$)/.test(name))) throw new Error('AAB模块范围无效');
    return verifyPackageFiles('client', 'android', entries.map(([name,bytes]) => [name.startsWith('base/')?name.slice(5):name,bytes]), bundleIdentity(manifest[1]), 'lib/arm64-v8a/libapp.so');
  }
  if (!source.endsWith(platform === 'ios' ? '.ipa' : '.zip')) throw new Error('最终资产封装类型与平台不一致');
  const output = join(work, source.split(/[\\/]/).at(-1) + '.verify');
  packageDestination(work, output, 'client', platform, environment);
  // ZIP列表、CRC和链接先验通过才允许系统解包；临时目标排他占有且仅本次负责清理。
  mkdirSync(output);
  const owned = lstatSync(output);
  try {
    if (platform === 'windows') execFileSync('tar', ['-xf', source, '-C', output], {stdio:'pipe'});
    else execFileSync('/usr/bin/unzip', ['-q', source, '-d', output], {stdio:'pipe'});
    if (platform === 'android') {
      const names = entries.map(([name]) => name).sort();
      if (names.join(',') !== 'tuyufactory-client.aab,tuyufactory-client.apk') throw new Error('Android最终ZIP必须准确包含APK和AAB');
      for (const name of names) await verifyClientArtifact(platform, join(output,name), application, signature, environment);
      return packageTarget('client', platform);
    }
    const applications = [...new Set(entries.map(([name]) => platform === 'ios' ? name.match(/^(Payload\/[^/]+\.app)\//)?.[1] : name.match(/^([^/]+\.app)\//)?.[1]).filter(Boolean))];
    const root = platform === 'windows' ? (entries.some(([name]) => name === 'tuyufactory_client.exe') ? output : null) :
      applications.length === 1 ? join(output, applications[0]) : null;
    if (!root || (platform !== 'windows' && entries.some(([name]) => !name.startsWith(applications[0] + '/')))) throw new Error('归档必须使用产品唯一根布局，不能混入其它载荷');
    return await verifyPackage(root, 'client', platform, {signature});
  } finally {
    const current = lstatSync(output);
    if (current.isSymbolicLink() || current.dev !== owned.dev || current.ino !== owned.ino) throw new Error('归档验真目录归属已变化，保留现场');
    cleanAutomationCandidate(output, {recursive:true, force:true});
  }
}

async function automationMaterialize(values){
const [language, postgres, destination] = values;
if (!language || !postgres || !destination) {
  throw new Error('usage: release-client-android.mjs host-materialize LANGUAGE_SOURCE POSTGRES_SOURCE DESTINATION');
}
if (existsSync(destination)) throw new Error(`厂家端运行包目标已经存在：${destination}`);

const root = fileURLToPath(new URL('../../', import.meta.url));
const lock = JSON.parse(readFileSync(join(root, 'native/runtime.lock.json'), 'utf8'));
const platform = process.env.TUYUFACTORY_PLATFORM;
const nodeSource = await runtimeTool('node', platform);
if (platform?.startsWith('linux-')) {
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
  cpSync(join(root, 'native', script), target);
  try { chmodSync(target, 0o755); } catch {}
}
// 产物记录实际验真版本，源配置不复制第二份工具版本与归档摘要。
writeFileSync(join(business, 'runtime.lock.json'), `${JSON.stringify({...lock, node: nodeSource.version}, null, 2)}\n`, 'utf8');
cpSync(join(root, 'native/schema.sql'), join(destination, 'schema.sql'));
cpSync(join(root, 'imported', 'frappe', 'LICENSE'), join(business, 'licenses', 'frappe-MIT.txt'));
cpSync(join(root, 'imported', 'erpnext', 'license.txt'), join(business, 'licenses', 'erpnext-GPL-3.0.txt'));

await verifyRuntime(destination, process.platform === 'linux' ? platform : undefined);
console.log(`已物化途遇厂家端独立运行包：${destination}`);

}
const AUTOMATION_ASSET_SOURCE="\nimport { execFileSync } from 'node:child_process';\nimport { createHash } from 'node:crypto';\nimport {\n  cpSync,\n  existsSync,\n  lstatSync,\n  mkdirSync,\n  readFileSync,\n  readdirSync,\n  renameSync,\n  rmSync,\n  symlinkSync,\n  writeFileSync,\n} from 'node:fs';\nimport { delimiter, dirname, join } from 'node:path';\nimport {runtimeTool,cleanAutomationCandidate} from \"__AUTOMATION_MODULE__\";\n\nconst source = process.argv[2];\nif (!source) throw new Error('usage: release-client-android.mjs host-assets LANGUAGE_SOURCE');\nif (!process.env.TUYUFACTORY_DEPENDENCY_DIR) throw new Error('厂家资源构建缺少TUYUFACTORY_DEPENDENCY_DIR');\nconst nodeSource = await runtimeTool('node');\nconst yarnSource = await runtimeTool('yarn');\n\nconst bench = join(source, 'bench');\nconst frappe = join(bench, 'apps', 'frappe');\nconst erpnext = join(bench, 'apps', 'erpnext');\nconst assets = join(bench, 'sites', 'assets');\nconst node = process.platform === 'win32'\n  ? join(source, 'node', 'node.exe')\n  : join(source, 'node', 'bin', 'node');\n// Yarn只在本次资源构建中使用，不进入运行包，也不依赖Node附带包管理器。\nconst yarnWork = join(source, '.yarn');\nconst yarn = join(yarnWork, yarnSource.root, 'bin', 'yarn.js');\nconst pathKey = Object.keys(process.env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH';\nconst childEnvironment = {\n  ...process.env,\n  FRAPPE_BENCH_ROOT: bench,\n  NODE_OPTIONS: '--max_old_space_size=4096',\n  YARN_CACHE_FOLDER: process.env.YARN_CACHE_FOLDER ||\n    join(process.env.TUYUFACTORY_DEPENDENCY_DIR, 'package-managers', 'yarn'),\n};\n// 主调用直接运行 Yarn JS，Windows 不执行 .cmd；上游子进程仍能找到官方 Yarn 入口。\nchildEnvironment[pathKey] = [dirname(node), dirname(yarn), childEnvironment[pathKey]]\n  .filter(Boolean).join(delimiter);\n\nfunction required(value, message) {\n  if (!value) throw new Error(message);\n}\n\nfunction run(file, args, cwd) {\n  execFileSync(file, args, {\n    cwd,\n    stdio: 'inherit',\n    env: childEnvironment,\n  });\n}\n\nfunction version(file, args) {\n  return execFileSync(file, args, {\n    encoding: 'utf8',\n    env: childEnvironment,\n  }).trim();\n}\n\nfunction copyTree(from, to) {\n  cpSync(from, to, {\n    recursive: true,\n    force: true,\n    dereference: process.platform === 'win32',\n  });\n}\n\nfunction removeBundleStyles(directory) {\n  if (!existsSync(directory)) return;\n  for (const entry of readdirSync(directory)) {\n    const item = join(directory, entry);\n    const stat = lstatSync(item);\n    if (stat.isDirectory()) removeBundleStyles(item);\n    else if (entry.endsWith('.bundle.css')) cleanAutomationCandidate(item, { force: true });\n  }\n}\n\nfor (const item of [node, join(frappe, 'yarn.lock'), join(erpnext, 'yarn.lock')]) {\n  required(existsSync(item), `厂家端资源构建输入缺失：${item}`);\n}\nrequired(version(node, ['--version']) === `v${nodeSource.version}`, `厂家端资源构建 Node 版本必须为 ${nodeSource.version}`);\nfor (const app of [frappe, erpnext]) {\n  required(existsSync(join(app, app === frappe ? 'frappe' : 'erpnext', 'public')),\n    `厂家端应用公开资源目录缺失：${app}`);\n}\n\nasync function materializeArchive(specification, destination) {\n  if (existsSync(destination)) {\n    required(!lstatSync(destination).isSymbolicLink() &&\n      createHash('sha256').update(readFileSync(destination)).digest('hex') === specification.sha256,\n    '厂家Yarn缓存摘要不符');\n    return;\n  }\n  const pending = `${destination}.pending-${process.pid}`;\n  for (let attempt = 1; attempt <= 3; attempt += 1) {\n    cleanAutomationCandidate(pending, { force: true });\n    try {\n      const response = await fetch(specification.url, { signal: AbortSignal.timeout(120_000) });\n      required(response.ok, `厂家Yarn下载状态无效：${response.status}`);\n      const bytes = Buffer.from(await response.arrayBuffer());\n      required(createHash('sha256').update(bytes).digest('hex') === specification.sha256,\n        '厂家Yarn下载摘要不符');\n      writeFileSync(pending, bytes, { flag: 'wx' });\n      renameSync(pending, destination);\n      return;\n    } catch (error) {\n      cleanAutomationCandidate(pending, { force: true });\n      if (attempt === 3) throw error;\n    }\n  }\n}\n\n// 排他创建后才拥有清理权限；Yarn版本和原件摘要来自产品锁。\nmkdirSync(yarnWork);\ntry {\n  const yarnArchive = join(yarnWork, yarnSource.filename);\n  await materializeArchive(yarnSource, yarnArchive);\n  run('tar', ['-xzf', yarnArchive, '-C', yarnWork], source);\n  required(version(node, [yarn, '--version']) === yarnSource.version,\n    `厂家端资源构建 Yarn 版本必须为 ${yarnSource.version}`);\n  mkdirSync(childEnvironment.YARN_CACHE_FOLDER, { recursive: true });\n  const network = process.env.TUYUFACTORY_OFFLINE === 'true' ? ['--offline'] : [];\n  if (process.env.TUYUFACTORY_OFFLINE && !['true', 'false'].includes(process.env.TUYUFACTORY_OFFLINE)) {\n    throw new Error('TUYUFACTORY_OFFLINE只接受true或false');\n  }\n  const yarnInstall = ['--cache-folder', childEnvironment.YARN_CACHE_FOLDER,\n    'install', '--frozen-lockfile', '--non-interactive', '--network-timeout', '60000', ...network];\n  run(node, [yarn, ...yarnInstall], frappe);\n  run(node, [yarn, ...yarnInstall, '--ignore-scripts'], erpnext);\n\n  cleanAutomationCandidate(assets, { recursive: true, force: true });\n  mkdirSync(assets, { recursive: true });\n  writeFileSync(join(bench, 'sites', 'apps.txt'), 'frappe\\nerpnext\\n', 'utf8');\n  copyTree(join(frappe, 'frappe', 'public'), join(assets, 'frappe'));\n  copyTree(join(erpnext, 'erpnext', 'public'), join(assets, 'erpnext'));\n\n  const publicModules = join(frappe, 'frappe', 'public', 'node_modules');\n  required(!existsSync(publicModules), '厂家端资源构建发现未登记的 public/node_modules');\n  if (process.platform === 'win32') {\n    symlinkSync(join(frappe, 'node_modules'), publicModules, 'junction');\n  } else {\n    symlinkSync('../../node_modules', publicModules, 'dir');\n  }\n\n  try {\n    removeBundleStyles(join(frappe, 'frappe', 'public', 'scss'));\n    removeBundleStyles(join(erpnext, 'erpnext', 'public', 'scss'));\n    run(node, ['esbuild', '--production', '--apps', 'frappe,erpnext'], frappe);\n\n    const manifestPath = join(assets, 'assets.json');\n    required(existsSync(manifestPath), '厂家端资源构建没有生成 assets.json');\n    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));\n    for (const key of ['login.bundle.css', 'desk.bundle.js', 'erpnext.bundle.js']) {\n      required(typeof manifest[key] === 'string' && manifest[key].startsWith('/assets/'),\n        `厂家端资源清单缺少：${key}`);\n    }\n  } finally {\n    cleanAutomationCandidate(publicModules, { recursive: true, force: true });\n    removeBundleStyles(join(frappe, 'frappe', 'public', 'scss'));\n    removeBundleStyles(join(erpnext, 'erpnext', 'public', 'scss'));\n    for (const app of [frappe, erpnext]) {\n      cleanAutomationCandidate(join(app, 'node_modules'), { recursive: true, force: true });\n      cleanAutomationCandidate(join(app, '.git'), { recursive: true, force: true });\n    }\n  }\n} finally {\n  cleanAutomationCandidate(yarnWork, { recursive: true, force: true });\n}\n\nconsole.log(`途遇厂家端浏览器资源构建通过：${assets}`);\n";
const direct=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
const testing=direct&&Boolean(process.env.NODE_TEST_CONTEXT)&&process.argv.length===2;
if(direct&&!testing){
  try{const [command,...args]=process.argv.slice(2);
    if(command==='verify')await verifyInternals.runVerifyCLI(args);else if(command==='client-copy'){if(args.length!==5)fail('自动化client复制参数无效');await buildClient(args[0],args[1],args[2],args[3],process.env,args[4]);}else if(command==='client-artifact'){if(args.length!==4)fail('自动化client资产参数无效');await verifyClientArtifact(...args);}else if(command==='host-materialize'){if(args.length!==3)fail('自动化运行包物化参数无效');await automationMaterialize(args);}else if(command==='host-assets'){if(args.length!==1)fail('自动化资源构建参数无效');const source=AUTOMATION_ASSET_SOURCE.replaceAll('__AUTOMATION_MODULE__',pathToFileURL(join(root,'.github/workflows/release-client-android.mjs')).href);const result=spawnSync(process.execPath,['--input-type=module','-e',source,join(root,'native/runtime.lock.json'),args[0]],{cwd:root,env:process.env,stdio:'inherit'});if(result.error||result.status!==0)fail('自动化资源构建失败');}else if(command==='prepare')await prepare();else if(command==='job')job();else if(command==='step')step(args[0]);
    else if(command==='action')action(args[0],args.slice(1));else if(command==='collect')await collect(args);
    else if(command==='collect-produced')await collectProduced();else if(command==='unsigned')await unsigned();
    else if(!await productCommand(command,args))fail('自动化命令无效');
  }catch(error){console.error(error.message);process.exitCode=1;}
}

if(testing){
  const {default:assert}=await import('node:assert/strict');const {default:test}=await import('node:test');

  test('厂家未签名候选由真实构建动作生成，本机签名不调用CI工程收据',()=>{
    assert.match(actions.checks.source,/await buildCandidate\(process\.env\.SOFTWARE_VERSION\)/u);
    assert.match(actions.checks.source,/claimRelease\(realpathSync\(process\.cwd\(\)\), process\.env\.RELEASE_DIR\)/u);
    assert.doesNotMatch(localSigningSources().sign,/client-copy|client-artifact|action checks build-release/u);
  });

  test('旧入口不能成为任一现行平台的清理归属证明',()=>{
    const current={id:9,path:workflowPath,head_branch:'main',event:'workflow_dispatch',created_at:'2026-01-02T00:00:00Z'};
    const old={...current,id:1,status:'completed',conclusion:'success',created_at:'2026-01-01T00:00:00Z'};
    for(const path of ['.github/workflows/release.yml',`.github/workflows/${owner.product}-${owner.platform}-ci.yml`,'.github/workflows/deleted.yml'])
      assert.deepEqual(cleanupPlan([{...old,path}],current,'success'),[]);
  });
  test('撤销当前产物失败仍处理旧失败且最终失败',async()=>{
    const current={id:9,path:workflowPath,head_branch:'main',event:'workflow_dispatch',created_at:'2026-01-02T00:00:00Z'};
    let releases=0,history=0;
    const api=async path=>{
      if(path.startsWith('releases?')){if(++releases===1)throw Error('撤销中断');return [];}
      if(path==='actions/runs/9')return current;
      if(path.startsWith('actions/runs?')){history++;return {workflow_runs:[]};}
      throw Error('未声明请求');
    };
    await assert.rejects(finish({build:{result:'failure'}},api,{run_id:9}),/撤销中断/);
    assert.equal(history,1);assert.equal(releases,2);
  });
  test('实际交付文件完整进入正式证明，必要件缺失或为空时失败',async()=>{
    const {mkdtempSync}=await import('node:fs');const {tmpdir}=await import('node:os');
    const directory=mkdtempSync(join(tmpdir(),'release-assets-')),previous={...process.env};
    try {
      const version='1.0.1';Object.assign(process.env,{GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:owner.repository,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_SHA:'a'.repeat(40),GITHUB_WORKFLOW_REF:`${owner.repository}/${workflowPath}@refs/heads/main`,GITHUB_RUN_ID:'9',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_NUMBER:'2',RELEASE_VERSION:version,RELEASE_TAG:`${prefix}${version}-r9-a1`,RUNNER_TEMP:directory,RELEASE_DIR:join(directory,'input'),RELEASE_WORK:join(directory,'work'),RELEASE_ASSETS_DIR:join(directory,'output'),GITHUB_OUTPUT:join(directory,'github-output')});
      const input=join(process.env.RELEASE_WORK,'unsigned');mkdirSync(input,{recursive:true});
      const names=owner.required_assets;
      for(const name of names)writeFileSync(join(input,name),'synthetic asset');
      const result=await collectProduced();assert.deepEqual(result.assets.map(row=>row.name).sort(),[...names].sort());
      rmSync(join(input,names[0]));await assert.rejects(collectProduced(),/完整正式资产缺失/);
      writeFileSync(join(input,names[0]),'');await assert.rejects(collectProduced(),/非空普通文件/);
    }finally{for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);rmSync(directory,{recursive:true,force:true});}
  });
  test('清理旧失败Run同时回收其多个Attempt的准确孤立Tag',async()=>{
    const old={id:2,run_attempt:2,path:workflowPath,head_branch:'main',event:'workflow_dispatch',head_sha:'a'.repeat(40),status:'completed',conclusion:'failure',created_at:'2026-01-01T00:00:00Z'},current={...old,id:9,status:'in_progress',created_at:'2026-01-02T00:00:00Z'};
    const deleted=new Set(),tags=[1,2].map(attempt=>({ref:`refs/tags/${prefix}1.0.0-r2-a${attempt}`,object:{type:'commit',sha:old.head_sha}}));
    const api=async(path,options={})=>{
      if(options.method==='DELETE'){deleted.add(path);return {};}
      if(deleted.has(path)||deleted.has(path.replace('git/ref/','git/refs/')))return null;
      if(path.startsWith('actions/runs?'))return {workflow_runs:[old,current]};
      if(path.startsWith('releases?')||path.includes('/artifacts?'))return path.includes('/artifacts?')?{artifacts:[]}:[];
      if(path.startsWith('git/matching-refs/'))return tags;
      if(path==='actions/runs/2')return old;if(path==='actions/runs/9')return current;
      throw Error('未声明的请求');
    };
    assert.deepEqual(await cleanup('failed',{run_id:9},api),[2]);assert.equal([...deleted].filter(path=>path.startsWith('git/refs/')).length,2);
  });
  test('全部前置成功才成功，其余结论一律失败',()=>{
    assert.equal(precedingResult({build:{result:'success'},publish:{result:'success'}}),'success');
    for(const result of ['failure','cancelled','skipped','timed_out',undefined])assert.equal(precedingResult({build:{result}}),'failed');
    assert.throws(()=>precedingResult({}));
  });
  test('当前Run尚在运行也能清理同目标旧结果，保护其它目标和活动任务',()=>{
    const row=(id,conclusion='success',status='completed',path=workflowPath)=>({id,conclusion,status,path,head_branch:'main',event:'workflow_dispatch',created_at:new Date(1700000000000+id*1000).toISOString()});
    const current=row(6,null,'in_progress');const rows=[row(1),row(2,'failure'),row(3,'success','in_progress'),row(4,'success','completed','.github/workflows/release-other.yml'),current,row(7)];
    assert.deepEqual(cleanupPlan(rows,current,'success').map(row=>row.id),[1]);
    assert.deepEqual(cleanupPlan(rows,current,'failed').map(row=>row.id),[2]);
  });
  test('软件版本进位与协议版本边界',()=>{
    assert.equal(nextVersion('1.0.0',['1.99.99']),'2.0.0');assert.equal(nextVersion('9',['9'],true),'10');
    assert.throws(()=>nextVersion(String(0xffffffff),[String(0xffffffff)],true));
  });
  test('历史完整分页不截断超过1000条记录',async()=>{
    const rows=Array.from({length:1005},(_,id)=>({id}));const api=async path=>rows.slice((Number(/page=(\d+)$/u.exec(path)[1])-1)*100,Number(/page=(\d+)$/u.exec(path)[1])*100);
    assert.equal((await pages('releases',null,api)).length,1005);
  });
  test('失败清理只删除所属旧失败产物及Run，成功和活动任务独立保留',async()=>{
    const row=(id,conclusion,status='completed')=>({id,run_attempt:1,conclusion,status,path:workflowPath,head_branch:'main',event:'workflow_dispatch',repository:{full_name:owner.repository},head_sha:'a'.repeat(40),created_at:new Date(1700000000000+id*1000).toISOString()});
    const current=row(10,null,'in_progress'),rows=[row(1,'success'),row(2,'failure'),row(3,null,'in_progress'),current];
    const gone=new Set(),removed=[];
    const api=async(path,options={})=>{
      if(options.method==='DELETE'){removed.push(path);gone.add(path);return {};}
      if(gone.has(path))return null;
      if(path.startsWith('actions/runs?'))return {workflow_runs:rows};
      if(path.startsWith('releases?')||path.startsWith('git/matching-refs/'))return [];
      if(path.startsWith('actions/runs/2/artifacts?'))return {artifacts:[{id:20}]};
      if(path==='actions/artifacts/20')return {id:20};
      const match=/^actions\/runs\/(\d+)$/u.exec(path);if(match)return rows.find(row=>row.id===Number(match[1]))??null;
      throw Error('未声明的模拟接口：'+path);
    };
    assert.deepEqual(await cleanup('failed',{run_id:10},api),[2]);
    assert.deepEqual(removed,['actions/artifacts/20','actions/runs/2']);
  });

  test('GitHub运行序号保证成功历史清理后版本不会回到初始值',()=>{
    assert.equal(nextVersion('1.0.0',[],false,4),'1.0.3');
    assert.equal(nextVersion('1.99.99',[],false,2),'2.0.0');
    assert.equal(nextVersion('1.0.0',['3.0.0'],false,4),'3.0.1');
    assert.throws(()=>nextVersion('1.0.0',[],false,0));
  });

}
