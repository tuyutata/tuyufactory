#!/usr/bin/env node
import { remoteEnvironment as productRemoteEnvironment } from '../../../../build.mjs';
if(!(process.env.NODE_TEST_CONTEXT && process.argv.length === 2)&&process.env.GITHUB_ACTIONS==='true'&&String(process.env.GITHUB_WORKFLOW||'').startsWith('tuyufactory.'))Object.assign(process.env,productRemoteEnvironment());
import { spawnSync as runExactProcess } from 'node:child_process';
function validateCandidate(){const value=process.env;
if(!/^[0-9a-f]{40}$/.test(value.SOURCE_SHA||'')||!/^[1-9][0-9]*$/.test(value.CI_RUN_ID||'')||!/^\d+\.\d{1,2}\.\d{1,2}$/.test(value.SOFTWARE_VERSION||'')||value.VERSION_TAG!=='tuyufactory-client-macos-v'+value.SOFTWARE_VERSION)throw Error('准确Release候选无效');}

// 本文件只执行 tuyufactory.client-macos.release 的 factory-client-macos Job；阶段编号由本仓唯一 Workflow 固定，禁止接收其它身份。
export const EXACT_REMOTE_JOB_IDENTITY = Object.freeze({"pipeline":"tuyufactory.client-macos.release","job":"factory-client-macos"});

