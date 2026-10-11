#!/usr/bin/env node
// 本产品 Publish 只读验真正式 GitHub Release；不执行上传、部署、商店交易或编译。
import {createHash} from 'node:crypto';
import {createReadStream,existsSync,lstatSync,readFileSync,readdirSync,realpathSync} from 'node:fs';
import {basename,isAbsolute,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const product="tuyufactory";
const repository="tuyutata/tuyufactory";
const assets=Object.freeze({"client-ios":"tuyufactory-client-ios.ipa","client-android":"tuyufactory-client-android.zip","client-macos":"tuyufactory-client-macos.zip","client-windows":"tuyufactory-client-windows.zip","host-macos":"tuyufactory-host-macos.zip","host-windows":"tuyufactory-host-windows.zip","host-linux-arm":"tuyufactory-host-linux-arm.tar.gz","host-linux-amd":"tuyufactory-host-linux-amd.tar.gz"});
const digestPattern=/^[a-f0-9]{64}$/u;
const shaPattern=/^[a-f0-9]{40}$/u;
const fail=message=>{throw Error(product+' Publish：'+message);};

function ordinary(directory,name,limit){
 if(name!==basename(name)||name==='.'||name==='..')fail('发布资产文件名无效');
 const path=join(directory,name),status=lstatSync(path);
 if(!status.isFile()||status.isSymbolicLink()||status.nlink!==1||status.size<1||status.size>limit||realpathSync(path)!==path)fail('发布资产不是准确普通文件：'+name);
 return {path,size:status.size};
}
function manifestInput(path){
 const value=JSON.parse(readFileSync(path,'utf8'));
 if(!value||typeof value!=='object'||Array.isArray(value))fail('正式清单结构无效');
 return value;
}
async function sha256(path){
 const hash=createHash('sha256');
 for await(const piece of createReadStream(path))hash.update(piece);
 return hash.digest('hex');
}
async function github(path){
 const token=process.env.GITHUB_TOKEN||process.env.GH_TOKEN;
 if(token&&/[\s\u0000-\u001f\u007f]/u.test(token))fail('GitHub只读令牌无效');
 const response=await fetch('https://api.github.com/repos/'+repository+'/'+path,{
  headers:{Accept:'application/vnd.github+json','User-Agent':product,...(token?{Authorization:'Bearer '+token}:{})},
  redirect:'error',signal:AbortSignal.timeout(30000)});
 if(!response.ok)fail('GitHub正式记录读取失败：'+response.status);
 const bytes=await response.arrayBuffer();if(bytes.byteLength>2*1024*1024)fail('GitHub正式记录超限');
 return JSON.parse(Buffer.from(bytes).toString('utf8'));
}
function coordinate(platform,tag){
 if(!Object.hasOwn(assets,platform))fail('发布平台未声明');
 const prefix=product+'-'+platform+'-v';
 if(typeof tag!=='string'||!tag.startsWith(prefix))fail('正式Tag不属于本产品平台');
 const value=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-r([1-9]\d*)-a([1-9]\d*)$/u.exec(tag.slice(prefix.length));
 if(!value)fail('正式Tag版本与运行坐标无效');
 const run=Number(value[4]),attempt=Number(value[5]);
 if(!Number.isSafeInteger(run)||!Number.isSafeInteger(attempt))fail('正式运行坐标越界');
 return {version:value.slice(1,4).join('.'),run,attempt};
}
function releaseNames(asset){return [asset,'release-manifest.json','SHA256SUMS'];}
function canonicalDirectory(directory){
 if(typeof directory!=='string'||!isAbsolute(directory)||resolve(directory)!==directory)fail('正式资产目录必须是规范绝对路径');
 const status=lstatSync(directory);
 if(!status.isDirectory()||status.isSymbolicLink()||realpathSync(directory)!==directory)fail('正式资产目录身份无效');
 return directory;
}
async function latestTag(platform,tag){
 const prefix=product+'-'+platform+'-v';
 let selected=null;
 for(let page=1;page<=100;page++){
  const rows=await github('releases?per_page=100&page='+page);
  if(!Array.isArray(rows))fail('GitHub Release分页结构无效');
  for(const row of rows){
   if(row.draft||row.prerelease||typeof row.tag_name!=='string'||!row.tag_name.startsWith(prefix))continue;
   const current=coordinate(platform,row.tag_name);
   const order=[...current.version.split('.').map(Number),current.run,current.attempt];
   if(!selected||order.some((number,index)=>number!==selected.order[index]&&order.slice(0,index).every((earlier,i)=>earlier===selected.order[i])&&number>selected.order[index]))selected={tag:row.tag_name,order};
  }
  if(rows.length<100)break;
  if(page===100)fail('GitHub Release列表超过验真上限');
 }
 if(selected?.tag!==tag)fail('所选Tag不是本平台最新正式Release');
}

export async function verifyRelease({platform,tag,directory}){
 const point=coordinate(platform,tag),asset=assets[platform],root=canonicalDirectory(directory),names=releaseNames(asset);
 const actual=readdirSync(root).sort();if(JSON.stringify(actual)!==JSON.stringify([...names].sort()))fail('正式资产集合不匹配');
 const input=Object.fromEntries(names.map(name=>[name,ordinary(root,name,name===asset?8*1024**3:1024*1024)]));
 const manifest=manifestInput(input['release-manifest.json'].path);
 if(manifest.product_id!==product||manifest.platform!==platform||manifest.software_version!==point.version
   ||manifest.producer_run_id!==point.run||!shaPattern.test(manifest.git_commit_sha||'')
   ||!Array.isArray(manifest.assets)||manifest.assets.length!==1||manifest.assets[0]?.name!==asset
   ||!digestPattern.test(manifest.assets[0]?.sha256||''))fail('正式清单身份或资产声明不符');
 const sums=readFileSync(input.SHA256SUMS.path,'utf8');
 const records=sums.trimEnd().split('\n').map(line=>/^([a-f0-9]{64})  ([^\r\n]+)$/u.exec(line));
 if(records.length!==2||records.some(value=>!value)||records[0][2]!==asset||records[1][2]!=='release-manifest.json')fail('SHA256SUMS集合或格式无效');
 const assetHash=await sha256(input[asset].path),manifestHash=await sha256(input['release-manifest.json'].path);
 if(records[0][1]!==assetHash||records[1][1]!==manifestHash||manifest.assets[0].sha256!==assetHash)fail('本地正式资产摘要不一致');
 const release=await github('releases/tags/'+encodeURIComponent(tag));
 if(release.tag_name!==tag||release.draft||release.prerelease||!Array.isArray(release.assets)||release.assets.length!==3)fail('GitHub正式Release身份无效');
 const remote=Object.fromEntries(release.assets.map(item=>[item.name,item]));
 if(JSON.stringify(Object.keys(remote).sort())!==JSON.stringify([...names].sort()))fail('GitHub正式资产集合不符');
 for(const name of names){const hash=name===asset?assetHash:name==='release-manifest.json'?manifestHash:await sha256(input.SHA256SUMS.path);
  if(remote[name]?.digest!=='sha256:'+hash||remote[name]?.size!==input[name].size||remote[name]?.state!=='uploaded')fail('GitHub资产摘要、尺寸或状态不符：'+name);}
 const ref=await github('git/ref/tags/'+encodeURIComponent(tag));
 if(ref.ref!=='refs/tags/'+tag||ref.object?.type!=='commit'||ref.object.sha!==manifest.git_commit_sha)fail('Tag与源码提交不符');
 const run=await github('actions/runs/'+point.run);
 if(run.id!==point.run||run.run_attempt!==point.attempt||run.status!=='completed'||run.conclusion!=='success'
   ||run.head_sha!==manifest.git_commit_sha||run.path!=='.github/workflows/release-'+platform+'.yml')fail('正式构建运行身份或结果不符');
 await latestTag(platform,tag);
 return {schema:1,product_id:product,platform,tag,source_sha:manifest.git_commit_sha,asset,sha256:assetHash,verified:true};
}

// 未签名候选与签名引用只从本仓当前公开接口推导；控制台不保存本产品文件名表。
const mobilePlatforms=new Set(['client-android','client-ios']);
const signingEnvironment=product+'-release';
function mobileKind(platform){
 if(!mobilePlatforms.has(platform))fail('本产品未声明的移动平台');
 return platform.endsWith('android')?'android':'ios';
}
function unsignedNames(platform){
 const kind=mobileKind(platform),stem=product+'-unsigned-'+platform;
 return kind==='android'?[stem+'.apk',stem+'.aab']:[stem+'.zip'];
}
export function unsignedArtifactNames(platform){return ['automation.json',product+'-unsigned-'+platform+'.json',...unsignedNames(platform)];}
async function freshSource(relative){
 const {pathToFileURL}=await import('node:url'),{readFile}=await import('node:fs/promises');
 const path=fileURLToPath(new URL(relative,import.meta.url)),stat=lstatSync(path);
 if(!stat.isFile()||stat.isSymbolicLink()||realpathSync(path)!==path||stat.size>4*1024*1024)fail('本仓公开接口源无效');
 const revision=createHash('sha256').update(await readFile(path)).digest('hex');
 return import(pathToFileURL(path).href+'?revision='+revision);
}
export async function signingConfiguration(platform){
 const kind=mobileKind(platform),{describeConfiguration}=await freshSource('./config.mjs');
 const items=describeConfiguration().configuration.items.filter(item=>item.kind===kind+'-signing');
 const expected=kind==='android'?['APP_KEY']:['IOS_KEY','APP_PROFILE'];
 if(items.length!==expected.length||items.map(item=>item.name).sort().join('\0')!==expected.sort().join('\0')
   ||items.some(item=>item.environment!==signingEnvironment||item.accessLevel!=='protected'))fail('正式签名配置与本仓消费者不一致');
 return items.map(item=>({environment:item.environment,name:item.name}));
}
export async function signingTools(platform){
 const kind=mobileKind(platform),{contract}=await freshSource('./build.mjs');
 const tools=contract.platforms?.[platform]?.tools,required=kind==='android'?['java','android','android-sdk']:['xcode'];
 if(!Array.isArray(tools))fail('本产品签名工具声明缺失');
 const selected=required.map(id=>tools.find(item=>item.id===id));
 if(selected.some(item=>!item||typeof item.version!=='string'||!item.version))fail('本产品签名工具版本无效');
 return selected.map(({id,version})=>({id,version}));
}
export async function verifyUnsigned(platform,directory,run){
 mobileKind(platform);
 if(typeof directory!=='string'||!isAbsolute(directory)||realpathSync(directory)!==directory||!lstatSync(directory).isDirectory())fail('未签名目录无效');
 const names=unsignedArtifactNames(platform);
 if(readdirSync(directory).sort().join('\0')!==names.slice().sort().join('\0'))fail('未签名资产文件闭集无效');
 const workflow='.github/workflows/release-'+platform+'.yml';
 if(!Number.isSafeInteger(run?.id)||run.id<1||!Number.isSafeInteger(run.run_attempt)||run.run_attempt<1
   ||!Number.isSafeInteger(run.run_number)||run.run_number<1||run.status!=='completed'||run.conclusion!=='success'
   ||run.event!=='workflow_dispatch'||run.head_branch!=='main'||run.repository?.full_name!==repository
   ||String(run.path||'').split('@')[0]!==workflow||!shaPattern.test(run.head_sha||''))fail('未签名候选不属于本仓成功自动化');
 const metadataFile=ordinary(directory,'automation.json',1024*1024),manifestName=product+'-unsigned-'+platform+'.json';
 const manifestFile=ordinary(directory,manifestName,1024*1024);
 const metadata=JSON.parse(readFileSync(metadataFile.path,'utf8')),manifest=JSON.parse(readFileSync(manifestFile.path,'utf8'));
 const tag=product+'-'+platform+'-v'+metadata.version+'-r'+run.id+'-a'+run.run_attempt;
 if(metadata.schema!==1||metadata.repository!==repository||metadata.product_id!==product||metadata.platform!==platform
   ||metadata.run_id!==run.id||metadata.run_attempt!==run.run_attempt||metadata.run_number!==run.run_number
   ||metadata.source_sha!==run.head_sha||metadata.workflow!==workflow||metadata.tag!==tag
   ||!/^[0-9]+\.[0-9]+\.[0-9]+$/u.test(metadata.version||'')
   ||manifest.schema!==1||manifest.product_id!==product||manifest.platform!==platform||manifest.repository!==repository
   ||manifest.version!==metadata.version||manifest.tag!==tag||manifest.source_sha!==run.head_sha
   ||manifest.run_id!==run.id||manifest.run_attempt!==run.run_attempt||manifest.run_number!==run.run_number
   ||manifest.workflow!==workflow||!Array.isArray(metadata.assets)||metadata.assets.length!==names.length-1
   ||!Array.isArray(manifest.assets)||manifest.assets.length!==names.length-2)fail('未签名清单与成功自动化不一致');
 for(const name of names.filter(name=>name!=='automation.json')){
   const file=ordinary(directory,name,2*1024**3),hash=await sha256(file.path);
   const row=metadata.assets.filter(item=>item?.name===name);
   if(row.length!==1||row[0].size!==file.size||row[0].sha256!==hash)fail('未签名资产与自动化摘要不符');
   if(name!==manifestName){const proof=manifest.assets.filter(item=>item?.name===name);
     if(proof.length!==1||proof[0].size!==file.size||proof[0].sha256!==hash)fail('未签名资产与产品清单不符');}
 }
 return {product_id:product,platform,version:metadata.version,tag,source_sha:run.head_sha,
   run_id:run.id,run_attempt:run.run_attempt,run_number:run.run_number,assets:manifest.assets};
}

// 本机签名只消费同一成功自动化的准确字节；子进程退出后才清理本轮现场。
const localSignedProofs=new WeakSet();
async function localCommand(command,args,{cwd,env,capture=false,timeout=1800000}={}){
 const {spawn}=await import('node:child_process');
 return new Promise((resolve,reject)=>{
   let child;try{child=spawn(command,args,{cwd,env,detached:true,stdio:['ignore',capture?'pipe':'ignore','ignore']});}
   catch{reject(Error('本机签名工具无法启动'));return;}
   const parts=[];let size=0,failed=false,settled=false;
   const stop=()=>{if(!child.pid)return;try{process.kill(-child.pid,'SIGTERM');}catch{child.kill();}};
   const timer=setTimeout(()=>{failed=true;stop();},timeout);
   if(capture&&child.stdout)child.stdout.on('data',part=>{size+=part.length;if(size>8*1024*1024){failed=true;stop();}else parts.push(part);});
   child.once('error',()=>{if(settled)return;settled=true;clearTimeout(timer);reject(Error('本机签名工具无法启动'));});
   child.once('close',(code,signal)=>{if(settled)return;settled=true;clearTimeout(timer);
     if(failed||code!==0||signal)reject(Error('本机签名工具失败或超时'));
     else resolve(capture?Buffer.concat(parts).toString('utf8'):'');
   });
 });
}
async function localSigningSource(platform){
 mobileKind(platform);const module=await freshSource('../.github/workflows/release-'+platform+'.mjs');
 if(typeof module.localSigningSources!=='function')fail('本仓本机签名接口缺失');
 return module.localSigningSources();
}
export async function signUnsigned(platform,directory,run,material,workRoot,{environment:tools=process.env}={}){
 const fs=await import('node:fs'),path=await import('node:path');
 const proof=await verifyUnsigned(platform,directory,run),refs=await signingConfiguration(platform),kind=mobileKind(platform);
 const expected=refs.map(ref=>ref.environment+':'+ref.name);
 if(!material||typeof material!=='object'||Object.keys(material).sort().join('\0')!==expected.slice().sort().join('\0')
   ||expected.some(key=>!Buffer.isBuffer(material[key])||material[key].length<1||material[key].length>32*1024*1024))fail('本次产品签名材料缺失或超限');
 if(typeof workRoot!=='string'||!path.isAbsolute(workRoot)||fs.realpathSync(workRoot)!==workRoot
   ||!fs.lstatSync(workRoot).isDirectory())fail('本机签名现场无效');
 const stage=fs.mkdtempSync(path.join(workRoot,'sign-')),project=join(stage,'application');
 let originalKeychains;
 try{
   if(kind==='android'){
     const apk=path.join(project,'build/app/outputs/flutter-apk'),aab=path.join(project,'build/app/outputs/bundle/release');
     fs.mkdirSync(apk,{recursive:true,mode:0o700});fs.mkdirSync(aab,{recursive:true,mode:0o700});
     fs.copyFileSync(path.join(directory,unsignedNames(platform)[0]),path.join(apk,'app-release.apk'));
     fs.copyFileSync(path.join(directory,unsignedNames(platform)[1]),path.join(aab,'app-release.aab'));
     fs.copyFileSync(path.join(project,'build/app/outputs/flutter-apk/app-release.apk'),path.join(stage,'candidate.apk'));
   }else{
     const archive=path.join(directory,unsignedNames(platform)[0]);
     const names=(await localCommand('/usr/bin/unzip',['-Z1',archive],{capture:true,timeout:300000})).trim().split('\n');
     if(names.length<2||names.length>20000||new Set(names).size!==names.length
       ||names.some(name=>!name.startsWith('Runner.app/')&&name!=='__MACOSX/'&&!name.startsWith('__MACOSX/Runner.app/'))
       ||names.some(name=>name.split('/').some(part=>part==='..'||part==='.'||part==='')))fail('iOS未签名包路径无效');
     const listing=await localCommand('/usr/bin/bsdtar',['-tvf',archive],{capture:true,timeout:300000});
     if(listing.split('\n').filter(Boolean).some(line=>!['-','d'].includes(line[0])))fail('iOS未签名包包含链接或特殊文件');
     const ios=path.join(project,'build/ios/iphoneos');fs.mkdirSync(ios,{recursive:true,mode:0o700});
     await localCommand('/usr/bin/ditto',['-x','-k',archive,ios],{timeout:300000});
     const app=path.join(ios,'Runner.app');if(!fs.lstatSync(app).isDirectory()||fs.realpathSync(app)!==app)fail('iOS未签名应用目录无效');
     const stack=[ios];let inspected=0;while(stack.length){const current=stack.pop();for(const item of fs.readdirSync(current,{withFileTypes:true})){
       const candidate=path.join(current,item.name),resolved=fs.realpathSync(candidate);
       if(++inspected>50000||!resolved.startsWith(ios+'/')&&resolved!==ios||item.isSymbolicLink())fail('iOS未签名包提取越界');
       if(item.isDirectory())stack.push(candidate);
     }}
     fs.cpSync(app,path.join(stage,'Candidate.app'),{recursive:true});
   }
   for(const item of proof.assets){const name=item.name;const candidate=kind==='android'
     ?path.join(project,name.endsWith('.apk')?'build/app/outputs/flutter-apk/app-release.apk':'build/app/outputs/bundle/release/app-release.aab')
     :path.join(directory,name);
     if(await sha256(candidate)!==item.sha256)fail('签名前未签名候选发生变化');
   }
   const release=path.join(stage,'release');fs.mkdirSync(release,{mode:0o700});
   const env={PATH:[path.dirname(process.execPath),tools.PATH||'/usr/bin:/bin'].join(':'),HOME:tools.HOME||process.env.HOME,
     ANDROID_HOME:tools.ANDROID_HOME,JAVA_HOME:tools.JAVA_HOME,GITHUB_WORKSPACE:fileURLToPath(new URL('..',import.meta.url)),
     GITHUB_ENV:path.join(stage,'environment'),RUNNER_TEMP:stage,RELEASE_DIR:release,SOFTWARE_VERSION:proof.version,
     SOURCE_SHA:proof.source_sha,PRODUCER_RUN_ID:String(proof.run_id)};
   env.TUYUFACTORY_WORK_DIR=stage;env.TUYUFACTORY_ANDROID_BUILD_TOOLS=join(tools.ANDROID_HOME||'', 'build-tools', (await signingTools(platform)).find(item=>item.id==='android')?.version||'');env.TUYU_FACTORY_PRODUCT='client';
   if(kind==='android')env.APP_KEY=material[signingEnvironment+':APP_KEY'].toString('utf8');
   else{env.IOS_KEY=material[signingEnvironment+':IOS_KEY'].toString('utf8');env.IOS_PROVISIONING_PROFILE=material[signingEnvironment+':APP_PROFILE'].toString('utf8');}
   const scripts=await localSigningSource(platform);
   if(kind==='ios'){
     const lines=(await localCommand('/usr/bin/security',['list-keychains','-d','user'],{capture:true,timeout:30000})).trim().split('\n');
     originalKeychains=lines.map(line=>/^\s*"([^"]+)"\s*$/u.exec(line)?.[1]);
     if(!originalKeychains.length||originalKeychains.some(value=>!value))fail('用户钥匙串搜索列表无效');
   }
   try{
     await localCommand('bash',['--noprofile','--norc','-e','-o','pipefail','-c',scripts.sign],
       {cwd:env.GITHUB_WORKSPACE,env,timeout:1800000});
   }finally{delete env.APP_KEY;delete env.IOS_KEY;delete env.IOS_PROVISIONING_PROFILE;
     if(originalKeychains)await localCommand('/usr/bin/security',['list-keychains','-d','user','-s',...originalKeychains],{timeout:30000});}
   await localCommand('bash',['--noprofile','--norc','-e','-o','pipefail','-c',scripts.manifest],
     {cwd:env.GITHUB_WORKSPACE,env,timeout:300000});
   const signedName=assets[platform],names=[signedName,'release-manifest.json','SHA256SUMS'];
   const manifest=JSON.parse(fs.readFileSync(path.join(release,'release-manifest.json'),'utf8'));
   if(manifest.product_id!==product||manifest.platform!==platform||manifest.software_version!==proof.version
     ||manifest.git_commit_sha!==proof.source_sha||manifest.producer_run_id!==proof.run_id
     ||manifest.assets?.length!==1||manifest.assets[0]?.name!==signedName
     ||manifest.assets[0]?.sha256!==await sha256(path.join(release,signedName)))fail('本机正式签名清单无效');
   const signed=path.join(workRoot,'signed');fs.mkdirSync(signed,{mode:0o700});
   const result=[];for(const name of names){const item=ordinary(release,name,2*1024**3),target=path.join(signed,name);
     fs.copyFileSync(item.path,target);result.push({name,size:item.size,sha256:await sha256(target)});}
   const receipt={...proof,directory:signed,signed_assets:result};localSignedProofs.add(receipt);return receipt;
 }finally{fs.rmSync(stage,{recursive:true,force:true});}
}

