import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { testRoot as tmpdir } from '../../../../build.mjs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('tuyufactory.client-macos.release的factory-client-macos远端Job物理独立', () => {
  const source = readFileSync(new URL('./execute.mjs', import.meta.url), 'utf8');
  assert.ok(source.includes('{"pipeline":"tuyufactory.client-macos.release","job":"factory-client-macos"}'));
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
    const output = join(temporary, 'tuyufactory-client-macos-release');
    const environment = { ...process.env, PATH: dirname(process.execPath) + delimiter + process.env.PATH,
      GITHUB_REPOSITORY: 'tuyutata/tuyufactory', GITHUB_WORKSPACE: source, RUNNER_TEMP: temporary,
      GITHUB_ENV: envFile, SOURCE_SHA: 'a'.repeat(40), CI_RUN_ID: '1',
      SOFTWARE_VERSION: '1.0.0', VERSION_TAG: 'tuyufactory-client-macos-v1.0.0' };
    const execute = new URL('./execute.mjs', import.meta.url);
    const run = env => execFileSync(process.execPath, [fileURLToPath(execute), 'workflow-step', '8'],
      { cwd: source, env, stdio: 'pipe' });
    run(environment);
    assert.equal(readFileSync(envFile, 'utf8'), 'RELEASE_DIR=' + output + '\n');
    mkdirSync(output); writeFileSync(join(output, 'retained'), 'keep');
    assert.throws(() => run(environment));
    assert.equal(readFileSync(join(output, 'retained'), 'utf8'), 'keep');
    assert.throws(() => run({ ...environment, RUNNER_TEMP: source }));
  } finally { rmSync(base, { recursive: true, force: false }); }
});
