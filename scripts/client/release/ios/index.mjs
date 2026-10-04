#!/usr/bin/env node
// RELEASE_BUILD: full; CARGO_INCREMENTAL=0
// 当前入口按产品与平台验真 CI 来源，并创建对应的 GitHub Release 资产。

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { releaseDirectory } from "../../ci/ios/index.mjs";

const identity = Object.freeze({
  product: "tuyufactory", platform: "client-ios", prefix: "tuyufactory-client-ios-v",
  ciTitle: "途遇厂家端 · 分机 iOS · CI", workflow: "tuyufactory.client-ios.release",
  asset: "tuyufactory-client-ios.ipa",
});

function required(value, message) { if (!value) throw new Error(message); }
function githubJSON(args) { return JSON.parse(execFileSync("gh", args, { encoding: "utf8", env: process.env })); }
function parseVersion(value) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d{0,1})\.(0|[1-9]\d{0,1})$/.exec(value || "");
  required(match, `iOS 软件版本无效：${value || "(empty)"}`); return match.slice(1).map(Number);
}
function baseInputs() {
  const value = { repository: process.env.GITHUB_REPOSITORY, source: process.env.SOURCE_SHA, ciRunID: process.env.CI_RUN_ID };
  required(value.repository === "tuyutata/tuyufactory", "途遇厂家仓库身份无效");
  required(/^[0-9a-f]{40}$/.test(value.source || ""), "iOS Release 源提交无效");
  required(/^[1-9][0-9]*$/.test(value.ciRunID || ""), "iOS CI Run ID 无效"); return value;
}
function inputs() {
  const value = { ...baseInputs(), version: process.env.SOFTWARE_VERSION, tag: process.env.VERSION_TAG };
  parseVersion(value.version); required(value.tag === `${identity.prefix}${value.version}`, "iOS Tag 无效"); return value;
}
function verify(value) {
  required(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim() === value.source, "iOS 源码提交不一致");
  const run = githubJSON(["api", `repos/${value.repository}/actions/runs/${value.ciRunID}`]);
  required(String(run?.id) === value.ciRunID && run?.head_sha === value.source && run?.head_branch === "main"
    && run?.event === "workflow_dispatch" && run?.status === "completed" && run?.conclusion === "success"
    && String(run?.display_title || '') === identity.ciTitle && String(run?.path || "").endsWith("/tuyufactory-client-ios-ci.yml"), "iOS CI Run 身份不一致");
}
function context(value) { writeFileSync("release-context.json", `${JSON.stringify({ repository: value.repository, product_id: identity.product, platform: identity.platform, software_flow: "release", software_version: value.version, version_tag: value.tag, source_sha: value.source, ci_run_id: Number(value.ciRunID), workflow: identity.workflow }, null, 2)}\n`); }
function publish(value) { verify(value);
  const root = process.env.RELEASE_DIR; required(root, "iOS Release 资产目录缺失");
  releaseDirectory(process.cwd(), root);
  execFileSync(process.execPath, [join(process.cwd(), "scripts/build_client.mjs"), "--artifact", identity.platform, join(root, identity.asset), join(process.env.TUYUFACTORY_WORK_DIR, "application"), "signed"], {env:process.env, stdio:"inherit"});
  const record = JSON.parse(readFileSync(join(root, "release-manifest.json"), "utf8"));
  const digest = createHash("sha256").update(readFileSync(join(root, identity.asset))).digest("hex");
  required(record.product_id === identity.product && record.platform === identity.platform
    && record.bundle_id === "com.tuyufactory.client" && record.git_commit_sha === value.source
    && record.software_version === value.version && record.ci_run_id === Number(value.ciRunID)
    && record.assets?.length === 1 && record.assets[0].name === identity.asset && record.assets[0].sha256 === digest, "厂家分机最终资产与清单不一致");
  const assets = [identity.asset, "release-manifest.json", "SHA256SUMS"].map((name) => join(root, name)); assets.forEach((path) => required(existsSync(path), `iOS Release 资产缺失：${path}`));
  required(spawnSync("gh", ["release", "view", value.tag, "--repo", value.repository], { stdio: "ignore" }).status !== 0, "iOS 正式 Release 已存在，禁止覆盖");
  required(spawnSync("gh", ["api", `repos/${value.repository}/git/ref/tags/${value.tag}`], { stdio: "ignore" }).status !== 0, "iOS 正式 Tag 已存在，禁止覆盖");
  execFileSync("gh", ["release", "create", value.tag, ...assets, "--repo", value.repository, "--target", value.source, "--title", "途遇厂家端 · Release · 分机 iOS", "--notes", `途遇厂家分机端 iOS ${value.version}；SOURCE_SHA:${value.source}`, "--latest=false"], { stdio: "inherit", env: process.env });
}

try {
  const command = process.argv[2];
  const value = inputs(); if (command === "verify-release-source") verify(value); else if (command === "write-context") context(value); else if (command === "publish-release") publish(value); else throw new Error(`iOS Release 子命令未登记：${command || "(empty)"}`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