// 正式GitHub写入仅使用最终确认事务交付的一次性短期令牌，且只指向本产品仓库。
async function localRequest(token,address,{method='GET',body,size,raw=false,send=fetch}={}){
 const url=address.startsWith('https://')?new URL(address):new URL('https://api.github.com/repos/'+repository+'/'+address);
 if(url.protocol!=='https:'||!['api.github.com','uploads.github.com'].includes(url.hostname)
   ||url.username||url.password||url.hash||!url.pathname.startsWith('/repos/'+repository+'/'))fail('本产品GitHub发布地址无效');
 let response=await send(url.href,{method,redirect:raw?'manual':'error',credentials:'omit',
   headers:{Authorization:'Bearer '+token,Accept:raw?'application/octet-stream':'application/vnd.github+json',
     'X-GitHub-Api-Version':'2026-03-10','User-Agent':product,
     ...(body===undefined?{}:{'Content-Type':size?'application/octet-stream':'application/json'}),
     ...(size?{'Content-Length':String(size)}:{})},
   ...(body===undefined?{}:{body:size?body:JSON.stringify(body)}),...(size?{duplex:'half'}:{}),signal:AbortSignal.timeout(180000)});
 if(raw&&response.status===302){const location=new URL(response.headers.get('location'));
   if(location.protocol!=='https:'||location.username||location.password||location.hash
     ||!/(?:^|\.)githubusercontent\.com$/u.test(location.hostname))fail('正式资产回读地址无效');
   await response.body?.cancel();response=await send(location.href,{method:'GET',redirect:'error',credentials:'omit',signal:AbortSignal.timeout(180000)});
 }
 if(response.status===404&&method==='GET')return null;
 if(!response.ok)fail('本产品GitHub发布请求失败：HTTP '+response.status);
 if(raw)return response;
 if(response.status===204)return {};
 if(!response.body)fail('本产品GitHub发布回执缺失');
 let bytes=0;const parts=[];for await(const part of response.body){bytes+=part.length;if(bytes>8*1024*1024)fail('本产品GitHub发布回执超限');parts.push(part);}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)));}
 catch{fail('本产品GitHub发布回执格式无效');}
}
async function localReadback(token,asset,expected,send){
 const response=await localRequest(token,'releases/assets/'+asset.id,{raw:true,send});
 if(!response?.body)fail('正式资产回读失败');
 const hash=createHash('sha256');let size=0;for await(const part of response.body){size+=part.length;if(size>expected.size)fail('正式资产回读超过声明大小');hash.update(part);}
 if(size!==expected.size||hash.digest('hex')!==expected.sha256)fail('正式资产逐件回读不一致');
}
export async function publishSigned(signed,token,{expiresAt,send=fetch}={}){
 if(!localSignedProofs.has(signed)||typeof token!=='string'||!token||/[\s\x00-\x1f\x7f]/u.test(token)
   ||!Number.isSafeInteger(expiresAt)||expiresAt<=Math.floor(Date.now()/1000)+30)fail('本机签名回执或发布令牌无效');
 localSignedProofs.delete(signed);
 const names=[assets[signed.platform],'release-manifest.json','SHA256SUMS'];
 if(typeof signed.directory!=='string'||!isAbsolute(signed.directory)||realpathSync(signed.directory)!==signed.directory
   ||readdirSync(signed.directory).sort().join('\0')!==names.slice().sort().join('\0')
   ||signed.signed_assets?.length!==names.length)fail('本次签名产物闭集无效');
 for(const name of names){const file=ordinary(signed.directory,name,2*1024**3),row=signed.signed_assets.find(item=>item.name===name);
   if(!row||signed.signed_assets.filter(item=>item.name===name).length!==1||row.size!==file.size
     ||row.sha256!==await sha256(file.path))fail('本机签名产物在上传前改变');}
 const manifest=JSON.parse(readFileSync(join(signed.directory,'release-manifest.json'),'utf8'));
 if(manifest.product_id!==product||manifest.platform!==signed.platform||manifest.software_version!==signed.version
   ||manifest.git_commit_sha!==signed.source_sha||manifest.producer_run_id!==signed.run_id
   ||manifest.assets?.length!==1||manifest.assets[0]?.name!==names[0]
   ||manifest.assets[0]?.sha256!==signed.signed_assets[0].sha256)fail('本机签名产物身份无效');
 const sums=readFileSync(join(signed.directory,'SHA256SUMS'),'utf8').trim().split('\n');
 const expectedSums=signed.signed_assets.filter(item=>item.name!=='SHA256SUMS').map(item=>item.sha256+'  '+item.name);
 if(sums.length!==2||sums.slice().sort().join('\0')!==expectedSums.sort().join('\0'))fail('正式摘要清单无效');
 const api=(path,options)=>localRequest(token,path,{...options,send});
 const workflow='release-'+signed.platform+'.yml';
 const listed=await api('actions/workflows/'+workflow+'/runs?branch=main&event=workflow_dispatch&status=completed&per_page=100');
 const current=listed?.workflow_runs?.find(run=>run.conclusion==='success');
 if(!current||current.id!==signed.run_id||current.run_attempt!==signed.run_attempt
   ||current.head_sha!==signed.source_sha||current.path!=='.github/workflows/'+workflow)fail('已有更新的成功自动化，旧候选不得发布');
 const run=await api('actions/runs/'+signed.run_id);
 if(run?.status!=='completed'||run.conclusion!=='success'||run.id!==signed.run_id
   ||run.run_attempt!==signed.run_attempt||run.head_sha!==signed.source_sha)fail('成功自动化身份已变化');
 if(await api('git/ref/tags/'+encodeURIComponent(signed.tag))!==null)fail('本次Tag已存在');
 let tagCreated=false,releaseID=null;
 try{
   const tag=await api('git/refs',{method:'POST',body:{ref:'refs/tags/'+signed.tag,sha:signed.source_sha}});
   if(tag?.ref!=='refs/tags/'+signed.tag||tag.object?.sha!==signed.source_sha)fail('正式Tag创建未确认');tagCreated=true;
   const release=await api('releases',{method:'POST',body:{tag_name:signed.tag,target_commitish:signed.source_sha,
     name:product+' · '+signed.platform+' · '+signed.version,draft:false,prerelease:false,make_latest:'false',
     body:'Source: '+signed.source_sha+'\nRun: '+signed.run_id+' / '+signed.run_attempt}});
   if(!Number.isSafeInteger(release?.id)||release.id<1||typeof release.upload_url!=='string')fail('正式Release创建未确认');
   releaseID=release.id;
   for(const item of signed.signed_assets){const url=new URL(release.upload_url.replace(/\{.*$/u,''));url.searchParams.set('name',item.name);
     const asset=await api(url.href,{method:'POST',body:createReadStream(join(signed.directory,item.name)),size:item.size});
     if(asset?.name!==item.name||asset.size!==item.size||asset.state!=='uploaded')fail('正式资产上传未确认');
     await localReadback(token,asset,item,send);
   }
   const final=await api('releases/'+releaseID),verifiedTag=await api('git/ref/tags/'+encodeURIComponent(signed.tag));
   if(final?.tag_name!==signed.tag||final.draft||final.prerelease||final.assets?.length!==names.length
     ||verifiedTag?.object?.type!=='commit'||verifiedTag.object.sha!==signed.source_sha
     ||signed.signed_assets.some(item=>!final.assets.some(asset=>asset.name===item.name&&asset.size===item.size
       &&asset.state==='uploaded'&&asset.digest==='sha256:'+item.sha256)))fail('正式Release回查未闭合');
 }catch(error){
   if(releaseID){try{const owned=await api('releases/'+releaseID);if(owned?.tag_name===signed.tag)await api('releases/'+releaseID,{method:'DELETE'});}catch{}}
   if(tagCreated){try{const owned=await api('git/ref/tags/'+encodeURIComponent(signed.tag));
     if(owned?.object?.sha===signed.source_sha)await api('git/refs/tags/'+encodeURIComponent(signed.tag),{method:'DELETE'});}catch{}}
   throw error;
 }
 const workflowModule=await freshSource('../.github/workflows/'+workflow.replace('.yml','.mjs'));
 if(typeof workflowModule.finish!=='function')fail('本仓历史清理接口缺失');
 await workflowModule.finish({publish:{result:'success'}},api,{run_id:signed.run_id,run_attempt:signed.run_attempt,source_sha:signed.source_sha,tag:signed.tag});
 return {release_id:releaseID,tag:signed.tag,run_id:signed.run_id,source_sha:signed.source_sha};
}

export function testFiles(){return ['scripts/publish.mjs','.github/workflows/release-client-android.mjs','.github/workflows/release-client-ios.mjs'];}
export async function testTools(){return [];}
const direct=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct&&process.env.NODE_TEST_CONTEXT){
 const {test}=await import('node:test'),{default:assert}=await import('node:assert/strict');
 test('厂家端正式签名需求由本产品独立公开声明',async()=>{
  const {describeConfiguration}=await import('./config.mjs'),items=describeConfiguration().configuration.items;
  assert.deepEqual(items.map(item=>item.name),['APP_KEY','IOS_KEY','APP_PROFILE']);
  assert.ok(items.every(item=>item.environment==='tuyufactory-release'&&item.accessLevel==='protected'));
 });
 test('未签名候选只接受本仓成功Run、完整文件闭集和准确摘要',async t=>{
  const {mkdtempSync,writeFileSync,rmSync}=await import('node:fs');
  const {testRoot}=await import('./build.mjs');
  const directory=mkdtempSync(join(testRoot(),'unsigned-proof-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const platform='client-android',names=unsignedNames(platform),manifestName=product+'-unsigned-'+platform+'.json';
  const run={id:42,run_attempt:1,run_number:3,status:'completed',conclusion:'success',event:'workflow_dispatch',
    head_branch:'main',head_sha:'a'.repeat(40),repository:{full_name:repository},path:'.github/workflows/release-'+platform+'.yml'};
  const rows=[];for(const [index,name] of names.entries()){const bytes=Buffer.from('synthetic-'+index);writeFileSync(join(directory,name),bytes);
    rows.push({name,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
  const tag=product+'-'+platform+'-v1.2.3-r42-a1';
  const manifest={schema:1,product_id:product,platform,repository,version:'1.2.3',tag,source_sha:run.head_sha,
    run_id:42,run_attempt:1,run_number:3,workflow:run.path,assets:rows};
  const manifestBytes=Buffer.from(JSON.stringify(manifest));writeFileSync(join(directory,manifestName),manifestBytes);
  const metadata={...manifest,assets:[...rows,{name:manifestName,size:manifestBytes.length,sha256:createHash('sha256').update(manifestBytes).digest('hex')}]};
  writeFileSync(join(directory,'automation.json'),JSON.stringify(metadata));
  assert.equal((await verifyUnsigned(platform,directory,run)).source_sha,run.head_sha);
  await assert.rejects(verifyUnsigned(platform,directory,{...run,head_sha:'b'.repeat(40)}),/成功自动化/);
  writeFileSync(join(directory,names[0]),'tampered');
  await assert.rejects(verifyUnsigned(platform,directory,run),/摘要|字节/u);
  await assert.rejects(publishSigned({},'synthetic',{expiresAt:Math.floor(Date.now()/1000)+600}),/签名回执/u);
 });
 test('签名引用与真实产品声明一一对应',async()=>{
  assert.deepEqual((await signingConfiguration('client-android')).map(item=>item.name),['APP_KEY']);
  assert.deepEqual((await signingConfiguration('client-ios')).map(item=>item.name),['IOS_KEY','APP_PROFILE']);
  assert.deepEqual(unsignedArtifactNames('client-android'),['automation.json',product+'-unsigned-client-android.json',...unsignedNames('client-android')]);
 });
}
if(direct&&!process.env.NODE_TEST_CONTEXT){
 void (async()=>{
  const args=process.argv.slice(2);if(args.length!==7||args[0]!=='verify'||args[1]!=='--platform'||args[3]!=='--tag'||args[5]!=='--directory')fail('用法：publish.mjs verify --platform 平台 --tag 正式Tag --directory 绝对资产目录');
  process.stdout.write(JSON.stringify(await verifyRelease({platform:args[2],tag:args[4],directory:args[6]}))+'\n');
 })().catch(error=>{process.stderr.write(String(error?.message||error)+'\n');process.exitCode=1;});
}
