#!/usr/bin/env node
// RELEASE_BUILD: full; CARGO_INCREMENTAL=0；正式包固定使用分机端入口。
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildCandidate, cleanCandidate, claimRelease, cleanRelease, releaseDirectory } from '../../ci/macos/index.mjs';

const identity = Object.freeze({
  product: 'tuyufactory', platform: 'client-macos', prefix: 'tuyufactory-client-macos-v',
  ciTitle: '途遇厂家端 · 分机 macOS · CI', workflow: 'tuyufactory.client-macos.release',
  artifact: 'tuyufactory-client-macos.zip',
});
const root = process.cwd();
const output = process.env.RELEASE_DIR;
function required(value, message) { if (!value) throw new Error(message); }
function run(file, args, cwd = root) { execFileSync(file, args, { cwd, stdio: 'inherit', env: process.env }); }
function hash(path) { return createHash('sha256').update(readFileSync(path)).digest('hex'); }
function githubJSON(args) { return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', env: process.env })); }
function inputs() { releaseDirectory(realpathSync(root), output); required(output, 'macos Release 缺少受控资产目录');
  const value = { repository: process.env.GITHUB_REPOSITORY, source: process.env.SOURCE_SHA, ciRunID: process.env.CI_RUN_ID, version: process.env.SOFTWARE_VERSION, tag: process.env.VERSION_TAG };
  required(value.repository === 'tuyutata/tuyufactory', '途遇厂家仓库身份无效');
  required(/^[0-9a-f]{40}$/u.test(value.source || ''), 'macOS Release 源提交无效');
  required(/^[1-9][0-9]*$/u.test(value.ciRunID || ''), 'macOS CI Run ID 无效');
  required(/^\d+\.\d{1,2}\.\d{1,2}$/u.test(value.version || ''), 'macOS 版本无效');
  required(value.tag === `${identity.prefix}${value.version}`, 'macOS Tag 无效');
  return value;
}
function verify(value) {
  required(process.platform === 'darwin' && process.arch === 'arm64', '途遇厂家分机端 macOS Release 必须运行在 ARM64');
  required(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() === value.source, 'macOS 源码提交不一致');
  const info = githubJSON(['api', `repos/${value.repository}/actions/runs/${value.ciRunID}`]);
  required(String(info?.id) === value.ciRunID && info?.head_sha === value.source && info?.head_branch === 'main' && info?.event === 'workflow_dispatch' && info?.status === 'completed' && info?.conclusion === 'success' && String(info?.display_title || '') === identity.ciTitle && String(info?.path || '').endsWith('/tuyufactory-client-macos-ci.yml'), 'macOS CI Run 身份不一致');
  required(spawnSync('gh', ['release', 'view', value.tag, '--repo', value.repository], { stdio: 'ignore' }).status !== 0, 'macOS 正式 Release 已存在，禁止覆盖');
}
function manifest(value) {
  const asset = join(output, identity.artifact); required(existsSync(asset), 'macOS 正式资产不存在');
  const body = { product_id: identity.product, platform: identity.platform, software_version: value.version, git_commit_sha: value.source, ci_run_id: Number(value.ciRunID), assets: [{ name: identity.artifact, sha256: hash(asset) }] };
  const path = join(output, 'release-manifest.json'); writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`);
  writeFileSync(join(output, 'SHA256SUMS'), `${hash(asset)}  ${identity.artifact}\n${hash(path)}  release-manifest.json\n`);
}
async function build(value) {
  verify(value);
  releaseDirectory(realpathSync(root), output);
  const result = await buildCandidate(value.version);
  const { app: application, work, candidate, environment } = result;
  const scripts = join(root, 'scripts');
  let owned, retained = false;
  try {
    const { buildClient } = await import(pathToFileURL(join(scripts, 'build_client.mjs')).href);
    owned = claimRelease(root, output);
    mkdirSync(join(work, 'signed'));
    // 本产品现有macOS交付使用ad-hoc签名；CI载荷检查不依赖任何发布密钥。
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', '--entitlements', join(application, 'macos/Runner/Release.entitlements'), candidate], {env:environment, stdio:'inherit'});
    const app = join(work, 'signed/TuyuFactoryClient.app');
    await buildClient('macos', candidate, app, application, environment, 'signed');
    run('ditto', ['-c', '-k', '--keepParent', app, join(output, identity.artifact)]);
    execFileSync(process.execPath, [join(scripts, 'build_client.mjs'), '--artifact', identity.platform, join(output, identity.artifact), application, 'signed'],
      {env:environment, stdio:'inherit'});
    manifest(value);
    required(process.env.GITHUB_ENV, 'Release跨步骤缺少目录归属环境');
    appendFileSync(process.env.GITHUB_ENV, 'TUYUFACTORY_WORK_ID=' + result.identity + '\nTUYUFACTORY_RELEASE_ID=' + owned + '\n');
    retained = true;
  } catch (error) {
    if (owned) cleanRelease(root, output, owned);
    throw error;
  } finally {
    if (!retained) cleanCandidate(result);
  }
}

function publish(value) { verify(value);
  // 上传前重新读取最终归档；不能只验证打包前App或清单中的自报身份。
  execFileSync(process.execPath, [join(root, 'scripts/build_client.mjs'), '--artifact', identity.platform, join(output, identity.artifact), join(process.env.TUYUFACTORY_WORK_DIR, 'application'), 'signed'], {env:process.env, stdio:'inherit'});
  const record = JSON.parse(readFileSync(join(output, 'release-manifest.json'), 'utf8'));
  required(record.product_id === identity.product && record.platform === identity.platform && record.git_commit_sha === value.source
    && record.software_version === value.version && record.ci_run_id === Number(value.ciRunID)
    && record.assets?.length === 1 && record.assets[0].name === identity.artifact && record.assets[0].sha256 === hash(join(output, identity.artifact)), '正式归档与Release清单不一致');
  run('gh', ['release', 'create', value.tag, '--repo', value.repository, '--target', value.source, '--latest=false', '--title', `途遇厂家分机端 macOS ${value.version}`, '--notes', `SOURCE_SHA:${value.source}`, ...[identity.artifact, 'release-manifest.json', 'SHA256SUMS'].map((name) => join(output, name))]); }
try { const value = inputs(); const command = process.argv[2]; if (command === 'build-release') await build(value); else if (command === 'publish-release') publish(value); else if (command === 'verify-release-source') verify(value); else throw new Error(`macOS Release 子命令未登记：${command || '(empty)'}`); } catch (error) { console.error(error.message); process.exitCode = 1; }
