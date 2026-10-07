#!/usr/bin/env node
import { remoteEnvironment as productRemoteEnvironment } from '../../../../build.mjs';
if(process.env.GITHUB_ACTIONS==='true'&&String(process.env.GITHUB_WORKFLOW||'').startsWith('tuyufactory.'))Object.assign(process.env,productRemoteEnvironment());
import { spawnSync as runExactProcess } from 'node:child_process';
function validateCandidate(){const value=process.env;
if(!/^[0-9a-f]{40}$/.test(value.SOURCE_SHA||'')||!/^[1-9][0-9]*$/.test(value.CI_RUN_ID||'')||!/^\d+\.\d{1,2}\.\d{1,2}$/.test(value.SOFTWARE_VERSION||'')||value.VERSION_TAG!=='tuyufactory-host-macos-v'+value.SOFTWARE_VERSION)throw Error('准确Release候选无效');}

// 本文件只执行 tuyufactory.host-macos.release 的 factory-host-macos Job；阶段编号由本仓唯一 Workflow 固定，禁止接收其它身份。
export const EXACT_REMOTE_JOB_IDENTITY = Object.freeze({"pipeline":"tuyufactory.host-macos.release","job":"factory-host-macos"});

function requireExactRemoteJobEnvironment() {
  const expected = 'tuyutata/tuyufactory';
  if (!expected || process.env.GITHUB_REPOSITORY !== expected) {
    throw new Error('准确远端Job仓库身份无效');
  }
}
const workflowSteps = Object.freeze({
  "0": {
    "shell": "bash",
    "source": "node scripts/verify.mjs --sources \"$GITHUB_WORKSPACE\"\n"
  },
  "1": {
    "shell": "bash",
    "source": "printf 'version=3.47.2\n' >> \"$GITHUB_OUTPUT\""
  },
  "2": {
    "shell": "bash",
    "source": "# 安装后先验真，再统一准备目标平台缓存与受控修订。\nflutter --version --machine >/dev/null\nplatform=\"macos\"\nflutter --version >/dev/null\n# 原生SDK消费与厂家Flutter同一已验真的工具原件；不取Runner默认版本。\nnode --input-type=module <<'NODE_FLUTTER_ROOT'\nimport {appendFileSync, existsSync, realpathSync} from 'node:fs';\nimport {join} from 'node:path';\nif (!process.env.FLUTTER_ROOT || /[\\r\\n\\0]/.test(process.env.FLUTTER_ROOT)) throw new Error('厂家缺少已验真的Flutter根');\nconst root = realpathSync(process.env.FLUTTER_ROOT);\nif (!existsSync(join(root, 'bin/flutter'))) throw new Error('厂家Flutter工具原件缺失');\nappendFileSync(process.env.GITHUB_ENV, 'CITIZENSDK_FLUTTER_ROOT=' + root + '\\nFLUTTER_ROOT=' + root + '\\n');\nNODE_FLUTTER_ROOT\n"
  },
  "3": {
    "shell": "bash",
    "source": "node \"$GITHUB_WORKSPACE/scripts/host/release/macos/factory-host-macos/execute.mjs\" validate-inputs"
  },
  "4": {
    "shell": "bash",
    "source": "node $GITHUB_WORKSPACE/scripts/host/release/macos/index.mjs build-release"
  },
  "5": {
    "shell": "bash",
    "source": "node $GITHUB_WORKSPACE/scripts/host/release/macos/index.mjs publish-release"
  },
  "6": {
    "shell": "bash",
    "source": "# 仅登记本产品平台资产目录；不占有或覆盖已有候选。\nnode --input-type=module <<'NODE_RELEASE_DIR'\nimport {appendFileSync, existsSync, lstatSync, realpathSync} from 'node:fs';\nimport {isAbsolute, join, relative, sep} from 'node:path';\nconst value = process.env.RUNNER_TEMP;\nif (!value || !isAbsolute(value) || /[\\r\\n\\0]/.test(value)) throw new Error('Release缺少准确Runner临时根');\nconst temporary = realpathSync(value), source = realpathSync(process.env.GITHUB_WORKSPACE);\nconst contains = (left, right) => {\n  const value = relative(left, right);\n  return value === '' || (value !== '..' && !value.startsWith('..' + sep) && !isAbsolute(value));\n};\nconst status = lstatSync(temporary);\nif (!status.isDirectory() || status.isSymbolicLink() || contains(source, temporary)\n    || contains(temporary, source)) throw new Error('Release临时根与源码交叠或经过链接');\nconst output = join(temporary, 'tuyufactory-host-macos-release');\nif (existsSync(output)) throw new Error('Release资产目标已存在，拒绝覆盖');\nappendFileSync(process.env.GITHUB_ENV, 'RELEASE_DIR=' + output + '\\n');\nNODE_RELEASE_DIR\n"
  }
});
function runExactWorkflowStep(index){requireExactRemoteJobEnvironment();if(!/^(?:0|[1-9][0-9]*)$/.test(String(index||''))||!Object.hasOwn(workflowSteps,String(index)))throw new Error('准确远端Job阶段无效');const step=workflowSteps[String(index)];const command=step.shell==='pwsh'?'pwsh':(process.platform==='win32'?'bash':'/bin/bash');const args=step.shell==='pwsh'?['-NoLogo','-NoProfile','-NonInteractive','-Command',step.source]:['--noprofile','--norc','-e','-o','pipefail','-c',step.source];const result=runExactProcess(command,args,{cwd:process.cwd(),env:process.env,stdio:'inherit'});if(result.error)throw new Error('准确远端Job阶段无法启动');if(result.status!==0)process.exitCode=Number.isInteger(result.status)?result.status:1;}

requireExactRemoteJobEnvironment();
validateCandidate();
if(process.argv[2]==='validate-inputs') process.exit(0);
if(process.argv[2]!=='workflow-step')throw new Error('准确Release Job只接受workflow-step');
runExactWorkflowStep(process.argv[3]);
