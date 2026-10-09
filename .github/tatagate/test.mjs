import assert from 'node:assert/strict';
import test from 'node:test';
import { gateContract, validateWorkflowSource, validateVectorGroup, validatePalletRegistry, readPublicChain } from './index.mjs';

// 本仓登记必须准确闭合；路径、重复和未知工具版本不得被默默接受。
test('本仓门禁登记拒绝漂移和重复', () => {
  const contract = structuredClone(gateContract());
  assert.equal(gateContract(contract), contract);
  for (const change of [
    value => { value.schema = 2; },
    value => { value.node_tests.push(value.node_tests[0]); },
    value => { value.node_tests = ['../outside.test.mjs']; },
    value => { value.tools.node = '0.0.0'; },
    value => { value.checks.push('undeclared'); },
    value => { value.workflows.push('other.ios.ci'); },
  ]) {
    const value = structuredClone(contract); change(value);
    assert.throws(() => gateContract(value));
  }
});
test('产品CI与Release仍只接受自己的三维手动入口', () => {
  const { repository } = gateContract();
  const id = repository + '.macos.ci';
  const workflow = 'name: ' + id + '\non:\n  workflow_dispatch:\nconcurrency:\n  group: ' + id
    + '\njobs:\n  flow:\n    steps:\n      - run: allowed=new Set(["' + id + '"])\n';
  assert.equal(validateWorkflowSource(workflow,repository+'-macos-ci.yml'),id);
  for (const invalid of [workflow.replace(repository+'.','other.'),workflow.replace('workflow_dispatch','push'),
    workflow.replace('group: '+id,'group: other'),workflow.replace('  flow:','  other:')]) {
    assert.throws(()=>validateWorkflowSource(invalid,repository+'-macos-ci.yml'));
  }
});
const group={ keys:['name'],values:['hex'],top:['domain'],complete:true };
const vectors={domain:'GMB',vectors:[{name:'a',hex:'AB'},{name:'b',hex:'CD'}]};
test('金标按语义键归一比较并阻断重复、缺项和漂移', () => {
  assert.equal(validateVectorGroup(vectors,{...vectors,vectors:[{name:'b',hex:'cd'},{name:'a',hex:'ab'}]},group),2);
  for (const mirror of [
    {...vectors,domain:'other'}, {...vectors,vectors:[vectors.vectors[0]]},
    {...vectors,vectors:[vectors.vectors[0],vectors.vectors[0]]},
    {...vectors,vectors:[{name:'a',hex:'EE'},vectors.vectors[1]]},
    {...vectors,vectors:[{name:'a'},vectors.vectors[1]]},
    {...vectors,vectors:[]},
  ]) assert.throws(()=>validateVectorGroup(vectors,mirror,group));
  assert.equal(validateVectorGroup(vectors,{...vectors,vectors:[vectors.vectors[0]]},{...group,complete:false}),1);
});
test('Pallet不得错指、为空或重复',()=>{
  const chain='#[runtime::pallet_index(1)]\n pub type Balances = PalletBalances;\n';
  assert.equal(validatePalletRegistry(chain,'static const int balancesPallet = 1;'),1);
  for (const dart of ['', 'static const int balancesPallet = 2;', 'static const int otherPallet = 1;',
    'static const int balancesPallet = 1;\nstatic const int balancesPallet = 1;']) {
    assert.throws(()=>validatePalletRegistry(chain,dart));
  }
  assert.throws(()=>validatePalletRegistry(chain+chain));
});
test('公开链真源只读准确SHA，拒绝main、网络、重定向、超限及伪造坐标',async()=>{
 const sha='a'.repeat(40),path='runtime/src/lib.rs';
 assert.equal(await readPublicChain(path,sha,async(url,options)=>{
  assert.equal(url,'https://raw.githubusercontent.com/crcfrcn/citizenchain/'+sha+'/'+path);
  assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.equal(options.headers.Authorization,undefined);
  return new Response('source');
 }),'source');
 for(const [path,sha]of [[null,null],['../private','a'.repeat(40)],['runtime/src/lib.rs','main'],['runtime/src/lib.rs','a'.repeat(39)]]){
  await assert.rejects(readPublicChain(path,sha,()=>assert.fail('非法坐标禁止联网')));
 }
 for(const request of [async()=>{throw Error('synthetic network failure');},async()=>new Response('',{status:302}),async()=>new Response('',{status:404}),async()=>new Response(Buffer.alloc(2*1024**2+1)),async()=>new Response(new Uint8Array([255]))])await assert.rejects(readPublicChain(path,sha,request),/准确提交真源读取失败/u);
});

