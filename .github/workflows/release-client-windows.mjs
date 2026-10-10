#!/usr/bin/env node
import {factoryRelease} from './release-client-android.mjs';
// 本仓本目标的完整自动化只由同名Workflow调用；版本与产物均在GitHub生成。
import { createHash } from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
import { appendFileSync, copyFileSync, createReadStream, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const owner = Object.freeze({
  "product": "tuyufactory",
  "platform": "client-windows",
  "repository": "tuyutata/tuyufactory",
  "version_source": {
    "kind": "pubspec",
    "path": "app/pubspec.yaml"
  },
  "required_assets": [],
  "asset_locations": [
    "$RELEASE_DIR"
  ],
  "asset_patterns": [
    "*.tgz",
    "*.zip",
    "*.ipa",
    "*.apk",
    "*.aab",
    "*.json",
    "SHA256SUMS",
    "tuyufactory-client-windows.zip"
  ],
  "required_patterns": [
    "tuyufactory-client-windows.zip",
    "release-manifest.json",
    "SHA256SUMS"
  ]
});
const commands = Object.freeze({
  "7": {
    "shell": "bash",
    "source": "node --input-type=module <<'NODE'\nimport {appendFileSync, realpathSync} from 'node:fs';\nimport {join} from 'node:path';\nconst platform = 'windows';\nconst work = join(realpathSync(process.env.RUNNER_TEMP), 'tuyufactory-client-' + platform);\nappendFileSync(process.env.GITHUB_ENV, 'TUYUFACTORY_WORK_DIR=' + work + '\\nFLUTTER_TARGET=lib/main_client.dart\\nTUYU_FACTORY_PRODUCT=client\\n');\nNODE"
  },
  "8": {
    "shell": "bash",
    "source": "set -euo pipefail\n\nnode \"$GITHUB_WORKSPACE/.github/workflows/release-client-windows.mjs\" action package build-release"
  },
  "5": {
    "shell": "bash",
    "source": "printf 'version=3.47.2\n' >> \"$GITHUB_OUTPUT\""
  },
  "1": {
    "shell": "bash",
    "source": "# 仅登记本产品平台资产目录；不占有或覆盖已有候选。\nnode --input-type=module <<'NODE_RELEASE_DIR'\nimport {appendFileSync, existsSync, lstatSync, realpathSync} from 'node:fs';\nimport {isAbsolute, join, relative, sep} from 'node:path';\nconst value = process.env.RUNNER_TEMP;\nif (!value || !isAbsolute(value) || /[\\r\\n\\0]/.test(value)) throw new Error('Release缺少准确Runner临时根');\nconst temporary = realpathSync(value), source = realpathSync(process.env.GITHUB_WORKSPACE);\nconst contains = (left, right) => {\n  const value = relative(left, right);\n  return value === '' || (value !== '..' && !value.startsWith('..' + sep) && !isAbsolute(value));\n};\nconst status = lstatSync(temporary);\nif (!status.isDirectory() || status.isSymbolicLink() || contains(source, temporary)\n    || contains(temporary, source)) throw new Error('Release临时根与源码交叠或经过链接');\nconst output = join(temporary, 'tuyufactory-client-windows-release');\nif (existsSync(output)) throw new Error('Release资产目标已存在，拒绝覆盖');\nappendFileSync(process.env.GITHUB_ENV, 'RELEASE_DIR=' + output + '\\n');\nNODE_RELEASE_DIR"
  },
  "6": {
    "shell": "bash",
    "source": "# 安装后先验真，再统一准备目标平台缓存与受控修订。\nflutter --version --machine >/dev/null\nplatform=\"windows\"\nflutter --version >/dev/null\n# 原生SDK消费与厂家Flutter同一已验真的工具原件；不取Runner默认版本。\nnode --input-type=module <<'NODE_FLUTTER_ROOT'\nimport {appendFileSync, existsSync, realpathSync} from 'node:fs';\nimport {join} from 'node:path';\nif (!process.env.FLUTTER_ROOT || /[\\r\\n\\0]/.test(process.env.FLUTTER_ROOT)) throw new Error('厂家缺少已验真的Flutter根');\nconst root = realpathSync(process.env.FLUTTER_ROOT);\nif (!existsSync(join(root, 'bin/flutter'))) throw new Error('厂家Flutter工具原件缺失');\nappendFileSync(process.env.GITHUB_ENV, 'CITIZENSDK_FLUTTER_ROOT=' + root + '\\nFLUTTER_ROOT=' + root + '\\n');\nNODE_FLUTTER_ROOT"
  },
  "9": {
    "shell": "bash",
    "source": "set -euo pipefail\nplatform=windows\nnode \"$GITHUB_WORKSPACE/.github/workflows/release-client-windows.mjs\" action checks cleanup"
  },
  "3": {
    "shell": "pwsh",
    "source": "$ErrorActionPreference = 'Stop'\nif ($env:RUNNER_ARCH -ne 'X64') { throw '厂家Windows只允许x86-64 Runner' }\nif ((git rev-parse HEAD).Trim() -ne $env:SOURCE_SHA) { throw '厂家源码提交身份不一致' }\nnode .github/workflows/release-client-android.mjs verify --sources $env:GITHUB_WORKSPACE\nif ($LASTEXITCODE -ne 0) { throw '厂家完整源码来源校验失败' }"
  },
  "4": {
    "shell": "bash",
    "source": "set -euo pipefail\ntest -f app/lib/main_client.dart || { echo '途遇厂家分机端缺少产品入口：app/lib/main_client.dart' >&2; exit 1; }\nplatform=windows\ntest -d \"app/$platform\" || { echo \"途遇厂家分机端缺少产品平台工程：$platform\" >&2; exit 1; }"
  },
  "2": {
    "shell": "pwsh",
    "source": "$ErrorActionPreference = 'Stop'\nif ($env:RUNNER_ARCH -ne 'X64') { throw '厂家Windows原生工具只允许x86-64 Runner' }\n$vswhere = \"${env:ProgramFiles(x86)}\\Microsoft Visual Studio\\Installer\\vswhere.exe\"\nif (-not (Test-Path -LiteralPath $vswhere -PathType Leaf)) { throw '厂家缺少已安装的Visual Studio查询工具' }\n# 只选择镜像中确实安装x64 C++的实例，不安装或修改系统工具。\n$installation = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath\nif ($LASTEXITCODE -ne 0 -or -not $installation) { throw '厂家缺少已安装的MSVC C++工具' }\nImport-Module \"$installation\\Common7\\Tools\\Microsoft.VisualStudio.DevShell.dll\"\nEnter-VsDevShell -VsInstallPath $installation -SkipAutomaticLocation -DevCmdArguments '-arch=x64 -host_arch=x64'\nforeach ($name in @('cl.exe', 'lib.exe', 'dumpbin.exe')) { Get-Command $name -ErrorAction Stop | Out-Null }\nforeach ($name in @('PATH', 'INCLUDE', 'LIB', 'LIBPATH', 'VCINSTALLDIR', 'VSINSTALLDIR', 'VCToolsInstallDir', 'WindowsSdkDir', 'WindowsSDKVersion')) {\n  $value = [Environment]::GetEnvironmentVariable($name)\n  if (-not $value -or $value.Contains(\"$([char]10)\") -or $value.Contains(\"$([char]13)\")) { throw \"厂家MSVC环境无效：$name\" }\n  \"$name=$value\" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append\n}"
  }
});
const actions = Object.freeze({
  "package": {
    "source": "#!/usr/bin/env node\nimport { execFileSync, spawnSync } from 'node:child_process';\nimport { createHash } from 'node:crypto';\nimport { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';\nimport { join, resolve } from 'node:path';\nimport { pathToFileURL } from 'node:url';\nconst {buildCandidate,cleanCandidate,claimRelease,cleanRelease,releaseDirectory}=await (async()=>{\n\nconst { execFileSync }=await import(\"node:child_process\");\nconst { appendFileSync, cpSync, existsSync, lstatSync, mkdirSync, realpathSync, rmSync, symlinkSync }=await import(\"node:fs\");\nconst { join, resolve, relative, isAbsolute, sep }=await import(\"node:path\");\nconst { pathToFileURL }=await import(\"node:url\");\nconst { prepareWebView2SDK, prepareWebView2 }=await import(\"__PRODUCT_URL__.github/workflows/release-client-windows.mjs__END_URL__\");\n\n\n// CitizenSDK准备逻辑固定属于本产品端，不再调用TUYU共享产品入口。\nconst prepareCitizenSdkSource = [\n  \"import {join} from 'node:path';\",\n  \"import {pathToFileURL} from 'node:url';\",\n  \"const [application,work]=process.argv.slice(2);\",\n  \"const platform=\\\"windows\\\",role=\\\"client\\\";\",\n  \"const factory=process.env.TUYUFACTORY_ROOT;\",\n  \"if(process.env.GITHUB_ACTIONS!=='true'||factory!==process.env.GITHUB_WORKSPACE) throw Error('厂家SDK源码工作区身份无效');\",\n  \"if(process.env.TUYU_PRODUCT!=='tuyufactory-'+role || process.env.TUYU_PLATFORM!==platform || process.env.TUYUFACTORY_WORK_DIR!==work) throw Error('厂家SDK任务身份不一致');\",\n  \"const source=join(factory,'app');\",\n  \"const {prepareNativeProject}=await import(pathToFileURL(join(source,'scripts/project.mjs')));\",\n  \"// 所有平台只装配Pub实际解析的当前SDK视图；产品工程入口负责源码、收据、构建、链接与失败回收。\",\n  \"try { const result=await prepareNativeProject({source,work,output:application,platform},process.env); process.stdout.write(JSON.stringify({...result,TUYUFACTORY_WORK_DIR:work,TUYU_FACTORY_PRODUCT:role})); }\",\n  \"catch(error) { process.stderr.write(error.message+'\\\\n'); process.exitCode=error.retainSdkStage || error.status===75 ? 75 : 1; }\"\n].join('\\n');\n\nconst platform = 'windows';\nfunction required(value, message) { if (!value) throw new Error(message); }\nfunction inside(parent, child) { const path = relative(parent, child); return Boolean(path) && path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path); }\nfunction run(file, args, cwd, environment) {\n  const flutter = process.platform === 'win32' && file === 'flutter';\n  if (flutter && args.some(value => !/^[A-Za-z0-9_./=-]+$/u.test(value))) throw new Error('Windows Flutter参数越过固定范围');\n  execFileSync(flutter ? 'cmd.exe' : file, flutter ? ['/d', '/s', '/c', ['flutter', ...args].join(' ')] : args,\n    { cwd, env: environment, stdio: 'inherit' });\n}\n\n// 清理权来自本进程创建时的设备号/索引；路径相同不表示仍属于本任务。\nfunction cleanCandidate(result) {\n  const {work, identity} = result;\n  required(work === join(realpathSync(process.env.RUNNER_TEMP), 'tuyufactory-client-' + platform), '清理任务路径不匹配');\n  const status = lstatSync(work);\n  required(status.isDirectory() && !status.isSymbolicLink() && realpathSync(work) === work\n    && String(status.dev) + ':' + String(status.ino) === identity, '任务目录归属已变化，保留现场');\n\n  rmSync(work, { recursive: true, force: false });\n}\n\n// 正式资产仅在本次Runner临时根；源码、祖先、别名或其它产品平台目录均拒绝。\nfunction releaseDirectory(root, output) {\n  required(realpathSync(root) === root, 'Release源码根必须为规范物理目录');\n  required(process.env.RUNNER_TEMP && isAbsolute(process.env.RUNNER_TEMP), 'Release缺少Runner临时根');\n  const parent = realpathSync(process.env.RUNNER_TEMP);\n  const status = lstatSync(parent);\n  const contains = (left, right) => {\n    const value = relative(left, right);\n    return value === '' || (value !== '..' && !value.startsWith('..' + sep) && !isAbsolute(value));\n  };\n  required(status.isDirectory() && !status.isSymbolicLink() && realpathSync(parent) === parent\n    && !contains(root, parent) && !contains(parent, root), 'Release临时根与源码交叠或经过链接');\n  required(output === join(parent, 'tuyufactory-client-windows-release'), 'Release资产目录身份无效');\n  return parent;\n}\n\nfunction claimRelease(root, output) {\n  const parent = releaseDirectory(root, output);\n  const status = lstatSync(parent);\n  required(status.isDirectory() && !status.isSymbolicLink() && realpathSync(parent) === parent, 'Release父目录不能经过链接');\n  mkdirSync(output);\n  const owned = lstatSync(output);\n  return String(owned.dev) + ':' + String(owned.ino);\n}\nfunction cleanRelease(root, output, identity) {\n  releaseDirectory(root, output);\n  required(/^[0-9]+:[0-9]+$/.test(identity || ''), 'Release清理归属无效');\n  const owned = lstatSync(output);\n  required(owned.isDirectory() && !owned.isSymbolicLink() && realpathSync(output) === output\n    && String(owned.dev) + ':' + String(owned.ino) === identity, 'Release目录归属已变化，保留现场');\n  rmSync(output, {recursive:true, force:false});\n}\n\nasync function buildCandidate(version) {\n  required(process.platform === 'win32' && process.arch === 'x64', '厂家分机windows必须使用准确原生Runner');\n  const root = realpathSync(process.cwd()), sourceApp = join(root, 'app');\n  required(existsSync(join(sourceApp, 'lib/main_client.dart')) && existsSync(join(sourceApp, platform)), '厂家分机缺少明确入口或平台工程');\n  required(process.env.RUNNER_TEMP && isAbsolute(process.env.RUNNER_TEMP), '缺少Runner任务目录');\n  const temporary = realpathSync(process.env.RUNNER_TEMP);\n  const work = join(temporary, 'tuyufactory-client-' + platform);\n  // 每次进程排他拥有当前任务，不覆盖已有候选或另一个流程的目录。\n  mkdirSync(work);\n  const status = lstatSync(work), identity = String(status.dev) + ':' + String(status.ino);\n  let source;\n  const app = join(work, 'application');\n  const environment = { ...process.env, TUYUFACTORY_ROOT: root, TUYU_PRODUCT: 'tuyufactory-client', TUYU_PLATFORM: platform,\n    TUYUFACTORY_WORK_DIR: work, FLUTTER_TARGET: 'lib/main_client.dart',\n    TUYU_FACTORY_PRODUCT: 'client', TUYU_FACTORY_PRODUCT_NAME: 'TuyuFactoryClient',\n    TUYU_FACTORY_BUNDLE_IDENTIFIER: 'com.tuyufactory.client' };\n  try {\n    // Runner仅使用当前任务的可写工程；CitizenSDK仍由Pub解析同一锁定Git原件。\n    const cacheLink = join(sourceApp, 'build');\n    const cache = existsSync(cacheLink) ? realpathSync(cacheLink) : null;\n    if (cache) required(!version && lstatSync(cacheLink).isSymbolicLink() && inside(join(temporary, 'ci-cache'), cache), '源码存在非受控CI输出，拒绝接管');\n    // 平台标准目录由本产品唯一入口在当前任务内装配。\n    execFileSync(process.execPath, [join(sourceApp, 'scripts/project.mjs'), 'create',\n      '--source-root', sourceApp, '--work-root', work, '--output', app, '--platform', 'windows'],\n      { env: process.env, stdio: ['ignore', 'ignore', 'inherit'] });\n    const build = join(app, 'build');\n    if (cache) symlinkSync(cache, build, process.platform === 'win32' ? 'junction' : 'dir');\n    else {\n      mkdirSync(join(work, 'flutter-build'));\n      symlinkSync(join(work, 'flutter-build'), build, process.platform === 'win32' ? 'junction' : 'dir');\n    }\n    run('flutter', ['pub', 'get', '--enforce-lockfile'], app, environment);\n    const prepared = JSON.parse(execFileSync(process.execPath,\n      ['--input-type=module', '-', app, work],\n      { cwd: root, env: environment, encoding: 'utf8', input: prepareCitizenSdkSource,\n        stdio: ['pipe', 'pipe', 'inherit'] }));\n    Object.assign(environment, prepared);\n    run('flutter', ['analyze', '--no-pub'], app, environment);\n    run('flutter', ['test', '--no-pub'], app, environment);\n    const runtime = await prepareWebView2({ work, environment });\n    // 开发SDK是产品依赖；产品流程只提交坐标，版本、来源和摘要只读取本产品锁文件。\n    const webView2Sdk = await prepareWebView2SDK({ work, environment });\n    environment.TUYUFACTORY_WEBVIEW2_PACKAGE = webView2Sdk.path;\n    environment.TUYUFACTORY_WEBVIEW2_SHA256 = webView2Sdk.sha256;\n    const args = ['build', 'windows', '--release', '--no-pub', '--target', 'lib/main_client.dart'];\n    if (version) args.push('--build-name=' + version);\n    run('flutter', args, app, environment);\n    const built = realpathSync(join(build, 'windows/x64/runner/Release'));\n    const scripts = join(root, 'scripts');\n    const { verifyPackage, packageFiles } = await import(pathToFileURL(join(root, '.github/workflows/release-client-android.mjs')).href);\n    // 浏览器仅加入本次组装树，增量编译缓存不承载正式Runtime。\n    for (const entry of packageFiles(built)) void entry;\n    // 先检查完整产物才复制离开增量缓存，组装器只接受真实位于本任务内的来源。\n    source = join(work, 'bundle');\n    cpSync(built, source, { recursive: true, force: false, errorOnExist: true, verbatimSymlinks: true });\n    const browser = join(source, 'data/webview2');\n    required(!existsSync(browser), 'Flutter编译结果不应携带另一运行时');\n    cpSync(runtime, browser, { recursive: true, force: false, errorOnExist: true });\n    await verifyPackage(source, 'client', platform, { signature: 'payload' });\n    const { buildClient } = await import(pathToFileURL(join(root, '.github/workflows/release-client-android.mjs')).href);\n    const candidate = join(work, 'candidate');\n    await buildClient(platform, source, candidate, app, environment, 'payload');\n    return { root, app, work, source, candidate, environment, identity };\n  } catch (error) {\n    // 只删除本函数创建的任务目录，不碰缓存来源、源码或历史成功资产。\n    if (error.status !== 75 && !error.retainSdkStage) cleanCandidate({root, work, identity});\n    throw error;\n  }\n}\n\nreturn {buildCandidate,cleanCandidate,claimRelease,cleanRelease,releaseDirectory};})();\n\n\nconst identity = Object.freeze({ product: 'tuyufactory', platform: 'client-windows', prefix: 'tuyufactory-client-windows-v',   artifact: 'tuyufactory-client-windows.zip' });\nconst root = process.cwd(); const output = process.env.RELEASE_DIR;\nfunction required(value, message) { if (!value) throw new Error(message); }\nfunction run(file, args, cwd = root) {\n  // Windows 的 Flutter 官方入口是批处理文件，必须经系统命令解释器执行。\n  const flutter = process.platform === 'win32' && file === 'flutter';\n  const executable = flutter ? 'cmd.exe' : file;\n  if (flutter && args.some((value) => !/^[A-Za-z0-9_./=-]+$/u.test(value))) throw new Error('Windows Flutter 参数超出固定流程范围');\n  const commandArgs = flutter ? ['/d', '/s', '/c', ['flutter', ...args].join(' ')] : args;\n  execFileSync(executable, commandArgs, { cwd, stdio: 'inherit', env: process.env });\n}\nfunction hash(path) { return createHash('sha256').update(readFileSync(path)).digest('hex'); }\nfunction inputs() { return {repository:process.env.GITHUB_REPOSITORY,source:process.env.SOURCE_SHA,sourceSHA:process.env.SOURCE_SHA,version:process.env.SOFTWARE_VERSION,tag:process.env.VERSION_TAG,runID:process.env.GITHUB_RUN_ID,runId:process.env.GITHUB_RUN_ID}; }\nfunction verify(value) { if (execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim() !== process.env.SOURCE_SHA) throw new Error('本仓源码提交不一致'); }\nfunction manifest(value) { const asset = join(output, identity.artifact); required(existsSync(asset), 'Windows 正式资产不存在'); const body = { product_id: identity.product, platform: identity.platform, software_version: value.version, git_commit_sha: value.source, producer_run_id: Number(value.runID), assets: [{ name: identity.artifact, sha256: hash(asset) }] }; const path = join(output, 'release-manifest.json'); writeFileSync(path, `${JSON.stringify(body, null, 2)}\\n`); writeFileSync(join(output, 'SHA256SUMS'), `${hash(asset)}  ${identity.artifact}\\n${hash(path)}  release-manifest.json\\n`); }\nasync function build(value) {\n  verify(value);\n  releaseDirectory(realpathSync(root), output);\n  const result = await buildCandidate(value.version);\n  const { app: application, work, candidate, environment } = result;\n  const scripts = join(root, 'scripts');\n  let owned, retained = false;\n  try {\n    const { buildClient } = await import(pathToFileURL(join(root, '.github/workflows/release-client-android.mjs')).href);\n    owned = claimRelease(root, output);\n    mkdirSync(join(work, 'signed'));\n    const bundle = join(work, 'signed/TuyuFactoryClient');\n    await buildClient('windows', candidate, bundle, application, environment, 'signed');\n    // 参数通过环境传入PowerShell，不把Runner路径插入可执行脚本文本。\n    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',\n      'Compress-Archive -LiteralPath (Get-ChildItem -LiteralPath $env:TUYUFACTORY_BUNDLE -Force | ForEach-Object FullName) -DestinationPath $env:TUYUFACTORY_ASSET -CompressionLevel Optimal'],\n      {env:{...environment, TUYUFACTORY_BUNDLE:bundle, TUYUFACTORY_ASSET:join(output, identity.artifact)}, stdio:'inherit'});\n    execFileSync(process.execPath, [join(root, '.github/workflows/release-client-android.mjs'), '--artifact', identity.platform, join(output, identity.artifact), application, 'signed'],\n      {env:environment, stdio:'inherit'});\n    manifest(value);\n    required(process.env.GITHUB_ENV, 'Release跨步骤缺少目录归属环境');\n    appendFileSync(process.env.GITHUB_ENV, 'TUYUFACTORY_WORK_ID=' + result.identity + '\\nTUYUFACTORY_RELEASE_ID=' + owned + '\\n');\n    retained = true;\n  } catch (error) {\n    if (owned) cleanRelease(root, output, owned);\n    throw error;\n  } finally {\n    if (!retained) cleanCandidate(result);\n  }\n}\n\n\n\nconst command=process.argv[2];\nif(command==='build-release'){await build({...inputs(),build:process.env.GITHUB_RUN_NUMBER});}else{throw new Error('本仓组包动作无效');}\n",
    "shell": "node"
  },
  "checks": {
    "source": "#!/usr/bin/env node\n// CI_BUILD: incremental\n// TUYUFACTORY_CLIENT_ENTRY_CONTRACT: 同一构建入口供CI载荷检查和Release签名前构建复用。\nimport { execFileSync } from 'node:child_process';\nimport { appendFileSync, cpSync, existsSync, lstatSync, mkdirSync, realpathSync, rmSync, symlinkSync } from 'node:fs';\nimport { join, resolve, relative, isAbsolute, sep } from 'node:path';\nimport { pathToFileURL } from 'node:url';\nimport { prepareWebView2SDK, prepareWebView2 } from '__PRODUCT_URL__.github/workflows/release-client-windows.mjs__END_URL__';\n\n\n// CitizenSDK准备逻辑固定属于本产品端，不再调用TUYU共享产品入口。\nconst prepareCitizenSdkSource = [\n  \"import {join} from 'node:path';\",\n  \"import {pathToFileURL} from 'node:url';\",\n  \"const [application,work]=process.argv.slice(2);\",\n  \"const platform=\\\"windows\\\",role=\\\"client\\\";\",\n  \"const factory=process.env.TUYUFACTORY_ROOT;\",\n  \"if(process.env.GITHUB_ACTIONS!=='true'||factory!==process.env.GITHUB_WORKSPACE) throw Error('厂家SDK源码工作区身份无效');\",\n  \"if(process.env.TUYU_PRODUCT!=='tuyufactory-'+role || process.env.TUYU_PLATFORM!==platform || process.env.TUYUFACTORY_WORK_DIR!==work) throw Error('厂家SDK任务身份不一致');\",\n  \"const source=join(factory,'app');\",\n  \"const {prepareNativeProject}=await import(pathToFileURL(join(source,'scripts/project.mjs')));\",\n  \"// 所有平台只装配Pub实际解析的当前SDK视图；产品工程入口负责源码、收据、构建、链接与失败回收。\",\n  \"try { const result=await prepareNativeProject({source,work,output:application,platform},process.env); process.stdout.write(JSON.stringify({...result,TUYUFACTORY_WORK_DIR:work,TUYU_FACTORY_PRODUCT:role})); }\",\n  \"catch(error) { process.stderr.write(error.message+'\\\\n'); process.exitCode=error.retainSdkStage || error.status===75 ? 75 : 1; }\"\n].join('\\n');\n\nconst platform = 'windows';\nfunction required(value, message) { if (!value) throw new Error(message); }\nfunction inside(parent, child) { const path = relative(parent, child); return Boolean(path) && path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path); }\nfunction run(file, args, cwd, environment) {\n  const flutter = process.platform === 'win32' && file === 'flutter';\n  if (flutter && args.some(value => !/^[A-Za-z0-9_./=-]+$/u.test(value))) throw new Error('Windows Flutter参数越过固定范围');\n  execFileSync(flutter ? 'cmd.exe' : file, flutter ? ['/d', '/s', '/c', ['flutter', ...args].join(' ')] : args,\n    { cwd, env: environment, stdio: 'inherit' });\n}\n\n// 清理权来自本进程创建时的设备号/索引；路径相同不表示仍属于本任务。\nfunction cleanCandidate(result) {\n  const {work, identity} = result;\n  required(work === join(realpathSync(process.env.RUNNER_TEMP), 'tuyufactory-client-' + platform), '清理任务路径不匹配');\n  const status = lstatSync(work);\n  required(status.isDirectory() && !status.isSymbolicLink() && realpathSync(work) === work\n    && String(status.dev) + ':' + String(status.ino) === identity, '任务目录归属已变化，保留现场');\n\n  rmSync(work, { recursive: true, force: false });\n}\n\n// 正式资产仅在本次Runner临时根；源码、祖先、别名或其它产品平台目录均拒绝。\nfunction releaseDirectory(root, output) {\n  required(realpathSync(root) === root, 'Release源码根必须为规范物理目录');\n  required(process.env.RUNNER_TEMP && isAbsolute(process.env.RUNNER_TEMP), 'Release缺少Runner临时根');\n  const parent = realpathSync(process.env.RUNNER_TEMP);\n  const status = lstatSync(parent);\n  const contains = (left, right) => {\n    const value = relative(left, right);\n    return value === '' || (value !== '..' && !value.startsWith('..' + sep) && !isAbsolute(value));\n  };\n  required(status.isDirectory() && !status.isSymbolicLink() && realpathSync(parent) === parent\n    && !contains(root, parent) && !contains(parent, root), 'Release临时根与源码交叠或经过链接');\n  required(output === join(parent, 'tuyufactory-client-windows-release'), 'Release资产目录身份无效');\n  return parent;\n}\n\nfunction claimRelease(root, output) {\n  const parent = releaseDirectory(root, output);\n  const status = lstatSync(parent);\n  required(status.isDirectory() && !status.isSymbolicLink() && realpathSync(parent) === parent, 'Release父目录不能经过链接');\n  mkdirSync(output);\n  const owned = lstatSync(output);\n  return String(owned.dev) + ':' + String(owned.ino);\n}\nfunction cleanRelease(root, output, identity) {\n  releaseDirectory(root, output);\n  required(/^[0-9]+:[0-9]+$/.test(identity || ''), 'Release清理归属无效');\n  const owned = lstatSync(output);\n  required(owned.isDirectory() && !owned.isSymbolicLink() && realpathSync(output) === output\n    && String(owned.dev) + ':' + String(owned.ino) === identity, 'Release目录归属已变化，保留现场');\n  rmSync(output, {recursive:true, force:false});\n}\n\nasync function buildCandidate(version) {\n  required(process.platform === 'win32' && process.arch === 'x64', '厂家分机windows必须使用准确原生Runner');\n  const root = realpathSync(process.cwd()), sourceApp = join(root, 'app');\n  required(existsSync(join(sourceApp, 'lib/main_client.dart')) && existsSync(join(sourceApp, platform)), '厂家分机缺少明确入口或平台工程');\n  required(process.env.RUNNER_TEMP && isAbsolute(process.env.RUNNER_TEMP), '缺少Runner任务目录');\n  const temporary = realpathSync(process.env.RUNNER_TEMP);\n  const work = join(temporary, 'tuyufactory-client-' + platform);\n  // 每次进程排他拥有当前任务，不覆盖已有候选或另一个流程的目录。\n  mkdirSync(work);\n  const status = lstatSync(work), identity = String(status.dev) + ':' + String(status.ino);\n  let source;\n  const app = join(work, 'application');\n  const environment = { ...process.env, TUYUFACTORY_ROOT: root, TUYU_PRODUCT: 'tuyufactory-client', TUYU_PLATFORM: platform,\n    TUYUFACTORY_WORK_DIR: work, FLUTTER_TARGET: 'lib/main_client.dart',\n    TUYU_FACTORY_PRODUCT: 'client', TUYU_FACTORY_PRODUCT_NAME: 'TuyuFactoryClient',\n    TUYU_FACTORY_BUNDLE_IDENTIFIER: 'com.tuyufactory.client' };\n  try {\n    // Runner仅使用当前任务的可写工程；CitizenSDK仍由Pub解析同一锁定Git原件。\n    // 不复制源码树中的缓存/生成物；CI只通过受控既有链接复用构建中间件。\n    const cacheLink = join(sourceApp, 'build');\n    const cache = existsSync(cacheLink) ? realpathSync(cacheLink) : null;\n    if (cache) required(!version && lstatSync(cacheLink).isSymbolicLink() && inside(join(temporary, 'ci-cache'), cache), '源码存在非受控CI输出，拒绝接管');\n    // 平台标准目录由本产品唯一入口在当前任务内装配。\n    execFileSync(process.execPath, [join(sourceApp, 'scripts/project.mjs'), 'create',\n      '--source-root', sourceApp, '--work-root', work, '--output', app, '--platform', 'windows'],\n      { env: process.env, stdio: ['ignore', 'ignore', 'inherit'] });\n    const build = join(app, 'build');\n    if (cache) symlinkSync(cache, build, process.platform === 'win32' ? 'junction' : 'dir');\n    else {\n      mkdirSync(join(work, 'flutter-build'));\n      symlinkSync(join(work, 'flutter-build'), build, process.platform === 'win32' ? 'junction' : 'dir');\n    }\n    run('flutter', ['pub', 'get', '--enforce-lockfile'], app, environment);\n    const prepared = JSON.parse(execFileSync(process.execPath,\n      ['--input-type=module', '-', app, work],\n      { cwd: root, env: environment, encoding: 'utf8', input: prepareCitizenSdkSource,\n        stdio: ['pipe', 'pipe', 'inherit'] }));\n    Object.assign(environment, prepared);\n    run('flutter', ['analyze', '--no-pub'], app, environment);\n    run('flutter', ['test', '--no-pub'], app, environment);\n    const runtime = await prepareWebView2({ work, environment });\n    // 开发SDK是产品依赖；产品流程只提交坐标，版本、来源和摘要只读取本产品锁文件。\n    const webView2Sdk = await prepareWebView2SDK({ work, environment });\n    environment.TUYUFACTORY_WEBVIEW2_PACKAGE = webView2Sdk.path;\n    environment.TUYUFACTORY_WEBVIEW2_SHA256 = webView2Sdk.sha256;\n    const args = ['build', 'windows', '--release', '--no-pub', '--target', 'lib/main_client.dart'];\n    if (version) args.push('--build-name=' + version);\n    run('flutter', args, app, environment);\n    const built = realpathSync(join(build, 'windows/x64/runner/Release'));\n    const scripts = join(root, 'scripts');\n    const { verifyPackage, packageFiles } = await import(pathToFileURL(join(root, '.github/workflows/release-client-android.mjs')).href);\n    // 浏览器仅加入本次组装树，增量编译缓存不承载正式Runtime。\n    for (const entry of packageFiles(built)) void entry;\n    // 先检查完整产物才复制离开增量缓存，组装器只接受真实位于本任务内的来源。\n    source = join(work, 'bundle');\n    cpSync(built, source, { recursive: true, force: false, errorOnExist: true, verbatimSymlinks: true });\n    const browser = join(source, 'data/webview2');\n    required(!existsSync(browser), 'Flutter编译结果不应携带另一运行时');\n    cpSync(runtime, browser, { recursive: true, force: false, errorOnExist: true });\n    await verifyPackage(source, 'client', platform, { signature: 'payload' });\n    const { buildClient } = await import(pathToFileURL(join(root, '.github/workflows/release-client-android.mjs')).href);\n    const candidate = join(work, 'candidate');\n    await buildClient(platform, source, candidate, app, environment, 'payload');\n    return { root, app, work, source, candidate, environment, identity };\n  } catch (error) {\n    if (error.status !== 75 && !error.retainSdkStage) cleanCandidate({root, work, identity});\n    throw error;\n  }\n}\n",
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

export function step(key) {
  runVersion();
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



export async function publish(directory) {
  const identity=runVersion();const metadata=JSON.parse(readFileSync(join(directory,'automation.json'),'utf8'));
  if(Object.entries(identity).some(([key,value])=>metadata[key]!==value)||!Array.isArray(metadata.assets)||!metadata.assets.length)fail('完整产物身份无效');
  const files=metadata.assets;
  if(readdirSync(directory).sort().join('\0')!==[...files.map(value=>value.name),'automation.json'].sort().join('\0'))fail('产物目录与完整资产集合不符');
  for(const file of files){const path=join(directory,assetName(file.name));if(regular(path).size!==file.size||await digestFile(path)!==file.sha256)fail('正式产物在交付前改变');}
  if(await request(`git/ref/tags/${encodeURIComponent(identity.tag)}`)!==null)fail('本次Tag已经存在');
  await request('git/refs',{method:'POST',body:{ref:`refs/tags/${identity.tag}`,sha:identity.source_sha}});
  const release=await request('releases',{method:'POST',body:{tag_name:identity.tag,target_commitish:identity.source_sha,
    name:`${owner.product} · ${owner.platform} · ${identity.version}`,draft:false,prerelease:false,make_latest:'false',
    body:`${owner.product} · ${owner.platform} · ${identity.version}\nSource: ${identity.source_sha}\nRun: ${identity.run_id} / ${identity.run_attempt}`}});
  if(!Number.isSafeInteger(release?.id)||!release.upload_url)fail('正式Release创建未确认');
  for(const file of files){const url=new URL(release.upload_url.replace(/\{.*$/u,''));url.searchParams.set('name',file.name);
    const asset=await request(url.href,{method:'POST',body:createReadStream(join(directory,file.name)),size:file.size});
    if(asset?.name!==file.name||asset.size!==file.size||asset.state!=='uploaded')fail('正式资产上传未确认');
    const response=await request(asset.url,{raw:true});if(!response?.body)fail('正式资产回读失败');
    const hash=createHash('sha256');let size=0;for await(const bytes of response.body){hash.update(bytes);size+=bytes.length;if(size>file.size)fail('正式资产回读超过声明大小');}
    if(size!==file.size||hash.digest('hex')!==file.sha256)fail('GitHub资产逐件回读不一致');
  }
  const readback=await request(`releases/${release.id}`);if((await factoryRelease(readback,owner.platform,tag=>request('git/ref/tags/'+encodeURIComponent(tag))))?.run_id!==identity.run_id||readback.draft||readback.prerelease
    ||readback.assets?.length!==files.length)fail('完整正式Release回查失败');
  for(const file of files){const asset=readback.assets.find(value=>value.name===file.name);if(!asset||asset.state!=='uploaded'||asset.size!==file.size||asset.digest!==`sha256:${file.sha256}`)fail('完整正式资产证明回查失败');}
  output('verified','true');output('release_id',release.id);output('tag',identity.tag);
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
  const tag=process.env.RELEASE_TAG;
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


// Windows WebView2锁定依赖只由本自动化入口准备。
const windowsDependencies=await(async()=>{
const {createHash}=await import('node:crypto');
const {execFile}=await import('node:child_process');
const {lstat,mkdir,open,readFile,realpath,readdir,rm}=await import('node:fs/promises');
const {readFileSync}=await import('node:fs');
const {dirname,isAbsolute,join,parse,relative,resolve,sep}=await import('node:path');
const {fileURLToPath}=await import('node:url');
const {promisify}=await import('node:util');
// 厂家分机Windows依赖只读取本产品固定声明，在本轮源码外目录下载并验真。

const productRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const contract = JSON.parse(readFileSync(new URL('../../native/dependencies.json', import.meta.url), 'utf8'));
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

async function prepareWebView2SDK({ work, environment = process.env }) {
  return candidate(work, 'webview2-sdk', environment, async directory => {
    const path = await download(contract.sdk, directory);
    return Object.freeze({ path, sha256: contract.sdk.sha256, version: contract.sdk.version });
  });
}

// CAB在展开前核对路径、大小写、成员完整性和签名边界。
function webView2CabFiles(bytes, root) {
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

async function prepareWebView2({ work, environment = process.env, run = execute }) {
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


return {prepareWebView2SDK,webView2CabFiles,prepareWebView2};
})();
export const {prepareWebView2SDK,webView2CabFiles,prepareWebView2}=windowsDependencies;
const direct=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
const testing=direct&&Boolean(process.env.NODE_TEST_CONTEXT)&&process.argv.length===2;
if(direct&&!testing){
  try{const [command,...args]=process.argv.slice(2);
    if(command==='prepare')await prepare();else if(command==='job')job();else if(command==='step')step(args[0]);
    else if(command==='action')action(args[0],args.slice(1));else if(command==='collect')await collect(args);
    else if(command==='collect-produced')await collectProduced();else if(command==='publish')await publish(args[0]);else if(command==='finish')await finish();
    else if(!await productCommand(command,args))fail('自动化命令无效');
  }catch(error){console.error(error.message);process.exitCode=1;}
}

if(testing){
  const {default:assert}=await import('node:assert/strict');const {default:test}=await import('node:test');

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
