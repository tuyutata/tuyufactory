import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { testRoot as tmpdir } from './build.mjs';
import test from 'node:test';

// 真实执行本产品Build入口。夹具仅替代平台编译器和已由project.test验真的视图装配，不下载或签名。
const product = 'tuyufactory';
function fixture(t) {
  const base = mkdtempSync(join(realpathSync(tmpdir()), product + '-build-'));
  const owner = lstatSync(base);
  t.after(() => { assert.equal(lstatSync(base).ino, owner.ino); rmSync(base, {recursive:true}); });
  const source = join(base, product), work = join(base, 'work'), project = join(work, 'project');
  const build = join(work, 'compiled'), tools = join(base, 'tools');
  for (const path of [join(source, 'scripts'), project, build, tools, join(project, 'android'), join(tools, 'bin')]) mkdirSync(path, {recursive:true});
  copyFileSync(new URL('./build-local.sh', import.meta.url), join(source, 'scripts/build-local.sh'));
  const scripts = ['tuyulove', 'tuyulife'].includes(product) ? join(source, 'scripts') : join(source, 'app/scripts');
  mkdirSync(scripts, {recursive:true});
  writeFileSync(join(scripts, 'project.mjs'),
    'if (process.env.FIXTURE_VIEW_FAIL === "yes") throw Error("view failed");\n' +
    'export function resolveFirstPartyDependencies(){return {citizen_sdk:{root:"fixture-provider"}};}\n' +
    'export function verifyProject(){}\n');
  writeFileSync(join(source, 'scripts/verify.mjs'), 'if (process.env.FIXTURE_VERIFY_FAIL === "yes") throw Error("payload failed");\n');
  const flutter = join(tools, 'bin/flutter');
  writeFileSync(flutter, '#!' + realpathSync(process.execPath) + '\n' +
    'const fs=require("node:fs"),p=require("node:path"),a=process.argv.slice(2);\n' +
    'fs.appendFileSync(process.env.FIXTURE_LOG,JSON.stringify(a)+"\\n");\n' +
    'if(a[0]==="--version"){process.stdout.write(process.env.FIXTURE_BAD_VERSION==="yes"?"{}":JSON.stringify({frameworkVersion:"3.44.2",channel:"stable",repositoryUrl:"https://github.com/flutter/flutter",frameworkRevision:"abc",engineRevision:"def",dartSdkVersion:"3.12.2"}));process.exit(0);}\n' +
    'if(process.env.FIXTURE_COMPILE_FAIL==="yes")process.exit(19);\n' +
    'if(a[0]==="build"&&a[1]==="ios"&&process.env.FIXTURE_MISSING_OUTPUT!=="yes"){const app=p.join(process.env.BUILD_DIR,"ios/iphoneos/Runner.app");fs.mkdirSync(p.join(app,"Frameworks/CitizenSDK.framework"),{recursive:true});fs.writeFileSync(p.join(app,"Frameworks/CitizenSDK.framework/CitizenSDK"),"compiled fixture");}\n', {mode:0o755});
  const gradle = join(tools, 'bin/gradle');
  writeFileSync(gradle, '#!' + realpathSync(process.execPath) + '\n' +
    'const fs=require("node:fs"),p=require("node:path");fs.appendFileSync(process.env.FIXTURE_LOG,JSON.stringify(process.argv.slice(2))+"\\n");if(process.env.FIXTURE_COMPILE_FAIL==="yes")process.exit(19);if(process.env.FIXTURE_MISSING_OUTPUT!=="yes"){const f=p.join(process.env.BUILD_DIR,"app/outputs/flutter-apk/app-release.apk");fs.mkdirSync(p.dirname(f),{recursive:true});fs.writeFileSync(f,"compiled apk fixture");}\n', {mode:0o755});
  const init = join(work, 'gradle-init'); writeFileSync(init, 'fixture\n');
  const log = join(work, 'compiler.log');
  const environment = {...process.env, NODE:realpathSync(process.execPath), FLUTTER:flutter,
    GRADLE:gradle, JAVA_HOME:tools, ANDROID_HOME:tools, GRADLE_INIT_SCRIPT:init, BUILD_DIR:build, FIXTURE_LOG:log};
  for (const name of ['PYTHON', 'CODESIGN', 'NODE_OPTIONS', 'NODE_PATH']) delete environment[name];
  const ios = product.startsWith('tuyul') ? 'ios' : 'client-ios';
  const android = product.startsWith('tuyul') ? 'android' : 'client-android';
  const run = (platform=ios, extra={}, args=[platform, project, work]) => {
    if (platform === android) {
      // Android必须调用真实组装与SDK校验入口，不能把缺脚本或缺导出误算为SDK拒绝。
      for (const name of ['build_client.mjs', 'verify.mjs']) copyFileSync(new URL('./' + name, import.meta.url), join(source, 'scripts', name));
      mkdirSync(join(project, '.dart_tool'), {recursive:true});
      writeFileSync(join(project, '.dart_tool/package_config.json'), JSON.stringify({packages:[]}));
    }
    return spawnSync('/bin/bash', [join(source, 'scripts/build-local.sh'), ...args],
      {env:{...environment,TUYU_PLATFORM:platform.replace(/^client-/, ''),...extra},encoding:'utf8'});
  };
  return {source,work,project,build,tools,flutter,log,environment,ios,android,run};
}

