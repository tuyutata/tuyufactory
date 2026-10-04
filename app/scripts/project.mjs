#!/usr/bin/env node
// tuyufactory：扁平源码是唯一输入，平台工具要求的目录只在本次工作根装配。
// 每个产品拥有自己的映射；不读取其他产品的构建配置，不复用任务输出。
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync,
  readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';



// 第一方依赖只来自宿主声明和锁中的准确公开Git提交；不读取邻仓、不接受override。
// Git检出和标准Flutter消费视图均属于本次工作根，宿主源码声明和锁保持原字节。
const firstPartyRepositories = Object.freeze({
  citizen_sdk: 'https://github.com/crcfrcn/citizensdk.git',
  tatachat_sdk: 'https://github.com/tuyutata/tatachatsdk.git',
});
function dependencyBlock(text, name) {
  const matches = [...text.matchAll(new RegExp('^  ' + name + ':\\n(?:[ \\t]{4,}[^\\n]*\\n)+', 'gm'))];
  if (matches.length !== 1) fail('第一方依赖块不唯一：' + name);
  return matches[0][0];
}
function dependencyField(block, key) {
  const matches = [...block.matchAll(new RegExp('^[ \\t]+' + key + ':\\s*(.*?)\\s*$', 'gm'))];
  if (matches.length !== 1) fail('第一方依赖字段不唯一：' + key);
  const value = matches[0][1];
  return value.startsWith('"') && value.endsWith('"') ? JSON.parse(value)
    : value.startsWith("'") && value.endsWith("'") ? value.slice(1, -1) : value;
}
function sourceGit(root, args) {
  return execFileSync(process.platform === 'win32' ? 'git' : '/usr/bin/git', ['-c', 'credential.helper=', '-c', 'core.hooksPath=/dev/null',
    '-c', 'protocol.file.allow=never', '-c', 'gc.auto=0', '-C', root, ...args], {
    encoding: 'utf8', timeout: 180000, maxBuffer: 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { HOME: process.env.HOME, PATH: process.env.PATH, LANG: 'C',
      GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0' },
  }).trim();
}
function verifyGitDirectory(root) {
  if (!isAbsolute(root) || resolve(root) !== root || root === parse(root).root) fail('Git来源根无效');
  let at = parse(root).root;
  for (const part of relative(at, root).split(sep)) {
    at = join(at, part);
    const info = lstatSync(at, { throwIfNoEntry: false });
    if (!info?.isDirectory() || info.isSymbolicLink()) fail('Git来源根缺失或经过链接');
  }
}
export function resolveFirstPartyDependencies(source, work) {
  verifyGitDirectory(source); verifyGitDirectory(work);
  if (existsSync(join(source, 'pubspec_overrides.yaml'))) fail('第一方依赖禁止override');
  const manifest = readFileSync(join(source, 'pubspec.yaml'), 'utf8');
  if (/^    path:/mu.test(manifest)) fail('宿主直接依赖禁止源码外path来源');
  const lock = readFileSync(join(source, 'pubspec.lock'), 'utf8');
  const result = {};
  for (const [name, url] of Object.entries(firstPartyRepositories)) {
    if (!new RegExp('^  ' + name + ':$', 'm').test(manifest)) continue;
    const declared = dependencyBlock(manifest, name), locked = dependencyBlock(lock, name);
    const sha = dependencyField(declared, 'ref');
    if (!/^    git:\s*$/m.test(declared) || !/^[0-9a-f]{40}$/.test(sha)
      || dependencyField(declared, 'url') !== url || dependencyField(declared, 'path') !== '.'
      || dependencyField(locked, 'source') !== 'git' || dependencyField(locked, 'url') !== url
      || dependencyField(locked, 'path') !== '.' || dependencyField(locked, 'ref') !== sha
      || dependencyField(locked, 'resolved-ref') !== sha
      || dependencyField(locked, 'version') !== '1.0.0') fail('第一方声明、锁和唯一Git来源不一致：' + name);
    const parent = join(work, 'git-sources'); mkdirSync(parent, { recursive: true, mode: 0o700 });
    verifyGitDirectory(parent);
    const root = join(parent, name);
    if (!existsSync(root)) {
      mkdirSync(root, { mode: 0o700 });
      const owned = lstatSync(root);
      try {
        sourceGit(root, ['init', '--quiet']);
        sourceGit(root, ['remote', 'add', 'origin', url]);
        sourceGit(root, ['fetch', '--no-tags', '--depth=1', 'origin', sha]);
        sourceGit(root, ['checkout', '--quiet', '--detach', sha]);
      } catch {
        const now = lstatSync(root, { throwIfNoEntry: false });
        if (now?.isDirectory() && !now.isSymbolicLink() && now.dev === owned.dev && now.ino === owned.ino) rmSync(root, { recursive: true });
        fail('第一方固定Git提交取得失败；未使用邻仓或重试：' + name);
      }
    }
    verifyGitDirectory(root); verifyGitDirectory(join(root, '.git'));
    if (resolve(sourceGit(root, ['rev-parse', '--show-toplevel'])) !== root
      || resolve(sourceGit(root, ['rev-parse', '--absolute-git-dir'])) !== join(root, '.git')
      || resolve(root, sourceGit(root, ['rev-parse', '--git-common-dir'])) !== join(root, '.git')
      || sourceGit(root, ['rev-parse', '--abbrev-ref', 'HEAD']) !== 'HEAD'
      || sourceGit(root, ['rev-parse', 'HEAD']) !== sha || sourceGit(root, ['remote', 'get-url', 'origin']) !== url
      || sourceGit(root, ['status', '--porcelain=v1', '--untracked-files=all']) !== ''
      || !new RegExp('^name:\\s*' + name + '\\s*$', 'm').test(readFileSync(join(root, 'pubspec.yaml'), 'utf8'))) {
      fail('第一方Git检出身份或源码已变：' + name);
    }
    result[name] = { root, url, sha };
  }
  if (!result.citizen_sdk) fail('宿主缺少唯一CitizenSDK直接依赖');
  return result;
}
function projectedPubMetadata(source, dependencies, views) {
  let manifest = readFileSync(join(source, 'pubspec.yaml'), 'utf8');
  let lock = readFileSync(join(source, 'pubspec.lock'), 'utf8');
  for (const [name] of Object.entries(dependencies)) {
    const target = views[name];
    if (typeof target !== 'string' || !isAbsolute(target) || target !== resolve(target)) fail('SDK视图路径无效');
    manifest = manifest.replace(dependencyBlock(manifest, name), '  ' + name + ':\n    path: ' + JSON.stringify(target) + '\n');
    lock = lock.replace(dependencyBlock(lock, name), '  ' + name + ':\n    dependency: "direct main"\n    description:\n      path: '
      + JSON.stringify(target) + '\n      relative: false\n    source: path\n    version: "1.0.0"\n');
  }
  return { 'pubspec.yaml': manifest, 'pubspec.lock': lock };
}

export const platformEntries = Object.freeze([
  [
    "ios/Runner.pbxproj",
    "ios/Runner.xcodeproj/project.pbxproj"
  ],
  [
    "ios/ProjectWorkspace.xcworkspacedata",
    "ios/Runner.xcodeproj/project.xcworkspace/contents.xcworkspacedata"
  ],
  [
    "ios/ProjectWorkspaceChecks.plist",
    "ios/Runner.xcodeproj/project.xcworkspace/xcshareddata/IDEWorkspaceChecks.plist"
  ],
  [
    "ios/ProjectWorkspaceSettings.xcsettings",
    "ios/Runner.xcodeproj/project.xcworkspace/xcshareddata/WorkspaceSettings.xcsettings"
  ],
  [
    "ios/Workspace.xcworkspacedata",
    "ios/Runner.xcworkspace/contents.xcworkspacedata"
  ],
  [
    "ios/WorkspaceChecks.plist",
    "ios/Runner.xcworkspace/xcshareddata/IDEWorkspaceChecks.plist"
  ],
  [
    "ios/WorkspaceSettings.xcsettings",
    "ios/Runner.xcworkspace/xcshareddata/WorkspaceSettings.xcsettings"
  ],
  [
    "macos/Runner.pbxproj",
    "macos/Runner.xcodeproj/project.pbxproj"
  ],
  [
    "macos/Runner.xcscheme",
    "macos/Runner.xcodeproj/xcshareddata/xcschemes/Runner.xcscheme"
  ],
  [
    "macos/ProjectWorkspaceChecks.plist",
    "macos/Runner.xcodeproj/project.xcworkspace/xcshareddata/IDEWorkspaceChecks.plist"
  ],
  [
    "macos/Workspace.xcworkspacedata",
    "macos/Runner.xcworkspace/contents.xcworkspacedata"
  ],
  [
    "macos/WorkspaceChecks.plist",
    "macos/Runner.xcworkspace/xcshareddata/IDEWorkspaceChecks.plist"
  ],
  [
    "macos/RunnerTests.swift",
    "macos/RunnerTests/RunnerTests.swift"
  ],
  [
    "macos/Runner/MainMenu.xib",
    "macos/Runner/Base.lproj/MainMenu.xib"
  ],
  [
    "macos/Runner/AppIcon.appiconset/Contents.json",
    "macos/Runner/Assets.xcassets/AppIcon.appiconset/Contents.json"
  ],
  [
    "macos/Runner/AppIcon.appiconset/app_icon_1024.png",
    "macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_1024.png"
  ],
  [
    "macos/Runner/AppIcon.appiconset/app_icon_128.png",
    "macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_128.png"
  ],
  [
    "macos/Runner/AppIcon.appiconset/app_icon_16.png",
    "macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_16.png"
  ],
  [
    "macos/Runner/AppIcon.appiconset/app_icon_256.png",
    "macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_256.png"
  ],
  [
    "macos/Runner/AppIcon.appiconset/app_icon_32.png",
    "macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_32.png"
  ],
  [
    "macos/Runner/AppIcon.appiconset/app_icon_512.png",
    "macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_512.png"
  ],
  [
    "macos/Runner/AppIcon.appiconset/app_icon_64.png",
    "macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_64.png"
  ],
  [
    "windows/runner/app_icon.ico",
    "windows/runner/resources/app_icon.ico"
  ]
]);
const generated = new Set(['.git', '.DS_Store', '.dart_tool', 'build', 'target', '.gradle',
  '.symlinks', '.plugin_symlinks', 'Pods', 'ephemeral', 'node_modules', 'xcuserdata', 'swiftpm']);
const generatedFiles = new Set(['.flutter-plugins', '.flutter-plugins-dependencies', '.packages',
  'Generated.xcconfig', 'flutter_export_environment.sh', 'local.properties',
  'GeneratedPluginRegistrant.h', 'GeneratedPluginRegistrant.m', 'GeneratedPluginRegistrant.swift',
  'generated_plugin_registrant.cc', 'generated_plugin_registrant.h', 'generated_plugins.cmake',
  'generated_config.cmake']);
const writable = new Set(['pubspec.yaml', 'pubspec.lock', 'pubspec_overrides.yaml',
  'analysis_options.yaml', 'Podfile.lock', 'project.pbxproj', 'Runner.pbxproj',
  'settings.gradle', 'settings.gradle.kts']);
const platforms = new Set(['ios', 'android', 'macos', 'windows', 'linux', 'linux-arm', 'linux-amd']);

function fail(message) { throw new Error('tuyufactory工程：' + message); }
function inside(root, value) { const p = relative(root, value); return p === '' || (!isAbsolute(p) && p !== '..' && !p.startsWith('..' + sep)); }
function directory(value, label) {
  if (typeof value !== 'string' || !isAbsolute(value) || resolve(value) !== value || value === parse(value).root) fail(label + '须为规范绝对路径');
  let at = parse(value).root;
  for (const part of relative(at, value).split(sep)) {
    at = join(at, part);
    const s = lstatSync(at, { throwIfNoEntry: false });
    if (!s?.isDirectory() || s.isSymbolicLink()) fail(label + '缺失或经过链接');
  }
  return value;
}
function parameters({ source, work, output, platform = process.env.TUYU_PLATFORM || (process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux') }) {
  directory(source, '源码根'); directory(work, '工作根');
  if (inside(source, work) || inside(work, source)) fail('工作根与源码根必须分离');
  if (!platforms.has(platform)) fail('平台无效');
  output ??= join(work, 'flutter-project', source.replace(/^[A-Za-z]:[\\/]|^[\\/]+/u, ''));
  if (!isAbsolute(output) || resolve(output) !== output || !inside(work, output) || output === work) fail('输出须属于本次工作根');
  let at = dirname(output);
  while (!existsSync(at)) at = dirname(at);
  directory(at, '输出父目录');
  return { source, work, output, platform };
}

function sourceFiles(root) {
  const files = [];
  const walk = (base) => {
    for (const e of readdirSync(base, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (generated.has(e.name) || generatedFiles.has(e.name)) continue;
      const input = join(base, e.name);
      if (e.isSymbolicLink()) fail('来源包含未登记链接：' + relative(root, input));
      if (e.isDirectory()) walk(input);
      else if (e.isFile()) files.push(input);
      else fail('来源包含非常规文件');
    }
  };
  walk(root);
  return files;
}

function put(input, output, copy = false) {
  if (lstatSync(output, { throwIfNoEntry: false })) fail('目标重复：' + output);
  mkdirSync(dirname(output), { recursive: true });
  if (copy || process.platform === 'win32') copyFileSync(input, output);
  else symlinkSync(input, output);
}

function wrappers(environment) {
  const root = directory(environment.FLUTTER_ROOT, '固定Flutter工具根');
  return ['gradlew', 'gradlew.bat', 'gradle/wrapper/gradle-wrapper.jar'].map(name => {
    const input = join(root, 'bin/cache/artifacts/gradle_wrapper', name);
    directory(dirname(input), 'Wrapper原件父目录');
    const s = lstatSync(input, { throwIfNoEntry: false });
    if (!s?.isFile() || s.isSymbolicLink() || s.size === 0) fail('Wrapper原件缺失：' + name);
    return { name, input };
  });
}

export async function createProject(options, environment = process.env) {
  const p = parameters(options);
  if (lstatSync(p.output, { throwIfNoEntry: false })) fail('输出已存在');
  const inputs = sourceFiles(p.source);
  const mapping = new Map(platformEntries);
  for (const [source] of mapping) if (!inputs.includes(join(p.source, source))) fail('平台输入缺失：' + source);
  const toolInputs = p.platform === 'android' ? wrappers(environment) : [];
  // 先核实全部固定输入，再排他创建本次输出；清理只持有这一次的inode身份。
  mkdirSync(dirname(p.output), { recursive: true });
  mkdirSync(p.output);
  const owned = lstatSync(p.output);
  try {
    for (const input of inputs) {
      const rel = relative(p.source, input).split(sep).join('/');
      const target = mapping.get(rel) || rel;
      if (mapping.has(rel) && inputs.includes(join(p.source, target))) fail('来源同时存在标准布局与扁平布局：' + target);
      put(input, join(p.output, target), writable.has(input.split(sep).at(-1)));
    }
    for (const item of toolInputs) {
      put(item.input, join(p.output, 'android', item.name), true);
      if (item.name === 'gradlew') chmodSync(join(p.output, 'android', item.name), 0o755);
    }
    // 厂家原工程无Wrapper声明；输出只使用本产品明确锁定的既有统一版本。
    if (p.platform === 'android') writeFileSync(join(p.output, 'android/gradle/wrapper/gradle-wrapper.properties'),
      'distributionBase=GRADLE_USER_HOME\ndistributionPath=wrapper/dists\nzipStoreBase=GRADLE_USER_HOME\nzipStorePath=wrapper/dists\ndistributionUrl=https\\://services.gradle.org/distributions/gradle-9.1.0-bin.zip\ndistributionSha256Sum=a17ddd85a26b6a7f5ddb71ff8b05fc5104c0202c6e64782429790c933686c806\n');
    // 宿主先验真Git原件，再调用各SDK唯一公开布局入口；只改写本轮Pub元数据副本。
    const dependencies = resolveFirstPartyDependencies(p.source, p.work), views = {};
    for (const [name, item] of Object.entries(dependencies)) {
      const target = join(p.output, '.source-packages', name);
      const api = await import(pathToFileURL(join(item.root, 'scripts/release.mjs')).href);
      if (typeof api.createFlutterSourceView !== 'function') fail('SDK缺少公开Flutter布局入口');
      mkdirSync(dirname(target), { recursive: true });
      await api.createFlutterSourceView(item.root, target);
      views[name] = target;
    }
    for (const [name, value] of Object.entries(projectedPubMetadata(p.source, dependencies, views))) {
      const output = join(p.output, name);
      if (lstatSync(output, { throwIfNoEntry: false })?.isSymbolicLink()) rmSync(output);
      writeFileSync(output, value);
    }
    verifyProject(p);
    return p.output;
  } catch (error) {
    const s = lstatSync(p.output, { throwIfNoEntry: false });
    if (s?.isDirectory() && !s.isSymbolicLink() && s.dev === owned.dev && s.ino === owned.ino) rmSync(p.output, { recursive: true });
    throw error;
  }
}

export function verifyProject(options) {
  const p = parameters(options);
  directory(p.output, '输出工程');
  for (const [input, output] of platformEntries) {
    const source = join(p.source, input), target = join(p.output, output);
    const s = lstatSync(target, { throwIfNoEntry: false });
    if (!s || (s.isSymbolicLink() ? realpathSync(target) !== source : !s.isFile())) fail('平台入口缺失或来源不一致：' + output);
    if (!readFileSync(source).equals(readFileSync(target))) fail('平台入口字节不符：' + output);
  }
  const dependencies = resolveFirstPartyDependencies(p.source, p.work);
  const views = Object.fromEntries(Object.keys(dependencies).map(name => [name, join(p.output, '.source-packages', name)]));
  for (const [name, expected] of Object.entries(projectedPubMetadata(p.source, dependencies, views))) {
    const path = join(p.output, name), info = lstatSync(path, { throwIfNoEntry: false });
    if (!info?.isFile() || info.isSymbolicLink() || readFileSync(path, 'utf8') !== expected) fail('本轮Pub声明或锁漂移');
  }
  if (!existsSync(join(p.output, 'pubspec.yaml'))) fail('输出缺少pubspec');
  if (p.platform === 'android') for (const name of ['gradlew', 'gradlew.bat', 'gradle/wrapper/gradle-wrapper.jar']) {
    const item = lstatSync(join(p.output, 'android', name), { throwIfNoEntry: false });
    if (!item?.isFile() || item.isSymbolicLink() || !item.size) fail('输出Wrapper无效');
  }
  return p.output;
}

export async function prepareNativeProject(options, environment = process.env) {
  const p = parameters(options);
  verifyProject(p);
  const dependency = resolveFirstPartyDependencies(p.source, p.work).citizen_sdk;
  const sdk = dependency.root, view = join(p.output, '.source-packages/citizen_sdk');
  const api = await import(pathToFileURL(join(sdk, 'scripts/release.mjs')).href);
  api.assertFlutterSourceView(sdk, view);
  const stage = join(p.work, 'sdk-native');
  if (lstatSync(stage, { throwIfNoEntry: false })) fail('SDK原生工作目录已存在');
  mkdirSync(stage);
  const owned = lstatSync(stage);
  const nativeWork = join(stage, 'work'), nativeOutput = join(stage, 'output');
  const sources = join(stage, 'sources');
  const target = { ios: 'apple', macos: 'apple', android: 'android', windows: 'Windows',
    'linux-arm': 'LinuxARM', 'linux-amd': 'LinuxAMD' }[p.platform];
  const dependencyPlatform = { ios: 'macOS', macos: 'macOS', android: 'Android',
    windows: 'Windows', 'linux-arm': 'LinuxARM', 'linux-amd': 'LinuxAMD' }[p.platform];
  if (!target) fail('SDK原生平台未登记');
  const child = { ...environment, CITIZENSDK_WORK_DIR: nativeWork,
    CITIZENSDK_NATIVE_OUTPUT_DIR: nativeOutput, CITIZENSDK_SOURCE_SHA: dependency.sha,
    CITIZENSDK_VERSION: '1.0.0', CITIZENSDK_FLUTTER_ROOT: environment.FLUTTER_ROOT,
    CITIZENSDK_GRADLE: p.platform === 'android' ? (environment.CITIZENSDK_GRADLE || join(p.output, 'android/gradlew')) : environment.CITIZENSDK_GRADLE };
  if (child.CITIZENSDK_DEPENDENCY_RECEIPT) fail('SDK依赖收据必须由本轮生成');
  const dependencyScript = join(sdk, 'scripts/dependencies.mjs');
  const run = (file, args) => execFileSync(file, args, {
    env: child, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8', maxBuffer: 1024 * 1024 });
  try {
    run(process.execPath, [dependencyScript, 'prepare-environment', '--scope', 'citizensdk',
      '--platform', dependencyPlatform, '--work', sources]);
    child.CITIZENSDK_ZXING_SOURCE_DIR = join(sources, 'zxing-cpp-3.1.1');
    if (['windows', 'linux-arm', 'linux-amd'].includes(p.platform)) {
      const prepared = JSON.parse(run(process.execPath, [dependencyScript, 'prepare-native',
        '--scope', 'citizensdk', '--platform', dependencyPlatform, '--work', join(stage, 'dependencies'),
        '--sources', sources, '--sdk', sdk, '--mode', environment.CARGO_INCREMENTAL === '0' ? 'release' : 'ci',
        '--source-sha', dependency.sha, '--software-version', '1.0.0']));
      child.CITIZENSDK_DEPENDENCY_RECEIPT = prepared.receipt;
    }
    mkdirSync(nativeWork); mkdirSync(nativeOutput);
    if (p.platform === 'windows') {
      for (const key of ['CITIZENSDK_WORK_DIR', 'CITIZENSDK_NATIVE_OUTPUT_DIR', 'CITIZENSDK_DEPENDENCY_RECEIPT',
        'CITIZENSDK_FLUTTER_ROOT', 'PUB_CACHE']) if (child[key]) {
        child[key] = execFileSync('cygpath', ['-u', child[key]], { encoding: 'utf8' }).trim();
      }
    }
    execFileSync('bash', [join(sdk, 'scripts/build-native.sh'), target], { env: child, stdio: ['ignore', 2, 2] });
    const result = {};
    if (p.platform === 'ios' || p.platform === 'macos') {
      const framework = join(nativeOutput, 'apple/CitizenSDK.xcframework');
      directory(framework, 'SDK Apple框架');
      symlinkSync(framework, join(view, 'darwin/CitizenSDK.xcframework'), 'dir');
    } else if (p.platform === 'android') {
      const core = join(nativeOutput, 'android/arm64-v8a');
      for (const name of ['libcitizensdk.so', 'libcitizensdk_jni.so']) {
        const info = lstatSync(join(core, name), { throwIfNoEntry: false });
        if (!info?.isFile() || info.isSymbolicLink() || !info.size) fail('SDK Android双库缺失');
      }
      Object.assign(result, { CITIZENSDK_ANDROID_CORE_DIR: core,
        CITIZENSDK_ANDROID_BUILD_DIR: join(stage, 'gradle'), CITIZENSDK_SOURCE_DIR: view });
    } else {
      const installed = join(nativeOutput, p.platform === 'windows' ? 'Windows' : 'linux/' + target);
      if (p.platform === 'windows') api.assertWindowsNativeArtifact(sdk, installed);
      const destination = join(view, p.platform === 'windows' ? 'windows' : 'linux');
      const install = (from, to) => {
        mkdirSync(to, { recursive: true });
        directory(to, 'SDK安装目标');
        for (const name of readdirSync(from).sort()) {
          const input = join(from, name), output = join(to, name), info = lstatSync(input);
          if (info.isDirectory() && !info.isSymbolicLink()) install(input, output);
          else if (info.isFile() && !info.isSymbolicLink()) {
            const present = lstatSync(output, { throwIfNoEntry: false });
            if (present) {
              if ((!present.isFile() && !present.isSymbolicLink())
                || !readFileSync(output).equals(readFileSync(input))) fail('SDK安装件与源码头冲突');
              rmSync(output);
            }
            copyFileSync(input, output, 1);
          } else fail('SDK安装来源包含链接或特殊文件');
        }
      };
      install(installed, destination);
    }
    verifyProject(p);
    return result;
  } catch (error) {
    // SDK依赖策略未安全释放时保留本轮目录，让外层准确失败而不删除仍占用资源。
    if (error.retainSdkStage || error.status === 75) { error.retainSdkStage = true; throw error; }
    const current = lstatSync(stage, { throwIfNoEntry: false });
    if (current?.isDirectory() && !current.isSymbolicLink()
      && current.dev === owned.dev && current.ino === owned.ino) rmSync(stage, { recursive: true });
    throw error;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const [command, ...argv] = process.argv.slice(2);
    const args = {};
    const keys = { '--source-root': 'source', '--work-root': 'work', '--output': 'output', '--platform': 'platform' };
    for (let i = 0; i < argv.length; i += 2) {
      const key = keys[argv[i]];
      if (!key || args[key] || !argv[i + 1]) fail('参数未知、重复或缺值');
      args[key] = argv[i + 1];
    }
    const value = command === 'native' ? JSON.stringify(await prepareNativeProject(args)) : command === 'dependencies' ? JSON.stringify(resolveFirstPartyDependencies(args.source, args.work)) : command === 'create' ? await createProject(args) : command === 'verify' ? verifyProject(args) : fail('命令只允许create/verify/dependencies/native');
    process.stdout.write(value + '\n');
  } catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = error.retainSdkStage || error.status === 75 ? 75 : 1; }
}
