import { remoteEnvironment as productRemoteEnvironment } from './build.mjs';
if(process.env.GITHUB_ACTIONS==='true'&&String(process.env.GITHUB_WORKFLOW||'').startsWith('tuyufactory.'))Object.assign(process.env,productRemoteEnvironment());
import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { testRoot } from './build.mjs';
const tmpdir=()=>testRoot('client-macos');
import { spawnSync } from 'node:child_process';
import { crc32 } from 'node:zlib';
import test from 'node:test';
import { packageTarget, packageBinary, packageSignature, verifyPackageFiles, packageDestination } from './verify.mjs';
import { apkFiles, bundleIdentity } from './build_client.mjs';

// 只在内存构造格式合同字节，不生成或声称已生成任何平台安装包。
function binary(platform) {
  const value = Buffer.alloc(256);
  if (platform === 'windows') {
    value.writeUInt16LE(0x5a4d); value.writeUInt32LE(64, 0x3c);
    value.writeUInt32LE(0x4550, 64); value.writeUInt16LE(0x8664, 68); value.writeUInt16LE(0x20b, 88);
  } else if (['ios', 'macos'].includes(platform)) {
    value.writeUInt32LE(0xfeedfacf); value.writeUInt32LE(0x100000c, 4); value.writeUInt32LE(2, 12);
    value.writeUInt32LE(1, 16); value.writeUInt32LE(24, 20); value.writeUInt32LE(0x32, 32);
    value.writeUInt32LE(24, 36); value.writeUInt32LE(platform === 'ios' ? 2 : 1, 40);
  } else {
    value.writeUInt32BE(0x7f454c46); value[4] = 2; value[5] = 1; value[6] = 1;
    value.writeUInt16LE(3, 16); value.writeUInt16LE(platform === 'linux-amd' ? 62 : 183, 18);
    value.writeUInt32LE(1, 20); value.writeUInt16LE(64, 52);
  }
  return value;
}

function fixture(role, platform) {
  const entries = new Map(), target = packageTarget(role, platform), data = Buffer.from('{}');
  const add = path => entries.set(path, /\.(so|dll|exe|dylib)$/.test(path) ? binary(platform) : data);
  const prefix = platform === 'macos' ? 'Contents/' : '';
  const executable = platform === 'macos' ? `Contents/MacOS/${role === 'host' ? 'TuyuFactory' : 'TuyuFactoryClient'}` :
    platform === 'ios' ? 'Runner' : platform === 'android' ? 'lib/arm64-v8a/libapp.so' :
    platform === 'windows' ? `tuyufactory${role === 'client' ? '_client' : ''}.exe` : 'tuyufactory';
  entries.set(executable, binary(platform));
  const apple = ['macos', 'ios'].includes(platform);
  const assets = apple ? `${prefix}Frameworks/App.framework/${platform === 'macos' ? 'Resources/' : ''}flutter_assets/` :
    platform === 'android' ? 'assets/flutter_assets/' : 'data/flutter_assets/';
  for (const file of ['manifest.json', 'chainspec.json', 'light_sync_state.json']) add(`${assets}packages/citizen_sdk/chain/${file}`);
  for (const file of apple ? [`${prefix}Frameworks/CitizenSDK.framework/CitizenSDK`] :
    platform === 'android' ? ['lib/arm64-v8a/libcitizensdk.so', 'lib/arm64-v8a/libcitizensdk_jni.so'] :
    platform === 'windows' ? ['citizensdk.dll', 'citizensdk_host.dll', 'citizen_sdk_plugin.dll'] :
    ['lib/libcitizensdk.so', 'lib/libcitizensdk_host.so', 'lib/libcitizen_sdk_plugin.so']) entries.set(file, binary(platform));
  if (role === 'host') {
    const runtime = platform === 'macos' ? 'Contents/Resources/runtime/' : 'runtime/';
    add(platform === 'macos' ? 'Contents/Frameworks/libtuyufactory_native.dylib' : platform === 'windows' ? 'tuyufactory_native.dll' : 'lib/libtuyufactory_native.so');
    for (const file of ['schema.sql', 'business/runtime.lock.json', 'business/bench/apps/frappe/LICENSE', 'business/bench/apps/erpnext/license.txt', 'business/bench/sites/assets/assets.json']) add(runtime + file);
    for (const file of platform === 'windows' ? ['postgresql/bin/postgres.exe', 'business/python/python.exe', 'business/node/node.exe'] :
      ['postgresql/bin/postgres', 'business/python/bin/python3', 'business/node/bin/node']) entries.set(runtime + file, binary(platform));
  } else if (platform === 'windows') {
    for (const file of ['msedgewebview2.exe', 'msedge.dll', 'icudtl.dat', 'resources.pak']) add('data/webview2/' + file);
  }
  return {entries, target, executable, check: (values = entries, identity = target.applicationId) => verifyPackageFiles(role, platform, values, identity, executable)};
}

