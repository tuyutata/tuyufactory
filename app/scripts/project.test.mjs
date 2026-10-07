import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync,
  rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { testRoot as tmpdir } from '../../scripts/build.mjs';
import test from 'node:test';
import { createProject, platformEntries, verifyProject, resolveFirstPartyDependencies, sourceGitEnvironment } from './project.mjs';

// 使用源码外最小夹具验证路径与归属；不运行Flutter、不下载工具、不接触真实账户。
function fixture(t) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'tuyufactory-project-test-'));
  const owned = lstatSync(root);
  t.after(() => {
    const current = lstatSync(root);
    assert.equal(current.ino, owned.ino);
    assert.equal(current.dev, owned.dev);
    rmSync(root, { recursive: true });
  });
  const source = join(root, 'source'), work = join(source, 'target', 'ios', 'test'), tool = join(root, 'tool');
  for (const p of [source, work, tool]) mkdirSync(p, { recursive: true });
  const write = (p, content) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };
  // 全部Git操作仅属于临时夹具；不下载、不读取邻仓，不接触正式产品仓。
  const provider = join(work, 'git-sources/citizen_sdk');
  write(join(provider, 'pubspec.yaml'), 'name: citizen_sdk\nversion: 1.0.0\n');
  write(join(provider, 'pubspec.lock'), 'packages: {}\n');
  write(join(provider, 'lib/citizen_sdk.dart'), 'const fixture = 1;\n');
  write(join(provider, 'scripts/release.mjs'),
    "import {mkdirSync,symlinkSync,copyFileSync} from 'node:fs';\nimport {join} from 'node:path';\n" +
    "export function createFlutterSourceView(source,output) {mkdirSync(join(output,'lib'),{recursive:true});" +
    "symlinkSync(join(source,'lib/citizen_sdk.dart'),join(output,'lib/citizen_sdk.dart'));" +
    "for(const name of ['pubspec.yaml','pubspec.lock'])copyFileSync(join(source,name),join(output,name));return output;}\n");
  const git = args => execFileSync(sourceGitEnvironment().path, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', '-C', provider, ...args],
    { encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } }).trim();
  git(['init', '--quiet']); git(['remote', 'add', 'origin', 'https://github.com/crcfrcn/citizensdk.git']);
  git(['add', '.']); git(['commit', '--quiet', '-m', 'fixture']);
  const sha = git(['rev-parse', 'HEAD']);
  git(['checkout', '--quiet', '--detach', sha]);
  write(join(source, 'pubspec.yaml'), 'name: project_fixture\nenvironment:\n  sdk: ">=3.12.0 <4.0.0"\n' +
    'dependencies:\n  citizen_sdk:\n    git:\n      url: https://github.com/crcfrcn/citizensdk.git\n      ref: ' + sha + '\n      path: .\n');
  write(join(source, 'pubspec.lock'), 'packages:\n  citizen_sdk:\n    dependency: "direct main"\n    description:\n' +
    '      url: "https://github.com/crcfrcn/citizensdk.git"\n      ref: "' + sha + '"\n      resolved-ref: "' + sha +
    '"\n      path: "."\n    source: git\n    version: "1.0.0"\n');
  write(join(source, 'lib/main.dart'), 'void main() {}\n');
  write(join(source, 'analysis_options.yaml'), 'analyzer:\n');
  for (const [input] of platformEntries) write(join(source, input), 'fixture:' + input + '\n');
  for (const name of ['gradlew', 'gradlew.bat', 'gradle/wrapper/gradle-wrapper.jar']) write(join(tool, 'bin/cache/artifacts/gradle_wrapper', name), 'tool-fixture:' + name);
  return { root, source, work, tool, write, provider, sha };
}

test('平台目录在任务内还原，输入字节及可写配置隔离', async t => {
  const f = fixture(t);
  const output = await createProject({ ...f, platform: 'ios' });
  assert.equal(verifyProject({ ...f, output, platform: 'ios' }), output);
  for (const [input, target] of platformEntries) {
    assert.equal(readFileSync(join(output, target), 'utf8'), readFileSync(join(f.source, input), 'utf8'));
    assert.equal(existsSync(join(output, input)), false);
  }
  writeFileSync(join(output, 'pubspec.yaml'), 'changed-work-only\n');
  assert.match(readFileSync(join(f.source, 'pubspec.yaml'), 'utf8'), /project_fixture/);
  writeFileSync(join(output, 'analysis_options.yaml'), 'changed-work-only\n');
  assert.equal(readFileSync(join(f.source, 'analysis_options.yaml'), 'utf8'), 'analyzer:\n');
});

test('Android仅消费明确工具原件，其他平台不要求Wrapper', async t => {
  const f = fixture(t);
  const output = await createProject({ ...f, platform: 'android' }, { FLUTTER_ROOT: f.tool });
  assert.equal(readFileSync(join(output, 'android/gradlew'), 'utf8'), 'tool-fixture:gradlew');
  assert.equal(lstatSync(join(output, 'android/gradlew')).isSymbolicLink(), false);
});

