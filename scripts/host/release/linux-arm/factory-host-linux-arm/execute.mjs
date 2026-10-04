#!/usr/bin/env node
import { spawnSync as runExactProcess } from 'node:child_process';
function validateCandidate(){const value=process.env;
if(!/^[0-9a-f]{40}$/.test(value.SOURCE_SHA||'')||!/^[1-9][0-9]*$/.test(value.CI_RUN_ID||'')||!/^\d+\.\d{1,2}\.\d{1,2}$/.test(value.SOFTWARE_VERSION||'')||value.VERSION_TAG!=='tuyufactory-host-linux-arm-v'+value.SOFTWARE_VERSION)throw Error('准确Release候选无效');}

// 本文件只执行 tuyufactory.host-linux-arm.release 的 factory-host-linux-arm Job；阶段编号由本仓唯一 Workflow 固定，禁止接收其它身份。
export const EXACT_REMOTE_JOB_IDENTITY = Object.freeze({"pipeline":"tuyufactory.host-linux-arm.release","job":"factory-host-linux-arm"});

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
    "source": "sudo apt-get update && sudo apt-get install -y build-essential clang curl file libbz2-dev libffi-dev libgdbm-dev libgtk-3-dev liblzma-dev libncursesw5-dev libpq-dev libreadline-dev libsqlite3-dev libssl-dev ninja-build patchelf pkg-config tk-dev uuid-dev xz-utils zlib1g-dev"
  },
  "2": {
    "shell": "bash",
    "source": "set -euo pipefail\nflutter_version=\"3.47.2\"\nflutter_revision=\"d3b14c876900e553bc736ca19295fc09e3853e8e\"\nflutter_source=\"https://github.com/flutter/flutter.git\"\ncase \"$(uname -m)\" in\n  aarch64|arm64) ;;\n  *) echo \"途遇厂家主机端 LinuxARM 只允许 ARM64 Runner\" >&2; exit 1 ;;\nesac\nflutter_root=\"$RUNNER_TEMP/flutter\"\ngit init \"$flutter_root\"\ngit -C \"$flutter_root\" remote add origin \"$flutter_source\"\ngit -C \"$flutter_root\" fetch --depth=1 origin refs/tags/$flutter_version:refs/tags/$flutter_version\ntest \"$(git -C \"$flutter_root\" rev-parse 'refs/tags/$flutter_version^{commit}')\" = \"$flutter_revision\"\ngit -C \"$flutter_root\" checkout --detach refs/tags/$flutter_version\n\"$flutter_root/bin/flutter\" --disable-analytics\n\"$flutter_root/bin/flutter\" config --enable-linux-desktop\n\"$flutter_root/bin/flutter\" precache --linux\n\"$flutter_root/bin/flutter\" --version --machine >/dev/null\n\"$flutter_root/bin/flutter\" --version\nfile \"$flutter_root/bin/cache/dart-sdk/bin/dart\" | grep -Eiq 'ARM aarch64|ARM64'\n# ARM源码引导同样进入受控准备器，CMake不再由apt或默认PATH提供。\nexport FLUTTER_ROOT=\"$flutter_root\"\nexport PATH=\"$flutter_root/bin:$PATH\"\n\"$flutter_root/bin/flutter\" --version >/dev/null\n# 原生SDK消费与厂家Flutter同一已验真的工具原件；不取Runner默认版本。\nnode --input-type=module <<'NODE_FLUTTER_ROOT'\nimport {appendFileSync, existsSync, realpathSync} from 'node:fs';\nimport {join} from 'node:path';\nif (!process.env.FLUTTER_ROOT || /[\\r\\n\\0]/.test(process.env.FLUTTER_ROOT)) throw new Error('厂家缺少已验真的Flutter根');\nconst root = realpathSync(process.env.FLUTTER_ROOT);\nif (!existsSync(join(root, 'bin/flutter'))) throw new Error('厂家Flutter工具原件缺失');\nappendFileSync(process.env.GITHUB_ENV, 'CITIZENSDK_FLUTTER_ROOT=' + root + '\\nFLUTTER_ROOT=' + root + '\\n');\nNODE_FLUTTER_ROOT\necho \"$flutter_root/bin\" >> \"$GITHUB_PATH\"\n"
  },
  "3": {
    "shell": "bash",
    "source": "node \"$GITHUB_WORKSPACE/scripts/host/release/linux-arm/factory-host-linux-arm/execute.mjs\" validate-inputs"
  },
  "4": {
    "shell": "bash",
    "source": "node $GITHUB_WORKSPACE/scripts/host/release/linux-arm/index.mjs build-release"
  },
  "5": {
    "shell": "bash",
    "source": "node $GITHUB_WORKSPACE/scripts/host/release/linux-arm/index.mjs publish-release"
  },
  "6": {
    "shell": "bash",
    "source": "# 仅登记本产品平台资产目录；不占有或覆盖已有候选。\nnode --input-type=module <<'NODE_RELEASE_DIR'\nimport {appendFileSync, existsSync, lstatSync, realpathSync} from 'node:fs';\nimport {isAbsolute, join, relative, sep} from 'node:path';\nconst value = process.env.RUNNER_TEMP;\nif (!value || !isAbsolute(value) || /[\\r\\n\\0]/.test(value)) throw new Error('Release缺少准确Runner临时根');\nconst temporary = realpathSync(value), source = realpathSync(process.env.GITHUB_WORKSPACE);\nconst contains = (left, right) => {\n  const value = relative(left, right);\n  return value === '' || (value !== '..' && !value.startsWith('..' + sep) && !isAbsolute(value));\n};\nconst status = lstatSync(temporary);\nif (!status.isDirectory() || status.isSymbolicLink() || contains(source, temporary)\n    || contains(temporary, source)) throw new Error('Release临时根与源码交叠或经过链接');\nconst output = join(temporary, 'tuyufactory-host-linux-arm-release');\nif (existsSync(output)) throw new Error('Release资产目标已存在，拒绝覆盖');\nappendFileSync(process.env.GITHUB_ENV, 'RELEASE_DIR=' + output + '\\n');\nNODE_RELEASE_DIR\n"
  }
});
function runExactWorkflowStep(index){requireExactRemoteJobEnvironment();if(!/^(?:0|[1-9][0-9]*)$/.test(String(index||''))||!Object.hasOwn(workflowSteps,String(index)))throw new Error('准确远端Job阶段无效');const step=workflowSteps[String(index)];const command=step.shell==='pwsh'?'pwsh':(process.platform==='win32'?'bash':'/bin/bash');const args=step.shell==='pwsh'?['-NoLogo','-NoProfile','-NonInteractive','-Command',step.source]:['--noprofile','--norc','-e','-o','pipefail','-c',step.source];const result=runExactProcess(command,args,{cwd:process.cwd(),env:process.env,stdio:'inherit'});if(result.error)throw new Error('准确远端Job阶段无法启动');if(result.status!==0)process.exitCode=Number.isInteger(result.status)?result.status:1;}

requireExactRemoteJobEnvironment();
validateCandidate();
if(process.argv[2]==='validate-inputs') process.exit(0);
if(process.argv[2]!=='workflow-step')throw new Error('准确Release Job只接受workflow-step');
runExactWorkflowStep(process.argv[3]);