for (const [role, platforms] of Object.entries({host: ['macos','windows','linux-arm','linux-amd'], client: ['macos','windows','ios','android']})) {
  for (const platform of platforms) {
    test(`${role}/${platform}：准确组件通过，每个必需组件缺失拒绝`, () => {
      const f = fixture(role, platform);
      assert.doesNotThrow(() => f.check());
      // 新包必须消费SDK唯一chain目录；旧资源目录不能替代必需文件。
      const oldAssets = new Map([...f.entries].map(([path, bytes]) => [
        path.replace('packages/citizen_sdk/chain/', 'packages/citizen_sdk/assets/citizenchain/'), bytes,
      ]));
      assert.throws(() => f.check(oldAssets), /缺少/);
      for (const path of f.entries.keys()) {
        const missing = new Map(f.entries); missing.delete(path);
        assert.throws(() => f.check(missing), /缺少/);
      }
      assert.throws(() => f.check(f.entries, role === 'host' ? 'com.tuyufactory.client' : 'com.tuyufactory'), /身份/);
    });
    test(`${role}/${platform}：每个原生组件错架构和截断均拒绝`, () => {
      const f = fixture(role, platform);
      for (const [path, bytes] of f.entries) {
        if (bytes.length !== 256) continue;
        for (const wrong of [binary(platform === 'windows' ? 'macos' : 'windows'), bytes.subarray(0, 8)]) {
          const entries = new Map(f.entries); entries.set(path, wrong);
          assert.throws(() => f.check(entries));
        }
      }
    });
  }
}

test('client拒绝主机目录、改名的导出库；完整SDK自身数据库允许保留', () => {
  for (const platform of ['macos','windows','ios','android']) {
    const f = fixture('client', platform);
    for (const path of ['runtime/postgresql/data/file', 'business/node/node.exe', 'business/python/bin/python3', 'other/frappe/code.py', 'any/schema.sql', 'factory_runtime.py', 'tuyufactory_native.dll']) {
      assert.throws(() => f.check([...f.entries, [path, Buffer.from('{}')]]), /主机/);
    }
    const renamed = Buffer.concat([binary(platform), Buffer.from('tuyufactory_initialize_administrator')]);
    assert.throws(() => f.check([...f.entries, ['innocent', renamed]]), /主机/);
    assert.doesNotThrow(() => f.check([...f.entries, ['sdk/light-node/state.db', Buffer.from('{}')]]));
  }
});

test('包路径、大小写碰撞、开发覆盖和秘密文件一律拒绝', () => {
  const f = fixture('client', 'windows');
  for (const path of ['../outside','/absolute','a\\b','a//b','./file','.git/config','pubspec_overrides.yaml','dev/private.key','CITIZENSDK.DLL']) {
    assert.throws(() => f.check([...f.entries, [path, Buffer.alloc(0)]]));
  }
});

test('角色与平台闭集无默认值；Apple设备与模拟器同架构也不能互换', () => {
  for (const [role, platform] of [['','macos'],['host','ios'],['client','linux-arm'],['client','linux-amd'],['__proto__','macos'],['host','windows-x86-64']]) assert.throws(() => packageTarget(role, platform));
  assert.throws(() => packageBinary(binary('macos'), 'ios', 'wrong-platform'));
  const simulator = binary('ios'); simulator.writeUInt32LE(7, 40);
  assert.throws(() => packageBinary(simulator, 'ios', 'simulator'));
  const f = fixture('client', 'macos');
  for (const magic of [0xfeedface,0xcefaedfe,0xcafebabf,0xbfbafeca,0xcafebabe,0xbebafeca]) {
    const wrong = Buffer.alloc(256); wrong.writeUInt32BE(magic);
    assert.throws(() => f.check([...f.entries, ['renamed-binary', wrong]]));
  }
});

