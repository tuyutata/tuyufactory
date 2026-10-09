#!/usr/bin/env node
import { remoteEnvironment as productRemoteEnvironment } from '../../../../build.mjs';
if(!(process.env.NODE_TEST_CONTEXT && process.argv.length === 2)&&process.env.GITHUB_ACTIONS==='true'&&String(process.env.GITHUB_WORKFLOW||'').startsWith('tuyufactory.'))Object.assign(process.env,productRemoteEnvironment());
import { spawnSync as runExactProcess } from 'node:child_process';
function validateCandidate(){const value=process.env;
if(!/^[0-9a-f]{40}$/.test(value.SOURCE_SHA||'')||!/^[1-9][0-9]*$/.test(value.CI_RUN_ID||'')||!/^\d+\.\d{1,2}\.\d{1,2}$/.test(value.SOFTWARE_VERSION||'')||value.VERSION_TAG!=='tuyufactory-client-ios-v'+value.SOFTWARE_VERSION)throw Error('准确Release候选无效');}

// 本文件只执行 tuyufactory.client-ios.release 的 factory-client-ios Job；阶段编号由本仓唯一 Workflow 固定，禁止接收其它身份。
export const EXACT_REMOTE_JOB_IDENTITY = Object.freeze({"pipeline":"tuyufactory.client-ios.release","job":"factory-client-ios"});

