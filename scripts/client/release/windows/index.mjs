#!/usr/bin/env node
// RELEASE_BUILD: full; CARGO_INCREMENTAL=0；正式包固定使用分机端入口。
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildCandidate, cleanCandidate, claimRelease, cleanRelease, releaseDirectory } from '../../ci/windows/index.mjs';

const identity = Object.freeze({ product: 'tuyufactory', platform: 'client-windows', prefix: 'tuyufactory-client-windows-v', ciTitle: '途遇厂家端 · 分机 Windows · CI', workflow: 'tuyufactory.client-windows.release', artifact: 'tuyufactory-client-windows.zip' });
const root = process.cwd(); const output = process.env.RELEASE_DIR;
function required(value, message) { if (!value) throw new Error(message); }
function run(file, args, cwd = root) {
  // Windows 的 Flutter 官方入口是批处理文件，必须经系统命令解释器执行。
  const flutter = process.platform === 'win32' && file === 'flutter';
  const executable = flutter ? 'cmd.exe' : file;
  if (flutter && args.some((value) => !/^[A-Za-z0-9_./=-]+$/u.test(value))) throw new Error('Windows Flutter 参数超出固定流程范围');
  const commandArgs = flutter ? ['/d', '/s', '/c', ['flutter', ...args].join(' ')] : args;
  execFileSync(executable, commandArgs, { cwd, stdio: 'inherit', env: process.env });
}
function hash(path) { return createHash('sha256').update(readFileSync(path)).digest('hex'); }
function inputs() { releaseDirectory(realpathSync(root), output); required(output, 'windows Release 缺少受控资产目录'); const value = { repository: process.env.GITHUB_REPOSITORY, source: process.env.SOURCE_SHA, ciRunID: process.env.CI_RUN_ID, version: process.env.SOFTWARE_VERSION, tag: process.env.VERSION_TAG }; required(value.repository === 'tuyutata/tuyufactory', '途遇厂家仓库身份无效'); required(/^[0-9a-f]{40}$/u.test(value.source || ''), 'Windows Release 源提交无效'); required(/^[1-9][0-9]*$/u.test(value.ciRunID || ''), 'Windows CI Run ID 无效'); required(/^\d+\.\d{1,2}\.\d{1,2}$/u.test(value.version || ''), 'Windows 版本无效'); required(value.tag === `${identity.prefix}${value.version}`, 'Windows Tag 无效'); return value; }
function verify(value) { required(process.platform === 'win32' && process.arch === 'x64', '途遇厂家分机端 Windows Release 必须运行在 x86-64'); required(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() === value.source, 'Windows 源码提交不一致'); const info = JSON.parse(execFileSync('gh', ['api', `repos/${value.repository}/actions/runs/${value.ciRunID}`], { encoding: 'utf8', env: process.env })); required(String(info?.id) === value.ciRunID && info?.head_sha === value.source && info?.head_branch === 'main' && info?.event === 'workflow_dispatch' && info?.status === 'completed' && info?.conclusion === 'success' && String(info?.display_title || '') === identity.ciTitle && String(info?.path || '').endsWith('/tuyufactory-client-windows-ci.yml'), 'Windows CI Run 身份不一致'); required(spawnSync('gh', ['release', 'view', value.tag, '--repo', value.repository], { stdio: 'ignore' }).status !== 0, 'Windows 正式 Release 已存在，禁止覆盖'); }
function manifest(value) { const asset = join(output, identity.artifact); required(existsSync(asset), 'Windows 正式资产不存在'); const body = { product_id: identity.product, platform: identity.platform, software_version: value.version, git_commit_sha: value.source, ci_run_id: Number(value.ciRunID), assets: [{ name: identity.artifact, sha256: hash(asset) }] }; const path = join(output, 'release-manifest.json'); writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`); writeFileSync(join(output, 'SHA256SUMS'), `${hash(asset)}  ${identity.artifact}\n${hash(path)}  release-manifest.json\n`); }
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
    const bundle = join(work, 'signed/TuyuFactoryClient');
    await buildClient('windows', candidate, bundle, application, environment, 'signed');
    // 参数通过环境传入PowerShell，不把Runner路径插入可执行脚本文本。
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      'Compress-Archive -LiteralPath (Get-ChildItem -LiteralPath $env:TUYUFACTORY_BUNDLE -Force | ForEach-Object FullName) -DestinationPath $env:TUYUFACTORY_ASSET -CompressionLevel Optimal'],
      {env:{...environment, TUYUFACTORY_BUNDLE:bundle, TUYUFACTORY_ASSET:join(output, identity.artifact)}, stdio:'inherit'});
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
  run('gh', ['release', 'create', value.tag, '--repo', value.repository, '--target', value.source, '--latest=false', '--title', `途遇厂家分机端 Windows ${value.version}`, '--notes', `SOURCE_SHA:${value.source}`, ...[identity.artifact, 'release-manifest.json', 'SHA256SUMS'].map((name) => join(output, name))]); }
try { const value = inputs(); const command = process.argv[2]; if (command === 'build-release') await build(value); else if (command === 'publish-release') publish(value); else if (command === 'verify-release-source') verify(value); else throw new Error(`Windows Release 子命令未登记：${command || '(empty)'}`); } catch (error) { console.error(error.message); process.exitCode = 1; }