test('缺失平台输入和工具必须在创建输出前拒绝', async t => {
  const f = fixture(t);
  if (platformEntries.length) {
    rmSync(join(f.source, platformEntries[0][0]));
    await assert.rejects(createProject({ ...f, platform: 'ios' }), /平台输入缺失/);
  }
  const g = fixture(t);
  await assert.rejects(createProject({ ...g, platform: 'android' }, {}), /Flutter工具根/);
  assert.equal(existsSync(join(g.work, 'flutter-project')), false);
});

test('既有输出与来源链接均不得覆盖', async t => {
  const f = fixture(t), output = join(f.work, 'existing');
  mkdirSync(output); writeFileSync(join(output, 'keep'), 'keep');
  await assert.rejects(createProject({ ...f, output, platform: 'ios' }), /输出已存在/);
  assert.equal(readFileSync(join(output, 'keep'), 'utf8'), 'keep');
  symlinkSync(join(f.source, 'lib/main.dart'), join(f.source, 'bad-link'));
  await assert.rejects(createProject({ ...f, platform: 'ios' }), /来源包含未登记链接/);
});

test('源码内输出、外部目标及链接父层必须拒绝', async t => {
  const f = fixture(t);
  await assert.rejects(createProject({ ...f, work: f.source, platform: 'ios' }), /本产品target/);
  await assert.rejects(createProject({ ...f, output: join(f.root, 'outside'), platform: 'ios' }), /属于本次工作根/);
  symlinkSync(f.source, join(f.work, 'redirect'), 'dir');
  await assert.rejects(createProject({ ...f, output: join(f.work, 'redirect/new'), platform: 'ios' }), /经过链接/);
});

test('固定Git源码转换只写本轮Pub元数据，声明锁和源文件保持原字节', async t => {
  const f = fixture(t);
  const yaml = readFileSync(join(f.source, 'pubspec.yaml')), lock = readFileSync(join(f.source, 'pubspec.lock'));
  const output = await createProject({ ...f, platform: 'ios' });
  assert.deepEqual(readFileSync(join(f.source, 'pubspec.yaml')), yaml);
  assert.deepEqual(readFileSync(join(f.source, 'pubspec.lock')), lock);
  assert.match(readFileSync(join(output, 'pubspec.yaml'), 'utf8'), /path: ".+\.source-packages\/citizen_sdk"/u);
  assert.match(readFileSync(join(output, 'pubspec.lock'), 'utf8'), /source: path/u);
  const entry = join(output, '.source-packages/citizen_sdk/lib/citizen_sdk.dart');
  assert.equal(lstatSync(entry).isSymbolicLink(), true);
  assert.equal(realpathSync(entry), join(f.provider, 'lib/citizen_sdk.dart'));
});

test('错误URL、锁SHA、脏Git、源码链接、path和override均在依赖解析边界拒绝', async t => {
  for (const kind of ['url', 'sha', 'dirty', 'link', 'path', 'override']) {
    const f = fixture(t);
    if (kind === 'url') writeFileSync(join(f.source, 'pubspec.yaml'),
      readFileSync(join(f.source, 'pubspec.yaml'), 'utf8').replace('crcfrcn/citizensdk', 'other/citizensdk'));
    if (kind === 'sha') writeFileSync(join(f.source, 'pubspec.lock'),
      readFileSync(join(f.source, 'pubspec.lock'), 'utf8').replace('resolved-ref: "' + f.sha, 'resolved-ref: "' + 'f'.repeat(40)));
    if (kind === 'dirty') writeFileSync(join(f.provider, 'lib/citizen_sdk.dart'), 'changed\\n');
    if (kind === 'link') { rmSync(join(f.provider, 'lib/citizen_sdk.dart')); symlinkSync(join(f.source, 'lib/main.dart'), join(f.provider, 'lib/citizen_sdk.dart')); }
    if (kind === 'path') writeFileSync(join(f.source, 'pubspec.yaml'), 'dependencies:\\n  citizen_sdk:\\n    path: ../bad-sdk\\n');
    if (kind === 'override') writeFileSync(join(f.source, 'pubspec_overrides.yaml'), 'dependency_overrides: {}\\n');
    assert.throws(() => resolveFirstPartyDependencies(f.source, f.work), undefined, kind);
    await assert.rejects(createProject({ ...f, platform: 'ios' }));
    assert.equal(existsSync(join(f.work, 'flutter-project', f.source.slice(1))), false);
  }
});

// 生产来源读取和临时Git夹具使用同一准确交付；目录、链接和其它版本不能冒充正式Git。
test('固定源码Git入口拒绝缺失相对链接及错版本', t => {
  const f=fixture(t), actual=sourceGitEnvironment();
  assert.equal(actual.path,process.env.PRODUCT_GIT_BIN);
  assert.equal(actual.env.PATH,dirname(actual.path));
  const link=join(f.root,'git-link');symlinkSync(actual.path,link);
  for(const path of [undefined,'git','/tmp/../git',f.root,link,process.execPath]) {
    assert.throws(()=>sourceGitEnvironment({...process.env,PRODUCT_GIT_BIN:path}), /Git/u);
  }
});
