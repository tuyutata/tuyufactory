#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { closeSync, cpSync, mkdirSync, openSync, readFileSync, rmSync, lstatSync, realpathSync, writeFileSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { crc32, inflateRawSync } from 'node:zlib';
import { packageTarget, packageSignature, packageInside, packageDestination, verifyPackage, verifyPackageFiles, verifySdkDependency } from './verify.mjs';

// 只组装/验证已有client编译结果；不调用Flutter、SDK构建、签名、CI或发布。
// 正式APK必须完整验签后原样复制；payload只是候选阶段，不能据此发布或安装。
export function* apkFiles(archive, {links = false} = {}) {
  let end = -1;
  for (let offset = archive.length - 22; offset >= Math.max(0, archive.length - 65557); offset--) {
    if (archive.readUInt32LE(offset) === 0x06054b50 && offset + 22 + archive.readUInt16LE(offset + 20) === archive.length) { end = offset; break; }
  }
  if (end < 0 || archive.readUInt16LE(end + 4) || archive.readUInt16LE(end + 6)) throw new Error('APK不是单卷ZIP');
  const count = archive.readUInt16LE(end + 10), size = archive.readUInt32LE(end + 12);
  let offset = archive.readUInt32LE(end + 16), total = 0;
  if (!count || count === 65535 || count !== archive.readUInt16LE(end + 8) || offset + size !== end) throw new Error('APK中央目录无效或不支持ZIP64');
  const limit = offset, seen = new Set(), spans = [];
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || archive.readUInt32LE(offset) !== 0x02014b50) throw new Error('APK目录项损坏');
    const flags = archive.readUInt16LE(offset + 8), method = archive.readUInt16LE(offset + 10);
    const compressed = archive.readUInt32LE(offset + 20), length = archive.readUInt32LE(offset + 24);
    const nameLength = archive.readUInt16LE(offset + 28), extra = archive.readUInt16LE(offset + 30), comment = archive.readUInt16LE(offset + 32);
    const local = archive.readUInt32LE(offset + 42), attributes = archive.readUInt32LE(offset + 38);
    if (offset + 46 + nameLength + extra + comment > end || flags & 1 || ![0, 8].includes(method) ||
        ![0,0x8000,0x4000,0xa000].includes((attributes >>> 16) & 0xf000) ||
        (!links && ((attributes >>> 16) & 0xf000) === 0xa000) || length > 512 * 1024 * 1024 || (total += length) > 2 * 1024 * 1024 * 1024) throw new Error('APK包含加密、链接、超限或不支持的内容');
    const nameBytes = archive.subarray(offset + 46, offset + 46 + nameLength), name = nameBytes.toString('utf8');
    if (!name || !Buffer.from(name).equals(nameBytes) || /[\\:\x00-\x1f]/.test(name) || name.startsWith('/') || name.includes('//') || name.split('/').some(p => p === '.' || p === '..') || seen.has(name.toLowerCase())) throw new Error('APK路径越界或重复');
    seen.add(name.toLowerCase());
    if (local + 30 > limit || archive.readUInt32LE(local) !== 0x04034b50 || archive.readUInt16LE(local + 8) !== method || archive.readUInt16LE(local + 6) !== flags) throw new Error('APK本地头与中央目录不一致');
    const localName = archive.readUInt16LE(local + 26), start = local + 30 + localName + archive.readUInt16LE(local + 28);
    if (start + compressed > limit || !archive.subarray(local + 30, local + 30 + localName).equals(nameBytes)) throw new Error('APK文件范围错误');
    if (spans.some(([begin,end]) => local < end && start + compressed > begin)) throw new Error('ZIP文件范围重叠');
    spans.push([local,start + compressed]);
    const input = archive.subarray(start, start + compressed);
    const value = method === 0 ? input : inflateRawSync(input, {maxOutputLength: Math.max(1, length)});
    if (value.length !== length) throw new Error('APK展开长度不符');
    if (crc32(value) !== archive.readUInt32LE(offset + 16)) throw new Error('ZIP内容CRC不符');
    const link = ((attributes >>> 16) & 0xf000) === 0xa000;
    if (link) {
      const target = value.toString('utf8'), destination = posix.normalize(posix.join(posix.dirname(name), target));
      if (!Buffer.from(target).equals(value) || !target || /[\\:\x00-\x1f]/.test(target) || target.startsWith('/') || destination === '..' || destination.startsWith('../')) throw new Error('ZIP链接越界');
    }
    if (!name.endsWith('/')) yield [name, value, link];
    offset += 46 + nameLength + extra + comment;
  }
  if (offset !== end) throw new Error('APK目录大小不符');
}

