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
  "platform": "host-macos",
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
    "tuyufactory-host-macos.zip"
  ],
  "required_patterns": [
    "tuyufactory-host-macos.zip",
    "release-manifest.json",
    "SHA256SUMS"
  ]
});
const commands = Object.freeze({
  "3": {
    "shell": "bash",
    "source": "printf 'version=3.47.2\n' >> \"$GITHUB_OUTPUT\""
  },
  "5": {
    "shell": "bash",
    "source": "node \"$GITHUB_WORKSPACE/.github/workflows/release-host-macos.mjs\" action package build-release"
  },
  "1": {
    "shell": "bash",
    "source": "# 仅登记本产品平台资产目录；不占有或覆盖已有候选。\nnode --input-type=module <<'NODE_RELEASE_DIR'\nimport {appendFileSync, existsSync, lstatSync, realpathSync} from 'node:fs';\nimport {isAbsolute, join, relative, sep} from 'node:path';\nconst value = process.env.RUNNER_TEMP;\nif (!value || !isAbsolute(value) || /[\\r\\n\\0]/.test(value)) throw new Error('Release缺少准确Runner临时根');\nconst temporary = realpathSync(value), source = realpathSync(process.env.GITHUB_WORKSPACE);\nconst contains = (left, right) => {\n  const value = relative(left, right);\n  return value === '' || (value !== '..' && !value.startsWith('..' + sep) && !isAbsolute(value));\n};\nconst status = lstatSync(temporary);\nif (!status.isDirectory() || status.isSymbolicLink() || contains(source, temporary)\n    || contains(temporary, source)) throw new Error('Release临时根与源码交叠或经过链接');\nconst output = join(temporary, 'tuyufactory-host-macos-release');\nif (existsSync(output)) throw new Error('Release资产目标已存在，拒绝覆盖');\nappendFileSync(process.env.GITHUB_ENV, 'RELEASE_DIR=' + output + '\\n');\nNODE_RELEASE_DIR"
  },
  "4": {
    "shell": "bash",
    "source": "# 安装后先验真，再统一准备目标平台缓存与受控修订。\nflutter --version --machine >/dev/null\nplatform=\"macos\"\nflutter --version >/dev/null\n# 原生SDK消费与厂家Flutter同一已验真的工具原件；不取Runner默认版本。\nnode --input-type=module <<'NODE_FLUTTER_ROOT'\nimport {appendFileSync, existsSync, realpathSync} from 'node:fs';\nimport {join} from 'node:path';\nif (!process.env.FLUTTER_ROOT || /[\\r\\n\\0]/.test(process.env.FLUTTER_ROOT)) throw new Error('厂家缺少已验真的Flutter根');\nconst root = realpathSync(process.env.FLUTTER_ROOT);\nif (!existsSync(join(root, 'bin/flutter'))) throw new Error('厂家Flutter工具原件缺失');\nappendFileSync(process.env.GITHUB_ENV, 'CITIZENSDK_FLUTTER_ROOT=' + root + '\\nFLUTTER_ROOT=' + root + '\\n');\nNODE_FLUTTER_ROOT"
  },
  "2": {
    "shell": "bash",
    "source": "node .github/workflows/release-client-android.mjs verify --sources \"$GITHUB_WORKSPACE\""
  }
});
const actions = Object.freeze({
  "package": {
    "source": "#!/usr/bin/env node\n\nimport { execFileSync, spawnSync } from 'node:child_process';\nimport { createHash } from 'node:crypto';\nimport { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';\nimport { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';\nimport { pathToFileURL } from 'node:url';\nconst {buildHost}=await (async()=>{\n\n\nconst { execFileSync }=await import(\"node:child_process\");\nconst { cpSync, existsSync, lstatSync, mkdirSync, realpathSync, rmSync }=await import(\"node:fs\");\nconst { join, relative, resolve }=await import(\"node:path\");\nconst { pathToFileURL }=await import(\"node:url\");\n\n\n// CitizenSDK准备逻辑固定属于本产品端，不再调用TUYU共享产品入口。\nconst prepareCitizenSdkSource = [\n  \"import {join} from 'node:path';\",\n  \"import {pathToFileURL} from 'node:url';\",\n  \"const [application,work]=process.argv.slice(2);\",\n  \"const platform=\\\"macos\\\",role=\\\"host\\\";\",\n  \"const factory=process.env.TUYUFACTORY_ROOT;\",\n  \"if(process.env.GITHUB_ACTIONS!=='true'||factory!==process.env.GITHUB_WORKSPACE) throw Error('厂家SDK源码工作区身份无效');\",\n  \"if(process.env.TUYU_PRODUCT!=='tuyufactory-'+role || process.env.TUYU_PLATFORM!==platform || process.env.TUYUFACTORY_WORK_DIR!==work) throw Error('厂家SDK任务身份不一致');\",\n  \"const source=join(factory,'app');\",\n  \"const {prepareNativeProject}=await import(pathToFileURL(join(source,'scripts/project.mjs')));\",\n  \"// 所有平台只装配Pub实际解析的当前SDK视图；产品工程入口负责源码、收据、构建、链接与失败回收。\",\n  \"try { const result=await prepareNativeProject({source,work,output:application,platform},process.env); process.stdout.write(JSON.stringify({...result,TUYUFACTORY_WORK_DIR:work,TUYU_FACTORY_PRODUCT:role})); }\",\n  \"catch(error) { process.stderr.write(error.message+'\\\\n'); process.exitCode=error.retainSdkStage || error.status===75 ? 75 : 1; }\"\n].join('\\n');\n\nfunction required(value, message) { if (!value) throw new Error(message); return value; }\nfunction run(command, args, cwd) {\n  const flutter = process.platform === 'win32' && command === 'flutter';\n  if (flutter && args.some((value) => !/^[A-Za-z0-9_./=-]+$/u.test(value))) throw new Error('Windows Flutter 参数超出固定流程范围');\n  execFileSync(flutter ? 'cmd.exe' : command, flutter ? ['/d', '/s', '/c', ['flutter', ...args].join(' ')] : args,\n    { cwd, stdio: 'inherit', env: process.env });\n}\nfunction buildHost({ flow = 'release', version, consume = () => {} } = {}) {\n  required(flow === 'release', '厂家主机构建流程无效');\n  required(flow !== 'release' || /^(0|[1-9]\\d*)\\.(0|[1-9]\\d{0,1})\\.(0|[1-9]\\d{0,1})$/.test(version || ''), '厂家主机正式版本无效');\n  required(process.platform === 'darwin' && process.arch === 'arm64', '途遇厂家主机端 macOS 必须运行在真实 arm64');\n  const root = realpathSync(process.cwd());\n  const temp = realpathSync(required(process.env.RUNNER_TEMP, 'macOS 缺少 Runner 临时目录'));\n  const work = join(temp, 'tuyufactory-host-macos');\n  const scripts = join(root, 'scripts');\n  // 产品运行包入口缺失必须在创建工作目录及编译前失败，不能交付仅有界面的空壳。\n  required(existsSync(join(root,'.github/workflows/release-host-macos.mjs')), '厂家macOS自动化入口缺失');\n  const previous = { ...process.env };\n  let owned = null;\n  try {\n    // 不清空既有任务。只有本进程排他创建成功后才取得该目录的清理权。\n    mkdirSync(work); owned = lstatSync(work);\n    Object.assign(process.env, {\n      TUYUFACTORY_ROOT: root, TUYU_PRODUCT: 'tuyufactory-host', TUYU_PLATFORM: 'macos',\n      TUYUFACTORY_WORK_DIR: work,\n      TUYU_FACTORY_PRODUCT: 'host', TUYUFACTORY_PLATFORM: 'macos',\n      TUYU_FACTORY_PRODUCT_NAME: 'TuyuFactory', TUYU_FACTORY_BUNDLE_IDENTIFIER: 'com.tuyufactory',\n      TUYU_FACTORY_DISPLAY_NAME: '途遇厂家端', FLUTTER_TARGET: 'lib/main_host.dart',\n    });\n    if (flow === 'release') process.env.CARGO_INCREMENTAL = '0';\n    if (flow === 'release' || !process.env.CARGO_TARGET_DIR) process.env.CARGO_TARGET_DIR = join(work, 'cargo-target');\n    run(process.execPath, [join(root, '.github/workflows/release-client-android.mjs'), 'verify', '--sources', root], root);\n    run('cargo', ['fmt', '--all', '--check'], root);\n    run('cargo', ['test', '--workspace', '--locked'], root);\n    run('cargo', ['build', '--workspace', '--release', '--locked'], root);\n    // Flutter 的可写工程仅属于本次任务；不把源码中的旧缓存、覆盖依赖或产物复制进去。\n    const source = join(root, 'app');\n    required(!existsSync(join(source, 'pubspec_overrides.yaml')), '厂家正式来源禁止本机依赖覆盖');\n    const application = join(work, 'application');\n    // 平台标准目录由本产品唯一入口在当前任务内装配。\n    execFileSync(process.execPath, [join(source, 'scripts/project.mjs'), 'create',\n      '--source-root', source, '--work-root', work, '--output', application, '--platform', 'macos'],\n      { env: process.env, stdio: ['ignore', 'ignore', 'inherit'] });\n    run('flutter', ['pub', 'get', '--enforce-lockfile'], application);\n    run(process.execPath, [join(root, '.github/workflows/release-client-android.mjs'), '--sdk', application], root);\n    const sdkEnvironment = JSON.parse(execFileSync(process.execPath,\n      ['--input-type=module', '-', application, work],\n      { cwd: root, env: process.env, encoding: 'utf8', input: prepareCitizenSdkSource,\n        stdio: ['pipe', 'pipe', 'inherit'] }));\n    Object.assign(process.env, sdkEnvironment);\n    run('flutter', ['analyze', '--no-pub'], application);\n    run('flutter', ['test', '--no-pub'], application);\n    run('flutter', ['build', 'macos', '--release', '--config-only', '--no-pub', '--target', 'lib/main_host.dart', ...(version ? [`--build-name=${version}`] : [])], application);\n    run('pod', ['install'], join(application, 'macos'));\n    run('xcodebuild', ['-workspace', 'macos/Runner.xcworkspace', '-scheme', 'Runner', '-configuration', 'Release',\n      '-derivedDataPath', join(work, 'xcode'), '-destination', 'platform=macOS,arch=arm64',\n      'ARCHS=arm64', 'ONLY_ACTIVE_ARCH=YES', 'FLUTTER_TARGET=lib/main_host.dart',\n      'TUYU_FACTORY_PRODUCT_NAME=TuyuFactory', 'TUYU_FACTORY_BUNDLE_IDENTIFIER=com.tuyufactory',\n      'TUYU_FACTORY_DISPLAY_NAME=途遇厂家端'], application);\n    const runtime = join(work, 'runtime');\n    run(process.execPath,[join(root,'.github/workflows/release-host-macos.mjs'),'action','runtime',runtime],root);\n    const sourceBundle = join(work, 'xcode/Build/Products/Release/TuyuFactory.app');\n    const library = join(process.env.CARGO_TARGET_DIR, 'release/libtuyufactory_native.dylib');\n    required(existsSync(sourceBundle) && existsSync(library), '厂家主机完整原生构建输入缺失');\n    const bundle = join(work, 'TuyuFactoryHost.app');\n    run(process.execPath,[join(root,'.github/workflows/release-host-macos.mjs'),'action','bundle',sourceBundle,library,runtime,bundle],root);\n    run(process.execPath, [join(root, '.github/workflows/release-client-android.mjs'), 'verify', '--package', bundle, 'host', 'macos', flow === 'release' ? 'signed' : 'payload'], root);\n    process.env.TUYUFACTORY_RUNTIME_ROOT = join(bundle, 'Contents/Resources/runtime');\n    run('cargo', ['test', '--test', 'runtime_contract', 'materialized_runtime_initializes_account_and_restarts', '--locked', '--', '--ignored', '--exact'], root);\n    consume(bundle, work);\n  } catch (error) {\n    // SDK资源未确认安全回收时保留任务现场，禁止外层清理仍占用资源。\n    if (error.status === 75 || error.retainSdkStage) owned = null;\n    throw error;\n  } finally {\n    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];\n    Object.assign(process.env, previous);\n    if (owned) {\n      const current = lstatSync(work);\n      required(!current.isSymbolicLink() && current.isDirectory() && current.dev === owned.dev &&\n        current.ino === owned.ino && realpathSync(work) === work && realpathSync(temp) === temp,\n        '厂家任务目录归属发生变化，拒绝清理');\n      rmSync(work, { recursive: true, force: true });\n    }\n  }\n}\n\n\nreturn {buildHost};})();\n\n\nconst identity = Object.freeze({ product: 'tuyufactory', platform: 'host-macos', prefix: 'tuyufactory-host-macos-v',   artifact: 'tuyufactory-host-macos.zip' });\nconst root = process.cwd(); const output = process.env.RELEASE_DIR;\nfunction required(value, message) { if (!value) throw new Error(message); }\nfunction run(file, args, cwd = root) { execFileSync(file, args, { cwd, stdio: 'inherit', env: process.env }); }\n\n\n\nfunction inputs() { return {repository:process.env.GITHUB_REPOSITORY,source:process.env.SOURCE_SHA,sourceSHA:process.env.SOURCE_SHA,version:process.env.SOFTWARE_VERSION,tag:process.env.VERSION_TAG,runID:process.env.GITHUB_RUN_ID,runId:process.env.GITHUB_RUN_ID}; }\nfunction verify(value) { if (execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim() !== process.env.SOURCE_SHA) throw new Error('本仓源码提交不一致'); }\nfunction hash(path) { return createHash('sha256').update(readFileSync(path)).digest('hex'); }\n\n// 归档列表是解包前置条件；拒绝绝对路径、目录穿越、重复成员和控制字符。\nfunction archiveEntries(listing) {\n  const names = new Set();\n  for (const raw of listing.split('\\n')) {\n    if (!raw) continue;\n    const name = raw.replace(/\\/$/u, '');\n    required(name && !/[\\\\\\\\\\x00-\\x1f\\x7f]/u.test(name) && !name.startsWith('/') && !/^[A-Za-z]:/u.test(name), '厂家正式归档路径无效');\n    required(name.split('/').every((part) => part && part !== '.' && part !== '..'), '厂家正式归档路径越界');\n    required(!names.has(name.toLowerCase()), '厂家正式归档含重复或大小写冲突成员');\n    names.add(name.toLowerCase());\n  }\n  required(names.size > 0, '厂家正式归档为空');\n  return names;\n}\n\n// 比对最终归档重新展开的每个文件、权限及链接，防止打包工具漏件或改变有效载荷。\nfunction snapshot(directory) {\n  const result = [];\n  function walk(path) {\n    for (const name of readdirSync(path).sort()) {\n      const item = join(path, name), stat = lstatSync(item), key = relative(directory, item).replaceAll('\\\\', '/');\n      required(!/[\\\\\\\\\\x00-\\x1f\\x7f]/u.test(name) && name !== '.' && name !== '..', '厂家组装包文件名不可安全归档');\n      if (stat.isSymbolicLink()) result.push([key, 'link', readlinkSync(item)]);\n      else if (stat.isDirectory()) { result.push([key, 'directory']); walk(item); }\n      else { required(stat.isFile(), '厂家正式归档含特殊文件'); result.push([key, 'file', stat.mode & 0o777, hash(item)]); }\n    }\n  }\n  walk(directory);\n  return JSON.stringify(result);\n}\n\n// 正式资产仅在本次Runner临时根；源码、祖先、别名或其它产品平台目录均拒绝。\nfunction releaseDirectory(root, output) {\n  required(realpathSync(root) === root, 'Release源码根必须为规范物理目录');\n  required(process.env.RUNNER_TEMP && isAbsolute(process.env.RUNNER_TEMP), 'Release缺少Runner临时根');\n  const parent = realpathSync(process.env.RUNNER_TEMP);\n  const status = lstatSync(parent);\n  const contains = (left, right) => {\n    const value = relative(left, right);\n    return value === '' || (value !== '..' && !value.startsWith('..' + sep) && !isAbsolute(value));\n  };\n  required(status.isDirectory() && !status.isSymbolicLink() && realpathSync(parent) === parent\n    && !contains(root, parent) && !contains(parent, root), 'Release临时根与源码交叠或经过链接');\n  required(output === join(parent, 'tuyufactory-host-macos-release'), 'Release资产目录身份无效');\n  return parent;\n}\n\nfunction build(value) {\n  verify(value);\n  const sourceRoot = realpathSync(root);\n  const parent = releaseDirectory(sourceRoot, output);\n  let owned = null;\n  let complete = false;\n  try {\n    // 已有成功资产绝不在开始时清空；本次创建成功后才有失败清理权。\n    mkdirSync(output); owned = lstatSync(output);\n    buildHost({ flow: 'release', version: value.version, consume(bundle, work) {\n      const originalSnapshot = snapshot(bundle);\n      const asset = join(output, identity.artifact);\n      run('ditto', ['-c', '-k', '--norsrc', '--noextattr', '--keepParent', bundle, asset]);\n      const archiveHash = hash(asset);\n      const entries = archiveEntries(execFileSync('tar', ['-tf', asset], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));\n      const bundleName = basename(bundle).toLowerCase();\n      required([...entries].every((name) => name === bundleName || name.startsWith(bundleName + '/')), '厂家正式归档包含包外成员');\n      const unpacked = join(work, 'archive-check');\n      mkdirSync(unpacked);\n      required(hash(asset) === archiveHash, '厂家正式归档在验证中发生变化');\n      run('tar', ['-xf', asset, '-C', unpacked]);\n      const unpackedBundle = join(unpacked, basename(bundle));\n      run(process.execPath, [join(root, '.github/workflows/release-client-android.mjs'), 'verify', '--package', unpackedBundle, 'host', 'macos', 'signed']);\n      required(originalSnapshot === snapshot(unpackedBundle), '厂家正式归档回读与组装包不一致');\n      required(hash(asset) === archiveHash, '厂家正式归档在回读后发生变化');\n      const manifest = { product_id: identity.product, platform: identity.platform, software_version: value.version, git_commit_sha: value.source, producer_run_id: Number(value.runID), assets: [{ name: identity.artifact, sha256: archiveHash }] };\n      const manifestPath = join(output, 'release-manifest.json');\n      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\\n`, { flag: 'wx' });\n      writeFileSync(join(output, 'SHA256SUMS'), `${[`${archiveHash}  ${identity.artifact}`, `${hash(manifestPath)}  release-manifest.json`].sort().join('\\n')}\\n`, { flag: 'wx' });\n    } });\n    complete = true;\n  } finally {\n    if (owned && !complete) {\n      const current = lstatSync(output);\n      required(!current.isSymbolicLink() && current.isDirectory() && current.dev === owned.dev &&\n        current.ino === owned.ino && realpathSync(output) === resolve(output) && realpathSync(parent) === parent,\n        '厂家失败资产目录归属发生变化，拒绝清理');\n      rmSync(output, { recursive: true, force: true });\n    }\n  }\n}\n\n\nconst command=process.argv[2];\nif(command==='build-release'){await build({...inputs(),build:process.env.GITHUB_RUN_NUMBER});}else{throw new Error('本仓组包动作无效');}\n",
    "shell": "node"
  },
  "runtime": {
    "source": "#!/usr/bin/env bash\nset -euo pipefail\n# 本机生成物由本产品清理。\nproduct_clean() { local item=\"${@: -1}\"; [[ \"$item\" == \"${RUNNER_TEMP:?}\"/* && ! -L \"$item\" ]] || { echo \"自动化清理路径越界\" >&2; exit 1; }; rm \"$@\"; }\n\nROOT=\"${GITHUB_WORKSPACE:?缺少厂家源码根}\"\nSCRIPT_DIR=\"$ROOT/.github/workflows\"\nDESTINATION=\"${1:?usage: release-host-macos.mjs action runtime DESTINATION}\"\n# 原件输入在创建或清理任何本轮目录前验证；没有交付组件就保持源码与既有候选不变。\n\"${NODE:?缺少Node准确入口}\" --input-type=module - \"$ROOT\" <<'COMPONENT_INPUTS'\nimport { lstatSync, realpathSync } from 'node:fs';\nimport { isAbsolute, join, resolve, sep } from 'node:path';\nconst source = realpathSync(process.argv[2]);\nfor (const name of ['TUYU_OPENSSL_PREFIX', 'TUYU_LIBFFI_PREFIX', 'TUYU_PANGO_PREFIX']) {\n  const path = process.env[name];\n  if (!path || !isAbsolute(path) || resolve(path) !== path || realpathSync(path) !== path\n    || !lstatSync(path).isDirectory() || path === source || (path.startsWith(source + sep) && !path.startsWith(join(source, 'target') + sep))\n    || source.startsWith(path + sep)) throw Error('编译组件未交付或目录身份无效：' + name);\n}\nCOMPONENT_INPUTS\n\n# 所有独立入口的工具临时状态归本产品target；宿主已交付的产品工作根继续归当前任务。\nPRODUCT_TARGET_TEMP_ROOT=\"${RUNNER_TEMP:?缺少Runner临时根}\"\nexport TMPDIR=\"$PRODUCT_TARGET_TEMP_ROOT\"\nWORK_ROOT=\"${TUYUFACTORY_WORK_DIR:-${TMPDIR:-$PRODUCT_TARGET_TEMP_ROOT}/tuyufactory/host/macos}\"\nBUILD=\"${TUYUFACTORY_BUILD_DIR:-$WORK_ROOT/build}\"\nSOURCES=\"$WORK_ROOT/sources\"\nLANGUAGE=\"$BUILD/language\"\nPOSTGRES=\"$BUILD/postgresql\"\nBUILD_WORK=\"$BUILD\"\nDEPENDENCY_ROOT=\"${TUYUFACTORY_DEPENDENCY_DIR:-$WORK_ROOT/dependencies}\"\nexport TUYUFACTORY_DEPENDENCY_DIR=\"$DEPENDENCY_ROOT\"\nDOWNLOADS=\"$DEPENDENCY_ROOT/factory-downloads\"\nPACKAGE_CACHE=\"$DEPENDENCY_ROOT/package-managers\"\nLANGUAGE_CACHE=\"$DEPENDENCY_ROOT/compiled/language-base\"\nPOSTGRES_CACHE=\"$DEPENDENCY_ROOT/compiled/postgresql-base\"\nTOOLCHAIN_FINGERPRINT=\"\"\nTOOLCHAIN_FINGERPRINT=\"$({\n  printf '%s\\n' 'tuyufactory-macos-toolchain-v1'\n  shasum -a 256 \"$ROOT/native/runtime.lock.json\" \"$0\"\n} | shasum -a 256 | awk '{print $1}')\"\n\n[[ \"$(uname -s)\" == Darwin && \"$(uname -m)\" == arm64 ]] || {\n  echo '厂家端 macOS 运行包只能在真实 macOS 主机生成' >&2\n  exit 1\n}\n[[ ! -e \"$DESTINATION\" ]] || { echo \"厂家端运行包目标已经存在：$DESTINATION\" >&2; exit 1; }\n\"${PYTHON:?缺少Python准确入口}\" - \"$ROOT\" \"$WORK_ROOT\" \"$BUILD\" \"$DEPENDENCY_ROOT\" \"$DESTINATION\" <<'CHECK_PATHS'\nfrom pathlib import Path\nimport sys\nsource = Path(sys.argv[1]).resolve()\nfor value in sys.argv[2:]:\n    raw, target = Path(value), Path(value).resolve()\n    if not raw.is_absolute() or source / 'target' not in target.parents:\n        raise SystemExit(f'TuyuFactory可写目录必须是本产品target内绝对路径：{value}')\nCHECK_PATHS\n\ncleanup() {\n  for item in \"$BUILD\" \"$SOURCES\"; do\n    [[ ! -e \"$item\" ]] || product_clean -rf \"$item\" 2>/dev/null || true\n  done\n}\ntrap cleanup EXIT\nmkdir -p \"$WORK_ROOT\" \"$SOURCES\" \"$DOWNLOADS\" \"$PACKAGE_CACHE\" \"$LANGUAGE\" \"$POSTGRES\"\nexport npm_config_cache=\"$PACKAGE_CACHE/npm\"\nexport YARN_CACHE_FOLDER=\"$PACKAGE_CACHE/yarn\"\nexport PIP_CACHE_DIR=\"$PACKAGE_CACHE/pip\"\n# 厂家端三层原生组件使用同一最低系统版本，禁止继承 Runner 的测试 SDK 默认值。\nexport MACOSX_DEPLOYMENT_TARGET=26.0\n\nLOCK_VALUES=\"$(node --input-type=module - \"$ROOT/native/runtime.lock.json\" <<'NODE'\nimport { readFileSync } from 'node:fs';\nimport { dirname, join } from 'node:path';\nimport { pathToFileURL } from 'node:url';\nconst lock = JSON.parse(readFileSync(process.argv[2], 'utf8'));\nconst {runtimeTool} = await import(pathToFileURL(join(dirname(dirname(process.argv[2])), '.github', 'workflows', 'release-client-android.mjs')));\nconst node = await runtimeTool('node', 'macos');\nconsole.log([node.version, node.filename, node.root,\n  ...[lock.sources.python_source, node, lock.sources.postgresql_source].flatMap(value => [value.url, value.sha256])].join('\\t'));\nNODE\n)\"\nIFS=$'\\t' read -r NODE_VERSION NODE_FILENAME NODE_ROOT PYTHON_URL PYTHON_SHA NODE_URL NODE_SHA POSTGRES_URL POSTGRES_SHA <<< \"$LOCK_VALUES\"\n# 产品工具更新必须使原语言缓存失效，不能仅比较不含版本的产品引用。\nTOOLCHAIN_FINGERPRINT=\"$(printf '%s\\n' \"$TOOLCHAIN_FINGERPRINT\" \"$NODE_VERSION\" \"$NODE_SHA\" | shasum -a 256 | awk '{print $1}')\"\n\nfetch_locked() {\n  local url=\"$1\" sha=\"$2\" target=\"$3\" pending=\"$3.pending.$$\"\n  [[ \"$url\" == https://* && \"$sha\" =~ ^[a-f0-9]{64}$ && \"$target\" == \"$RUNNER_TEMP\"/* ]] || { echo \"自动化原件来源或路径无效\" >&2; exit 1; }\n  if [[ ! -f \"$target\" ]]; then\n    curl --fail --location --proto '=https' --tlsv1.2 --output \"$pending\" \"$url\"\n    printf '%s  %s\\n' \"$sha\" \"$pending\" | shasum -a 256 -c -\n    mv \"$pending\" \"$target\"\n  fi\n  printf '%s  %s\\n' \"$sha\" \"$target\" | shasum -a 256 -c -\n}\n\n# 运行库由调用方按固定来源交付，不查询Homebrew或系统安装位置。\nOPENSSL_PREFIX=\"${TUYU_OPENSSL_PREFIX:?缺少验真的OpenSSL编译组件}\"\nLIBFFI_PREFIX=\"${TUYU_LIBFFI_PREFIX:?缺少验真的libffi编译组件}\"\nPANGO_PREFIX=\"${TUYU_PANGO_PREFIX:?缺少验真的Pango编译组件}\"\n\nPYTHON_ARCHIVE=\"$DOWNLOADS/Python-3.14.3.tgz\"\nNODE_ARCHIVE=\"$DOWNLOADS/$NODE_FILENAME\"\nPOSTGRES_ARCHIVE=\"$DOWNLOADS/postgresql-17.11.tar.bz2\"\nfetch_locked \"$PYTHON_URL\" \"$PYTHON_SHA\" \"$PYTHON_ARCHIVE\"\nfetch_locked \"$NODE_URL\" \"$NODE_SHA\" \"$NODE_ARCHIVE\"\nfetch_locked \"$POSTGRES_URL\" \"$POSTGRES_SHA\" \"$POSTGRES_ARCHIVE\"\n\nLANGUAGE_CACHE_HIT=0\nif [[ -n \"$LANGUAGE_CACHE\" && -f \"$LANGUAGE_CACHE/fingerprint\" \\\n    && \"$(cat \"$LANGUAGE_CACHE/fingerprint\")\" == \"$TOOLCHAIN_FINGERPRINT\" \\\n    && -x \"$LANGUAGE_CACHE/runtime/python/bin/python3\" \\\n    && -x \"$LANGUAGE_CACHE/runtime/node/bin/node\" ]]; then\n  find \"$LANGUAGE\" -depth -delete\n  ditto \"$LANGUAGE_CACHE/runtime\" \"$LANGUAGE\"\n  LANGUAGE_CACHE_HIT=1\nfi\nif [[ \"$LANGUAGE_CACHE_HIT\" != 1 ]]; then\n  tar -xzf \"$PYTHON_ARCHIVE\" -C \"$BUILD\"\n  (\n    cd \"$BUILD/Python-3.14.3\"\n    CPPFLAGS=\"-I$OPENSSL_PREFIX/include -I$LIBFFI_PREFIX/include\" \\\n    LDFLAGS=\"-L$OPENSSL_PREFIX/lib -L$LIBFFI_PREFIX/lib\" \\\n    ac_cv_func_dup3=no ac_cv_func_pipe2=no \\\n      ./configure --prefix=\"$LANGUAGE/python\" --enable-shared \\\n        --with-ensurepip=install --with-openssl=\"$OPENSSL_PREFIX\"\n    make -j\"$(sysctl -n hw.logicalcpu)\"\n    make install\n  )\n  mkdir -p \"$LANGUAGE/licenses\"\n  cp \"$BUILD/Python-3.14.3/LICENSE\" \"$LANGUAGE/licenses/Python-PSF.txt\"\n  tar -xzf \"$NODE_ARCHIVE\" -C \"$BUILD\"\n  ditto \"$BUILD/$NODE_ROOT\" \"$LANGUAGE/node\"\n  if [[ -n \"$LANGUAGE_CACHE\" ]]; then\n    LANGUAGE_CACHE_NEXT=\"$LANGUAGE_CACHE.next.$$\"\n    product_clean -rf \"$LANGUAGE_CACHE_NEXT\"\n    mkdir -p \"$LANGUAGE_CACHE_NEXT\"\n    ditto \"$LANGUAGE\" \"$LANGUAGE_CACHE_NEXT/runtime\"\n    printf '%s\\n' \"$TOOLCHAIN_FINGERPRINT\" > \"$LANGUAGE_CACHE_NEXT/fingerprint\"\n    product_clean -rf \"$LANGUAGE_CACHE\"\n    mv \"$LANGUAGE_CACHE_NEXT\" \"$LANGUAGE_CACHE\"\n  fi\nfi\nPYTHON=\"$LANGUAGE/python/bin/python3\"\n\"$PYTHON\" --version 2>&1 | grep -qx 'Python 3.14.3'\n\"$LANGUAGE/node/bin/node\" --version | grep -Fxq \"v$NODE_VERSION\"\nexport PATH=\"$LANGUAGE/node/bin:$PATH\"\n\nmkdir -p \"$LANGUAGE/bench/apps\" \"$LANGUAGE/bench/sites\" \"$LANGUAGE/lib\" \"$LANGUAGE/licenses\"\n[[ -f \"$LANGUAGE/licenses/Python-PSF.txt\" ]] \\\n  || { echo '厂家端Python许可证缓存不完整' >&2; exit 1; }\ncp \"$LANGUAGE/node/LICENSE\" \"$LANGUAGE/licenses/Node-MIT.txt\"\nfor app in frappe erpnext; do\n  rsync -a --delete --exclude .git --exclude node_modules \\\n    \"$ROOT/imported/$app/\" \"$LANGUAGE/bench/apps/$app/\"\ndone\n\"$PYTHON\" - \"$LANGUAGE/bench/apps/frappe/pyproject.toml\" <<'PY'\nfrom pathlib import Path\nimport sys\n\npath = Path(sys.argv[1])\nvalue = path.read_text(encoding=\"utf-8\")\nfor dependency in ('    \"PyMySQL==1.1.2\",\\n', '    \"mysqlclient==2.2.7\",\\n'):\n    if dependency not in value:\n        raise SystemExit(f\"厂家端 Frappe 数据库依赖行缺失：{dependency.strip()}\")\n    value = value.replace(dependency, \"\")\npath.write_text(value, encoding=\"utf-8\")\nPY\nexport PYTHONNOUSERSITE=1\n# Python依赖由上游pyproject和产品缓存决定；离线模式必须显式选择。\nunset PIP_NO_CACHE_DIR UV_NO_CACHE\nexport PIP_CACHE_DIR=\"$PACKAGE_CACHE/pip\"\nexport UV_CACHE_DIR=\"$PACKAGE_CACHE/uv\"\nmkdir -p \"$PIP_CACHE_DIR\" \"$UV_CACHE_DIR\"\nPIP_NETWORK_ARGS=()\ncase \"${TUYUFACTORY_OFFLINE:-false}\" in\n  true) PIP_NETWORK_ARGS+=(--no-index) ;;\n  false) ;;\n  *) echo 'TUYUFACTORY_OFFLINE只接受true或false' >&2; exit 1 ;;\nesac\n\"$PYTHON\" -m pip install --disable-pip-version-check --cache-dir \"$PIP_CACHE_DIR\" \\\n  \"${PIP_NETWORK_ARGS[@]}\" \"$LANGUAGE/bench/apps/frappe\"\n\"$PYTHON\" -m pip install --disable-pip-version-check --cache-dir \"$PIP_CACHE_DIR\" \\\n  \"${PIP_NETWORK_ARGS[@]}\" \"$LANGUAGE/bench/apps/erpnext\"\n\"$PYTHON\" -m pip freeze | LC_ALL=C sort > \"$LANGUAGE/licenses/python-packages.txt\"\n\"$LANGUAGE/node/bin/node\" \"$ROOT/.github/workflows/release-client-android.mjs\" host-assets \"$LANGUAGE\"\n\nPOSTGRES_CACHE_HIT=0\nif [[ -n \"$POSTGRES_CACHE\" && -f \"$POSTGRES_CACHE/fingerprint\" \\\n    && \"$(cat \"$POSTGRES_CACHE/fingerprint\")\" == \"$TOOLCHAIN_FINGERPRINT\" \\\n    && -x \"$POSTGRES_CACHE/runtime/bin/postgres\" ]]; then\n  find \"$POSTGRES\" -depth -delete\n  ditto \"$POSTGRES_CACHE/runtime\" \"$POSTGRES\"\n  POSTGRES_CACHE_HIT=1\nfi\nif [[ \"$POSTGRES_CACHE_HIT\" != 1 ]]; then\n  tar -xjf \"$POSTGRES_ARCHIVE\" -C \"$BUILD\"\n  (\n    cd \"$BUILD/postgresql-17.11\"\n    CPPFLAGS=\"-I$OPENSSL_PREFIX/include\" LDFLAGS=\"-L$OPENSSL_PREFIX/lib\" \\\n      ./configure --prefix=\"$POSTGRES\" --datadir=\"$POSTGRES/share/postgresql\" \\\n        --without-icu --without-readline --with-openssl\n    make -j\"$(sysctl -n hw.logicalcpu)\"\n    make install\n  )\n  mkdir -p \"$POSTGRES/licenses\"\n  cp \"$BUILD/postgresql-17.11/COPYRIGHT\" \"$POSTGRES/licenses/PostgreSQL-COPYRIGHT\"\n  if [[ -n \"$POSTGRES_CACHE\" ]]; then\n    POSTGRES_CACHE_NEXT=\"$POSTGRES_CACHE.next.$$\"\n    product_clean -rf \"$POSTGRES_CACHE_NEXT\"\n    mkdir -p \"$POSTGRES_CACHE_NEXT\"\n    ditto \"$POSTGRES\" \"$POSTGRES_CACHE_NEXT/runtime\"\n    printf '%s\\n' \"$TOOLCHAIN_FINGERPRINT\" > \"$POSTGRES_CACHE_NEXT/fingerprint\"\n    product_clean -rf \"$POSTGRES_CACHE\"\n    mv \"$POSTGRES_CACHE_NEXT\" \"$POSTGRES_CACHE\"\n  fi\nfi\n\nis_macho() { file -b \"$1\" | grep -q 'Mach-O'; }\nnative_candidates() {\n  find \"$1\" -type f \\( -perm -111 -o -name '*.dylib' -o -name '*.so' -o -name '*.so.*' \\) \\\n    | LC_ALL=C sort\n}\n\ncopy_dependency() {\n  local source_file=\"$1\" dependency=\"$2\" library_dir=\"$3\"\n  local source_dir dependency_path dependency_name resolved resolved_name\n  source_dir=\"$(dirname \"$source_file\")\"\n  case \"$dependency\" in\n    \"$OPENSSL_PREFIX\"/*|\"$LIBFFI_PREFIX\"/*|\"$PANGO_PREFIX\"/*) dependency_path=\"$dependency\" ;;\n    @loader_path/*) dependency_path=\"$source_dir/${dependency#@loader_path/}\" ;;\n    *) return ;;\n  esac\n  [[ -e \"$dependency_path\" ]] || { echo \"厂家端 Mach-O 依赖缺失：$dependency_path\" >&2; exit 1; }\n  dependency_name=\"$(basename \"$dependency_path\")\"\n  resolved=\"$(realpath \"$dependency_path\")\"\n  resolved_name=\"$(basename \"$resolved\")\"\n  if [[ ! -f \"$library_dir/$resolved_name\" ]]; then\n    cp \"$resolved\" \"$library_dir/$resolved_name\"\n    chmod u+w \"$library_dir/$resolved_name\"\n    while IFS= read -r nested; do copy_dependency \"$resolved\" \"$nested\" \"$library_dir\"; done \\\n      < <(otool -L \"$resolved\" | awk 'NR > 1 {print $1}')\n  fi\n  if [[ \"$dependency_name\" != \"$resolved_name\" && ! -e \"$library_dir/$dependency_name\" ]]; then\n    ln -s \"$resolved_name\" \"$library_dir/$dependency_name\"\n  fi\n}\n\nrelocate_tree() {\n  local tree=\"$1\" library_dir=\"$2\" file_path dependency relative target\n  mkdir -p \"$library_dir\"\n  while IFS= read -r file_path; do\n    is_macho \"$file_path\" || continue\n    while IFS= read -r dependency; do copy_dependency \"$file_path\" \"$dependency\" \"$library_dir\"; done \\\n      < <(otool -L \"$file_path\" | awk 'NR > 1 {print $1}')\n  done < <(native_candidates \"$tree\")\n\n  while IFS= read -r file_path; do\n    is_macho \"$file_path\" || continue\n    chmod u+w \"$file_path\"\n    while IFS= read -r dependency; do\n      case \"$dependency\" in\n        \"$OPENSSL_PREFIX\"/*|\"$LIBFFI_PREFIX\"/*|\"$PANGO_PREFIX\"/*)\n          relative=\"$($PYTHON -c 'import os,sys; print(os.path.relpath(sys.argv[1], sys.argv[2]))' \\\n            \"$library_dir/$(basename \"$dependency\")\" \"$(dirname \"$file_path\")\")\"\n          install_name_tool -change \"$dependency\" \"@loader_path/$relative\" \"$file_path\"\n          ;;\n        \"$tree\"/*)\n          target=\"$dependency\"\n          relative=\"$($PYTHON -c 'import os,sys; print(os.path.relpath(sys.argv[1], sys.argv[2]))' \\\n            \"$target\" \"$(dirname \"$file_path\")\")\"\n          install_name_tool -change \"$dependency\" \"@loader_path/$relative\" \"$file_path\"\n          ;;\n      esac\n    done < <(otool -L \"$file_path\" | awk 'NR > 1 {print $1}')\n    if [[ \"$file_path\" == *.dylib ]]; then\n      install_name_tool -id \"@loader_path/$(basename \"$file_path\")\" \"$file_path\"\n    fi\n    # 路径改写会使原动态库签名失效；先恢复构建签名，最终 App 再执行整包签名。\n    codesign --force --sign - \"$file_path\"\n  done < <(native_candidates \"$tree\")\n\n  if native_candidates \"$tree\" | while IFS= read -r file_path; do \\\n    if is_macho \"$file_path\"; then printf '%s\\n' \"$file_path\"; fi; \\\n    done | \\\n    while IFS= read -r file_path; do otool -L \"$file_path\"; done | \\\n    awk '/^[[:space:]]+\\// {print $1}' | \\\n    grep -F -e \"$OPENSSL_PREFIX/\" -e \"$LIBFFI_PREFIX/\" -e \"$PANGO_PREFIX/\" -e \"$WORK_ROOT/\" >/dev/null; then\n    echo \"厂家端 Mach-O 仍引用构建主机路径：$tree\" >&2\n    exit 1\n  fi\n}\n\nrelocate_tree \"$LANGUAGE\" \"$LANGUAGE/lib\"\nrelocate_tree \"$POSTGRES\" \"$POSTGRES/lib\"\n\"$LANGUAGE/node/bin/node\" \"$ROOT/.github/workflows/release-client-android.mjs\" host-materialize \"$LANGUAGE\" \"$POSTGRES\" \"$DESTINATION\"\necho \"途遇厂家端 macOS 运行包构建通过：$DESTINATION\"\n",
    "shell": "bash"
  },
  "bundle": {
    "source": "#!/usr/bin/env bash\nset -euo pipefail\n\nROOT=\"${GITHUB_WORKSPACE:?缺少厂家源码根}\"\nSCRIPT_DIR=\"$ROOT/.github/workflows\"\nSOURCE_APP=\"${1:?usage: release-host-macos.mjs action bundle APP NATIVE_LIBRARY RUNTIME OUTPUT}\"\nNATIVE_LIBRARY=\"${2:?usage: release-host-macos.mjs action bundle APP NATIVE_LIBRARY RUNTIME OUTPUT}\"\nRUNTIME=\"${3:?usage: release-host-macos.mjs action bundle APP NATIVE_LIBRARY RUNTIME OUTPUT}\"\nOUTPUT=\"${4:?usage: release-host-macos.mjs action bundle APP NATIVE_LIBRARY RUNTIME OUTPUT}\"\nIDENTITY=\"${CODE_SIGN_IDENTITY:--}\"\n# 所有独立入口的工具临时状态归本产品target；宿主已交付的产品工作根继续归当前任务。\nPRODUCT_TARGET_TEMP_ROOT=\"${RUNNER_TEMP:?缺少Runner临时根}\"\nexport TMPDIR=\"$PRODUCT_TARGET_TEMP_ROOT\"\nTUYUFACTORY_WORK_DIR=\"${TUYUFACTORY_WORK_DIR:-${TMPDIR:-$PRODUCT_TARGET_TEMP_ROOT}/tuyufactory/host/macos}\"\n\n[[ \"$(uname -s)\" == Darwin && \"$(uname -m)\" == arm64 ]] \\\n  || { echo '厂家端 macOS 包只能在真实 macOS 主机生成' >&2; exit 1; }\n[[ -d \"$SOURCE_APP\" && -f \"$SOURCE_APP/Contents/Info.plist\" ]] \\\n  || { echo \"厂家端 Flutter App 不存在：$SOURCE_APP\" >&2; exit 1; }\n[[ -f \"$NATIVE_LIBRARY\" ]] || { echo \"厂家端原生库不存在：$NATIVE_LIBRARY\" >&2; exit 1; }\n[[ -f \"$RUNTIME/business/runtime.lock.json\" && -x \"$RUNTIME/postgresql/bin/postgres\" ]] \\\n  || { echo \"厂家端独立运行包不存在：$RUNTIME\" >&2; exit 1; }\n[[ ! -e \"$OUTPUT\" ]] || { echo \"厂家端 App 目标已经存在：$OUTPUT\" >&2; exit 1; }\n\n# 主机组装入口不能接收client壳；写入前验证准确工作根和新目标。\n[[ \"$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' \"$SOURCE_APP/Contents/Info.plist\")\" == com.tuyufactory ]] \\\n  || { echo '厂家主机打包入口拒绝分机安装身份' >&2; exit 1; }\nnode --input-type=module - \"$SCRIPT_DIR/release-client-android.mjs\" \"$TUYUFACTORY_WORK_DIR\" \"$OUTPUT\" \"$SOURCE_APP\" \"$RUNTIME\" <<'NODE_PACKAGE'\nimport { pathToFileURL } from 'node:url';\nimport { lstatSync } from 'node:fs';\nimport { join } from 'node:path';\nconst {packageDestination, packageInside, verifyTree} = await import(pathToFileURL(process.argv[2]));\npackageDestination(process.argv[3], process.argv[4], 'host', 'macos');\nfor (const input of process.argv.slice(5)) {\n  if (lstatSync(input).isSymbolicLink() || packageInside(input, process.argv[4]) || packageInside(process.argv[4], input) || input === process.argv[4]) throw new Error('厂家打包输入与输出交叉');\n  verifyTree(input);\n}\nfor (const name of ['Contents', 'Contents/Frameworks', 'Contents/Resources']) {\n  const path = join(process.argv[5], name);\n  try { if (lstatSync(path).isSymbolicLink()) throw new Error('厂家包写入父目录不得为链接'); }\n  catch (error) { if (error.code !== 'ENOENT') throw error; }\n}\nNODE_PACKAGE\n\n# 排他创建后才拥有清理权；签名和验真失败不能留下半包。\nOUTPUT_OWNED=0\nENTITLEMENTS_OWNED=0\nPACKAGE_COMPLETE=0\ncleanup_package() {\n  if [[ \"$ENTITLEMENTS_OWNED\" == 1 ]]; then /bin/rm -f \"$APP_ENTITLEMENTS\"; fi\n  if [[ \"$OUTPUT_OWNED\" == 1 && \"$PACKAGE_COMPLETE\" != 1 ]]; then find \"$OUTPUT\" -depth -delete; fi\n}\ntrap cleanup_package EXIT\nmkdir \"$OUTPUT\"\nOUTPUT_OWNED=1\nditto \"$SOURCE_APP\" \"$OUTPUT\"\nmkdir -p \"$OUTPUT/Contents/Frameworks\" \"$OUTPUT/Contents/Resources\"\ncp \"$NATIVE_LIBRARY\" \"$OUTPUT/Contents/Frameworks/libtuyufactory_native.dylib\"\ninstall_name_tool -id '@rpath/libtuyufactory_native.dylib' \\\n  \"$OUTPUT/Contents/Frameworks/libtuyufactory_native.dylib\"\nditto \"$RUNTIME\" \"$OUTPUT/Contents/Resources/runtime\"\n\n# 先签全部嵌套 Mach-O，再签最外层 App；PostgreSQL 子进程不能继承 App Sandbox。\nsign_nested_code() {\n  local file_path=\"$1\" signing_output\n  if ! signing_output=\"$(codesign --force --sign \"$IDENTITY\" --timestamp=none \"$file_path\" 2>&1)\"; then\n    printf '%s\\n' \"$signing_output\" >&2\n    return 1\n  fi\n}\nwhile IFS= read -r file_path; do\n  if file -b \"$file_path\" | grep -q 'Mach-O'; then\n    sign_nested_code \"$file_path\"\n  fi\ndone < <(find \"$OUTPUT/Contents/Resources/runtime\" \"$OUTPUT/Contents/Frameworks\" \\\n  -type f \\( -perm -111 -o -name '*.dylib' -o -name '*.so' -o -name '*.node' \\) \\\n  -print | LC_ALL=C sort)\n\n# 权限文件随统一 Flutter 工程定位，主机打包不读取分机入口或重复资源。\nAPP_ENTITLEMENTS=\"$ROOT/app/macos/Runner/Release.entitlements\"\nif [[ \"$IDENTITY\" == - ]]; then\n  APP_ENTITLEMENTS=\"$TUYUFACTORY_WORK_DIR/adhoc.entitlements\"\n  node --input-type=module - \"$ROOT/app/macos/Runner/Release.entitlements\" \"$APP_ENTITLEMENTS\" <<'NODE_ENTITLEMENTS'\nimport { copyFileSync, constants } from 'node:fs';\ncopyFileSync(process.argv[2], process.argv[3], constants.COPYFILE_EXCL);\nNODE_ENTITLEMENTS\n  ENTITLEMENTS_OWNED=1\n  /usr/libexec/PlistBuddy -c \\\n    'Add :com.apple.security.cs.disable-library-validation bool true' \\\n    \"$APP_ENTITLEMENTS\"\nfi\n# 签名前使基础名称与最终物理包名一致，用户名称由包内语言资源提供。\nbundle_name=\"$(basename \"$OUTPUT\" .app)\"\n/usr/libexec/PlistBuddy -c \"Set :CFBundleDisplayName $bundle_name\" \"$OUTPUT/Contents/Info.plist\"\n/usr/libexec/PlistBuddy -c \"Set :CFBundleName $bundle_name\" \"$OUTPUT/Contents/Info.plist\"\ncodesign --force --sign \"$IDENTITY\" --timestamp=none --options runtime \\\n  --entitlements \"$APP_ENTITLEMENTS\" \"$OUTPUT\"\n\"${PRODUCT_NODE_BIN:-${NODE:-node}}\" \"$ROOT/.github/workflows/release-client-android.mjs\" verify --package \"$OUTPUT\" host macos signed\nPACKAGE_COMPLETE=1\necho \"已生成途遇厂家端 macOS App：$OUTPUT\"\n",
    "shell": "bash"
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