test('Windows原生运行包允许产品直接调用并使用产品目录', () => {
  const source = readFileSync(new URL('./build_windows_x86_64.ps1', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /env:CI -ne|未登记本机构建入口/u);
  assert.match(source, /TUYUFACTORY_WORK_DIR/u);
  assert.match(source, /TUYUFACTORY_BUILD_DIR/u);
  assert.match(source, /TUYUFACTORY_DEPENDENCY_DIR/u);
  assert.match(source, /attempt -le 3/u);
});

test('输出只要求位于当前产品源码外工作目录', () => {
  const work = join(realpathSync(tmpdir()), 'tuyufactory-test', 'client', 'macos');
  assert.doesNotThrow(() => packageDestination(
    work, work + '/uncreated.app', 'client', 'macos', {},
  ));
  // 系统临时根若经符号链接，原始路径必须拒绝，不能削弱生产校验。
  if (tmpdir() !== realpathSync(tmpdir())) {
    const linked = join(tmpdir(), 'tuyufactory-test', 'client', 'macos');
    assert.throws(() => packageDestination(linked, linked + '/uncreated.app', 'client', 'macos', {}), /符号链接/);
  }
  for (const output of [
    resolve(import.meta.dirname, '..', 'app'),
    work,
    work + '/../escape',
  ]) {
    assert.throws(() => packageDestination(work, output, 'client', 'macos', {}));
  }
});

// 构造无落盘ZIP供真实解析函数检验长度、越界和内容，不生成伪APK文件。
function zip(name, value = Buffer.from('test')) {
  const filename = Buffer.from(name), local = Buffer.alloc(30), central = Buffer.alloc(46), end = Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50); local.writeUInt32LE(value.length,18); local.writeUInt32LE(value.length,22); local.writeUInt16LE(filename.length,26);
  central.writeUInt32LE(0x02014b50); central.writeUInt32LE(value.length,20); central.writeUInt32LE(value.length,24); central.writeUInt16LE(filename.length,28);
  local.writeUInt32LE(crc32(value),14); central.writeUInt32LE(crc32(value),16);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1,8); end.writeUInt16LE(1,10); end.writeUInt32LE(central.length+filename.length,12); end.writeUInt32LE(local.length+filename.length+value.length,16);
  return Buffer.concat([local,filename,value,central,filename,end]);
}

test('真实APK ZIP解析：正确内容、截断、路径穿越、加密和超限', () => {
  const valid = zip('assets/file');
  assert.equal([...apkFiles(valid)][0][1].toString(), 'test');
  for (const name of ['../escape','/absolute','a\\b']) assert.throws(() => [...apkFiles(zip(name))]);
  for (const length of [0,21,valid.length-1]) assert.throws(() => [...apkFiles(valid.subarray(0,length))]);
  for (const [offset, value] of [[8,1],[24,0x7fffffff],[42,0xffffffff]]) {
    const wrong = Buffer.from(valid), central = valid.readUInt32LE(valid.length-6);
    if (offset === 8) wrong.writeUInt16LE(value, central+offset); else wrong.writeUInt32LE(value, central+offset);
    assert.throws(() => [...apkFiles(wrong)]);
  }
});

test('ZIP损坏CRC、非法文件类型及逃逸链接拒绝，Apple内部相对链接允许', () => {
  const corrupted=zip('asset'); corrupted[35]^=1;
  assert.throws(()=>[...apkFiles(corrupted)]);
  for(const target of ['/outside','../../outside','C:\\outside']) {
    const value=zip('app/link',Buffer.from(target)), at=value.readUInt32LE(value.length-6);
    value.writeUInt32LE(0xa0000000,at+38);
    assert.throws(()=>[...apkFiles(value,{links:true})]);
  }
  const good=zip('App.app/Versions/Current',Buffer.from('A')), at=good.readUInt32LE(good.length-6);
  good.writeUInt32LE(0xa0000000,at+38);
  assert.equal([...apkFiles(good,{links:true})][0][2],true);
  assert.throws(()=>[...apkFiles(good)]);
  good.writeUInt32LE(0x20000000,at+38);
  assert.throws(()=>[...apkFiles(good,{links:true})]);
});