test('iOS实际编译无签名候选；工具失败、缺产物及验真失败均阻止收口', t => {
  const f=fixture(t), result=f.run(); assert.equal(result.status,0,result.stderr);
  assert.ok(readFileSync(join(f.work,'ios.app.zip')).length>0);
  const invocations=readFileSync(f.log,'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(invocations[0], ['build','ios','--release','--no-codesign', ...(product.startsWith('tuyul')?[]:['--target','lib/main_client.dart'])]);
  for(const extra of [{FIXTURE_COMPILE_FAIL:'yes'},{FIXTURE_MISSING_OUTPUT:'yes'}, ...(product==='tuyufactory'?[{FIXTURE_VERIFY_FAIL:'yes'}]:[])]){
    const g=fixture(t), failed=g.run(g.ios,extra); assert.notEqual(failed.status,0,failed.stderr); assert.equal(existsSync(join(g.work,'ios.app.zip')),false);
  }
});

test('输入失败在编译前拒绝，已存在候选不得覆盖', t => {
  for(const kind of ['platform','source-output','build-output','tool-link','tool-relative','missing-tool','view','existing']){
    const f=fixture(t);let platform=f.ios,extra={},args;
    if(kind==='platform')platform='invalid';
    if(kind==='source-output')args=[platform,f.project,f.source];
    if(kind==='build-output')extra.BUILD_DIR=join(f.project,'compiled');
    if(kind==='tool-link'){const link=join(f.tools,'flutter-link');symlinkSync(f.flutter,link);extra.FLUTTER=link;}
    if(kind==='tool-relative')extra.FLUTTER='./flutter';
    if(kind==='missing-tool')extra.FLUTTER=join(f.tools,'missing');
    if(kind==='view')extra.FIXTURE_VIEW_FAIL='yes';
    if(kind==='existing')writeFileSync(join(f.work,'ios.app.zip'),'keep');
    const result=f.run(platform,extra,args);assert.notEqual(result.status,0,kind);assert.equal(existsSync(f.log),false,kind);
    if(kind==='existing')assert.equal(readFileSync(join(f.work,'ios.app.zip'),'utf8'),'keep');
  }
});

test('Android实际Gradle接收完整版本定义，缺字段和编译失败阻止APK收口', t => {
  const f=fixture(t), result=f.run(f.android);
  if(product.startsWith('tuyul')){assert.equal(result.status,0,result.stderr);assert.equal(readFileSync(join(f.work,'android.apk'),'utf8'),'compiled apk fixture');}
  else {
    assert.notEqual(result.status,0,'无SDK的合成APK必须由产品后置验真拒绝');
    assert.match(result.stderr, /厂家SDK必须唯一解析/u);
    assert.doesNotMatch(result.stderr, /ERR_MODULE_NOT_FOUND|does not provide an export/u);
    assert.equal(existsSync(join(f.work,'android.apk')), false);
  }
  const lines=readFileSync(f.log,'utf8').trim().split('\n').map(JSON.parse);
  const args=lines.find(x=>x.includes('assembleRelease'));assert.ok(args);
  const encoded=args.find(x=>x.startsWith('-Pdart-defines=')).slice('-Pdart-defines='.length);
  assert.equal(encoded.split(',').length,6);assert.equal(Buffer.from(encoded.split(',')[0],'base64').toString(),'FLUTTER_VERSION=3.44.2');
  for(const extra of [{FIXTURE_BAD_VERSION:'yes'}, {FIXTURE_COMPILE_FAIL:'yes'}, {FIXTURE_MISSING_OUTPUT:'yes'}]){
    const g=fixture(t);assert.notEqual(g.run(g.android,extra).status,0);assert.equal(existsSync(join(g.work,'android.apk')),false);
  }
});
