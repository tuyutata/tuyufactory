#!/usr/bin/env node

// tuyufactory SDK准备入口只消费产品声明及锁定Git原件；工程视图由产品自己装配。
import { spawnSync } from 'node:child_process';
import { createProject } from '../app/scripts/project.mjs';
import {
  existsSync, lstatSync, readFileSync, realpathSync, rmSync,
} from 'node:fs';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const productRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const applicationRoot = join(productRoot, 'app');
const contract = JSON.parse(readFileSync(join(applicationRoot, 'sdk-dependencies.json'), 'utf8'));

function fail(message) { throw new Error(`TuyuFactory SDK依赖准备失败：${message}`); }

function argumentsMap(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 2) {
    if (!values[index]?.startsWith('--') || values[index + 1] === undefined) fail('参数必须使用--name value');
    const name = values[index].slice(2);
    if (Object.hasOwn(result, name)) fail(`参数重复：${name}`);
    result[name] = values[index + 1];
  }
  return result;
}

async function prepare(options) {
  if (Object.keys(options).some(key => !['output', 'platform', 'flutter', 'offline'].includes(key))) fail('SDK准备参数闭集无效');
  const output = resolve(options.output || '');
  if (!isAbsolute(options.output || '') || output === productRoot || output.startsWith(productRoot + sep)) {
    fail('output必须是TuyuFactory源码外绝对路径');
  }
  if (existsSync(output)) fail('output必须是全新目录');
  await createProject({ source: applicationRoot, work: realpathSync(dirname(output)), output, platform: options.platform || process.env.TUYU_PLATFORM });
  const owned = lstatSync(output);
  try {
    const locked = readFileSync(join(applicationRoot, 'pubspec.yaml'), 'utf8');
    if (contract.schema !== 1 || contract.package !== 'citizen_sdk' || !locked.includes(contract.source.url)
      || !locked.includes(contract.source.ref) || contract.source.path !== '.') fail('SDK依赖合同与受控声明不一致');
    const flutter = options.flutter || process.env.FLUTTER || 'flutter';
    const args = ['pub', 'get', '--enforce-lockfile'];
    if (options.offline === 'true') args.push('--offline');
    else if (options.offline && options.offline !== 'false') fail('offline只接受true或false');
    const result = spawnSync(flutter, args, { cwd: output, encoding: 'utf8', stdio: 'inherit' });
    if (result.error || result.status !== 0) fail(`flutter pub get失败(${result.status ?? 'spawn'})`);
    process.stdout.write(`${JSON.stringify({ schema: 1, source: contract.source, project: output })}\n`);
  } catch (error) {
    const current = lstatSync(output, { throwIfNoEntry: false });
    if (current?.isDirectory() && !current.isSymbolicLink() && current.dev === owned.dev && current.ino === owned.ino) rmSync(output, { recursive: true });
    throw error;
  }
}

try {
  const [command, ...rest] = process.argv.slice(2);
  if (command !== 'prepare') fail('只支持prepare命令');
  await prepare(argumentsMap(rest));
} catch (error) {
  process.stderr.write(`${error?.message || error}\n`);
  process.exitCode = 1;
}