function requireExactRemoteJobEnvironment() {
  const expected = 'tuyutata/tuyufactory';
  if (!expected || process.env.GITHUB_REPOSITORY !== expected) {
    throw new Error('准确远端Job仓库身份无效');
  }
}
const workflowSteps = Object.freeze({
  "0": {
    "shell": "bash",
    "source": "set -euo pipefail\ntest -f app/lib/main_client.dart || { echo '途遇厂家分机端缺少产品入口：app/lib/main_client.dart' >&2; exit 1; }\nplatform=ios\ntest -d \"app/$platform\" || { echo \"途遇厂家分机端缺少产品平台工程：$platform\" >&2; exit 1; }\n"
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
    "source": "# 安装后先验真，再统一准备目标平台缓存与受控修订。\nflutter --version --machine >/dev/null\nplatform=\"ios\"\nflutter --version >/dev/null\n# 原生SDK消费与厂家Flutter同一已验真的工具原件；不取Runner默认版本。\nnode --input-type=module <<'NODE_FLUTTER_ROOT'\nimport {appendFileSync, existsSync, realpathSync} from 'node:fs';\nimport {join} from 'node:path';\nif (!process.env.FLUTTER_ROOT || /[\\r\\n\\0]/.test(process.env.FLUTTER_ROOT)) throw new Error('厂家缺少已验真的Flutter根');\nconst root = realpathSync(process.env.FLUTTER_ROOT);\nif (!existsSync(join(root, 'bin/flutter'))) throw new Error('厂家Flutter工具原件缺失');\nappendFileSync(process.env.GITHUB_ENV, 'CITIZENSDK_FLUTTER_ROOT=' + root + '\\nFLUTTER_ROOT=' + root + '\\n');\nNODE_FLUTTER_ROOT\n"
  },
  "4": {
    "shell": "bash",
    "source": "node --input-type=module <<'NODE'\nimport {appendFileSync, realpathSync} from 'node:fs';\nimport {join} from 'node:path';\nconst platform = 'ios';\nconst work = join(realpathSync(process.env.RUNNER_TEMP), 'tuyufactory-client-' + platform);\nappendFileSync(process.env.GITHUB_ENV, 'TUYUFACTORY_WORK_DIR=' + work + '\\nFLUTTER_TARGET=lib/main_client.dart\\nTUYU_FACTORY_PRODUCT=client\\n');\nNODE\n"
  },
  "5": {
    "shell": "bash",
    "source": "node \"$GITHUB_WORKSPACE/scripts/client/release/ios/factory-client-ios/execute.mjs\" validate-inputs"
  },
  "6": {
    "shell": "bash",
    "source": "node \"$GITHUB_WORKSPACE/scripts/client/ci/ios/index.mjs\" build-release"
  },
  "7": {
    "shell": "bash",
    "source": "set -euo pipefail\numask 077\nwork=\"$TUYUFACTORY_WORK_DIR/signing\"\nmkdir \"$work\"\nkeychain=\"$work/release.keychain-db\"\ntrap 'security delete-keychain \"$keychain\" >/dev/null 2>&1 || true; rm -rf \"$work\"' EXIT\nnode \"$GITHUB_WORKSPACE/scripts/client/ci/ios/index.mjs\" claim-release\nkeychain_password=\"$(openssl rand -hex 32)\"\npython3 - \"$work\" <<'PY'\nimport base64, os, pathlib, re, sys\nroot = pathlib.Path(sys.argv[1]); fields = {}\nfor raw in os.environ.get(\"IOS_KEY\", \"\").splitlines():\n    line = raw.strip()\n    if not line or line.startswith(\"#\"): continue\n    name, sep, value = line.partition(\"=\")\n    if not sep or name.strip() in fields or not value.strip(): raise SystemExit(\"IOS_KEY 行格式无效\")\n    fields[name.strip()] = value.strip()\nif set(fields) != {\"pkcs12\", \"password\", \"certificate_sha1\"}: raise SystemExit(\"IOS_KEY 字段集合无效\")\nif not re.fullmatch(r\"[0-9A-F]{40}\", fields[\"certificate_sha1\"]): raise SystemExit(\"Apple Distribution 证书摘要无效\")\ntry:\n    pkcs12 = base64.b64decode(fields[\"pkcs12\"], validate=True)\n    profile = base64.b64decode(os.environ.get(\"IOS_PROVISIONING_PROFILE\", \"\"), validate=True)\nexcept ValueError as exc: raise SystemExit(\"iOS 签名材料 Base64 无效\") from exc\nif not 1024 <= len(pkcs12) <= 32 * 1024 * 1024 or not 1024 <= len(profile) <= 1024 * 1024: raise SystemExit(\"iOS 签名材料大小无效\")\n(root / \"distribution.p12\").write_bytes(pkcs12); (root / \"password\").write_text(fields[\"password\"])\n(root / \"certificate-sha1\").write_text(fields[\"certificate_sha1\"]); (root / \"profile.mobileprovision\").write_bytes(profile)\nPY\nsecurity create-keychain -p \"$keychain_password\" \"$keychain\"\nsecurity unlock-keychain -p \"$keychain_password\" \"$keychain\"\nsecurity list-keychains -d user -s \"$keychain\"\nsecurity import \"$work/distribution.p12\" -k \"$keychain\" -P \"$(cat \"$work/password\")\" -T /usr/bin/codesign\nsecurity set-key-partition-list -S apple-tool:,apple:,codesign: -s -k \"$keychain_password\" \"$keychain\" >/dev/null\ncertificate_sha1=\"$(cat \"$work/certificate-sha1\")\"\nsecurity find-identity -v -p codesigning \"$keychain\" | grep -Fq \"$certificate_sha1\"\n/usr/bin/openssl smime -verify -inform DER -in \"$work/profile.mobileprovision\" -noverify -out \"$work/profile.plist\" >/dev/null\nteam_id=\"$(/usr/libexec/PlistBuddy -c 'Print :TeamIdentifier:0' \"$work/profile.plist\")\"\ntest \"$(/usr/libexec/PlistBuddy -c 'Print :Entitlements:application-identifier' \"$work/profile.plist\")\" = \"$team_id.com.tuyufactory.client\"\n# 厂家发现主机所需权限必须被真实分机描述文件授予，不能只留在源码entitlements。\ntest \"$(/usr/libexec/PlistBuddy -c 'Print :Entitlements:com.apple.developer.networking.multicast' \"$work/profile.plist\")\" = true\npython3 - \"$work/profile.plist\" <<'PY'\nimport datetime, plistlib, sys\nwith open(sys.argv[1], 'rb') as profile_file:\n    profile = plistlib.load(profile_file)\nexpiration = profile.get('ExpirationDate')\nif not isinstance(expiration, datetime.datetime) or expiration <= datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None):\n    raise SystemExit('厂家分机描述文件已过期或缺少有效期')\nif profile.get('Entitlements', {}).get('get-task-allow') is not False:\n    raise SystemExit('厂家分机正式描述文件不能允许调试')\nPY\nplutil -extract Entitlements xml1 -o \"$work/entitlements.plist\" \"$work/profile.plist\"\napp=\"$TUYUFACTORY_WORK_DIR/Candidate.app\"\ntest \"$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' \"$app/Info.plist\")\" = com.tuyufactory.client\ncp \"$work/profile.mobileprovision\" \"$app/embedded.mobileprovision\"\nfind \"$app\" -type f -name '*.dylib' -print0 | while IFS= read -r -d '' item; do codesign --force --sign \"$certificate_sha1\" --keychain \"$keychain\" --timestamp=none \"$item\"; done\nfind \"$app\" -type d \\( -name '*.framework' -o -name '*.appex' \\) -print0 | while IFS= read -r -d '' item; do codesign --force --sign \"$certificate_sha1\" --keychain \"$keychain\" --timestamp=none \"$item\"; done\ncodesign --force --sign \"$certificate_sha1\" --keychain \"$keychain\" --timestamp=none --generate-entitlement-der --entitlements \"$work/entitlements.plist\" \"$app\"\ncodesign --verify --deep --strict \"$app\"\nnode scripts/build_client.mjs ios \"$app\" \"$TUYUFACTORY_WORK_DIR/Signed.app\" \"$TUYUFACTORY_WORK_DIR/application\" signed\nmkdir -p \"$work/package/Payload\" && cp -R \"$TUYUFACTORY_WORK_DIR/Signed.app\" \"$work/package/Payload/Runner.app\"\n(cd \"$work/package\" && ditto -c -k --keepParent Payload \"$RELEASE_DIR/tuyufactory-client-ios.ipa\")\nnode scripts/build_client.mjs --artifact ios \"$RELEASE_DIR/tuyufactory-client-ios.ipa\" \"$TUYUFACTORY_WORK_DIR/application\" signed\n"
  },
  "8": {
    "shell": "bash",
    "source": "node <<'NODE'\nconst { createHash } = require('node:crypto'); const fs = require('node:fs'); const root = process.env.RELEASE_DIR;\nconst hash = (name) => createHash('sha256').update(fs.readFileSync(`${root}/${name}`)).digest('hex');\nconst asset = 'tuyufactory-client-ios.ipa';\nconst manifest = { product_id: 'tuyufactory', platform: 'client-ios', software_version: process.env.SOFTWARE_VERSION, git_commit_sha: process.env.SOURCE_SHA, ci_run_id: Number(process.env.CI_RUN_ID), bundle_id: 'com.tuyufactory.client', assets: [{ name: asset, sha256: hash(asset) }] };\nfs.writeFileSync(`${root}/release-manifest.json`, `${JSON.stringify(manifest, null, 2)}\\n`);\nfs.writeFileSync(`${root}/SHA256SUMS`, `${hash(asset)}  ${asset}\\n${hash('release-manifest.json')}  release-manifest.json\\n`);\nNODE\nnode \"$GITHUB_WORKSPACE/scripts/client/release/ios/index.mjs\" publish-release\n"
  },
  "9": {
    "shell": "bash",
    "source": "set -euo pipefail\nplatform=ios\nnode \"$GITHUB_WORKSPACE/scripts/client/ci/$platform/index.mjs\" cleanup\n"
  },
  "10": {
    "shell": "bash",
    "source": "# 仅登记本产品平台资产目录；不占有或覆盖已有候选。\nnode --input-type=module <<'NODE_RELEASE_DIR'\nimport {appendFileSync, existsSync, lstatSync, realpathSync} from 'node:fs';\nimport {isAbsolute, join, relative, sep} from 'node:path';\nconst value = process.env.RUNNER_TEMP;\nif (!value || !isAbsolute(value) || /[\\r\\n\\0]/.test(value)) throw new Error('Release缺少准确Runner临时根');\nconst temporary = realpathSync(value), source = realpathSync(process.env.GITHUB_WORKSPACE);\nconst contains = (left, right) => {\n  const value = relative(left, right);\n  return value === '' || (value !== '..' && !value.startsWith('..' + sep) && !isAbsolute(value));\n};\nconst status = lstatSync(temporary);\nif (!status.isDirectory() || status.isSymbolicLink() || contains(source, temporary)\n    || contains(temporary, source)) throw new Error('Release临时根与源码交叠或经过链接');\nconst output = join(temporary, 'tuyufactory-client-ios-release');\nif (existsSync(output)) throw new Error('Release资产目标已存在，拒绝覆盖');\nappendFileSync(process.env.GITHUB_ENV, 'RELEASE_DIR=' + output + '\\n');\nNODE_RELEASE_DIR\n"
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

test('tuyufactory.client-ios.release的factory-client-ios远端Job物理独立', () => {
  const source = readFileSync(new URL('./execute.mjs', import.meta.url), 'utf8');
  assert.ok(source.includes('{"pipeline":"tuyufactory.client-ios.release","job":"factory-client-ios"}'));
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
    const output = join(temporary, 'tuyufactory-client-ios-release');
    const environment = { ...process.env, PATH: dirname(process.execPath) + delimiter + process.env.PATH,
      GITHUB_REPOSITORY: 'tuyutata/tuyufactory', GITHUB_WORKSPACE: source, RUNNER_TEMP: temporary,
      GITHUB_ENV: envFile, SOURCE_SHA: 'a'.repeat(40), CI_RUN_ID: '1',
      SOFTWARE_VERSION: '1.0.0', VERSION_TAG: 'tuyufactory-client-ios-v1.0.0' };
    const execute = new URL('./execute.mjs', import.meta.url);
    const run = env => execFileSync(process.execPath, [fileURLToPath(execute), 'workflow-step', '10'],
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