// 用隔离的合成Git提交验证门禁读取真实初始内容；不修改产品仓或调用仓库保存/推送。
test('保留源码不按每文件汉字数量判定，真实第一方临时注释仍拒绝', async () => {
  const [{ mkdtempSync, mkdirSync, writeFileSync, rmSync }, { join }, { testRoot: tmpdir }, { execFileSync }, { validateQuality }] = await Promise.all([
    import('node:fs'), import('node:path'), import('../../scripts/build.mjs'), import('node:child_process'), import('./index.mjs'),
  ]);
  const root = mkdtempSync(join(tmpdir(), 'tatagate-quality-'));
  const env = { HOME: process.env.HOME, PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C',
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
    GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' };
  const git = (...args) => execFileSync('/usr/bin/git', ['-C', root, ...args], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    git('init', '--quiet', '--initial-branch=main');
    mkdirSync(join(root, 'test'));
    writeFileSync(join(root, 'test', 'example.test.mjs'), 'export const fixture = true;\n');
    const base = git('hash-object', '-w', '-t', 'tree', '/dev/null');
    for (const [source, rejected] of [
      ['export const value = 1;\n', false],
      ['// Retained implementation explanation.\nexport const value = 1;\n', false],
      ['// Generated file; do not edit.\nexport const value = 1;\n', false],
      ['// HACK: unfinished first-party implementation.\nexport const value = 1;\n', true],
    ]) {
      writeFileSync(join(root, 'source.mjs'), source);
      git('add', '--all');
      const head = git('commit-tree', git('write-tree'), '-m', 'synthetic quality input');
      git('update-ref', 'refs/heads/main', head);
      const run = () => validateQuality(root, base, head, gateContract().repository);
      if (rejected) await assert.rejects(run(), /第一方|产品实现代码保留临时注释/u);
      else await assert.doesNotReject(run());
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// 准确坐标、首次提交、唯一无父根和带父覆盖分别验证，防止历史清理扩大强推范围。
test('历史清理仅接受唯一无父新根并完整检查全部内容', async () => {
  const { pushBaseSHA } = await import('./index.mjs');
  const headSHA = 'a'.repeat(40), before = 'b'.repeat(40), empty = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
  const reset = { forced: true, before, headSHA, parents: headSHA, commitCount: '1' };
  assert.equal(pushBaseSHA({ forced: false, before, headSHA }), before);
  assert.equal(pushBaseSHA({ forced: false, before: '0'.repeat(40), headSHA }), empty);
  assert.equal(pushBaseSHA(reset), empty);
  for (const invalid of [
    { ...reset, parents: headSHA + ' ' + before }, { ...reset, commitCount: '2' },
    { ...reset, parents: '' }, { ...reset, forced: 'true' },
    { ...reset, before: 'main' }, { ...reset, headSHA: 'main' },
    { ...reset, headSHA: '0'.repeat(40) }, { ...reset, before: '0'.repeat(40) },
  ]) assert.throws(() => pushBaseSHA(invalid));
});

// 本仓target是唯一源码内生成边界；嵌套或链接旁路仍必须拒绝。
test('产品门禁允许自有根target并拒绝嵌套与链接输出', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, unlinkSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { testRoot } = await import('../../scripts/build.mjs');
  const { assertNoProductOutputDirectories, gateContract } = await import('./index.mjs');
  const fixture = mkdtempSync(join(testRoot(), 'target-boundary-'));
  const root = join(fixture, 'source'), target = join(root, 'target');
  mkdirSync(root);
  try {
    mkdirSync(join(target, 'test', 'build'), { recursive: true });
    writeFileSync(join(target, 'test', 'build', 'generated.txt'), 'generated fixture');
    assert.doesNotThrow(() => assertNoProductOutputDirectories(root, gateContract().repository));
    const nested = join(root, 'source', 'target');
    mkdirSync(nested, { recursive: true });
    assert.throws(() => assertNoProductOutputDirectories(root, gateContract().repository), /生成状态目录/u);
    rmSync(join(root, 'source'), { recursive: true });
    rmSync(target, { recursive: true });
    const outside = join(fixture, 'outside'); mkdirSync(outside);
    symlinkSync(outside, target, 'dir');
    assert.throws(() => assertNoProductOutputDirectories(root, gateContract().repository), /生成状态目录/u);
    // 仅移除夹具链接自身，保留指向的普通目录，避免误清理目标。
    unlinkSync(target);
    writeFileSync(target, 'ordinary file');
    assert.throws(() => assertNoProductOutputDirectories(root, gateContract().repository), /生成状态目录/u);
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});

// 所属根文档验收只读本仓，负向夹具在本产品target内，不借其它仓库资料。
test('所属根技术文档拒绝缺失、空文件、链接、副本与错误文件类型', async () => {
  const { validateProductDocuments } = await import('./index.mjs');
  const { mkdtempSync, writeFileSync, unlinkSync, symlinkSync, mkdirSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { testRoot } = await import('../../scripts/build.mjs');
  const root = mkdtempSync(join(testRoot(), 'product-documents-'));
  const names = ["TuyuFactory.md"];
  try {
    assert.throws(() => validateProductDocuments(root), /根技术文档/u);
    for (const name of names) writeFileSync(join(root, name), '产品技术文档\n');
    writeFileSync(join(root, 'README.md'), '产品简介\n');
    assert.equal(validateProductDocuments(root), true);
    const file = join(root, names[0]);
    writeFileSync(file, '');
    assert.throws(() => validateProductDocuments(root), /根技术文档/u);
    unlinkSync(file); symlinkSync(join(root, 'README.md'), file);
    assert.throws(() => validateProductDocuments(root), /根技术文档/u);
    unlinkSync(file); mkdirSync(file);
    assert.throws(() => validateProductDocuments(root), /根技术文档/u);
    rmSync(file, { recursive: true }); writeFileSync(file, '产品技术文档\n');
    writeFileSync(join(root, 'Extra.md'), '第二技术文档\n');
    assert.throws(() => validateProductDocuments(root), /额外技术文档/u);
    unlinkSync(join(root, 'Extra.md'));
    const readme = join(root, 'README.md'); unlinkSync(readme); symlinkSync(file, readme);
    assert.throws(() => validateProductDocuments(root), /非空普通原件/u);
    unlinkSync(readme); writeFileSync(readme, '产品简介\n');
    assert.equal(validateProductDocuments(root), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// 文档迁出后保留同等资料扫描，测试只使用合成材料。
test('根技术文档机密扫描保留正文、令牌和转义快照拒绝', async () => {
  const { hasSecretMaterial } = await import('./index.mjs');
  const header = type => '-----BEGIN ' + type + 'PRIVATE KEY-----';
  const footer = type => '-----END ' + type + 'PRIVATE KEY-----';
  for (const type of ['', 'RSA ', 'EC ', 'OPENSSH ']) {
    const begin = header(type), end = footer(type);
    assert.equal(hasSecretMaterial('识别格式 ' + JSON.stringify(begin)), false);
    assert.equal(hasSecretMaterial(begin + '\\n\\(fixtureData.base64EncodedString())\\n' + end), false);
    const shaped = begin + '\n' + 'A'.repeat(96) + '\n' + end;
    assert.equal(hasSecretMaterial(shaped), true);
    assert.equal(hasSecretMaterial(shaped.replaceAll('\n', '\\n')), true);
    assert.equal(hasSecretMaterial(JSON.stringify({ original: shaped })), true);
    const escaped = JSON.stringify({ original: shaped }).replace('BEGIN', '\\u0042EGIN');
    assert.equal(hasSecretMaterial(escaped), true);
    assert.equal(hasSecretMaterial(JSON.stringify({ original: JSON.stringify(shaped).replace('BEGIN', '\\u0042EGIN') })), true);
    assert.equal(hasSecretMaterial(JSON.stringify({ [shaped]: '合成键名' }).replace('BEGIN', '\\u0042EGIN')), true);
    const snapshot = '<!-- PATCH_DATA\n' + escaped + '\nPATCH_DATA -->';
    assert.equal(hasSecretMaterial(snapshot), true);
    assert.equal(hasSecretMaterial(begin + '\n' + 'A'.repeat(32)), true);
  }
  for (const [prefix, length] of [['AKIA', 16], ['github_pat_', 20], ['ghp_', 30], ['sk_live_', 16]]) {
    assert.equal(hasSecretMaterial(prefix + 'A'.repeat(length)), true);
    assert.equal(hasSecretMaterial(JSON.stringify({ example: prefix + 'A'.repeat(length) })), true);
  }
  assert.equal(hasSecretMaterial('格式说明，没有凭据正文'), false);
  assert.equal(hasSecretMaterial(header('') + '\nfixture-only\n' + footer('')), false);
  assert.throws(() => hasSecretMaterial('<!-- PATCH_DATA\n{}'), /快照结构/u);
  assert.throws(() => hasSecretMaterial('<!-- PATCH_DATA\ninvalid\nPATCH_DATA -->'), /快照结构/u);
  assert.throws(() => hasSecretMaterial(null), /输入必须/u);
});

// 真实资源只免除唯一官方归档字段；负向输入仍经完整Git跟踪文件扫描，现场归本产品。
test('官方Flutter归档字段不冒充旧平台标识，其它残留和伪造声明仍拒绝', async () => {
  const { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { execFileSync } = await import('node:child_process');
  const { testRoot } = await import('../../scripts/build.mjs');
  const { validatePlatformNaming } = await import('./index.mjs');
  const root = mkdtempSync(join(testRoot(), 'tatagate-platform-'));
  const gitBin = '/usr/bin/git';
  const env = { HOME: process.env.HOME, PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C',
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
  const git = (...args) => execFileSync(gitBin, ['-C', root, ...args], { env, stdio: ['ignore','pipe','pipe'] });
  const source = readFileSync(new URL('../../scripts/resources.mjs', import.meta.url), 'utf8');
  const literal = source.match(/^const toolDefinitions=(\[.*\]);$/mu)[1];
  const tool = JSON.parse(literal).find(value => value.id === 'flutter');
  const legacy = ['macos','arm64'].join('_');
  const declaration = tools => 'const toolDefinitions=' + JSON.stringify(tools) + ';\n';
  try {
    git('init', '--quiet', '--initial-branch=main');
    mkdirSync(join(root, 'scripts')); mkdirSync(join(root, '.github', 'tatagate'), { recursive: true });
    const file = join(root, 'scripts', 'resources.mjs');
    writeFileSync(join(root, '.github', 'tatagate', 'contracts.json'), JSON.stringify(gateContract()));
    writeFileSync(file, source); git('add', '--all');
    assert.doesNotThrow(() => validatePlatformNaming(root));
    // 使用本仓真实补丁；即使伪造登记摘要，原上下文以外的旧平台文字仍须拒绝。
    const { createHash } = await import('node:crypto');
    const patch = JSON.parse(source.match(/^const flutterPatch=(".*");$/mu)[1]);
    const withPatch = (value, body=patch) => declaration([value]) + 'const flutterPatch=' + JSON.stringify(body) + ';\n';
    const altered = (change, metadata=()=>{}, refresh=false) => {
      const value=structuredClone(tool), body=change(patch);
      if (refresh) value.patch.sha256=createHash('sha256').update(body).digest('hex');
      metadata(value.patch);
      return withPatch(value,body);
    };
    writeFileSync(file, withPatch(tool));
    assert.doesNotThrow(() => validatePlatformNaming(root));
    const marker=['macos','arm64'].join(' ');
    const original=' /// ios device or '+marker+'.';
    for (const invalid of [
      altered(body=>body, value=>{value.source='https://example.invalid/commit/'+'a'.repeat(40);}),
      altered(body=>body, value=>{value.source=value.source.replace('https:','http:');}),
      altered(body=>body, value=>{value.source='https://github.com/flutter/flutter/commit/'+'0'.repeat(40);}),
      altered(body=>body, value=>{value.sha256='0'.repeat(64);}),
      altered(body=>body, value=>{value.path='other.patch';}),
      altered(body=>body, value=>{value.extra='unexpected';}),
      altered(body=>body+'\n'),
      altered(body=>body.replace('Future<void> lipoDylibs','Future<void> changed'),()=>{},true),
      altered(body=>body.replaceAll('native_assets_host.dart','other.dart'),()=>{},true),
      altered(body=>body.replace(original,'+/// ios device or '+marker+'.'),()=>{},true),
      altered(body=>body+'\n+// '+marker+'\n',()=>{},true),
      altered(body=>body+'\n'+body,()=>{},true),
      withPatch(tool)+'const flutterPatch='+JSON.stringify(patch)+';\n',
      withPatch(tool).replace('fixed source','fixed\\u0020source'),
      declaration([tool])+'const flutterPatch='+JSON.stringify(patch).slice(0,-1)+';\n',
      withPatch(tool)+'// '+marker+'\n',
    ]) {
      writeFileSync(file,invalid);
      assert.throws(() => validatePlatformNaming(root), /禁用平台命名/u);
    }
    writeFileSync(file, declaration([tool]));
    assert.doesNotThrow(() => validatePlatformNaming(root));
    const changed = change => { const value = structuredClone(tool); change(value); return declaration([value]); };
    for (const invalid of [
      changed(value => { value.archive.url = value.archive.url.replace('storage.googleapis.com','example.invalid'); }),
      changed(value => { value.archive.url = value.archive.url.replace('https:','http:'); }),
      changed(value => { value.version = '0.0.0'; }),
      changed(value => { value.archive.url = value.archive.url.replace('-stable.zip','-other.zip'); }),
      changed(value => { value.source = 'https://example.invalid/releases.json'; }),
      changed(value => { value.archive.root = 'other'; }),
      changed(value => { value.archive.executable = 'other'; }),
      changed(value => { value.title = legacy; }),
      changed(value => { value.archive.extra = legacy; }),
      declaration([tool, tool]),
      declaration([tool]) + declaration([tool]),
      declaration([tool]).replace('"version":', '"id":"other","version":'),
      declaration([tool]).replace('"flutter"', '"flutt\\u0065r"'),
      'const toolDefinitions=[invalid];\n// ' + legacy,
      declaration([tool]) + '// ' + legacy,
    ]) {
      writeFileSync(file, invalid);
      assert.throws(() => validatePlatformNaming(root), /禁用平台命名/u);
    }
    writeFileSync(file, declaration([tool]));
    const other = join(root, 'other.mjs');
    writeFileSync(other, declaration([tool])); git('add', '--all');
    assert.throws(() => validatePlatformNaming(root), /禁用平台命名/u);
    rmSync(other); git('add', '--all');
    for (const alias of gateContract().platform_forbidden_values) {
      writeFileSync(file, declaration([tool]) + '// ' + alias);
      assert.throws(() => validatePlatformNaming(root), /禁用平台命名/u);
    }
    writeFileSync(file, declaration([tool]));
    mkdirSync(join(root, legacy)); writeFileSync(join(root, legacy, 'source.mjs'), 'export const fixture=true;\n');
    git('add', '--all');
    assert.throws(() => validatePlatformNaming(root), /禁用平台目录/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// 用真实门禁函数检查登记与执行回执；这些用例在整项实现后统一运行。
test('本仓Git测试集合不得漏项、增项、重复或混入门禁自身', async () => {
  const { validateNodeInventory } = await import('./index.mjs');
  const paths = ['scripts/build.mjs', 'test/helper.test.mjs', 'test/api.spec.mjs', '.github/tatagate/test.mjs'];
  const registered = ['scripts/build.mjs', 'test/helper.test.mjs', 'test/api.spec.mjs'];
  const inventory=(paths,registered)=>validateNodeInventory(paths,registered,undefined,['scripts/build.mjs']);
  assert.deepEqual(inventory(paths, registered), [...registered].sort());
  for (const listed of [registered.slice(1), [...registered, 'missing.test.mjs'], [...registered, registered[0]], []]) {
    assert.throws(() => inventory(paths, listed));
  }
  assert.throws(() => inventory([...paths, 'scripts/new.test.mjs'], registered));
  assert.throws(() => inventory([...paths, paths[0]], registered));
  assert.throws(()=>validateNodeInventory([...paths,'scripts/new.mjs'],registered,undefined,['scripts/build.mjs','scripts/new.mjs']));
});
test('成功退出但零用例、失败、取消或跳过不能作为完整测试回执', async () => {
  const { successfulTestSummary } = await import('./index.mjs');
  const counts = { tests: 2, passed: 2, failed: 0, skipped: 0, todo: 0, cancelled: 0 };
  assert.equal(successfulTestSummary({ success: true, counts }), true);
  for (const change of [{ tests: 0 }, { passed: 0 }, { failed: 1 }, { skipped: 1 }, { todo: 1 }, { cancelled: 1 }]) {
    assert.equal(Boolean(successfulTestSummary({ success: true, counts: { ...counts, ...change } })), false);
  }
  assert.equal(Boolean(successfulTestSummary({ success: false, counts })), false);
  assert.equal(Boolean(successfulTestSummary({ success: true })), false);
});
test('资源中的注释文本与正则字面量不是第一方代码注释', async () => {
  const { commentText, hasFirstPartyTemporaryComments } = await import('./index.mjs');
  const source = 'const patch = "// TODO upstream\\n/* FIXME original */";\nconst literal = /\\/\\/ XXX/;\n// 正常中文实现说明\n';
  assert.equal(hasFirstPartyTemporaryComments('scripts/resources.mjs', source), false);
  assert.match(commentText('module.mjs', source), /正常中文实现说明/u);
  assert.equal(hasFirstPartyTemporaryComments('module.mjs', source + '// TODO first party\n'), true);
  assert.equal(hasFirstPartyTemporaryComments('module.rs', 'let raw = r##"// TODO raw"##;\n// 中文说明\n'), false);
  assert.equal(hasFirstPartyTemporaryComments('module.rs', "fn bind<'a>() {} // FIXME actual\n"), true);
});

// 真实词法和消费者闭合，模板表达式中的真实注释仍参与检查。
test('注释检查区分模板正文、模板表达式、Python文串和真实行尾注释',async()=>{
 const {hasFirstPartyTemporaryComments}=await import('./index.mjs');
 assert.equal(hasFirstPartyTemporaryComments('module.mjs','const value=`// TODO text ${1}`;'),false);
 assert.equal(hasFirstPartyTemporaryComments('module.mjs','const value=`text ${(()=>{ // FIXME actual\n return 1; })()}`;'),true);
 assert.equal(hasFirstPartyTemporaryComments('module.py','value="""# TODO text"""\nvalue=1 # FIXME actual\n'),true);
 assert.equal(hasFirstPartyTemporaryComments('module.py','value="""# TODO text"""\n'),false);
});
// 使用真实Node运行器和实际门禁Reporter；不以伪造汇总对象代替最终执行回执。
test('实际NodeReporter拒绝漏文件、零用例、跳过和失败',async()=>{
 const [{mkdtempSync,writeFileSync,rmSync},{join},{testRoot},{spawnSync},{fileURLToPath}]=await Promise.all([import('node:fs'),import('node:path'),import('../../scripts/build.mjs'),import('node:child_process'),import('node:url')]);
 const work=mkdtempSync(join(testRoot(),'gate-reporter-')),file=join(work,'case.test.mjs'),reporter=fileURLToPath(new URL('./index.mjs',import.meta.url));
 try{
  for(const [body,extra,success]of [
   ['import test from "node:test";test("正常夹具",()=>{});',[],true],
   ['export const noTests=true;',[],false],
   ['import test from "node:test";test.skip("跳过夹具",()=>{});',[],false],
   ['import test from "node:test";test("失败夹具",()=>{throw Error("synthetic failure")});',[],false],
   ['import test from "node:test";test("漏项夹具",()=>{});',[join(work,'missing.test.mjs')],false],
  ]){
   // 子Node必须是独立运行器；保留产品工具输入，只移除父运行器的内部测试上下文。
   const childEnvironment={...process.env,TATAGATE_NODE_TESTS:JSON.stringify([file,...extra])};delete childEnvironment.NODE_TEST_CONTEXT;
   writeFileSync(file,body);const result=spawnSync(process.execPath,['--test','--test-reporter='+reporter,file],{env:childEnvironment,encoding:'utf8',timeout:30000,maxBuffer:2*1024**2});
   assert.equal(result.error,undefined);assert.equal(result.signal,null);assert.equal(result.status===0,success,result.stdout+result.stderr);
  }
 }finally{rmSync(work,{recursive:true,force:true});}
});

test('实际语言回执拒绝零用例、跳过、失败及不完整终态',async()=>{
 const {validateLanguageResult}=await import('./index.mjs');
 const vitest={success:true,numTotalTests:2,numPassedTests:2,numFailedTests:0,numPendingTests:0,numTodoTests:0};assert.equal(validateLanguageResult('vitest',JSON.stringify(vitest)),true);
 for(const change of [{numTotalTests:0,numPassedTests:0},{numPassedTests:1},{numPendingTests:1},{success:false}])assert.throws(()=>validateLanguageResult('vitest',JSON.stringify({...vitest,...change})));
 const flutter=JSON.stringify({type:'testDone',result:'success',skipped:false,hidden:false})+'\n'+JSON.stringify({type:'done',success:true});assert.equal(validateLanguageResult('flutter',flutter),true);
 for(const invalid of ['',JSON.stringify({type:'done',success:true}),flutter.replace('"skipped":false','"skipped":true'),flutter.replace('"success":true','"success":false')])assert.throws(()=>validateLanguageResult('flutter',invalid));
 assert.equal(validateLanguageResult('cargo','test result: ok. 2 passed; 0 failed; 0 ignored;'),true);
 for(const invalid of ['', 'test result: ok. 0 passed; 0 failed; 0 ignored;', 'test result: ok. 2 passed; 0 failed; 1 ignored;'])assert.throws(()=>validateLanguageResult('cargo',invalid));
});

test('代码变化必须同步所属文档与非空回归差异',async()=>{
 const {validateChangeEvidence}=await import('./index.mjs');
 assert.equal(validateChangeEvidence(['src/main.mjs','Owned.md','scripts/main.test.mjs'],['Owned.md']),true);
 assert.equal(validateChangeEvidence(['Owned.md'],['Owned.md']),true);
 for(const paths of [['src/main.mjs'],['src/main.mjs','Owned.md'],['src/main.mjs','Foreign.md','scripts/main.test.mjs']])assert.throws(()=>validateChangeEvidence(paths,['Owned.md']));
 assert.throws(()=>validateChangeEvidence(['src/main.mjs','Owned.md','scripts/main.test.mjs'],['Owned.md'],{changed:path=>path!=='Owned.md'}));
});

// 调用真实结果核验接口；合成协议事件仅验证核验器，不能作为产品功能通过证据。
test('功能映射必须闭合，拒绝遗漏类型、重复来源和路径越界',async()=>{
 const {validateFunctionalContract,gateContract}=await import('./index.mjs');const list=structuredClone(gateContract().functions);
 assert.equal(validateFunctionalContract(list),true);
 for(const invalid of [[],[...list,list[0]],list.map((item,index)=>index?item:{...item,path:'../foreign.test.mjs'}),list.map((item,index)=>index?item:{...item,target:'/foreign/Cargo.toml'}),list.map((item,index)=>index?item:{...item,runner:'skip'}),list.map((item,index)=>index?item:{...item,unknown:true})])assert.throws(()=>validateFunctionalContract(invalid));
 const value=structuredClone(gateContract());value.functions=value.functions.filter(item=>item.path!==value.node_tests[0]);assert.throws(()=>gateContract(value));
});
test('Vitest必须逐一完成本仓具名文件，错路径、漏跑和重复结果均拒绝',async()=>{
 const {functionalFiles}=await import('./index.mjs');const root='/owned/source',paths=['test/one.test.ts','test/two.test.ts'];
 const suite=name=>({name:root+'/'+name,assertionResults:[{status:'passed'}]}),value={success:true,numTotalTests:2,numPassedTests:2,numFailedTests:0,numPendingTests:0,numTodoTests:0,testResults:paths.map(suite)};
 assert.deepEqual(functionalFiles('vitest',JSON.stringify(value),paths,[root]),paths.map(path=>({path,tests:1})));
 for(const change of [{testResults:[suite(paths[0])]},{testResults:[suite(paths[0]),suite(paths[0])]},{testResults:[suite(paths[0]),{...suite(paths[1]),name:'/foreign/'+paths[1]}]},{testResults:[suite(paths[0]),{...suite(paths[1]),assertionResults:[]}]},{testResults:[suite(paths[0]),{...suite(paths[1]),assertionResults:[{status:'skipped'}]}]}])assert.throws(()=>functionalFiles('vitest',JSON.stringify({...value,...change}),paths,[root]));
});
test('Flutter加载事件不能代替实际用例，每个本仓套件均需成功',async()=>{
 const {functionalFiles}=await import('./index.mjs');const path='test/feature_test.dart',events=[{type:'suite',suite:{id:1,path:'/owned/source/'+path}},{type:'testStart',test:{id:1,suiteID:1,name:'真实协议夹具',hidden:false}},{type:'testDone',testID:1,hidden:false,result:'success',skipped:false},{type:'done',success:true}];
 const text=value=>value.map(row=>JSON.stringify(row)).join('\n');
 assert.deepEqual(functionalFiles('flutter',text(events),[path],['/owned/source']),[{path,tests:1}]);
 for(const value of [events.filter(item=>item.type!=='testDone'),events.map(item=>item.type==='testDone'?{...item,skipped:true}:item),events.map(item=>item.type==='suite'?{...item,suite:{...item.suite,path:'/foreign/'+path}}:item),[events[0],events[1],events[2],events[2],events[3]]])assert.throws(()=>functionalFiles('flutter',text(value),[path],['/owned/source']));
 assert.throws(()=>functionalFiles('flutter',text(events),[path,'test/missing_test.dart'],['/owned/source']));
});
test('Rust功能结果必须属于准确包，完整摘要不等于具名用例执行',async()=>{
 const {functionalRustCases}=await import('./index.mjs'),items=[{path:'src/auth.rs',package:'owned-package',cases:['reject_expired']},{path:'tests/boundary.rs',package:'owned-package',cases:['reject_foreign']}];
 const value='test auth::reject_expired ... ok\ntest reject_foreign ... ok\ntest result: ok. 2 passed; 0 failed; 0 ignored;';
 assert.deepEqual(functionalRustCases(value,items),items.map(item=>({path:item.path,cases:item.cases})));
 for(const invalid of [value.replace('test reject_foreign ... ok\n',''),value.replace('0 ignored','1 ignored'),value.replace('2 passed','0 passed')])assert.throws(()=>functionalRustCases(invalid,items));
 assert.throws(()=>functionalRustCases(value,[items[0],{...items[1],package:'foreign-package'}]));
 assert.throws(()=>functionalRustCases(value,[items[0],{...items[1],cases:['reject_expired']} ]));
});

// 固定协调参数不承载产品产物；目录身份及空状态必须真实验证。
test('门禁请求协调目录拒绝相对、源码和无效目录',async()=>{
 const {validateGateRequestWork}=await import('./index.mjs');
 assert.throws(()=>validateGateRequestWork('/owned/source','relative/work'));
 assert.throws(()=>validateGateRequestWork('/owned/source','/nonexistent/owned/gate-work'));
});

// 回读本仓实际已跟踪测试来源；完整映射不可空跑、漏登记或混入不存在的入口。
test('本仓真实功能源码清单与登记准确闭合',async()=>{
 const [{validateFunctionalInventory},{fileURLToPath}]=await Promise.all([import('./index.mjs'),import('node:url')]);
 const root=fileURLToPath(new URL('../../',import.meta.url)).replace(/\/$/u,'');
 assert.equal(validateFunctionalInventory(root).length,gateContract().functions.length);
 assert.throws(()=>validateFunctionalInventory(root,gateContract().functions.slice(1)),/本仓功能测试存在遗漏/u);
 assert.throws(()=>validateFunctionalInventory(root,[...gateContract().functions,{function:'不存在的入口',path:'missing.test.mjs',runner:'node',target:'.'}]),/本仓功能测试存在遗漏/u);
});