function requireExactRemoteJobEnvironment() {
  const expected = 'tuyutata/tuyufactory';
  if (!expected || process.env.GITHUB_REPOSITORY !== expected) {
    throw new Error('准确远端Job仓库身份无效');
  }
}
const workflowSteps = Object.freeze({
  "0": {
    "shell": "bash",
    "source": "set -euo pipefail\ntest -f app/lib/main_client.dart || { echo '途遇厂家分机端缺少产品入口：app/lib/main_client.dart' >&2; exit 1; }\nplatform=macos\ntest -d \"app/$platform\" || { echo \"途遇厂家分机端缺少产品平台工程：$platform\" >&2; exit 1; }\n"
  },
  "1": {
    "shell": "bash",
    "source": "set -euo pipefail\nnode scripts/verify.mjs --sources \"$GITHUB_WORKSPACE\"\n"
  },
  "2": {
    "shell": "bash",
    "source": "printf 'version=3.47.2\n' >> \"$GITHUB_OUTPUT\""
  },
  "3": {
    "shell": "bash",
    "source": "# 安装后先验真，再统一准备目标平台缓存与受控修订。\nflutter --version --machine >/dev/null\nplatform=\"macos\"\nflutter --version >/dev/null\n# 原生SDK消费与厂家Flutter同一已验真的工具原件；不取Runner默认版本。\nnode --input-type=module <<'NODE_FLUTTER_ROOT'\nimport {appendFileSync, existsSync, realpathSync} from 'node:fs';\nimport {join} from 'node:path';\nif (!process.env.FLUTTER_ROOT || /[\\r\\n\\0]/.test(process.env.FLUTTER_ROOT)) throw new Error('厂家缺少已验真的Flutter根');\nconst root = realpathSync(process.env.FLUTTER_ROOT);\nif (!existsSync(join(root, 'bin/flutter'))) throw new Error('厂家Flutter工具原件缺失');\nappendFileSync(process.env.GITHUB_ENV, 'CITIZENSDK_FLUTTER_ROOT=' + root + '\\nFLUTTER_ROOT=' + root + '\\n');\nNODE_FLUTTER_ROOT\n"
  },
  "4": {
    "shell": "bash",
    "source": "node --input-type=module <<'NODE'\nimport {appendFileSync, realpathSync} from 'node:fs';\nimport {join} from 'node:path';\nconst platform = 'macos';\nconst work = join(realpathSync(process.env.RUNNER_TEMP), 'tuyufactory-client-' + platform);\nappendFileSync(process.env.GITHUB_ENV, 'TUYUFACTORY_WORK_DIR=' + work + '\\nFLUTTER_TARGET=lib/main_client.dart\\nTUYU_FACTORY_PRODUCT=client\\n');\nNODE\n"
  },
  "5": {
    "shell": "bash",
    "source": "node \"$GITHUB_WORKSPACE/scripts/client/release/macos/factory-client-macos/execute.mjs\" validate-inputs"
  },
  "6": {
    "shell": "bash",
    "source": "set -euo pipefail\nscript='scripts/client/release/macos/index.mjs'\nnode \"$GITHUB_WORKSPACE/${script}\" build-release\nnode \"$GITHUB_WORKSPACE/${script}\" publish-release\n"
  },
  "7": {
    "shell": "bash",
    "source": "set -euo pipefail\nplatform=macos\nnode \"$GITHUB_WORKSPACE/scripts/client/ci/$platform/index.mjs\" cleanup\n"
  },
  "8": {
    "shell": "bash",
    "source": "# 仅登记本产品平台资产目录；不占有或覆盖已有候选。\nnode --input-type=module <<'NODE_RELEASE_DIR'\nimport {appendFileSync, existsSync, lstatSync, realpathSync} from 'node:fs';\nimport {isAbsolute, join, relative, sep} from 'node:path';\nconst value = process.env.RUNNER_TEMP;\nif (!value || !isAbsolute(value) || /[\\r\\n\\0]/.test(value)) throw new Error('Release缺少准确Runner临时根');\nconst temporary = realpathSync(value), source = realpathSync(process.env.GITHUB_WORKSPACE);\nconst contains = (left, right) => {\n  const value = relative(left, right);\n  return value === '' || (value !== '..' && !value.startsWith('..' + sep) && !isAbsolute(value));\n};\nconst status = lstatSync(temporary);\nif (!status.isDirectory() || status.isSymbolicLink() || contains(source, temporary)\n    || contains(temporary, source)) throw new Error('Release临时根与源码交叠或经过链接');\nconst output = join(temporary, 'tuyufactory-client-macos-release');\nif (existsSync(output)) throw new Error('Release资产目标已存在，拒绝覆盖');\nappendFileSync(process.env.GITHUB_ENV, 'RELEASE_DIR=' + output + '\\n');\nNODE_RELEASE_DIR\n"
  }
});
function runExactWorkflowStep(index){requireExactRemoteJobEnvironment();if(!/^(?:0|[1-9][0-9]*)$/.test(String(index||''))||!Object.hasOwn(workflowSteps,String(index)))throw new Error('准确远端Job阶段无效');const step=workflowSteps[String(index)];const command=step.shell==='pwsh'?'pwsh':(process.platform==='win32'?'bash':'/bin/bash');const args=step.shell==='pwsh'?['-NoLogo','-NoProfile','-NonInteractive','-Command',step.source]:['--noprofile','--norc','-e','-o','pipefail','-c',step.source];const result=runExactProcess(command,args,{cwd:process.cwd(),env:process.env,stdio:'inherit'});if(result.error)throw new Error('准确远端Job阶段无法启动');if(result.status!==0)process.exitCode=Number.isInteger(result.status)?result.status:1;}

if (!(process.env.NODE_TEST_CONTEXT && process.argv.length === 2) && process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL((await import('node:path')).resolve(process.argv[1])).href) {
requireExactRemoteJobEnvironment();
validateCandidate();
if(process.argv[2]==='validate-inputs') process.exit(0);
if(process.argv[2]!=='workflow-step')throw new Error('准确Release Job只接受workflow-step');
runExactWorkflowStep(process.argv[3]);
}

// 正式实现结束；仅直接使用 node --test 执行本文件时注册以下回归。
if (process.env.NODE_TEST_CONTEXT && process.argv.length === 2 && !process.execArgv.some(value=>/^(?:-e|--eval(?:=|$)|--input-type(?:=|$))/u.test(value)) && process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL((await import('node:path')).resolve(process.argv[1])).href) {
const {default:assert} = await import('node:assert/strict');
const { readFileSync, mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } = await import('node:fs');
const { execFileSync } = await import('node:child_process');
const { testRoot:tmpdir } = await import('../../../../build.mjs');
const { delimiter, dirname, join, resolve } = await import('node:path');
const { fileURLToPath } = await import('node:url');
const {default:test} = await import('node:test');

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

}
