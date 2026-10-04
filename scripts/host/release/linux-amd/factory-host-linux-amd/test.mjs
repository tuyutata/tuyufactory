import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('tuyufactory.host-linux-amd.release的factory-host-linux-amd远端Job物理独立', () => {
  const source = readFileSync(new URL('./execute.mjs', import.meta.url), 'utf8');
  assert.ok(source.includes('{"pipeline":"tuyufactory.host-linux-amd.release","job":"factory-host-linux-amd"}'));
  assert.match(source, /function runExactWorkflowStep\(index\)/u);
  assert.match(source, /function requireExactRemoteJobEnvironment\(\)/u);
});


// 使用当前真实执行器登记资产，不编译、不读发布凭据、不派发远端Job。
test('准确Release阶段登记源码外目录且拒绝已有资产和源码交叠', () => {
  const base = mkdtempSync(join(realpathSync(tmpdir()), 'factory-release-stage-'));
  try {
    const temporary = join(base, 'runner'); mkdirSync(temporary);
    const source = resolve(fileURLToPath(new URL('../../../../..', import.meta.url)));
    const envFile = join(base, 'environment'); writeFileSync(envFile, '');
    const output = join(temporary, 'tuyufactory-host-linux-amd-release');
    const environment = { ...process.env, PATH: dirname(process.execPath) + delimiter + process.env.PATH,
      GITHUB_REPOSITORY: 'tuyutata/tuyufactory', GITHUB_WORKSPACE: source, RUNNER_TEMP: temporary,
      GITHUB_ENV: envFile, SOURCE_SHA: 'a'.repeat(40), CI_RUN_ID: '1',
      SOFTWARE_VERSION: '1.0.0', VERSION_TAG: 'tuyufactory-host-linux-amd-v1.0.0' };
    const execute = new URL('./execute.mjs', import.meta.url);
    const run = env => execFileSync(process.execPath, [fileURLToPath(execute), 'workflow-step', '7'],
      { cwd: source, env, stdio: 'pipe' });
    run(environment);
    assert.equal(readFileSync(envFile, 'utf8'), 'RELEASE_DIR=' + output + '\n');
    mkdirSync(output); writeFileSync(join(output, 'retained'), 'keep');
    assert.throws(() => run(environment));
    assert.equal(readFileSync(join(output, 'retained'), 'utf8'), 'keep');
    assert.throws(() => run({ ...environment, RUNNER_TEMP: source }));
  } finally { rmSync(base, { recursive: true, force: false }); }
});


// 动态导入真实目录校验函数不执行Build或GitHub请求，验证四平台同一边界。
test('主机Release真实目录校验拒绝旧源码输出和其它平台', async () => {
  const { releaseDirectory } = await import('../index.mjs');
  const base = mkdtempSync(join(realpathSync(tmpdir()), 'factory-host-output-'));
  const original = process.env.RUNNER_TEMP;
  try {
    const source = join(base, 'source'), temporary = join(base, 'runner');
    mkdirSync(source); mkdirSync(temporary); process.env.RUNNER_TEMP = temporary;
    const output = join(temporary, 'tuyufactory-host-linux-amd-release');
    assert.equal(releaseDirectory(source, output), temporary);
    for (const wrong of [join(source, '.release/tuyufactory-host-linux-amd'),
      join(temporary, 'tuyufactory-client-linux-amd-release'), output + '/..']) {
      assert.throws(() => releaseDirectory(source, wrong));
    }
    process.env.RUNNER_TEMP = source;
    assert.throws(() => releaseDirectory(source, join(source, 'tuyufactory-host-linux-amd-release')));
  } finally {
    if (original === undefined) delete process.env.RUNNER_TEMP; else process.env.RUNNER_TEMP = original;
    rmSync(base, { recursive: true, force: false });
  }
});
