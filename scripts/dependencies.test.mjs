import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { prepareWebView2, prepareWebView2SDK, webView2CabFiles } from './dependencies.mjs';

const root = 'Microsoft.WebView2.FixedVersionRuntime.152.0.4191.62.x64';
const names = ['msedgewebview2.exe', 'msedge.dll', 'icudtl.dat', 'resources.pak'];
// 合成CAB只验证实际文件表解析，不伪造微软签名或原生运行态通过。
function cab(paths = names.map(name => root + '/' + name)) {
  const entries = paths.map(path => {
    const name = Buffer.from(path + '\0');
    const entry = Buffer.alloc(16 + name.length);
    entry.writeUInt32LE(1, 0);
    name.copy(entry, 16);
    return entry;
  });
  const first = 68 + entries.reduce((sum, entry) => sum + entry.length, 0);
  const signature = first + 8;
  const bytes = Buffer.alloc(signature + 128);
  bytes.write('MSCF', 0, 'ascii');
  bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(68, 16);
  bytes.writeUInt16LE(1, 26);
  bytes.writeUInt16LE(paths.length, 28);
  bytes.writeUInt16LE(4, 30);
  bytes.writeUInt16LE(20, 36);
  bytes.writeUInt32LE(signature, 44);
  bytes.writeUInt32LE(128, 48);
  bytes.writeUInt32LE(first, 60);
  let offset = 68;
  for (const entry of entries) { entry.copy(bytes, offset); offset += entry.length; }
  return bytes;
}
test('固定CAB完整成员与产品依赖声明保持唯一官方版本和来源', () => {
  const files = webView2CabFiles(cab(), root);
  assert.deepEqual(files.map(x => x.path), names.map(name => root + '/' + name));
  assert.ok(Object.isFrozen(files) && files.every(Object.isFrozen));
  const value = JSON.parse(readFileSync(new URL('./dependencies.json', import.meta.url), 'utf8'));
  assert.equal(value.product, 'tuyufactory-client');
  assert.equal(value.platform, 'windows');
  assert.equal(value.runtime.version, '152.0.4191.62');
  assert.equal(value.sdk.version, '1.0.3537.50');
  assert.equal(value.runtime.root, root);
  assert.ok([value.runtime, value.sdk].every(x => new URL(x.url).protocol === 'https:' && /^[a-f0-9]{64}$/u.test(x.sha256)));
});
test('CAB拒绝越界、大小写冲突、目录覆盖、缺件、坏头及截断签名', () => {
  for (const extra of [root + '/../escape', root + '/MSedge.dll', root + '/CON.txt',
    root + '/nested.', root + '/msedge.dll/child']) {
    assert.throws(() => webView2CabFiles(cab([...names.map(n => root + '/' + n), extra]), root));
  }
  assert.throws(() => webView2CabFiles(cab(names.slice(0, 3).map(n => root + '/' + n)), root), /缺少/u);
  assert.throws(() => webView2CabFiles(Buffer.alloc(68), root), /CAB头/u);
  assert.throws(() => webView2CabFiles(cab().subarray(0, -1), root), /签名边界/u);
  assert.throws(() => webView2CabFiles(cab(), '../wrong'), /CAB头/u);
  const malformed = cab(); malformed.writeUInt16LE(1, 68 + 8);
  assert.throws(() => webView2CabFiles(malformed, root), /条目/u);
});
test('没有准确Windows x64工作根与本产品身份，下载及展开入口必须拒绝', async () => {
  await assert.rejects(prepareWebView2({ work: '.', environment: {} }));
  await assert.rejects(prepareWebView2SDK({ work: '.', environment: {} }));
});
