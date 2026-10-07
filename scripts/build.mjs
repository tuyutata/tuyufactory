#!/usr/bin/env node
// 本产品独立拥有资源需求、工程准备与编译；公开回执仅提供验真资源，不提供执行命令。
import {spawn} from 'node:child_process';
import {AsyncLocalStorage} from 'node:async_hooks';
import {Socket} from 'node:net';
import {chmodSync,closeSync,openSync,renameSync,readlinkSync,unlinkSync,copyFileSync,existsSync,lstatSync,mkdirSync,readFileSync,readdirSync,realpathSync,symlinkSync,writeFileSync} from 'node:fs';
import {dirname,isAbsolute,join,parse,relative,resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const contract=JSON.parse(readFileSync(join(root,'scripts/flows.json'),'utf8'));
const product=contract.product_id, prefix=product.toUpperCase();
const inside=(base,path)=>{const r=relative(base,path);return r===''||!isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+sep);};
const fail=message=>{throw Error(product+' Build：'+message);};
export function checkWork(work) {
 if(typeof work!=='string'||!isAbsolute(work)||resolve(work)!==work||work===parse(work).root||!inside(join(root,'target'),work)||work===join(root,'target'))fail('工作根必须是本产品target内的规范目录');
 const parts=relative(join(root,'target'),work).split(sep);
 if(Object.keys(contract.platforms).length>1&&!Object.hasOwn(contract.platforms,parts[0]))fail('工作根平台未由本产品声明');
 const flow=parts[Object.keys(contract.platforms).length>1?1:0];
 if(!['build','ci','release','publish','test','tmp'].includes(flow))fail('工作根流程职责无效');
 let at=parse(work).root;for(const part of relative(at,work).split(sep)){at=join(at,part);const s=lstatSync(at);if(!s.isDirectory()||s.isSymbolicLink())fail('工作根经过链接或非目录');}return work;
}
// 产品自己拥有target工作边界；测试与独立入口也不借用调用方的全局缓存。
export function productTarget(platform) {
 platformContract(platform);
 return join(root,'target',...(Object.keys(contract.platforms).length===1?[]:[platform]));
}
export function temporaryRoot(platform=Object.keys(contract.platforms)[0],scope='test',suppliedInput=process.env.TMPDIR) {
 if(!['test','tmp','build','ci','release','publish'].includes(scope))fail('临时目录职责无效');
 const endpoint=productTarget(platform),supplied=suppliedInput?resolve(suppliedInput):undefined;
 const directory=supplied&&supplied!==endpoint&&inside(endpoint,supplied)?supplied:join(endpoint,scope);
 let at=parse(directory).root;
 for(const part of relative(at,directory).split(sep)){
  at=join(at,part);if(!existsSync(at))mkdirSync(at,{mode:0o700});
  const info=lstatSync(at);if(!info.isDirectory()||info.isSymbolicLink())fail('工作目录经过链接或非目录');
 }
 checkWork(directory);return directory;
}
// 测试继承当前平台现场；独立执行没有任务身份时才选产品首个平台。
export const testRoot=platform=>{
 const workflow=String(process.env.GITHUB_WORKFLOW||'').split('.');
 const local=process.env.TMPDIR?relative(join(root,'target'),resolve(process.env.TMPDIR)).split(sep)[0]:undefined;
 const inherited=workflow[0]===product&&Object.hasOwn(contract.platforms,workflow[1])?workflow[1]
  :Object.hasOwn(contract.platforms,local)?local:undefined;
 return temporaryRoot(platform||inherited||Object.keys(contract.platforms)[0],'test');
};
// 远端Runner基础设施仍归GitHub；本产品步骤的可写临时目录归准确平台流程target。
export function remoteEnvironment(environment=process.env) {
 const [id,platform,flow,...extra]=String(environment.GITHUB_WORKFLOW||'').split('.');
 if(id!==product||extra.length||!Object.hasOwn(contract.platforms,platform)||!['ci','release'].includes(flow))fail('远端临时目录缺少准确产品平台流程身份');
 const temporary=temporaryRoot(platform,flow,null);
 return {...environment,RUNNER_TEMP:temporary,TMPDIR:temporary,TMP:temporary,TEMP:temporary};
}

// 展开来源根由本产品指定，调用者不识别任何产品来源名称。
export function resourceSourceRoot(name,work){checkWork(work);if(!/^[a-z][a-z0-9_]*$/u.test(name))fail('来源名称无效');return join(work,'git-sources',name);}
export function platformContract(platform) {
 if(!Object.hasOwn(contract.platforms,platform))fail('平台未声明');
 return contract.platforms[platform];
}
const sourceRoot=()=>existsSync(join(root,'app/pubspec.yaml'))?join(root,'app'):root;
const nativePlatform=platform=>platform.endsWith('android')?'Android':platform.includes('linux-arm')?'LinuxARM':platform.includes('linux-amd')?'LinuxAMD':platform.endsWith('windows')?'Windows':'macOS';
const osPlatform=platform=>platform.includes('linux-')?'linux':platform.replace(/^(?:host|client)-/u,'');