test('AAB读取官方protobuf清单，拒绝重复身份、主机身份和截断字段', () => {
  const field=(id,value)=>Buffer.concat([Buffer.from([id*8+2,value.length]),value]);
  const text=(id,value)=>field(id,Buffer.from(value));
  const attribute=value=>field(4,Buffer.concat([text(2,'package'),text(3,value)]));
  const node=attributes=>field(1,Buffer.concat([text(3,'manifest'),...attributes]));
  const bytes=node([attribute('com.tuyufactory.client')]);
  assert.equal(bundleIdentity(bytes),'com.tuyufactory.client');
  const f=fixture('client','android');
  assert.throws(()=>f.check(f.entries,bundleIdentity(node([attribute('com.tuyufactory')]))),/身份/);
  assert.throws(()=>bundleIdentity(node([attribute('com.tuyufactory.client'),attribute('com.tuyufactory.client')])));
  for(const length of [0,1,bytes.length-1]) assert.throws(()=>bundleIdentity(bytes.subarray(0,length)));
  for(const value of ['',undefined,'unsigned','release']) assert.throws(()=>packageSignature(value));
  assert.equal(packageSignature('payload'),'payload'); assert.equal(packageSignature('signed'),'signed');
});

test('上游锁核对subtree目录、必要文件和子模块残留', () => {
  const source=readFileSync(new URL('verify.mjs',import.meta.url),'utf8');
  const body=source.slice(source.indexOf('export function verifyFactorySources('),source.indexOf('\nexport function verifySdkPlugin')).replace('export function','function');
  const revision='a'.repeat(40), components=['imported/erpnext','imported/frappe'].map(path=>({path,revision,required_files:['license']}));
  for(const failure of ['', 'mode','missing','metadata','registered','required']) {
    const files=new Set(['/factory/tuyufactory.sources.json','/factory/.gitmodules','/factory/imported/erpnext','/factory/imported/frappe','/factory/imported/erpnext/license','/factory/imported/frappe/license']);
    if(failure==='missing')files.delete('/factory/imported/frappe');
    if(failure==='metadata')files.add('/factory/imported/frappe/.git');
    if(failure==='required')files.delete('/factory/imported/frappe/license');
    const check=new Function('readFileSync','join','existsSync','lstatSync',body+';return verifyFactorySources;')(
      path=>path==='/factory/tuyufactory.sources.json'?JSON.stringify({dependency_mode:failure==='mode'?'git_submodule':'git_subtree',components}):failure==='registered'?'path = imported/frappe':'',
      (...parts)=>parts.join('/').replaceAll('//','/'),path=>files.has(path),()=>({isDirectory:()=>true,isSymbolicLink:()=>false}));
    if(failure)assert.throws(()=>check('/factory'));else assert.doesNotThrow(()=>check('/factory'));
  }
});

test('Apple候选与正式包走同一载荷校验，只有正式阶段强制真实codesign', async () => {
  const source=readFileSync(new URL('verify.mjs',import.meta.url),'utf8');
  const body=source.slice(source.indexOf('export async function verifyPackage('),source.indexOf('\nexport function verifyBinary')).replace('export async function','async function');
  const f=fixture('client','ios');
  for(const signature of ['payload','signed']) {
    const commands=[];
    const runner=new Function('packageSignature','packageTarget','execFileSync','join','verifyPackageFiles','packageFiles','process',body+';return verifyPackage;')(
      packageSignature,packageTarget,(file,args)=>{commands.push(file);if(file.includes('plutil'))return JSON.stringify({CFBundleIdentifier:'com.tuyufactory.client',CFBundleExecutable:'Runner',UIDeviceFamily:[1,2],NSBonjourServices:['_tuyufactory._tcp'],NSLocalNetworkUsageDescription:'用途'});},
      (...parts)=>parts.join('/'),verifyPackageFiles,()=>f.entries,{platform:'darwin'});
    await runner('/App.app','client','ios',{signature});
    assert.equal(commands.includes('/usr/bin/codesign'),signature==='signed');
  }
});