async function inspect(source, platform, signature) {
  if (platform !== 'android') return verifyPackage(source, 'client', platform, {signature});
  if (signature === 'signed') execFileSync('apksigner', ['verify', '--verbose', source], {stdio: 'pipe'});
  const identity = execFileSync('apkanalyzer', ['manifest', 'application-id', source], {encoding: 'utf8'}).trim();
  return verifyPackageFiles('client', platform, apkFiles(readFileSync(source)), identity, 'lib/arm64-v8a/libapp.so');
}

export async function buildClient(platform, source, output, application, environment = process.env, signature) {
  packageTarget('client', platform);
  packageSignature(signature);
  const work = environment.TUYUFACTORY_WORK_DIR;
  packageDestination(work, output, 'client', platform, environment);
  if (!source || resolve(source) !== source || source === output || packageInside(source, output) || packageInside(output, source) ||
      lstatSync(source).isSymbolicLink() || realpathSync(source) !== source || !packageInside(work, source)) throw new Error('client输入必须是当前任务内独立的准确编译结果');
  verifySdkDependency(application, environment);
  await inspect(source, platform, signature);
  // 目标排他占有后才获得清理权限；失败绝不删除来源和已存在的成功产物。
  let fd = platform === 'android' ? openSync(output, 'wx', 0o644) : undefined;
  if (platform !== 'android') mkdirSync(output);
  const owned = lstatSync(output);
  try {
    if (fd !== undefined) writeFileSync(fd, readFileSync(source));
    else cpSync(source, output, {recursive: true, force: false, errorOnExist: true, verbatimSymlinks: true});
    await inspect(output, platform, signature);
  } catch (error) {
    if (fd !== undefined) { closeSync(fd); fd = undefined; }
    const current = lstatSync(output);
    if (current.isSymbolicLink() || current.dev !== owned.dev || current.ino !== owned.ino) throw new Error('client失败输出归属已变化，保留现场');
    rmSync(output, {recursive: true, force: true});
    throw error;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  return output;
}

// AAB 使用官方 aapt.pb.XmlNode，不把压缩包字符串匹配当作安装身份。
// 字段来源：AOSP frameworks/base/tools/aapt2/Resources.proto。
export function bundleIdentity(bytes) {
  const fields = value => {
    const output = new Map(); let at = 0;
    const integer = () => { let result = 0, shift = 0; for (;;) {
      if (at >= value.length || shift > 49) throw new Error('AAB protobuf截断或溢出');
      const byte = value[at++]; result += (byte & 127) * 2 ** shift;
      if (!(byte & 128)) return result; shift += 7;
    }};
    while (at < value.length) {
      const tag = integer(), field = Math.floor(tag / 8), wire = tag & 7;
      if (!field || ![0,1,2,5].includes(wire)) throw new Error('AAB protobuf字段无效');
      let data;
      if (wire === 0) { integer(); continue; }
      const size = wire === 2 ? integer() : wire === 1 ? 8 : 4;
      if (at + size > value.length) throw new Error('AAB protobuf字段越界');
      data = value.subarray(at, at + size); at += size;
      if (wire === 2) output.set(field, [...(output.get(field) ?? []), data]);
    }
    return output;
  };
  const one = (map, id) => { const values = map.get(id); if (values?.length !== 1) throw new Error('AAB清单字段缺失或重复'); return values[0]; };
  const element = fields(one(fields(bytes), 1));
  if (one(element, 3).toString() !== 'manifest') throw new Error('AAB根节点不是manifest');
  const attributes = (element.get(4) ?? []).map(fields).filter(item => one(item, 2).toString() === 'package');
  if (attributes.length !== 1 || attributes[0].get(1)?.some(value => value.length)) throw new Error('AAB缺少唯一package属性');
  return one(attributes[0], 3).toString('utf8');
}

export async function verifyClientArtifact(platform, source, application, signature, environment = process.env) {
  packageTarget('client', platform); packageSignature(signature); verifySdkDependency(application, environment);
  const work = environment.TUYUFACTORY_WORK_DIR;
  const release = environment.GITHUB_ACTIONS === 'true' && environment.GITHUB_WORKSPACE ? join(environment.GITHUB_WORKSPACE,'.release',`tuyufactory-client-${platform}`) : null;
  if (!work || (!packageInside(work, source) && !(release && packageInside(release,source))) || lstatSync(source).isSymbolicLink() || realpathSync(source) !== source) throw new Error('最终资产必须属于当前厂家任务或准确Release目录');
  if (platform === 'android' && source.endsWith('.apk')) return inspect(source, platform, signature);
  const entries = [...apkFiles(readFileSync(source), {links:platform === 'macos'})];
  const links = entries.filter(([, , link]) => link).map(([name])=>name);
  if (entries.some(([name])=>links.some(link=>name.startsWith(link+'/')))) throw new Error('ZIP文件不得通过目录链接写入');
  if (platform === 'android' && source.endsWith('.aab')) {
    if (signature === 'signed') {
      const result = execFileSync('jarsigner', ['-J-Duser.language=en', '-J-Duser.country=US', '-verify', '-verbose', source], {encoding:'utf8'});
      if (!result.includes('jar verified.') || /unsigned entries|jar is unsigned|treated as unsigned/i.test(result)) throw new Error('AAB签名未覆盖全部载荷');
    }
    const manifest = entries.find(([name]) => name === 'base/manifest/AndroidManifest.xml');
    if (!manifest || entries.some(([name]) => !/^(base\/|META-INF\/|BUNDLE-METADATA\/|BundleConfig.pb$)/.test(name))) throw new Error('AAB模块范围无效');
    return verifyPackageFiles('client', 'android', entries.map(([name,bytes]) => [name.startsWith('base/')?name.slice(5):name,bytes]), bundleIdentity(manifest[1]), 'lib/arm64-v8a/libapp.so');
  }
  if (!source.endsWith(platform === 'ios' ? '.ipa' : '.zip')) throw new Error('最终资产封装类型与平台不一致');
  const output = join(work, source.split(/[\\/]/).at(-1) + '.verify');
  packageDestination(work, output, 'client', platform, environment);
  // ZIP列表、CRC和链接先验通过才允许系统解包；临时目标排他占有且仅本次负责清理。
  mkdirSync(output);
  const owned = lstatSync(output);
  try {
    if (platform === 'windows') execFileSync('tar', ['-xf', source, '-C', output], {stdio:'pipe'});
    else execFileSync('/usr/bin/unzip', ['-q', source, '-d', output], {stdio:'pipe'});
    if (platform === 'android') {
      const names = entries.map(([name]) => name).sort();
      if (names.join(',') !== 'tuyufactory-client.aab,tuyufactory-client.apk') throw new Error('Android最终ZIP必须准确包含APK和AAB');
      for (const name of names) await verifyClientArtifact(platform, join(output,name), application, signature, environment);
      return packageTarget('client', platform);
    }
    const applications = [...new Set(entries.map(([name]) => platform === 'ios' ? name.match(/^(Payload\/[^/]+\.app)\//)?.[1] : name.match(/^([^/]+\.app)\//)?.[1]).filter(Boolean))];
    const root = platform === 'windows' ? (entries.some(([name]) => name === 'tuyufactory_client.exe') ? output : null) :
      applications.length === 1 ? join(output, applications[0]) : null;
    if (!root || (platform !== 'windows' && entries.some(([name]) => !name.startsWith(applications[0] + '/')))) throw new Error('归档必须使用产品唯一根布局，不能混入其它载荷');
    return await verifyPackage(root, 'client', platform, {signature});
  } finally {
    const current = lstatSync(output);
    if (current.isSymbolicLink() || current.dev !== owned.dev || current.ino !== owned.ino) throw new Error('归档验真目录归属已变化，保留现场');
    rmSync(output, {recursive:true, force:true});
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv[2] === '--artifact') {
    if (process.argv.length !== 7) throw new Error('usage: build_client.mjs --artifact PLATFORM SOURCE APPLICATION payload|signed');
    await verifyClientArtifact(...process.argv.slice(3));
  } else {
    if (process.argv.length !== 7) throw new Error('usage: build_client.mjs PLATFORM SOURCE OUTPUT APPLICATION payload|signed');
    await buildClient(...process.argv.slice(2,6), process.env, process.argv[6]);
  }
}