// 只读声明与原始锁；每个第一方Git来源必须同时匹配固定URL、40位提交和resolved-ref。
export function lockedSources() {
 const source=sourceRoot(),path=join(source,'pubspec.yaml');if(!existsSync(path))return [];
 const manifest=readFileSync(path,'utf8'),lock=readFileSync(join(source,'pubspec.lock'),'utf8'),result=[];
 for(const name of ['citizen_sdk','tatachat_sdk']) {
  const block=text=>[...text.matchAll(new RegExp('^  '+name+':\\r?\\n(?: {4,}[^\\n]*\\n|[ \\t]*\\n)+','gm'))];
  const a=block(manifest),b=block(lock);if(!a.length)continue;
  if(a.length!==1||b.length!==1)fail('Git来源记录不唯一');
  const value=(text,key)=>{const m=[...text.matchAll(new RegExp('^ +'+key+':\\s*([^\\n]+)$','gm'))];if(m.length!==1)fail('Git来源字段不唯一');return m[0][1].trim().replace(/^["']|["']$/gu,'');};
  const url=value(a[0][0],'url'),ref=value(a[0][0],'ref');
  if(!/^https:\/\/github\.com\/[a-z0-9-]+\/[a-z0-9-]+\.git$/u.test(url)||!/^[a-f0-9]{40}$/u.test(ref)
   ||value(a[0][0],'path')!=='.'||value(b[0][0],'url')!==url||value(b[0][0],'resolved-ref')!==ref||value(b[0][0],'ref')!==ref)fail('Git声明和锁不一致');
  result.push({name,url,ref});
 }return result;
}
export function requirements(platform,work) {
 checkWork(work);const declared=platformContract(platform);
 const locks=declared.locks.map(value=>({...value})),sources=lockedSources(),archives=[];
 for(const source of sources) {
  const packageRoot=join(work,'git-sources',source.name);
  if(existsSync(packageRoot)) {
   const path=source.name==='citizen_sdk'?'Cargo.lock':'native/Cargo.lock';
   locks.push({ecosystem:'cargo',path,source_package:source.name});
   if(source.name==='citizen_sdk') {
    const lock=JSON.parse(readFileSync(join(packageRoot,'scripts/dependencies.lock.json'),'utf8'));
    const p=nativePlatform(platform);
    const entries=[['zxing-cpp',lock.environment['zxing-cpp']],...((p==='LinuxARM'||p==='LinuxAMD')?Object.entries(lock.native.sources):p==='Windows'?[['sqlite',lock.native.sources.sqlite]]:[])];
    for(const [name,value]of entries)archives.push({ecosystem:'native',name,...value,group:'sdk-native'});
   }
  }
 }
 // Apple依赖方式由本产品源码决定；有Podfile就必须有原始锁，纯SwiftPM无需CocoaPods。
 const apple=platform.endsWith('ios')?'ios':platform.endsWith('macos')?'macos':null;
 if(apple){const base=sourceRoot(),pod=join(base,apple,'Podfile'),lock=join(base,apple,'Podfile.lock');
  if(existsSync(pod)){if(!existsSync(lock))fail('CocoaPods原始锁缺失：'+relative(root,lock));locks.push({ecosystem:'cocoapods',path:relative(root,lock)});}
  else {const project=[join(base,apple,'Runner.pbxproj'),join(base,apple,'Runner.xcodeproj/project.pbxproj')].find(existsSync);
   if(!project||!readFileSync(project,'utf8').includes('FlutterGeneratedPluginSwiftPackage'))fail('Apple工程缺少明确依赖方式');}
 }
 // 原生源归档坐标归本产品已有声明；准备后才提出展开源码的Cargo锁。
 for(const lock of declared.locks){const file=join(root,lock.path);if(!existsSync(file)||!lstatSync(file).isFile()||lstatSync(file).isSymbolicLink())fail('原始锁缺失或带链接：'+lock.path);}
 return {schema:1,product_id:product,platform,tools:declared.tools,locks,sources,archives};
}

export function resourceEnvironment(platform,work,receipt,base={}) {
 checkWork(work);const declared=platformContract(platform);
 if(!receipt||receipt.schema!==1||receipt.product_id!==product||receipt.platform!==platform||receipt.work!==work||receipt.offline!==true
  ||!receipt.tools||!receipt.dependencies||!receipt.archives)fail('资源回执身份无效');
 const env={HOME:base.HOME,USER:base.USER,LOGNAME:base.LOGNAME,LANG:'zh_CN.UTF-8',LC_ALL:'C',
  ...receipt.environment,TMPDIR:join(work,'tmp')+sep,TMP:join(work,'tmp'),TEMP:join(work,'tmp'),XDG_CACHE_HOME:join(work,'cache'),XDG_CONFIG_HOME:join(work,'config'),
  CARGO_TARGET_DIR:join(work,'work/cargo-target'),CARGO_NET_OFFLINE:'true',CARGO_INCREMENTAL:'1',
  npm_config_offline:'true',npm_config_audit:'false',npm_config_fund:'false'};
 const allowedEnvironment=new Set(['PRODUCT_WORK_DIR','PRODUCT_BASH_BIN','PRODUCT_RSYNC_BIN','PATH','DEVELOPER_DIR','SDKROOT','DART_EXECUTABLE','XCODEBUILD','CODESIGN','SECURITY','XCRUN','XCODE_SELECT','CC','CXX','SWIFT','OTOOL','INSTALL_NAME_TOOL','LIPO','MAKE','AR','RANLIB','NM','STRIP','LLVM_NM','LD','LDCXX','CARGO_TARGET_AARCH64_APPLE_DARWIN_LINKER','ANDROID_HOME','ANDROID_SDK_ROOT','ANDROID_NDK_HOME','ANDROID_USER_HOME','ANDROID_EMULATOR_HOME','GRADLE_INIT_SCRIPT','GRADLE_USER_HOME']);
 if(Object.keys(receipt.environment||{}).some(key=>!allowedEnvironment.has(key)))fail('资源回执包含未声明环境或注入变量');
 for(const tool of declared.tools) {
  const value=receipt.tools[tool.id];
  if(!value||value.version!==tool.version||typeof value.path!=='string'||!isAbsolute(value.path)||resolve(value.path)!==value.path)fail('缺少准确版本的工具：'+tool.id);
  const s=lstatSync(value.path);if(!s.isFile()||s.isSymbolicLink()||!(s.mode&0o111)||realpathSync(value.path)!==value.path)fail('工具入口必须是普通执行器：'+tool.id);
 }
 const aliases={node:'NODE',git:'GIT',flutter:'FLUTTER',rust:'RUSTC',python:'PYTHON',java:'JAVA',gradle:'GRADLE',
  cmake:'CMAKE',cocoapods:'POD',protoc:'PROTOC',zig:'ZIG','worker-build':'WORKER_BUILD','wasm-bindgen':'WASM_BINDGEN_BIN','wasm-opt':'WASM_OPT_BIN',esbuild:'ESBUILD_BIN',
  perl:'PERL',m4:'M4',bison:'BISON',flex:'FLEX',tcl:'TCLSH',gettext:'GETTEXT',openssl:'OPENSSL'};
 for(const [id,name]of Object.entries(aliases))if(receipt.tools[id])env[name]=receipt.tools[id].path;
 // POSIX旧Shell不进入正式PATH；基础工具只通过产品已验真的GNU投影交付。
 const paths=Object.entries(receipt.tools).filter(([id])=>id!=='posix').map(([,value])=>dirname(value.path));
 env.PATH=[...new Set([...paths,...(env.PATH||'').split(':')].filter(Boolean))].join(':');
 if(env.GIT)env.PRODUCT_GIT_BIN=env.GIT;
 if(env.RUSTC)env.CARGO=join(dirname(env.RUSTC),'cargo');
 if(env.FLUTTER){env.FLUTTER_ROOT=dirname(dirname(env.FLUTTER));env.DART_EXECUTABLE=join(env.FLUTTER_ROOT,'bin/cache/dart-sdk/bin/dart');}
 if(env.PYTHON)env.PYTHONHOME=dirname(dirname(env.PYTHON));
 if(env.JAVA)env.JAVA_HOME=dirname(dirname(env.JAVA));
 if(env.OPENSSL)env.TUYU_OPENSSL_PREFIX=dirname(dirname(env.OPENSSL));
 const own=receipt.dependencies.own||{};
 // 原始锁要求的目录必须显式交付，不能落入用户默认缓存。
 for(const lock of declared.locks){const key={npm:'npmCache',pub:'pubCache',cargo:'cargoHome'}[lock.ecosystem];if(key&&!own[key])fail('缺少原始锁依赖回执：'+lock.ecosystem);}
 for(const [key,name]of [['npmCache','npm_config_cache'],['pubCache','PUB_CACHE'],['cargoHome','CARGO_HOME']])if(own[key]){
  checkDependency(work,own[key]);env[name]=own[key];
 }
 env[prefix+'_WORK_DIR']=work;env[prefix+'_BUILD_WORK_DIR']=join(work,'work');env[prefix+'_DEPENDENCY_DIR']=join(work,'dependencies');
 env[prefix+'_BUILD_DIR']=join(work,'work/flutter');env[prefix+'_ARTIFACT_DIR']=work;env[prefix+'_OFFLINE']='true';
 env.BUILD_DIR=join(work,'work/flutter');env[prefix+'_NODE_BIN']=env.NODE;
 env[prefix+'_PROJECT_ROOT']=join(work,'source-view',sourceRoot().replace(/^\/+/u,''));
 env.PRODUCT_SOURCE_DIR=env[prefix+'_PROJECT_ROOT'];
 if(env.GRADLE)env[prefix+'_GRADLE_BIN']=env.GRADLE;
 env.GRADLE_INIT_SCRIPT=join(work,'work/gradle.init.gradle');env.FLUTTER_GRADLE_BUILD_DIR=join(work,'work/flutter-gradle-plugin');
 env.GRADLE_USER_HOME=join(work,'dependencies/gradle');env.CP_HOME_DIR=join(work,'dependencies/cocoapods');
 env[prefix+'_PUB_OFFLINE']='true';env.GRADLE_OPTS='-Dorg.gradle.project.android.builder.sdkDownload=false';
 if(receipt.archives.native)env.CHATSERVER_NATIVE_ARCHIVE=receipt.archives.native[0].path;
 if(receipt.archives.protocol)env.CHATSERVER_PROTOCOL_ARCHIVE=receipt.archives.protocol[0].path;
 return env;
}
function checkDependency(work,path){if(!isAbsolute(path)||resolve(path)!==path||!inside(work,path)||path===work||!lstatSync(path).isDirectory()||realpathSync(path)!==path)fail('依赖回执越界或无效');}
// 工程输入复制到本轮真实目录，保证包解析与写入均不进入正式源码；内部链接映射到同轮副本。
export function createView(source,destination) {
 if(realpathSync(source)!==source||!lstatSync(source).isDirectory()||!isAbsolute(destination)||resolve(destination)!==destination||inside(source,destination)||inside(destination,source))fail('工程输入与输出边界无效');
 let parent=dirname(destination);while(!existsSync(parent))parent=dirname(parent);
 if(!lstatSync(parent).isDirectory()||realpathSync(parent)!==parent)fail('工程输出经过链接');
 if(lstatSync(destination,{throwIfNoEntry:false}))fail('本轮工程已存在');mkdirSync(destination,{recursive:true,mode:0o700});
 const generated=new Set(['.git','.dart_tool','.gradle','.symlinks','Pods','build','target','node_modules','ephemeral','.cache','.DS_Store','swiftpm','dist','tsconfig.tsbuildinfo']);
 function visit(from,to){for(const name of readdirSync(from).sort()){if(generated.has(name))continue;const a=join(from,name),b=join(to,name),s=lstatSync(a);
  if(s.isDirectory()){mkdirSync(b);visit(a,b);}else if(s.isFile()){copyFileSync(a,b);}
  else if(s.isSymbolicLink()){const target=realpathSync(a);if(!inside(source,target)||!lstatSync(target).isFile())fail('源码链接越界');symlinkSync(join(destination,relative(source,target)),b);}else fail('源码文件类型无效');
 }}visit(source,destination);return destination;
}
// 归档坐标只接受本产品当前锁；完整性在build前核验，prepare允许稍后展开的锁。
export async function checkArchives(platform,work,receipt,complete=false) {
 const requested=(await requirements(platform,work)).archives;
 const expected=new Map(requested.map(value=>[value.group+'@'+value.name,value]));const seen=new Set();
 for(const [group,items]of Object.entries(receipt.archives)){
  if(!Array.isArray(items))fail('归档回执类型无效');
  for(const item of items){const key=group+'@'+item.name,wanted=expected.get(key);
   if(!wanted||seen.has(key)||['url','version','sha256'].some(key=>item[key]!==wanted[key])||typeof item.path!=='string'||!isAbsolute(item.path)||resolve(item.path)!==item.path||!inside(work,item.path))fail('归档回执与产品锁不一致');
   seen.add(key);const info=lstatSync(item.path);if(!info.isFile()||info.isSymbolicLink()||realpathSync(item.path)!==item.path||!info.size||createHash('sha256').update(readFileSync(item.path)).digest('hex')!==wanted.sha256)fail('锁定归档原件无效');
  }
 }
 if(complete&&seen.size!==expected.size)fail('缺少产品锁定归档回执');
}
async function stageArchives(work,receipt) {
 // 归档都来自回执；先按本产品锁回读摘要，再交给现有原生准备器，缺失时禁止下载。
 for(const item of receipt.archives['sdk-native']||[]) {
  if(createHash('sha256').update(readFileSync(item.path)).digest('hex')!==item.sha256)fail('原生归档摘要漂移');
  const directory=join(work,'sdk-native/sources/archives');mkdirSync(directory,{recursive:true});
  const suffix=new URL(item.url).pathname.endsWith('.zip')?'.zip':'.tar.gz';
  const target=join(directory,item.sha256+suffix);if(!existsSync(target))copyFileSync(item.path,target);
 }
}
// Android插件编译与Kotlin状态均属于本轮，离线标志不允许Gradle自动补资源。
export function prepareGradle(work) {
 checkWork(work);const directory=join(work,'work');mkdirSync(directory,{recursive:true,mode:0o700});
 const path=join(directory,'gradle.init.gradle');if(lstatSync(path,{throwIfNoEntry:false}))fail('本轮Gradle初始化脚本已经存在');
 writeFileSync(path,[
 'gradle.startParameter.offline = true',
 'gradle.beforeProject { project ->',
 '    def source = System.getenv("FLUTTER_GRADLE_ROOT")',
 '    def output = System.getenv("FLUTTER_GRADLE_BUILD_DIR")',
 '    if (source && output && project.rootDir.canonicalPath == new File(source).canonicalPath) {',
 '        def suffix = project.path == ":" ? "root" : project.path.substring(1).replace(":", "/")',
 '        project.layout.buildDirectory.set(new File(output, suffix))',
 '        project.extensions.extraProperties.set("kotlin.project.persistent.dir", new File(output, suffix + "/kotlin-project").path)',
 '    }',
 '}', ''].join('\n'),{mode:0o600});return path;
}
export async function prepare(platform,work,receipt,base) {
 const env=resourceEnvironment(platform,work,receipt,base),source=sourceRoot();
 if(platform.endsWith('android'))prepareGradle(work);
 for(const name of ['work','tmp','cache','config','dependencies','stage'])mkdirSync(join(work,name),{recursive:true,mode:0o700});
 await checkArchives(platform,work,receipt);await stageArchives(work,receipt);
 const {createProject}=await import(pathToFileURL(join(source,'scripts/project.mjs')));
 await createProject({source,work,output:env[prefix+'_PROJECT_ROOT'],platform:osPlatform(platform)},env);
 return {schema:1,product_id:product,platform,work};
}
export async function build(platform,work,receipt,base) {
 const env=resourceEnvironment(platform,work,receipt,base),declared=platformContract(platform);
 await checkArchives(platform,work,receipt,true);await stageArchives(work,receipt);
 const shell=receipt.tools.bash?.path;
 if(!shell)fail('缺少显式Shell资源');
 const project=env[prefix+'_PROJECT_ROOT'];

 if(/(?:ios|android|macos)$/u.test(platform))await prepareSdkNative(platform,work,project,env,receipt,shell);
 await run(env.FLUTTER,['config','--build-dir='+relative(project,env.BUILD_DIR)],env,project);
 await run(env.FLUTTER,['pub','get','--offline'],env,project);
 await buildApplication(platform,work,project,env,shell);

 return completeBuild(platform,work,receipt,env);
}

// Build准备锁定SDK的原生资源；只消费本轮归档和Cargo回执，不调用其它产品流程。
async function prepareSdkNative(platform,work,project,env,receipt,shell) {
 const source=sourceRoot(),api=await import(pathToFileURL(join(source,'scripts/project.mjs')));
 api.verifyProject({source,work,output:project,platform:osPlatform(platform)});
 const dependency=api.resolveFirstPartyDependencies(source,work).citizen_sdk;
 const sdk=dependency.root,view=join(project,'.source-packages/citizen_sdk');
 const release=await import(pathToFileURL(join(sdk,'scripts/release.mjs')));release.assertFlutterSourceView(sdk,view);
 const os=osPlatform(platform),stage=join(work,'sdk-native'),nativeWork=join(stage,'work'),output=join(stage,'output'),sources=join(stage,'sources');
 if(existsSync(nativeWork)||existsSync(output))fail('本轮SDK编译目录已经存在');
 if(!receipt.dependencies.citizen_sdk?.cargoHome)fail('缺少锁定SDK的Cargo回执');
 const child={...env,CARGO_HOME:receipt.dependencies.citizen_sdk.cargoHome,CITIZENSDK_WORK_DIR:nativeWork,CITIZENSDK_NATIVE_OUTPUT_DIR:output,
  CITIZENSDK_SOURCE_SHA:dependency.sha,CITIZENSDK_VERSION:'1.0.0',CITIZENSDK_FLUTTER_ROOT:env.FLUTTER_ROOT,
  CITIZENSDK_GRADLE:env.GRADLE,CITIZENSDK_OFFLINE:'true'};
 const lock=JSON.parse(readFileSync(join(sdk,'scripts/dependencies.lock.json'),'utf8'));
 child.CITIZENSDK_ZXING_SOURCE_DIR=join(sources,lock.environment['zxing-cpp'].archive_root);
 const expected=(receipt.archives['sdk-native']||[]);if(!expected.length)fail('缺少SDK锁定原生归档');
 for(const item of expected){const suffix=new URL(item.url).pathname.endsWith('.zip')?'.zip':'.tar.gz';
  const file=join(sources,'archives',item.sha256+suffix);if(!existsSync(file)||createHash('sha256').update(readFileSync(file)).digest('hex')!==item.sha256)fail('SDK原生归档缺失或漂移');}
 await run(env.NODE,[join(sdk,'scripts/dependencies.mjs'),'prepare-environment','--scope','citizensdk','--platform',nativePlatform(platform),'--work',sources],child);
 mkdirSync(nativeWork,{recursive:true});mkdirSync(output,{recursive:true});
 const target=os==='android'?'android':os==='ios'||os==='macos'?'apple':null;if(!target)fail('原生候选平台无效');
 await run(shell,[join(sdk,'scripts/build-native.sh'),target],child);
 if(target==='apple'){
  const framework=join(output,'apple/CitizenSDK.xcframework');
  if(!lstatSync(framework).isDirectory()||realpathSync(framework)!==framework)fail('SDK Apple候选缺失');
  const destination=join(view,'darwin/CitizenSDK.xcframework');if(existsSync(destination))fail('SDK视图已有原生候选');symlinkSync(framework,destination,'dir');
 }else{
  const core=join(output,'android/arm64-v8a');
  for(const name of ['libcitizensdk.so','libcitizensdk_jni.so']){const path=join(core,name),s=lstatSync(path);if(!s.isFile()||s.isSymbolicLink()||!s.size)fail('SDK Android双库候选无效');}
  Object.assign(env,{CITIZENSDK_ANDROID_CORE_DIR:core,CITIZENSDK_ANDROID_BUILD_DIR:join(stage,'gradle'),CITIZENSDK_SOURCE_DIR:view});
 }
}

async function buildApplication(platform,work,project,env,shell) {
  await run(shell,[join(root,'scripts/build-local.sh'),platform,project,work],env,project);
}

// 产品自有Security.framework验真器源码，只在本轮工作目录编译。
export const IOS_VERIFIER_SOURCE=[
 "import Foundation",
 "import Security",
 "import CryptoKit",
 "import Darwin",
 "struct SecurityFailure: Error { let message: String }",
 "enum ProductFileIdentity {",
 " static func identity(_ url: URL, directory: Bool) throws -> [UInt64] {",
 "  guard url.path == url.standardizedFileURL.path, url.path == url.resolvingSymlinksInPath().path else { throw SecurityFailure(message: \"产品路径经过链接\") }",
 "  var info = stat()",
 "  guard lstat(url.path, &info) == 0, (info.st_mode & S_IFMT) == (directory ? S_IFDIR : S_IFREG), directory || info.st_nlink == 1 else { throw SecurityFailure(message: \"产品路径类型或链接无效\") }",
 "  return [UInt64(info.st_dev),UInt64(info.st_ino)]",
 " }",
 "}",
 "enum ProductIOSContract {",
 "    static func iosReleaseSettings(_ project: [String: Any]) throws -> [String: Any] {",
 "        guard let objects = project[\"objects\"] as? [String: [String: Any]],",
 "              let rootID = project[\"rootObject\"] as? String, let root = objects[rootID],",
 "              let targets = root[\"targets\"] as? [String] else { throw SecurityFailure(message: \"iOS 工程结构无效\") }",
 "        func settings(_ object: [String: Any]) throws -> [String: Any] {",
 "            guard let listID = object[\"buildConfigurationList\"] as? String,",
 "                  let ids = objects[listID]?[\"buildConfigurations\"] as? [String] else {",
 "                throw SecurityFailure(message: \"iOS 工程缺少 Release 配置\")",
 "            }",
 "            let release = ids.compactMap { objects[$0] }.filter { $0[\"name\"] as? String == \"Release\" }",
 "            guard release.count == 1, let values = release[0][\"buildSettings\"] as? [String: Any] else {",
 "                throw SecurityFailure(message: \"iOS 工程 Release 配置不唯一\")",
 "            }",
 "            return values",
 "        }",
 "        let applications = targets.compactMap { objects[$0] }.filter {",
 "            $0[\"name\"] as? String == \"Runner\" && $0[\"productType\"] as? String == \"com.apple.product-type.application\"",
 "        }",
 "        guard applications.count == 1 else { throw SecurityFailure(message: \"iOS Runner 产品目标缺失或不唯一\") }",
 "        return try settings(root).merging(settings(applications[0])) { _, target in target }",
 "    }",
 "",
 "    static func iosVersion(_ value: String) throws -> [UInt64] {",
 "        guard value.range(of: \"^[0-9]+(?:\\\\.[0-9]+){0,2}$\", options: .regularExpression) != nil else {",
 "            throw SecurityFailure(message: \"iOS 应用版本格式无效\")",
 "        }",
 "        let parts = value.split(separator: \".\").compactMap { UInt64($0) }",
 "        guard parts.count == value.split(separator: \".\").count else { throw SecurityFailure(message: \"iOS 应用版本超出范围\") }",
 "        return parts + Array(repeating: 0, count: 3 - parts.count)",
 "    }",
 "",
 "    static func iosEntitlements(profile: [String: Any], team: String, bundleID: String,",
 "                                device: String, requested: [String: Any], now: Date) throws -> [String: Any] {",
 "        guard profile[\"TeamIdentifier\"] as? [String] == [team],",
 "              let prefixes = profile[\"ApplicationIdentifierPrefix\"] as? [String], prefixes.count == 1,",
 "              prefixes[0].range(of: \"^[A-Z0-9]{10}$\", options: .regularExpression) != nil,",
 "              let expiry = profile[\"ExpirationDate\"] as? Date, expiry > now,",
 "              let creation = profile[\"CreationDate\"] as? Date, creation <= now,",
 "              (profile[\"Platform\"] as? [String])?.contains(\"iOS\") == true,",
 "              (profile[\"ProvisionedDevices\"] as? [String])?.contains(device) == true,",
 "              let allowed = profile[\"Entitlements\"] as? [String: Any] else {",
 "            throw SecurityFailure(message: \"iOS profile 的团队、期限、平台或设备不匹配\")",
 "        }",
 "        let prefix = prefixes[0] + \".\"",
 "        let applicationID = prefix + bundleID",
 "        func resolve(_ value: Any) throws -> Any {",
 "            if let string = value as? String {",
 "                if string == \"$(APS_ENVIRONMENT)\",",
 "                   let aps = allowed[\"aps-environment\"] as? String,",
 "                   [\"development\", \"production\"].contains(aps) { return aps }",
 "                let resolved = string.replacingOccurrences(of: \"$(AppIdentifierPrefix)\", with: prefix)",
 "                    .replacingOccurrences(of: \"$(TeamIdentifierPrefix)\", with: team + \".\")",
 "                    .replacingOccurrences(of: \"$(PRODUCT_BUNDLE_IDENTIFIER)\", with: bundleID)",
 "                guard !resolved.contains(\"$(\"), !resolved.contains(\"${\") else {",
 "                    throw SecurityFailure(message: \"iOS entitlement 存在未解析的工程变量\")",
 "                }",
 "                return resolved",
 "            }",
 "            if let array = value as? [Any] { return try array.map(resolve) }",
 "            if let object = value as? [String: Any] { return try object.mapValues(resolve) }",
 "            return value",
 "        }",
 "        var entitlements = try requested.mapValues(resolve)",
 "        for (key, value) in [\"application-identifier\": applicationID, \"com.apple.developer.team-identifier\": team] {",
 "            if let existing = entitlements[key] {",
 "                guard let existing = existing as? String, existing == value else {",
 "                    throw SecurityFailure(message: \"iOS entitlement 产品身份不一致或类型无效\")",
 "                }",
 "            }",
 "            entitlements[key] = value",
 "        }",
 "        guard entitlements[\"get-task-allow\"] as? Bool != true else {",
 "            throw SecurityFailure(message: \"iOS Release 候选禁止调试权限\")",
 "        }",
 "        // Local device installation uses the profile's own signing class. An",
 "        // Apple Development profile requires this grant; distribution profiles",
 "        // keep it false. Product entitlements still cannot request it directly.",
 "        entitlements[\"get-task-allow\"] = allowed[\"get-task-allow\"] as? Bool == true",
 "        func permits(_ permitted: Any, _ actual: Any) -> Bool {",
 "            if let pattern = permitted as? String, let value = actual as? String {",
 "                if pattern.hasSuffix(\"*\"), !pattern.dropLast().contains(\"*\") { return value.hasPrefix(String(pattern.dropLast())) }",
 "                return pattern == value",
 "            }",
 "            if let permittedArray = permitted as? [Any], let actualArray = actual as? [Any] {",
 "                return actualArray.allSatisfy { entry in permittedArray.contains { permits($0, entry) } }",
 "            }",
 "            if let permittedObject = permitted as? [String: Any], let actualObject = actual as? [String: Any] {",
 "                return actualObject.allSatisfy { key, value in permittedObject[key].map { permits($0, value) } ?? false }",
 "            }",
 "            if let a = actual as? NSNumber, let p = permitted as? NSNumber,",
 "               CFGetTypeID(a) == CFBooleanGetTypeID(), CFGetTypeID(p) == CFBooleanGetTypeID() {",
 "                return !a.boolValue || p.boolValue",
 "            }",
 "            return (permitted as? NSObject)?.isEqual(actual) == true",
 "        }",
 "        // Profile 是授权上限，不将未请求的能力整份授予应用。",
 "        for (key, value) in entitlements {",
 "            guard let permitted = allowed[key], permits(permitted, value) else {",
 "                throw SecurityFailure(message: \"iOS profile 未授权工程请求的 entitlement\")",
 "            }",
 "        }",
 "        return entitlements",
 "    }",
 "",
 "    static func iosSignedEntitlementsMatch(_ actual: [String: Any], expected: [String: Any]) -> Bool {",
 "        var normalized = actual",
 "        // Security.framework synthesizes these aliases even when codesign receives",
 "        // only the canonical entitlement. Accept exact duplicates only; all other",
 "        // extra capabilities or value drift remain fatal.",
 "        for (aliasKey, canonicalKey) in [",
 "            (\"com.apple.application-identifier\", \"application-identifier\"),",
 "            (\"com.apple.developer.aps-environment\", \"aps-environment\"),",
 "        ] {",
 "            if let alias = normalized.removeValue(forKey: aliasKey) {",
 "                guard let canonical = normalized[canonicalKey],",
 "                      NSDictionary(object: alias, forKey: \"value\" as NSString)",
 "                        .isEqual(to: [\"value\": canonical]) else { return false }",
 "            }",
 "        }",
 "        return NSDictionary(dictionary: normalized).isEqual(to: expected)",
 "    }",
 "}",
 "",
 "struct ProductVerifier {",
 " private let fileManager = FileManager.default",
 "    private func appleRoots() throws -> [SecCertificate] {",
 "        // 仅从只读系统根钥匙串取 Apple 根，不接受用户添加的同名根证书。",
 "        var keychain: SecKeychain?",
 "        guard SecKeychainOpen(\"/System/Library/Keychains/SystemRootCertificates.keychain\", &keychain) == errSecSuccess, let keychain else {",
 "            throw SecurityFailure(message: \"无法读取 Apple 系统信任根\")",
 "        }",
 "        var result: CFTypeRef?",
 "        let query: [String: Any] = [kSecClass as String: kSecClassCertificate,",
 "            kSecMatchSearchList as String: [keychain], kSecMatchLimit as String: kSecMatchLimitAll,",
 "            kSecReturnRef as String: true]",
 "        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let certificates = result as? [SecCertificate] else {",
 "            throw SecurityFailure(message: \"Apple 系统信任根不可用\")",
 "        }",
 "        let roots = certificates.filter {",
 "            [\"Apple Root CA\", \"Apple Root CA - G2\", \"Apple Root CA - G3\"].contains(SecCertificateCopySubjectSummary($0) as String? ?? \"\")",
 "        }",
 "        guard !roots.isEmpty else { throw SecurityFailure(message: \"缺少 Apple 系统信任根\") }",
 "        return roots",
 "    }",
 "",
 "    private func decodeIOSProfile(_ data: Data, roots: [SecCertificate]) throws -> [String: Any] {",
 "        guard !data.isEmpty, data.count <= 16 * 1024 * 1024 else { throw SecurityFailure(message: \"iOS profile 大小无效\") }",
 "        var decoder: CMSDecoder?",
 "        guard CMSDecoderCreate(&decoder) == errSecSuccess, let decoder else { throw SecurityFailure(message: \"无法创建 CMS 验证器\") }",
 "        let updated = data.withUnsafeBytes { CMSDecoderUpdateMessage(decoder, $0.baseAddress!, $0.count) }",
 "        var count = 0",
 "        guard updated == errSecSuccess, CMSDecoderFinalizeMessage(decoder) == errSecSuccess,",
 "              CMSDecoderGetNumSigners(decoder, &count) == errSecSuccess, count == 1 else {",
 "            throw SecurityFailure(message: \"iOS profile CMS 签名结构无效\")",
 "        }",
 "        var status = CMSSignerStatus(rawValue: 0)!",
 "        var trust: SecTrust?",
 "        var result: OSStatus = errSecSuccess",
 "        guard CMSDecoderCopySignerStatus(decoder, 0, SecPolicyCreateBasicX509(), false, &status, &trust, &result) == errSecSuccess,",
 "              status == .valid, let trust,",
 "              SecTrustSetAnchorCertificates(trust, roots as CFArray) == errSecSuccess,",
 "              SecTrustSetAnchorCertificatesOnly(trust, true) == errSecSuccess,",
 "              SecTrustSetNetworkFetchAllowed(trust, false) == errSecSuccess,",
 "              SecTrustEvaluateWithError(trust, nil),",
 "              let chain = SecTrustCopyCertificateChain(trust) as? [SecCertificate], chain.count == 3,",
 "              SecCertificateCopySubjectSummary(chain[0]) as String? == \"Apple iPhone OS Provisioning Profile Signing\",",
 "              SecCertificateCopySubjectSummary(chain[1]) as String? == \"Apple iPhone Certification Authority\" else {",
 "            throw SecurityFailure(message: \"iOS profile 不是有效的 Apple 签名授权\")",
 "        }",
 "        var content: CFData?",
 "        guard CMSDecoderCopyContent(decoder, &content) == errSecSuccess, let content,",
 "              let profile = try PropertyListSerialization.propertyList(from: content as Data, format: nil) as? [String: Any] else {",
 "            throw SecurityFailure(message: \"iOS profile 内容无效\")",
 "        }",
 "        return profile",
 "    }",
 "",
 "    private func iosTree(_ app: URL) throws -> [URL] {",
 "        _ = try ProductFileIdentity.identity(app, directory: true)",
 "        var enumerationFailed = false",
 "        guard let enumerator = fileManager.enumerator(at: app, includingPropertiesForKeys: [.isDirectoryKey], errorHandler: { _, _ in",
 "            enumerationFailed = true",
 "            return false",
 "        }) else {",
 "            throw SecurityFailure(message: \"无法读取 iOS 应用内容\")",
 "        }",
 "        var urls: [URL] = []",
 "        for case let url as URL in enumerator {",
 "            let directory = try url.resourceValues(forKeys: [.isDirectoryKey]).isDirectory == true",
 "            _ = try ProductFileIdentity.identity(url, directory: directory)",
 "            urls.append(url)",
 "            guard urls.count <= 100_000 else { throw SecurityFailure(message: \"iOS 应用内容数量异常\") }",
 "        }",
 "        guard !enumerationFailed else { throw SecurityFailure(message: \"iOS 应用目录枚举失败，禁止使用不完整内容\") }",
 "        return urls.sorted { $0.path < $1.path }",
 "    }",
 "",
 "    private func iosTreeDigest(_ app: URL) throws -> String {",
 "        var hash = SHA256()",
 "        for url in try iosTree(app) {",
 "            hash.update(data: Data(url.path.dropFirst(app.path.count).utf8))",
 "            hash.update(data: Data([0]))",
 "            if try url.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile == true {",
 "                hash.update(data: try Data(contentsOf: url, options: .mappedIfSafe))",
 "            }",
 "        }",
 "        return hash.finalize().map { String(format: \"%02x\", $0) }.joined()",
 "    }",
 "",
 "    private func iosInfo(_ app: URL, bundleID: String) throws -> (version: String, build: String) {",
 "        let url = app.appendingPathComponent(\"Info.plist\")",
 "        _ = try ProductFileIdentity.identity(url, directory: false)",
 "        guard let info = try PropertyListSerialization.propertyList(from: Data(contentsOf: url), format: nil) as? [String: Any],",
 "              info[\"CFBundleIdentifier\"] as? String == bundleID,",
 "              info[\"CFBundlePackageType\"] as? String == \"APPL\",",
 "              (info[\"CFBundleSupportedPlatforms\"] as? [String])?.contains(\"iPhoneOS\") == true,",
 "              let executable = info[\"CFBundleExecutable\"] as? String, !executable.isEmpty,",
 "              !executable.contains(\"/\"), executable != \".\", executable != \"..\",",
 "              let version = info[\"CFBundleShortVersionString\"] as? String,",
 "              let build = info[\"CFBundleVersion\"] as? String else {",
 "            throw SecurityFailure(message: \"iOS 候选产品、平台或版本身份无效\")",
 "        }",
 "        _ = try ProductFileIdentity.identity(app.appendingPathComponent(executable), directory: false)",
 "        _ = try ProductIOSContract.iosVersion(version)",
 "        _ = try ProductIOSContract.iosVersion(build)",
 "        return (version, build)",
 "    }",
 "",
 "    private func iosCodeInformation(_ url: URL) throws -> [String: Any] {",
 "        var code: SecStaticCode?",
 "        guard SecStaticCodeCreateWithPath(url as CFURL, [], &code) == errSecSuccess, let code,",
 "              SecStaticCodeCheckValidity(code, SecCSFlags(rawValue: kSecCSStrictValidate | kSecCSCheckAllArchitectures), nil) == errSecSuccess else {",
 "            throw SecurityFailure(message: \"iOS 签名严格验证失败\")",
 "        }",
 "        var information: CFDictionary?",
 "        guard SecCodeCopySigningInformation(code, SecCSFlags(rawValue: kSecCSSigningInformation), &information) == errSecSuccess,",
 "              let information = information as? [String: Any] else {",
 "            throw SecurityFailure(message: \"iOS 签名信息无法读取\")",
 "        }",
 "        return information",
 "    }",
 "",
 "    private func validateIOSCode(_ url: URL, team: String, certificate: Data,",
 "                                 entitlements: [String: Any]? = nil) throws {",
 "        let information = try iosCodeInformation(url)",
 "        guard",
 "              information[kSecCodeInfoTeamIdentifier as String] as? String == team,",
 "              let certificates = information[kSecCodeInfoCertificates as String] as? [SecCertificate], let leaf = certificates.first,",
 "              SecCertificateCopyData(leaf) as Data == certificate else {",
 "            throw SecurityFailure(message: \"iOS 产品签名团队或证书不一致\")",
 "        }",
 "        if let entitlements {",
 "            guard let actual = information[kSecCodeInfoEntitlementsDict as String] as? [String: Any],",
 "                  ProductIOSContract.iosSignedEntitlementsMatch(actual, expected: entitlements) else {",
 "                throw SecurityFailure(message: \"iOS 产品签名 entitlement 与工程授权不一致\")",
 "            }",
 "        }",
 "    }",
 "",
 "    /// 产品Build已经完成签名；产品验证内嵌profile、证书链与实际代码签名，不读取签名私钥。",
 "    private func iosProductSigning(_ app: URL, team: String, bundleID: String, device: String,",
 "                                   requested: [String: Any]) throws -> (certificate: Data, entitlements: [String: Any]) {",
 "        let roots = try appleRoots()",
 "        let profileURL = app.appendingPathComponent(\"embedded.mobileprovision\")",
 "        _ = try ProductFileIdentity.identity(profileURL, directory: false)",
 "        let profileData = try Data(contentsOf: profileURL)",
 "        let profile = try decodeIOSProfile(profileData, roots: roots)",
 "        let entitlements = try ProductIOSContract.iosEntitlements(",
 "            profile: profile, team: team, bundleID: bundleID, device: device,",
 "            requested: requested, now: Date())",
 "        let information = try iosCodeInformation(app)",
 "        guard information[kSecCodeInfoTeamIdentifier as String] as? String == team,",
 "              let certificates = information[kSecCodeInfoCertificates as String] as? [SecCertificate],",
 "              let leaf = certificates.first,",
 "              let allowed = profile[\"DeveloperCertificates\"] as? [Data],",
 "              allowed.contains(SecCertificateCopyData(leaf) as Data),",
 "              let actual = information[kSecCodeInfoEntitlementsDict as String] as? [String: Any],",
 "              ProductIOSContract.iosSignedEntitlementsMatch(actual, expected: entitlements) else {",
 "            throw SecurityFailure(message: \"iOS 产品签名与内嵌 profile 不一致\")",
 "        }",
 "        var trust: SecTrust?",
 "        guard let policy = SecPolicyCreateWithProperties(kSecPolicyAppleCodeSigning, nil),",
 "              SecTrustCreateWithCertificates(certificates as CFArray, policy, &trust) == errSecSuccess,",
 "              let trust,",
 "              SecTrustSetAnchorCertificates(trust, roots as CFArray) == errSecSuccess,",
 "              SecTrustSetAnchorCertificatesOnly(trust, true) == errSecSuccess,",
 "              SecTrustSetNetworkFetchAllowed(trust, false) == errSecSuccess,",
 "              SecTrustEvaluateWithError(trust, nil) else {",
 "            throw SecurityFailure(message: \"iOS 产品签名证书链无效\")",
 "        }",
 "        return (SecCertificateCopyData(leaf) as Data, entitlements)",
 "    }",
 "",
 "",
 " func verify(app: URL, project: URL, device: String) throws -> [String: Any] {",
 "  _ = try ProductFileIdentity.identity(project, directory: false)",
 "  guard let objects = try PropertyListSerialization.propertyList(from: Data(contentsOf: project), format: nil) as? [String: Any] else { throw SecurityFailure(message: \"产品工程无效\") }",
 "  let settings = try ProductIOSContract.iosReleaseSettings(objects)",
 "  guard let bundle = settings[\"PRODUCT_BUNDLE_IDENTIFIER\"] as? String, let team = settings[\"DEVELOPMENT_TEAM\"] as? String,",
 "        bundle.range(of: \"^[A-Za-z0-9-]+(?:\\\\.[A-Za-z0-9-]+)+$\", options: .regularExpression) != nil,",
 "        team.range(of: \"^[A-Z0-9]{10}$\", options: .regularExpression) != nil else { throw SecurityFailure(message: \"产品签名身份无效\") }",
 "  var requested: [String: Any] = [:]",
 "  if let path = settings[\"CODE_SIGN_ENTITLEMENTS\"] as? String, !path.isEmpty {",
 "   guard !path.hasPrefix(\"/\"), !path.split(separator: \"/\").contains(\"..\"), !path.contains(\"$\") else { throw SecurityFailure(message: \"产品entitlement路径无效\") }",
 "   let base = project.pathExtension == \"pbxproj\" && project.deletingLastPathComponent().pathExtension == \"xcodeproj\" ? project.deletingLastPathComponent().deletingLastPathComponent() : project.deletingLastPathComponent()",
 "   let url = base.appendingPathComponent(path); _ = try ProductFileIdentity.identity(url, directory: false)",
 "   guard let values = try PropertyListSerialization.propertyList(from: Data(contentsOf: url), format: nil) as? [String: Any] else { throw SecurityFailure(message: \"产品entitlement无效\") }; requested = values",
 "  }",
 "  let version = try iosInfo(app, bundleID: bundle), tree = try iosTree(app)",
 "  guard !tree.contains(where: { [\"appex\",\"app\",\"xpc\"].contains($0.pathExtension) }) else { throw SecurityFailure(message: \"嵌套应用缺少独立签名声明\") }",
 "  let signing = try iosProductSigning(app, team: team, bundleID: bundle, device: device, requested: requested)",
 "  for code in tree.filter({ [\"framework\",\"dylib\"].contains($0.pathExtension) }) { try validateIOSCode(code, team: team, certificate: signing.certificate) }",
 "  try validateIOSCode(app, team: team, certificate: signing.certificate, entitlements: signing.entitlements)",
 "  guard try iosInfo(app, bundleID: bundle) == version else { throw SecurityFailure(message: \"产品版本漂移\") }",
 "  return [\"version\":version.version,\"build\":version.build,\"bundle_id\":bundle,\"team\":team,\"sha256\":try iosTreeDigest(app)]",
 " }",
 "}",
 "// 独立执行使用产品自己的安全存储；调用方可用专用宿主通道提供等价开发材料能力。",
 "func development(_ product: String, value: Data?) throws -> Data? {",
 " let service = product + \" Development\", account = \"development:DEV_KEY\"",
 " let query: [String: Any] = [kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:service,kSecAttrAccount as String:account]",
 " func read() throws -> Data? { var output: CFTypeRef?; let status = SecItemCopyMatching(query.merging([kSecReturnData as String:true]) {_,v in v} as CFDictionary,&output)",
 "  if status == errSecItemNotFound { return nil }; guard status == errSecSuccess, let data = output as? Data else { throw SecurityFailure(message: \"产品开发材料读取失败\") }; return data }",
 " if let current = try read() { return current }",
 " guard let value else { return nil }",
 " let status = SecItemAdd(query.merging([kSecValueData as String:value,kSecAttrAccessible as String:kSecAttrAccessibleWhenUnlockedThisDeviceOnly]) {_,v in v} as CFDictionary,nil)",
 " guard status == errSecSuccess || status == errSecDuplicateItem else { throw SecurityFailure(message: \"产品开发材料存储失败\") }",
 " guard let stored = try read() else { throw SecurityFailure(message: \"产品开发材料写后回读缺失\") }; return stored",
 "}",
 "do {",
 " let bytes = FileHandle.standardInput.readDataToEndOfFile()",
 " guard bytes.count <= 128 * 1024, let request = try JSONSerialization.jsonObject(with: bytes) as? [String:Any], let operation = request[\"operation\"] as? String else { throw SecurityFailure(message: \"产品安全输入无效\") }",
 " let result: Any",
 " if operation == \"ios.verify\", let app = request[\"app\"] as? String, let project = request[\"project\"] as? String, let device = request[\"device\"] as? String {",
 "  result = try ProductVerifier().verify(app: URL(fileURLWithPath:app),project:URL(fileURLWithPath:project),device:device)",
 " } else if [\"development.read\",\"development.create\"].contains(operation), let product = request[\"product_id\"] as? String, product.range(of:\"^[a-z][a-z0-9-]*$\",options:.regularExpression) != nil {",
 "  var value = (request[\"value\"] as? String).flatMap { Data(base64Encoded:$0) }; defer { if var bytes = value { bytes.resetBytes(in:0..<bytes.count) }; value = nil }",
 "  guard operation != \"development.create\" || value != nil else { throw SecurityFailure(message:\"开发材料缺失\") }",
 "  var stored = try development(product,value:value); defer { if var bytes = stored { bytes.resetBytes(in:0..<bytes.count) }; stored = nil }",
 "  result = [\"value\":stored?.base64EncodedString() as Any? ?? NSNull()]",
 " } else { throw SecurityFailure(message:\"产品安全操作未声明\") }",
 " FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject:result))",
 "} catch {",
 " // 不输出Security错误上下文、请求或材料；调用方只取得失败事实。",
 " FileHandle.standardError.write(Data(\"产品安全验真失败\\n\".utf8)); exit(1)",
 "}"
].join('\n');

// 包标识来自本产品唯一原始Android配置，不从调用方登记或另一端推导。
export function androidPackageName() {
 const directory=join(sourceRoot(),'android/app');const paths=['build.gradle.kts','build.gradle'].map(n=>join(directory,n)).filter(existsSync);
 if(paths.length!==1)fail('Android应用工程不唯一');
 const matches=[...readFileSync(paths[0],'utf8').matchAll(/\bapplicationId\s*(?:=\s*)?["']([A-Za-z0-9_.]+)["']/gu)];
 if(matches.length!==1||!/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/u.test(matches[0][1]))fail('Android应用标识无效');return matches[0][1];
}
export function androidUSBSerials(text) {
 const lines=text.trim().split(/\r?\n/u);if(lines.shift()!=='List of devices attached')fail('ADB设备列表无效');
 const serials=[],seen=new Set();for(const line of lines.filter(Boolean)){
  const parts=line.trim().split(/\s+/u),serial=parts[0];if(!parts.some(x=>x.startsWith('usb:')))continue;
  if(parts[1]!=='device'||!serial||serial.includes(':')||serial.startsWith('emulator-')||!/^[A-Za-z0-9._-]+$/u.test(serial)||seen.has(serial))fail('USB设备状态或身份无效');
  seen.add(serial);serials.push(serial);
 }if(serials.length<2)fail('多台USB目标回读不一致');return serials;
}
export function androidInstalledPath(result) {
 if(result.code===1&&!result.stdout.trim()&&!result.stderr.trim())return null;
 if(result.code!==0||result.stderr.trim()||!/^package:\/data\/app\/[A-Za-z0-9_./=+~-]+\/base\.apk\s*$/u.test(result.stdout)||result.stdout.includes('..'))fail('Android安装路径回读无效');
 return result.stdout.trim().slice('package:'.length);
}
export function androidCertificate(text) {
 const matches=[...text.matchAll(/Signer #\d+ certificate SHA-256 digest:\s*([a-fA-F0-9]{64})/gu)];
 if(matches.length!==1||!text.includes('Verified using v2 scheme (APK Signature Scheme v2): true'))fail('Android签名证书或v2验真失败');return matches[0][1].toLowerCase();
}
async function nativeVerifier(work,env) {
 const state=executions.getStore();if(state?.verifier)return state.verifier;
 const dir=join(work,'product-verifier');mkdirSync(dir,{mode:0o700});const source=join(dir,'verify.swift'),binary=join(dir,'verify');
 writeFileSync(source,IOS_VERIFIER_SOURCE,{flag:'wx',mode:0o600});
 await run(env.SWIFT,['-O','-module-cache-path',join(work,'cache/swift'),'-framework','Security','-framework','CryptoKit',source,'-o',binary],env,work);
 const digest=outputDigest(binary);
 const verify=async request=>{if(outputDigest(binary)!==digest)fail('产品安全验真器发生变化');return JSON.parse((await runBuildProcess(binary,[],env,work,{capture:true,input:JSON.stringify(request),timeout:300000})).stdout);};
 if(state)state.verifier=verify;return verify;
}
async function developmentMaterial(work,env,value) {
 const operation=value===undefined?'development.read':'development.create',host=await productHost();
 if(host)return host(operation,value);
 const verifier=await nativeVerifier(work,env);return (await verifier({operation,product_id:product,...(value===undefined?{}:{value})})).value;
}
export function parseAndroidSigning(encoded) {
 if(typeof encoded!=='string'||encoded.length>128*1024)fail('开发签名材料无效');const bytes=Buffer.from(encoded,'base64');
 try{const fields={};for(const raw of bytes.toString('utf8').split(/\r?\n/u)){const line=raw.trim();if(!line||line.startsWith('#'))continue;const at=line.indexOf('='),key=line.slice(0,at).trim(),value=line.slice(at+1).trim();if(at<1||!['keystore','password','alias','keyPassword'].includes(key)||Object.hasOwn(fields,key)||!value)fail('开发签名字段无效');fields[key]=value;}
  const keystore=Buffer.from(fields.keystore||'','base64');if(keystore.length<1024||keystore.length>64*1024||!fields.password||Buffer.byteLength(fields.password)>1024||Buffer.byteLength(fields.keyPassword||fields.password)>1024||!/^[A-Za-z0-9._-]{1,128}$/u.test(fields.alias||'development')){keystore.fill(0);fail('开发签名材料缺失');}
  return {keystore,password:fields.password,alias:fields.alias||'development',keyPassword:fields.keyPassword||fields.password};
 }finally{bytes.fill(0);}
}
async function completeAndroid(platform,work,receipt,env) {
 const packageName=androidPackageName(),sdk=env.ANDROID_HOME;
 const definitions=(await import('./resources.mjs')).resourceDeclarations().android;
 const buildTools=definitions.filter(x=>x.path.startsWith('build-tools;'));if(buildTools.length!==1)fail('Android签名工具版本不唯一');
 const signer=join(sdk,...buildTools[0].path.split(';'),'apksigner'),analyzer=join(dirname(receipt.tools['android-sdk'].path),'apkanalyzer'),adb=receipt.tools.android.path,keytool=join(dirname(env.JAVA),'keytool');
 for(const file of [signer,analyzer,adb,keytool]){const s=lstatSync(file);if(!s.isFile()||!(s.mode&0o111)||realpathSync(file)!==file)fail('Android签名安装工具入口无效');}
 const call=(file,args,extra={})=>runBuildProcess(file,args,{...env,...extra},work,{capture:true,timeout:600000});
 const candidate=join(work,'android.apk'),signed=join(work,'android.signed.apk');
 if(existsSync(signed)||!lstatSync(candidate).isFile()||realpathSync(candidate)!==candidate)fail('Android本轮候选无效');
 const manifest=async(apk,field)=>(await call(analyzer,['manifest',field,apk])).stdout.trim();
 const inspect=async(apk,certificate)=>{
  if(await manifest(apk,'application-id')!==packageName||await manifest(apk,'debuggable')!=='false')fail('Android候选产品或Release配置无效');
  const version={name:await manifest(apk,'version-name'),code:await manifest(apk,'version-code')};if(!version.name||version.name.length>128||!/^[1-9]\d*$/u.test(version.code))fail('Android候选版本无效');
  if(certificate&&androidCertificate((await call(signer,['verify','--verbose','--print-certs',apk])).stdout)!==certificate)fail('Android安装证书不一致');return version;
 };
 const version=await inspect(candidate),unsigned=await runBuildProcess(signer,['verify','--print-certs',candidate],env,work,{capture:true,accepted:[0,1],timeout:300000});
 if(unsigned.code!==1||!(unsigned.stdout+unsigned.stderr).includes('DOES NOT VERIFY'))fail('Android候选必须是未签名Release包');
 let encoded=await developmentMaterial(work,env);
 if(encoded===null){
  const generated=join(work,'development.p12'),password=randomBytes(32).toString('base64url');
  try{
   await call(keytool,['-genkeypair','-storetype','PKCS12','-keystore',generated,'-storepass:env','PRODUCT_STORE_PASSWORD','-keypass:env','PRODUCT_KEY_PASSWORD','-alias','development','-keyalg','RSA','-keysize','4096','-validity','36500','-dname','CN=Product Development,O=GMB,C=US'],{PRODUCT_STORE_PASSWORD:password,PRODUCT_KEY_PASSWORD:password});
   const material=readFileSync(generated);try{unlinkSync(generated);encoded=await developmentMaterial(work,env,Buffer.from('keystore='+material.toString('base64')+'\npassword='+password+'\nalias=development\nkeyPassword='+password+'\n').toString('base64'));}finally{material.fill(0);}
  }finally{if(existsSync(generated)&&!executions.getStore()?.unconfirmed)unlinkSync(generated);}
 }
 const signing=parseAndroidSigning(encoded);encoded='';const temporary=join(work,'android-signing.keystore');
 try{
  writeFileSync(temporary,signing.keystore,{flag:'wx',mode:0o600});signing.keystore.fill(0);
  await call(signer,['sign','--ks',temporary,'--ks-pass','env:PRODUCT_STORE_PASSWORD','--key-pass','env:PRODUCT_KEY_PASSWORD','--ks-key-alias',signing.alias,'--out',signed,candidate],{PRODUCT_STORE_PASSWORD:signing.password,PRODUCT_KEY_PASSWORD:signing.keyPassword});
 }finally{signing.keystore.fill(0);signing.password='';signing.keyPassword='';if(existsSync(temporary)&&!executions.getStore()?.unconfirmed)unlinkSync(temporary);}
 const certificate=androidCertificate((await call(signer,['verify','--verbose','--print-certs',signed])).stdout);
 if(JSON.stringify(await inspect(signed,certificate))!==JSON.stringify(version))fail('Android签名后版本漂移');const digest=outputDigest(signed);
 const install=async(target,index)=>{
  if(outputDigest(signed)!==digest)fail('Android安装前签名产物改变');
  const result=await call(adb,[...target,'install','-r',signed]);if(!result.stdout.split(/\r?\n/u).includes('Success'))fail('Android安装失败');
  await readback(target,index);
 };
 const readback=async(target,index)=>{
  const result=await runBuildProcess(adb,[...target,'shell','pm','path',packageName],env,work,{capture:true,accepted:[0,1],timeout:300000}),path=androidInstalledPath(result);
  if(!path)fail('Android安装后包缺失');const file=join(work,'installed-after-'+index+'.apk');
  if(existsSync(file))fail('Android回读路径已存在');await call(adb,[...target,'pull',path,file]);
  if(realpathSync(file)!==file||JSON.stringify(await inspect(file,certificate))!==JSON.stringify(version))fail('Android安装后产品、证书或版本不一致');
 };
 await saveMobileArtifact(platform,work,signed);
 if(outputDigest(signed)!==digest)fail('Android安装前签名产物改变');
 const first=await runBuildProcess(adb,['-d','install','-r',signed],env,work,{capture:true,accepted:[0,1],timeout:300000});
 if(first.code===0&&first.stdout.split(/\r?\n/u).includes('Success'))await readback(['-d'],0);
 else{
  if(first.code!==1||!first.stderr.includes('more than one device'))fail('ADB直接USB安装失败');
  const serials=androidUSBSerials((await call(adb,['devices','-l'])).stdout);let failures=0;
  for(let i=0;i<serials.length;i++){executions.getStore()?.signal?.throwIfAborted();try{await install(['-s',serials[i]],i);}catch{executions.getStore()?.signal?.throwIfAborted();failures++;}}
  if(failures)fail('Android USB安装或回读失败'+failures+'/'+serials.length+'，已尝试全部设备');
 }
 renameSync(signed,join(work,'android.apk'));
 process.stderr.write('本机移动产物已签名验真；设备安装及产品身份、版本回读通过\n');
}
export function iosDeviceCandidates(response) {
 if(response?.info?.outcome!=='success'||!Array.isArray(response?.result?.devices))fail('iOS设备列表无效');
 const candidates=response.result.devices.filter(d=>d?.properties?.hardware?.reality==='physical'&&d.properties.hardware.platform==='iOS'&&d.properties.connection?.pairingState==='paired'&&d.properties.state?.developerModeStatus?.enabled?.mode===1);
 for(const d of candidates)if(!/^[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$/u.test(d.identifier)||!/^(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{8}-[a-fA-F0-9]{16})$/u.test(d.properties.hardware.udid))fail('iOS物理设备身份无效');
 return candidates.map(d=>({identifier:d.identifier,udid:d.properties.hardware.udid}));
}
export function iosInstalled(response,device,bundle) {
 const result=response?.result;
 if(response?.info?.outcome!=='success'||result?.deviceIdentifier!==device||result.matchingBundleIdentifier!==bundle||!Array.isArray(result.apps)||result.apps.length>1)fail('iOS安装回读设备或过滤身份无效');
 if(!result.apps.length)return null;const app=result.apps[0];if(app.bundleIdentifier!==bundle||typeof app.version!=='string'||typeof app.bundleVersion!=='string')fail('iOS应用版本回读无效');return {version:app.version,build:app.bundleVersion};
}
export function iosVersion(value) {if(typeof value!=='string'||!/^\d+(?:\.\d+){0,2}$/u.test(value))fail('iOS版本无效');return [...value.split('.').map(BigInt),0n,0n].slice(0,3);}
async function completeIOS(platform,work,receipt,env) {
 const signal=executions.getStore()?.signal,helper=await nativeVerifier(work,env),projectCandidates=['Runner.xcodeproj/project.pbxproj','Runner.pbxproj'].map(n=>join(sourceRoot(),'ios',n)).filter(existsSync);
 if(projectCandidates.length!==1)fail('iOS原始工程不唯一');const project=projectCandidates[0],archive=join(work,'ios.app.zip'),archiveDigest=outputDigest(archive),directory=join(work,'ios-product');
 await (await import('./resources.mjs')).extractArchive(archive,directory,{signal,maxBytes:2*1024**3});
 if(readdirSync(directory).join(',')!=='Runner.app')fail('iOS归档只能包含唯一Runner.app');const app=join(directory,'Runner.app');
 let sequence=0;
 // devicectl官方入口可能是无签名启动脚本；只接受本轮Xcode所定位且Apple签名通过的真实执行器。
 const found=(await runBuildProcess(env.XCRUN,['--find','devicectl'],env,work,{capture:true,timeout:60000})).stdout.trim();
 const installed='/Library/Developer/PrivateFrameworks/CoreDevice.framework/Versions/A/Resources/bin/devicectl';
 const tool=realpathSync(existsSync(installed)?installed:found);
 if(!tool.startsWith(env.DEVELOPER_DIR+'/')&&tool!==installed)fail('devicectl不属于当前Apple工具边界');
 await runBuildProcess(env.CODESIGN,['--verify','--strict','-R','=anchor apple',tool],env,work,{capture:true,timeout:60000});
 const deviceCall=async(args,seconds=120)=>{
  const file=join(work,'device-'+(++sequence)+'.json');
  await runBuildProcess(tool,[...args,'--json-output',file,'--omit-deprecated-fields-in-json','--timeout',String(seconds)],env,work,{capture:true,timeout:(seconds+10)*1000});
  if(realpathSync(file)!==file||!lstatSync(file).isFile()||lstatSync(file).size>4*1024*1024)fail('iOS设备结果文件无效');
  const response=JSON.parse(readFileSync(file,'utf8'));unlinkSync(file);if(response?.info?.outcome!=='success')fail('iOS设备命令失败');return response;
 };
 const findDevice=async()=>{
  for(let attempt=0;attempt<8;attempt++){
   signal?.throwIfAborted();const candidates=iosDeviceCandidates(await deviceCall(['list','devices'],5)),reachable=[];
   for(const d of candidates){let response;try{response=await deviceCall(['device','info','details','--device',d.identifier],5);}catch{signal?.throwIfAborted();continue;}
    const found=response.result,properties=found?.properties;
    if(found?.identifier!==d.identifier||properties?.hardware?.udid!==d.udid||properties.hardware.reality!=='physical'||properties.hardware.platform!=='iOS'||properties.connection?.pairingState!=='paired'||properties.state?.developerModeStatus?.enabled?.mode!==1)fail('iOS主动探测设备身份漂移');reachable.push(d);
   }
   if(reachable.length>1)fail('多台可用iOS真机无法确定安装设备');if(reachable.length===1)return reachable[0];
   if(attempt<7)await pauseBuild(2000,signal);
  }fail('iOS真机等待就绪超时');
 };
 const device=await findDevice(),prepared=await helper({operation:'ios.verify',app,project,device:device.udid});
 const before=iosInstalled(await deviceCall(['device','info','apps','--device',device.identifier,'--include-all-apps','--bundle-id',prepared.bundle_id]),device.identifier,prepared.bundle_id);
 const less=(a,b)=>{for(let i=0;i<3;i++){if(a[i]<b[i])return true;if(a[i]>b[i])return false;}return false;};
 if(before&&(less(iosVersion(prepared.version),iosVersion(before.version))||!less(iosVersion(prepared.version),iosVersion(before.version))&&!less(iosVersion(before.version),iosVersion(prepared.version))&&less(iosVersion(prepared.build),iosVersion(before.build))))fail('iOS禁止降级安装');
 const refreshed=await findDevice();if(JSON.stringify(refreshed)!==JSON.stringify(device)||JSON.stringify(await helper({operation:'ios.verify',app,project,device:device.udid}))!==JSON.stringify(prepared))fail('iOS安装前设备或签名产物漂移');
 if(outputDigest(archive)!==archiveDigest)fail('iOS归档输入漂移');
 await saveMobileArtifact(platform,work,archive);
 await deviceCall(['device','install','app','--device',device.identifier,app]);
 const after=iosInstalled(await deviceCall(['device','info','apps','--device',device.identifier,'--include-all-apps','--bundle-id',prepared.bundle_id]),device.identifier,prepared.bundle_id);
 if(!after||after.version!==prepared.version||after.build!==prepared.build)fail('iOS安装后产品或版本回读不一致');
 if(outputDigest(archive)!==archiveDigest||JSON.stringify(await helper({operation:'ios.verify',app,project,device:device.udid}))!==JSON.stringify(prepared))fail('iOS安装期间签名产物漂移');
 process.stderr.write('本机移动产物已签名验真；设备安装及产品身份、版本回读通过\n');
}
function pauseBuild(ms,signal){signal?.throwIfAborted();return new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(Error('产品任务已取消'));};const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();});}
async function saveMobileArtifact(platform,work,path) {
 const declared=platformContract(platform);if(declared.files.length!==1)fail('移动候选登记不唯一');
 const publicPath=join(work,declared.files[0]);
 if(path!==publicPath){unlinkSync(publicPath);copyFileSync(path,publicPath);}
 const host=await productHost();
 if(host)await host('artifact',[{path:publicPath,sha256:outputDigest(publicPath)}]);
}
async function completeMobile(platform,work,receipt,env) {
 executions.getStore()?.signal?.throwIfAborted();if(platform.endsWith('android'))await completeAndroid(platform,work,receipt,env);else await completeIOS(platform,work,receipt,env);
}

// 每次调用拥有自己的取消和进程集合，导入API并发也不能共享执行状态。
const executions=new AsyncLocalStorage();
export async function runBuildProcess(file,args,env,cwd=root,{capture=false,input,accepted=[0],timeout=7200000,signal=executions.getStore()?.signal,passHost=false,streamError=false}={}) {
 signal?.throwIfAborted();
 return new Promise((ok,reject)=>{
  const child=spawn(file,args,{cwd,env,detached:true,stdio:['pipe','pipe','pipe',...(passHost?[3]:[])]});
  let stdout=[],stderr=[],bytes=0,reason,settled=false;
  const stop=()=>{try{process.kill(-child.pid,'SIGTERM');}catch(error){if(error.code!=='ESRCH')reason='无法取消产品工具进程组';}};
  let killer;
  const terminate=()=>{stop();clearTimeout(killer);killer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},1500);};
  const forced=setTimeout(()=>{reason='产品工具超时';terminate();},timeout);forced.unref();
  const abort=()=>{reason='产品任务已取消';terminate();};
  signal?.addEventListener('abort',abort,{once:true});
  const consume=(chunk,out)=>{bytes+=chunk.length;if(bytes>16*1024*1024){reason='产品工具输出超限';terminate();return;}out.push(chunk);if(!capture)process.stderr.write(chunk);};
  child.stdout.on('data',chunk=>consume(chunk,stdout));child.stderr.on('data',chunk=>{if(capture&&streamError)process.stderr.write(chunk);else consume(chunk,stderr);});
  child.stdin.on('error',()=>{reason='产品工具输入失败';stop();});
  child.once('error',()=>{reason='产品工具无法启动';});
  child.once('close',async(code,termination)=>{
   clearTimeout(forced);clearTimeout(killer);signal?.removeEventListener('abort',abort);
   // 主进程close不代表后代退出；未退出的同组工具必须停止并确认，之后才能清理材料。
   const alive=()=>{if(!child.pid)return false;try{process.kill(-child.pid,0);return true;}catch(error){return error.code!=='ESRCH';}};
   if(alive()){reason??='产品工具退出后仍有后代';stop();for(let n=0;n<15&&alive();n++)await new Promise(r=>setTimeout(r,100));if(alive())try{process.kill(-child.pid,'SIGKILL');}catch{};for(let n=0;n<15&&alive();n++)await new Promise(r=>setTimeout(r,100));}
   if(alive()){reason='产品工具后代退出未确认，保留工作目录';const state=executions.getStore();if(state)state.unconfirmed=true;}
   if(settled)return;settled=true;
   if(reason||termination||!accepted.includes(code))reject(Error(reason||'产品工具执行失败'));
   else ok({stdout:Buffer.concat(stdout).toString('utf8'),stderr:Buffer.concat(stderr).toString('utf8'),code});
  });
  child.stdin.end(input);
 });
}
const run=async(file,args,env,cwd=root,capture=false)=>(await runBuildProcess(file,args,env,cwd,{capture})).stdout;

export function outputDigest(path) {
 const hash=createHash('sha256');const base=path;
 function visit(file){const info=lstatSync(file);const name=relative(base,file);
  if(info.isSymbolicLink()){const real=realpathSync(file);if(!inside(base,real))fail('输出链接越界');hash.update(JSON.stringify([name,'link',readlinkSync(file)])+'\n');}
  else if(info.isDirectory()){hash.update(JSON.stringify([name,'directory'])+'\n');for(const child of readdirSync(file).sort())visit(join(file,child));}
  else if(info.isFile()&&info.nlink===1){hash.update(JSON.stringify([name,'file',Boolean(info.mode&0o111),info.size])+'\n');hash.update(readFileSync(file));}
  else fail('输出包含特殊文件或硬链接');
 }visit(path);return hash.digest('hex');
}
// 摘要只读执行源码；所属根技术文档及target等运行数据不改变编译身份。
function sourceDigest() {
 const hash=createHash('sha256'),rootData=new Set(['cache','target','rely','tools','tasks','TATA.md','MAP.md','CODEX.md','CLAUDE.md','README.md','TuyuFactory.md']);
 const generated=new Set(['.git','node_modules','.dart_tool','.gradle','.symlinks','Pods','build','target','ephemeral','.cache','.DS_Store']);
 function visit(path){for(const name of readdirSync(path).sort()){
  if(generated.has(name)||path===root&&rootData.has(name))continue;
  const file=join(path,name),info=lstatSync(file);hash.update(relative(root,file)+'\n');
  if(info.isDirectory())visit(file);else if(info.isFile()){hash.update(String(Boolean(info.mode&0o111)));hash.update(readFileSync(file));}
  else if(info.isSymbolicLink()){const real=realpathSync(file);if(!inside(root,real))fail('产品源码链接越界');hash.update(readlinkSync(file));}
  else fail('产品源码特殊输入未声明');
 }}visit(root);return hash.digest('hex');
}

export async function execute(platform,work,request={},options={}) {
 checkWork(work);platformContract(platform);
 if(!inside(productTarget(platform),work)||work===productTarget(platform))fail('执行工作根与当前产品平台不一致');
 options.signal?.throwIfAborted();
 if(!request||typeof request!=='object'||Array.isArray(request)||Object.keys(request).some(k=>!['schema','product_id','platform','work','run_id','program_digest'].includes(k))
  ||request.schema!==undefined&&request.schema!==1||request.run_id!==undefined&&!/^[1-9][0-9]{8}$/u.test(request.run_id)||request.program_digest!==undefined&&!/^[a-f0-9]{64}$/u.test(request.program_digest)
  ||request.product_id!==undefined&&request.product_id!==product||request.platform!==undefined&&request.platform!==platform||request.work!==undefined&&request.work!==work)fail('公开Build请求身份或字段无效');
 chmodSync(work,0o700);
 const lock=join(work,'.product-build.lock'),resultFile=join(work,'build-result.json');
 if(existsSync(resultFile))fail('本轮完整Build已有结果，禁止复用旧终态');
 const handle=openSync(lock,'wx',0o600);closeSync(handle);
 const cancellation=new AbortController(),abort=()=>cancellation.abort();options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();
 const state={signal:cancellation.signal,cancellation,host:options.host,unconfirmed:false,finished:false};
 try{return await executions.run(state,async()=>{
  const initial=sourceDigest(),stages=options.stages||{requirements,resources:(...args)=>import('./resources.mjs').then(m=>m.resources(...args)),prepare,build};
  const unchanged=()=>{state.signal.throwIfAborted();if(sourceDigest()!==initial)fail('产品源码或锁在执行期间改变');};
  const resourcesOptions={signal:state.signal,offline:Boolean(options.offline),environment:options.environment||process.env};
  await stages.requirements(platform,work);unchanged();
  let receipt=await stages.resources(platform,work,request,resourcesOptions);unchanged();
  await stages.prepare(platform,work,receipt,resourcesOptions.environment);unchanged();
  await stages.requirements(platform,work);
  receipt=await stages.resources(platform,work,receipt,resourcesOptions);unchanged();
  const result=await stages.build(platform,work,receipt,resourcesOptions.environment);unchanged();
  checkBuildResult(result,platform,work,request.run_id);
  writeFileSync(resultFile,JSON.stringify(result)+'\n',{flag:'wx',mode:0o600});return result;
 });}finally{state.finished=true;state.socket?.destroy();options.signal?.removeEventListener('abort',abort);if(!state.unconfirmed)unlinkSync(lock);}
}
export function checkBuildResult(value,platform,work,runId) {
 const declared=platformContract(platform);
 if(!value||Object.keys(value).sort().join(',')!==(runId?'completion,files,platform,product_id,run_id,schema,work':'completion,files,platform,product_id,schema,work')
  ||value.schema!==1||value.product_id!==product||value.platform!==platform||value.work!==work||value.completion!==declared.completion
  ||runId&&value.run_id!==runId||!Array.isArray(value.files)||value.files.length!==declared.files.length)fail('完整Build结果身份或完成方式无效');
 for(let n=0;n<value.files.length;n++){const entry=value.files[n],file=join(work,declared.files[n]);
  if(Object.keys(entry).sort().join(',')!=='path,sha256'||entry.path!==file||!inside(work,file)||realpathSync(file)!==file||!/^[a-f0-9]{64}$/u.test(entry.sha256)||outputDigest(file)!==entry.sha256)fail('完整Build产物摘要或边界无效');}
 return value;
}
async function completeBuild(platform,work,receipt,env) {
 const declared=platformContract(platform);
 if(declared.completion==='device-install')await completeMobile(platform,work,receipt,env);
 if(declared.completion==='macos-artifact')for(const name of declared.files)await run(env.CODESIGN,['--verify','--deep','--strict',join(work,name)],env);
 const result={schema:1,product_id:product,platform,work,completion:declared.completion,
  files:declared.files.map(name=>{const path=join(work,name);if(!inside(work,path)||realpathSync(path)!==path)fail('Build候选越界');return {path,sha256:outputDigest(path)};})};
 if(receipt.run_id)result.run_id=receipt.run_id;return checkBuildResult(result,platform,work,receipt.run_id);
}

// 全双工宿主通道只传开发签名材料，不与stdout结果、stderr日志或资源回执混用。
async function productHost() {
 const supplied=executions.getStore()?.host;if(supplied)return supplied;
 if(process.env.PRODUCT_HOST_FD===undefined)return null;
 if(process.env.PRODUCT_HOST_FD!=='3')fail('宿主通道描述符无效');
 const socket=new Socket({fd:3,readable:true,writable:true}),pending=new Map();let buffer='',sequence=0;
 socket.on('data',chunk=>{buffer+=chunk.toString('utf8');if(Buffer.byteLength(buffer)>128*1024){socket.destroy();return;}
  let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);try{const reply=JSON.parse(line),entry=pending.get(reply.id);if(!entry)throw Error();pending.delete(reply.id);clearTimeout(entry.timer);if(reply.ok!==true)entry.reject(Error('开发签名材料宿主操作失败'));else entry.resolve(reply.value);}catch{socket.destroy();}}});
 const close=()=>{const state=executions.getStore();if(state&&!state.finished)state.cancellation?.abort();for(const entry of pending.values()){clearTimeout(entry.timer);entry.reject(Error('产品宿主通道中断'));}pending.clear();};socket.on('error',close);socket.on('close',close);socket.unref();
 const host=(operation,value)=>new Promise((resolve,reject)=>{if(!['development.read','development.create','artifact'].includes(operation))return reject(Error('宿主能力未授权'));
  const id=String(++sequence),timer=setTimeout(()=>{pending.delete(id);reject(Error('开发材料操作超时'));socket.destroy();},30000);
  pending.set(id,{resolve,reject,timer});socket.write(JSON.stringify({id,operation,...(value===undefined?{}:operation==='artifact'?{files:value}:{value})})+'\n');});
 executions.getStore().host=host;executions.getStore().socket=socket;return host;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [command,platform,option,work,...extra]=process.argv.slice(2);
 if(command==='temporary-root') {
  if(work!==undefined||extra.length)fail('临时入口参数无效');
  const host=process.platform==='darwin'?'macos':process.platform==='win32'?'windows':process.platform==='linux'?(process.arch==='arm64'?'linux-arm':process.arch==='x64'?'linux-amd':undefined):undefined;
  const fallback=option?.endsWith('macos')?option.slice(0,-5)+host:option;
  const chosen=Object.hasOwn(contract.platforms,platform)?platform
   :platform&&option?.endsWith('-'+platform)&&Object.hasOwn(contract.platforms,option)?option
   :Object.hasOwn(contract.platforms,'host-'+platform)?'host-'+platform:!platform?(Object.hasOwn(contract.platforms,fallback)?fallback:option):platform;
  platformContract(chosen);process.stdout.write(temporaryRoot(chosen,'tmp')+'\n');
 } else {

 if(!['requirements','resources','prepare','build','execute'].includes(command)||option!=='--work'||extra.some(x=>x!=='--offline')||extra.length>1||extra.length&&!['resources','execute'].includes(command))fail('固定入口参数无效');
 if(command==='requirements')process.stdout.write(JSON.stringify(requirements(platform,work))+'\n');
 else{
  const cancellation=new AbortController();for(const name of ['SIGTERM','SIGINT'])process.once(name,()=>cancellation.abort());
  let input='';for await(const chunk of process.stdin){input+=chunk;if(Buffer.byteLength(input)>2*1024*1024)fail('公开输入超限');}
  const request=input?JSON.parse(input):{},options={environment:process.env,signal:cancellation.signal,offline:extra.includes('--offline')};
  let result;
  if(command==='execute'){
   const {bootstrapNode}=await import('./resources.mjs');const node=await bootstrapNode(work,options);
   if(createHash('sha256').update(readFileSync(process.execPath)).digest('hex')!==createHash('sha256').update(readFileSync(node.path)).digest('hex')){
    const environment=Object.fromEntries(['HOME','USER','LOGNAME','LANG','LC_ALL','PRODUCT_TOOL_ROOT','PRODUCT_DEPENDENCY_ROOT','PRODUCT_HOST_FD'].filter(k=>typeof process.env[k]==='string').map(k=>[k,process.env[k]]));
    result=JSON.parse((await runBuildProcess(node.path,[fileURLToPath(import.meta.url),command,platform,option,work,...extra],environment,root,{capture:true,streamError:true,input:JSON.stringify(request),signal:cancellation.signal,passHost:environment.PRODUCT_HOST_FD==='3'})).stdout);
   }else result=await execute(platform,work,request,options);
  }else if(command==='resources')result=await (await import('./resources.mjs')).resources(platform,work,request,options);
  else result=await executions.run({signal:cancellation.signal},()=>command==='prepare'?prepare(platform,work,request,process.env):build(platform,work,request,process.env));
  process.stdout.write(JSON.stringify(result)+'\n');
 }
}
}