test('厂家SDK仅有同一Git锁定来源与本轮Pub视图', () => {
  const manifest = readFileSync(new URL('../app/pubspec.yaml', import.meta.url), 'utf8');
  const lock = readFileSync(new URL('../app/pubspec.lock', import.meta.url), 'utf8');
  for (const content of [manifest, lock]) {
    assert.match(content, /https:\/\/github\.com\/crcfrcn\/citizensdk\.git/u);
    assert.match(content, /52b83f8f33a9424f3a92161da4f183678263ab7c/u);
  }
  const preparer = readFileSync(new URL('./sdk-dependencies.mjs', import.meta.url), 'utf8');
  assert.match(preparer, /createProject/u);
  assert.match(preparer, /--enforce-lockfile/u);
  assert.match(preparer, /contract\.source\.ref/u);
  assert.doesNotMatch(preparer, /mode === '(?:local|public)'/u);
  const project = readFileSync(new URL('../app/scripts/project.mjs', import.meta.url), 'utf8');
  assert.match(project, /assertFlutterSourceView/u);
  assert.match(project, /prepareNativeProject/u);
  assert.match(project, /error\.retainSdkStage \|\| error\.status === 75/u);
});

test('Linux真实CMake解释入口和平台匹配，不调用编译器也不生成文件', () => {
  const source = readFileSync(new URL('../app/linux/flutter/CMakeLists.txt', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('# 读取Flutter'), source.indexOf('# TODO:'));
  for (const [entry, cpu, platform, ok] of [['lib/main_host.dart','aarch64','linux-arm64',true], ['lib/main_host.dart','x86_64','linux-x64',true],
    ['lib/main_client.dart','aarch64','linux-arm64',false], ['lib/main_host.dart','aarch64','linux-x64',false],['','aarch64','linux-arm64',false]]) {
    const script = `function(check)\nset(PROJECT_DIR /task/app)\nset(FLUTTER_TARGET "${entry}")\nset(CMAKE_SYSTEM_PROCESSOR ${cpu})\nset(FLUTTER_TARGET_PLATFORM ${platform})\n${body}\nendfunction()\ncheck()\n`;
    const result = spawnSync('cmake', ['-P','/dev/stdin'], {input:script, encoding:'utf8'});
    assert.equal(result.status === 0, ok, result.stderr);
  }
});

test('厂家client源码递归不引用主机FFI，平台身份和主机包入口保持严格', () => {
  const root = new URL('../app/lib/', import.meta.url), pending = ['main_client.dart'], seen = new Set();
  while (pending.length) {
    const path = pending.pop(); if (seen.has(path)) continue; seen.add(path);
    assert.ok(path === 'main_client.dart' || path.startsWith('client/') || path.startsWith('shared/'));
    const source = readFileSync(new URL(path, root), 'utf8').replace(/\/\*[\s\S]*?\*\/|^\s*\/\/[^\n]*/gm, '');
    assert.doesNotMatch(source, /(?:import|export).*['"](?:dart:ffi|package:ffi\/)/);
    for (const directive of source.matchAll(/(?:import|export|part(?!\s+of))\s+([^;]+);/g)) {
      for (const literal of directive[1].matchAll(/['"]([^'"]+)['"]/g)) {
        const value = literal[1];
        if (value.startsWith('package:tuyufactory/')) pending.push(value.slice('package:tuyufactory/'.length));
        else if (!value.includes(':')) pending.push(new URL(value, new URL(path, root)).pathname.slice(root.pathname.length));
      }
    }
  }
  assert.ok(seen.has('client/app.dart'));
  const verify = readFileSync(new URL('verify_macos.sh', import.meta.url), 'utf8');
  assert.match(verify, /--package "\$APP" host macos/);
});

test('真实client组装控制流：来源失败不写入，复制和终检失败仅删除本次目标', () => {
  const source = readFileSync(new URL('build_client.mjs', import.meta.url), 'utf8');
  const script = `
import assert from 'node:assert/strict';
import {SourceTextModule,SyntheticModule,createContext} from 'node:vm';
const source=${JSON.stringify(source)};
for(const failure of ['', 'destination', 'sdk', 'input', 'mkdir', 'copy', 'output', 'replaced']) {
 const events=[], work='/task/client', input=work+'/input', output=work+'/output';
 const context=createContext({process:{argv:[],env:{}},Buffer,URL});
 async function synthetic(values){const m=new SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});await m.link(()=>{});await m.evaluate();return m;}
 const fs={closeSync(){},openSync(){throw Error('unexpected');},writeFileSync(){},readFileSync(){throw Error('unexpected');},
  lstatSync(){return {dev:1,ino:failure==='replaced'&&events.includes('copy')?2:1,isSymbolicLink:()=>false};},realpathSync:path=>path,
  mkdirSync(path){events.push('mkdir');if(failure==='mkdir')throw Error('occupied');},
  cpSync(from,to){assert.equal(from,input);assert.equal(to,output);events.push('copy');if(['copy','replaced'].includes(failure))throw Error('copy');},
  rmSync(path){assert.equal(path,output);events.push('remove');}};
 const verify={packageTarget(){},packageSignature(){},packageInside:(root,path)=>path.startsWith(root+'/'),packageDestination(){if(failure==='destination')throw Error('destination');},
  verifySdkDependency(){if(failure==='sdk')throw Error('sdk');},verifyPackageFiles(){throw Error('unexpected');},
  async verifyPackage(path){events.push(path===input?'input':'output');if(failure===(path===input?'input':'output'))throw Error('invalid');}};
 const module=new SourceTextModule(source,{context,initializeImportMeta(meta){meta.url='file:///product/build_client.mjs';}});
 await module.link(async name=>synthetic(name==='node:fs'?fs:name==='./verify.mjs'?verify:await import(name)));
 await module.evaluate();
 const run=()=>module.namespace.buildClient('macos',input,output,'/application',{TUYUFACTORY_WORK_DIR:work},'signed');
 if(failure)await assert.rejects(run);else assert.equal(await run(),output);
 assert.equal(events.includes('remove'),['copy','output'].includes(failure));
 if(['destination','sdk','input'].includes(failure))assert.ok(!events.includes('mkdir'));
}
`;
  const result = spawnSync(process.execPath, ['--experimental-vm-modules','--input-type=module','-'], {input:script, encoding:'utf8'});
  assert.equal(result.status, 0, result.stderr);
});

test('真实SDK来源只接受产品锁定Git原件及当前Pub视图', () => {
  const source = readFileSync(new URL('verify.mjs', import.meta.url), 'utf8');
  const dependency = source.slice(source.indexOf('export function verifySdkDependency('),
    source.indexOf('\nexport function packageSignature'));
  assert.match(dependency, /resolveFirstPartyDependencies\(original, work\)/u);
  assert.match(dependency, /verifyProject\(\{ source: original, work, output: application, platform \}\)/u);
  assert.match(dependency, /\.source-packages\/citizen_sdk/u);
  assert.match(dependency, /entries\.length !== 1/u);
  assert.doesNotMatch(dependency, /contract\.modes|pubspec_overrides|\/Users\//u);
});

test('Windows真实路径后代判断和EXE/SDK分离身份校验', () => {
  const source = readFileSync(new URL('verify.mjs', import.meta.url), 'utf8');
  const f = fixture('client', 'windows');
  f.entries.set(f.executable, Buffer.concat([binary('windows'),Buffer.from('TUYU.TuyuFactory.Client\0','utf16le')]));
  f.entries.set('citizen_sdk_plugin.dll', Buffer.concat([binary('windows'),Buffer.from('com.tuyufactory.client\0')]));
  const serialized = [...f.entries].map(([path,value])=>[path,value.toString('base64')]);
  const script = `
import assert from 'node:assert/strict';
import {win32} from 'node:path';
import {SourceTextModule,SyntheticModule,createContext} from 'node:vm';
const files=new Map(${JSON.stringify(serialized)}.map(([path,value])=>[path,Buffer.from(value,'base64')]));
const root='D:\\\\product\\\\target\\\\client-windows\\\\test\\\\fixture', output=root+'\\\\output';
let identityFailure=false;
const context=createContext({process:{argv:[],env:{},platform:'win32',arch:'x64'},Buffer,URL,console});
async function synthetic(values){const m=new SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});await m.link(()=>{});await m.evaluate();return m;}
const fs={...await import('node:fs'),realpathSync:p=>p,
 lstatSync(path){if(path===output){const error=Error('absent');error.code='ENOENT';throw error;}return {isSymbolicLink:()=>false,isDirectory:()=>!files.has(win32.relative(root,path).replaceAll('\\\\','/')),isFile:()=>files.has(win32.relative(root,path).replaceAll('\\\\','/'))};},
 readFileSync(path){const name=win32.relative(root,path).replaceAll('\\\\','/');if(identityFailure&&name==='citizen_sdk_plugin.dll')return Buffer.from('com.tuyufactory\\0');return files.get(name);},
 readdirSync(path){const prefix=win32.relative(root,path).replaceAll('\\\\','/');const base=prefix?prefix+'/':'';return [...new Set([...files.keys()].filter(p=>p.startsWith(base)).map(p=>p.slice(base.length).split('/')[0]))];}};
const module=new SourceTextModule(${JSON.stringify(source)},{context,initializeImportMeta(meta){meta.url='file:///D:/product/scripts/verify.mjs';meta.dirname='D:/product/scripts';}});
await module.link(async name=>synthetic(name==='node:fs'?fs:name==='node:path'?win32:name==='../app/scripts/project.mjs'?await import(${JSON.stringify(new URL('../app/scripts/project.mjs', import.meta.url).href)}):await import(name)));
await module.evaluate();
module.namespace.packageDestination(root,output,'client','windows',{GITHUB_ACTIONS:'true',RUNNER_TEMP:'D:\\\\runner\\\\temp'});
await module.namespace.verifyPackage(root,'client','windows',{signature:'payload'});
identityFailure=true;await assert.rejects(()=>module.namespace.verifyPackage(root,'client','windows',{signature:'payload'}),/SDK插件/);
`;
  const result = spawnSync(process.execPath,['--experimental-vm-modules','--input-type=module','-'],{input:script,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});

// 字符串内脚本也必须交给Node解析，外层语法检查不能覆盖其错误。
for (const platform of ['android', 'ios', 'macos', 'windows']) {
  test(`client/${platform}：SDK准备脚本无重复声明`, () => {
    const source = readFileSync(new URL(`client/ci/${platform}/index.mjs`, import.meta.url), 'utf8');
    const match = source.match(/const prepareCitizenSdkSource = (\[[\s\S]*?\])\.join\(/);
    assert.ok(match);
    const script = JSON.parse(match[1]).join('\n');
    const result = spawnSync(process.execPath, ['--input-type=module', '--check'], {input: script, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
  });
}

// 导入真实CI模块且核对Release的实际相对入口，不能用存在的流程身份代替模块可加载性。
test('厂家桌面Release只导入本角色平台实际CI入口，Windows依赖模块可加载', async () => {
  for (const [role, platforms] of [['client', ['macos', 'windows']], ['host', ['macos', 'windows', 'linux-arm', 'linux-amd']]]) {
    for (const platform of platforms) {
      const ci = await import(new URL('./' + role + '/ci/' + platform + '/index.mjs', import.meta.url));
      assert.equal(typeof ci[role === 'host' ? 'buildHost' : 'buildCandidate'], 'function');
      const release = readFileSync(new URL('./' + role + '/release/' + platform + '/index.mjs', import.meta.url), 'utf8');
      assert.ok(release.includes("from '../../ci/" + platform + "/index.mjs'"));
      assert.ok(!release.includes("from './ci.mjs'"));
    }
  }
  const dependency = await import(new URL('./dependencies.mjs', import.meta.url));
  assert.equal(typeof dependency.prepareWebView2SDK, 'function');
  assert.equal(typeof dependency.prepareWebView2, 'function');
});

// 检查内嵌正文，防止外层JSON字符串语法正确却不能实际执行。
test('厂家八个CI Job的Flutter与分机工作目录登记正文可解析', () => {
  const jobs = [
    ['client','android'],['client','ios'],['client','macos'],['client','windows'],
    ['host','linux-amd'],['host','linux-arm'],['host','macos'],['host','windows'],
  ];
  for (const [role, platform] of jobs) {
    const source = readFileSync(new URL(role+'/ci/'+platform+'/factory-'+role+'-'+platform+'/execute.mjs', import.meta.url), 'utf8');
    const marker = 'const workflowSteps = Object.freeze(';
    const start = source.indexOf(marker) + marker.length;
    const end = source.indexOf('\n});', start) + 2;
    const steps = JSON.parse(source.slice(start, end));
    for (const step of Object.values(steps)) {
      const pattern = /(?:^|\n)[^\n]*\bnode\b[^\n]*<<\s*['"]?([A-Za-z_][A-Za-z_0-9]*)['"]?[^\n]*\n/gu;
      for (const match of step.source.matchAll(pattern)) {
        const begin = match.index + match[0].length;
        const ending = new RegExp('^' + match[1] + '\\s*$', 'mu').exec(step.source.slice(begin));
        assert.ok(ending, role+'/'+platform+'缺少正文结束标记');
        const code = step.source.slice(begin, begin + ending.index);
        const result = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: code, encoding: 'utf8' });
        assert.equal(result.status, 0, role+'/'+platform+': '+result.stderr);
      }
    }
  }
});
