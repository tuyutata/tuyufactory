#!/usr/bin/env node
import { spawnSync as runExactProcess } from 'node:child_process';
function validateCandidate(){const value=process.env;
if(!/^[0-9a-f]{40}$/.test(value.SOURCE_SHA||'')||!/^[1-9][0-9]*$/.test(value.CI_RUN_ID||'')||!/^\d+\.\d{1,2}\.\d{1,2}$/.test(value.SOFTWARE_VERSION||'')||value.VERSION_TAG!=='tuyufactory-client-android-v'+value.SOFTWARE_VERSION)throw Error('准确Release候选无效');}

// 本文件只执行 tuyufactory.client-android.release 的 factory-client-android Job；阶段编号由本仓唯一 Workflow 固定，禁止接收其它身份。
export const EXACT_REMOTE_JOB_IDENTITY = Object.freeze({"pipeline":"tuyufactory.client-android.release","job":"factory-client-android"});

function requireExactRemoteJobEnvironment() {
  const expected = 'tuyutata/tuyufactory';
  if (!expected || process.env.GITHUB_REPOSITORY !== expected) {
    throw new Error('准确远端Job仓库身份无效');
  }
}
const workflowSteps = Object.freeze({
  "0": {
    "shell": "bash",
    "source": "set -euo pipefail\ntest -f app/lib/main_client.dart || { echo '途遇厂家分机端缺少产品入口：app/lib/main_client.dart' >&2; exit 1; }\nplatform=android\ntest -d \"app/$platform\" || { echo \"途遇厂家分机端缺少产品平台工程：$platform\" >&2; exit 1; }\n"
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
    "source": "# 安装后先验真，再统一准备目标平台缓存与受控修订。\nflutter --version --machine >/dev/null\nplatform=\"android\"\nflutter --version >/dev/null\n# 原生SDK消费与厂家Flutter同一已验真的工具原件；不取Runner默认版本。\nnode --input-type=module <<'NODE_FLUTTER_ROOT'\nimport {appendFileSync, existsSync, realpathSync} from 'node:fs';\nimport {join} from 'node:path';\nif (!process.env.FLUTTER_ROOT || /[\\r\\n\\0]/.test(process.env.FLUTTER_ROOT)) throw new Error('厂家缺少已验真的Flutter根');\nconst root = realpathSync(process.env.FLUTTER_ROOT);\nif (!existsSync(join(root, 'bin/flutter'))) throw new Error('厂家Flutter工具原件缺失');\nappendFileSync(process.env.GITHUB_ENV, 'CITIZENSDK_FLUTTER_ROOT=' + root + '\\nFLUTTER_ROOT=' + root + '\\n');\nNODE_FLUTTER_ROOT\n"
  },
  "4": {
    "shell": "bash",
    "source": "node --input-type=module <<'NODE'\nimport {appendFileSync, realpathSync} from 'node:fs';\nimport {join} from 'node:path';\nconst platform = 'android';\nconst work = join(realpathSync(process.env.RUNNER_TEMP), 'tuyufactory-client-' + platform);\nappendFileSync(process.env.GITHUB_ENV, 'TUYUFACTORY_WORK_DIR=' + work + '\\nFLUTTER_TARGET=lib/main_client.dart\\nTUYU_FACTORY_PRODUCT=client\\n');\nNODE\n"
  },
  "5": {
    "shell": "bash",
    "source": "set -euo pipefail\nsdkmanager \"platforms;android-36\" \"build-tools;36.0.0\" \"platform-tools\" \"cmdline-tools;22.0\" \"ndk;28.2.13676358\" \"cmake;3.31.6\"\ntools=\"$ANDROID_HOME/build-tools/36.0.0\"\nndk_root=\"$ANDROID_HOME/ndk/28.2.13676358\"\ntest -x \"$tools/apksigner\" && test -f \"$ndk_root/source.properties\"\ngrep -Eq '^Pkg\\.Revision[[:space:]]*=[[:space:]]*28\\.2\\.13676358$' \"$ndk_root/source.properties\"\n{\n  printf 'TUYUFACTORY_ANDROID_BUILD_TOOLS=%s\\n' \"$tools\"\n  printf 'ANDROID_NDK_HOME=%s\\n' \"$ndk_root\"\n  printf 'ANDROID_NDK_ROOT=%s\\n' \"$ndk_root\"\n} >> \"$GITHUB_ENV\"\nprintf '%s\\n%s\\n' \"$tools\" \"$ANDROID_HOME/cmdline-tools/22.0/bin\" >> \"$GITHUB_PATH\"\n"
  },
  "6": {
    "shell": "bash",
    "source": "node \"$GITHUB_WORKSPACE/scripts/client/release/android/factory-client-android/execute.mjs\" validate-inputs"
  },
  "7": {
    "shell": "bash",
    "source": "set -euo pipefail\numask 077\nnode \"$GITHUB_WORKSPACE/scripts/client/ci/android/index.mjs\" build-release\nwork=\"$TUYUFACTORY_WORK_DIR/signing\"\nmkdir \"$work\"\ntrap 'rm -rf \"$work\"' EXIT\nnode \"$GITHUB_WORKSPACE/scripts/client/ci/android/index.mjs\" claim-release\nmkdir \"$RELEASE_DIR/payload\"\npython3 - \"$work\" <<'PY'\nimport base64, os, pathlib, re, sys\nroot = pathlib.Path(sys.argv[1]); fields = {}\nfor raw in os.environ.get(\"APP_KEY\", \"\").splitlines():\n    line = raw.strip()\n    if not line or line.startswith(\"#\"): continue\n    name, sep, value = line.partition(\"=\")\n    if not sep or name.strip() in fields or not value.strip(): raise SystemExit(\"APP_KEY 行格式无效\")\n    fields[name.strip()] = value.strip()\nif set(fields) - {\"keystore\", \"password\", \"alias\", \"keyPassword\"}: raise SystemExit(\"APP_KEY 包含未登记字段\")\nalias = fields.get(\"alias\", \"upload\")\nif not re.fullmatch(r\"[A-Za-z0-9._-]{1,128}\", alias): raise SystemExit(\"APP_KEY alias 无效\")\ntry: key = base64.b64decode(fields[\"keystore\"], validate=True); password = fields[\"password\"]\nexcept (KeyError, ValueError) as exc: raise SystemExit(\"APP_KEY 缺少有效签名材料\") from exc\nif not 1024 <= len(key) <= 32 * 1024 * 1024: raise SystemExit(\"APP_KEY keystore 大小无效\")\n(root / \"release.keystore\").write_bytes(key); (root / \"password\").write_text(password)\n(root / \"key-password\").write_text(fields.get(\"keyPassword\", password)); (root / \"alias\").write_text(alias)\nPY\nexport TUYU_ANDROID_STORE_PASSWORD=\"$(cat \"$work/password\")\"\nexport TUYU_ANDROID_KEY_PASSWORD=\"$(cat \"$work/key-password\")\"\nalias=\"$(cat \"$work/alias\")\"\napksigner=\"$TUYUFACTORY_ANDROID_BUILD_TOOLS/apksigner\"\n\"$apksigner\" sign --ks \"$work/release.keystore\" --ks-pass env:TUYU_ANDROID_STORE_PASSWORD --key-pass env:TUYU_ANDROID_KEY_PASSWORD --v4-signing-enabled false --ks-key-alias \"$alias\" --out \"$TUYUFACTORY_WORK_DIR/signed.apk\" \"$TUYUFACTORY_WORK_DIR/candidate.apk\"\nnode scripts/build_client.mjs android \"$TUYUFACTORY_WORK_DIR/signed.apk\" \"$TUYUFACTORY_WORK_DIR/tuyufactory-client.apk\" \"$TUYUFACTORY_WORK_DIR/application\" signed\ncp \"$TUYUFACTORY_WORK_DIR/tuyufactory-client.apk\" \"$RELEASE_DIR/payload/tuyufactory-client.apk\"\ncp \"$TUYUFACTORY_WORK_DIR/application/build/app/outputs/bundle/release/app-release.aab\" \"$RELEASE_DIR/payload/tuyufactory-client.aab\"\n# 仅移除旧JAR签名封装，保留META-INF中的许可证和其它上游元数据。\nsignature_cleanup=0\nzip -d \"$RELEASE_DIR/payload/tuyufactory-client.aab\" 'META-INF/*.SF' 'META-INF/*.RSA' 'META-INF/*.DSA' 'META-INF/*.EC' >/dev/null || signature_cleanup=$?\ntest \"$signature_cleanup\" = 0 || test \"$signature_cleanup\" = 12\njarsigner -keystore \"$work/release.keystore\" -storepass:env TUYU_ANDROID_STORE_PASSWORD -keypass:env TUYU_ANDROID_KEY_PASSWORD \"$RELEASE_DIR/payload/tuyufactory-client.aab\" \"$alias\"\n\"$apksigner\" verify --verbose \"$RELEASE_DIR/payload/tuyufactory-client.apk\"\njarsigner -verify \"$RELEASE_DIR/payload/tuyufactory-client.aab\"\nnode scripts/build_client.mjs --artifact android \"$RELEASE_DIR/payload/tuyufactory-client.aab\" \"$TUYUFACTORY_WORK_DIR/application\" signed\ntest \"$(apkanalyzer manifest application-id \"$RELEASE_DIR/payload/tuyufactory-client.apk\")\" = com.tuyufactory.client\n(cd \"$RELEASE_DIR/payload\" && zip -X \"$RELEASE_DIR/tuyufactory-client-android.zip\" tuyufactory-client.apk tuyufactory-client.aab)\nnode scripts/build_client.mjs --artifact android \"$RELEASE_DIR/tuyufactory-client-android.zip\" \"$TUYUFACTORY_WORK_DIR/application\" signed\n"
  },
  "8": {
    "shell": "bash",
    "source": "node <<'NODE'\nconst { createHash } = require('node:crypto'); const fs = require('node:fs'); const root = process.env.RELEASE_DIR;\nconst hash = (name) => createHash('sha256').update(fs.readFileSync(`${root}/${name}`)).digest('hex');\nconst asset = 'tuyufactory-client-android.zip';\nconst manifest = { product_id: 'tuyufactory', platform: 'client-android', software_version: process.env.SOFTWARE_VERSION, git_commit_sha: process.env.SOURCE_SHA, ci_run_id: Number(process.env.CI_RUN_ID), package_name: 'com.tuyufactory.client', assets: [{ name: asset, sha256: hash(asset) }] };\nfs.writeFileSync(`${root}/release-manifest.json`, `${JSON.stringify(manifest, null, 2)}\\n`);\nfs.writeFileSync(`${root}/SHA256SUMS`, `${hash(asset)}  ${asset}\\n${hash('release-manifest.json')}  release-manifest.json\\n`);\nNODE\nnode \"$GITHUB_WORKSPACE/scripts/client/release/android/index.mjs\" publish-release\n"
  },
  "9": {
    "shell": "bash",
    "source": "set -euo pipefail\nplatform=android\nnode \"$GITHUB_WORKSPACE/scripts/client/ci/$platform/index.mjs\" cleanup\n"
  },
  "10": {
    "shell": "bash",
    "source": "# 仅登记本产品平台资产目录；不占有或覆盖已有候选。\nnode --input-type=module <<'NODE_RELEASE_DIR'\nimport {appendFileSync, existsSync, lstatSync, realpathSync} from 'node:fs';\nimport {isAbsolute, join, relative, sep} from 'node:path';\nconst value = process.env.RUNNER_TEMP;\nif (!value || !isAbsolute(value) || /[\\r\\n\\0]/.test(value)) throw new Error('Release缺少准确Runner临时根');\nconst temporary = realpathSync(value), source = realpathSync(process.env.GITHUB_WORKSPACE);\nconst contains = (left, right) => {\n  const value = relative(left, right);\n  return value === '' || (value !== '..' && !value.startsWith('..' + sep) && !isAbsolute(value));\n};\nconst status = lstatSync(temporary);\nif (!status.isDirectory() || status.isSymbolicLink() || contains(source, temporary)\n    || contains(temporary, source)) throw new Error('Release临时根与源码交叠或经过链接');\nconst output = join(temporary, 'tuyufactory-client-android-release');\nif (existsSync(output)) throw new Error('Release资产目标已存在，拒绝覆盖');\nappendFileSync(process.env.GITHUB_ENV, 'RELEASE_DIR=' + output + '\\n');\nNODE_RELEASE_DIR\n"
  }
});
function runExactWorkflowStep(index){requireExactRemoteJobEnvironment();if(!/^(?:0|[1-9][0-9]*)$/.test(String(index||''))||!Object.hasOwn(workflowSteps,String(index)))throw new Error('准确远端Job阶段无效');const step=workflowSteps[String(index)];const command=step.shell==='pwsh'?'pwsh':(process.platform==='win32'?'bash':'/bin/bash');const args=step.shell==='pwsh'?['-NoLogo','-NoProfile','-NonInteractive','-Command',step.source]:['--noprofile','--norc','-e','-o','pipefail','-c',step.source];const result=runExactProcess(command,args,{cwd:process.cwd(),env:process.env,stdio:'inherit'});if(result.error)throw new Error('准确远端Job阶段无法启动');if(result.status!==0)process.exitCode=Number.isInteger(result.status)?result.status:1;}

requireExactRemoteJobEnvironment();
validateCandidate();
if(process.argv[2]==='validate-inputs') process.exit(0);
if(process.argv[2]!=='workflow-step')throw new Error('准确Release Job只接受workflow-step');
runExactWorkflowStep(process.argv[3]);
