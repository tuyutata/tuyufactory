import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('tuyufactory.client-ios.ci的factory-client-ios远端Job物理独立', () => {
  const source = readFileSync(new URL('./execute.mjs', import.meta.url), 'utf8');
  assert.ok(source.includes('{"pipeline":"tuyufactory.client-ios.ci","job":"factory-client-ios"}'));
  assert.match(source, /function runExactWorkflowStep\(index\)/u);
  assert.match(source, /function requireExactRemoteJobEnvironment\(\)/u);
});


// 真实占有/清理只针对本次普通目录，错误归属不得删除资产。
test('分机Release真实资产占有与清理隔离源码和其它平台', async () => {
  const { claimRelease, cleanRelease } = await import('../index.mjs');
  const base = mkdtempSync(join(realpathSync(tmpdir()), 'factory-client-output-'));
  const original = process.env.RUNNER_TEMP;
  try {
    const source = join(base, 'source'), temporary = join(base, 'runner');
    mkdirSync(source); mkdirSync(temporary); process.env.RUNNER_TEMP = temporary;
    const output = join(temporary, 'tuyufactory-client-ios-release');
    for (const wrong of [join(source, '.release/tuyufactory-client-ios'),
      join(temporary, 'tuyufactory-host-ios-release'), output + '/..']) {
      assert.throws(() => claimRelease(source, wrong));
    }
    const identity = claimRelease(source, output); writeFileSync(join(output, 'retained'), 'keep');
    assert.throws(() => claimRelease(source, output));
    assert.throws(() => cleanRelease(source, output, '0:0'));
    assert.equal(readFileSync(join(output, 'retained'), 'utf8'), 'keep');
    cleanRelease(source, output, identity); assert.equal(existsSync(output), false);
    process.env.RUNNER_TEMP = source;
    assert.throws(() => claimRelease(source, join(source, 'tuyufactory-client-ios-release')));
  } finally {
    if (original === undefined) delete process.env.RUNNER_TEMP; else process.env.RUNNER_TEMP = original;
    rmSync(base, { recursive: true, force: false });
  }
});
