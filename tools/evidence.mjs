#!/usr/bin/env node
/**
 * 统一证据目录工具（Phase 5）。
 *
 * 用法：
 *   node tools/evidence.mjs init [runId]        # 建目录 + 写 meta.json
 *   node tools/evidence.mjs note <key> <text>   # 追加一条备注
 *   node tools/evidence.mjs file <路径>          # 记录文件 sha256
 *
 * 目录：docs/3d-model-optimization/evidence/<runId>/
 * 也可被 e2e 脚本以模块方式 import：
 *   import { initEvidence, recordFile, finish } from '../evidence.mjs'
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, relative } from 'node:path';
import os from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE_ROOT = join(ROOT, 'docs/3d-model-optimization/evidence');

function git(args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

export function sha256File(p) {
  const h = createHash('sha256');
  h.update(readFileSync(p));
  return h.digest('hex');
}

/** 参与发布的资产哈希——证据里必须能对应到具体字节 */
export function assetHashes() {
  const items = [
    'web/assets/tower/tower.glb',
    'web/assets/tower/tower.obj',
    'web/assets/tower/tower.manifest.json',
    'web/assets/separator/separator.glb',
    'web/assets/separator/separator.obj',
    'web/assets/separator/separator.manifest.json',
    'web/data/process-connections.json',
  ];
  const out = {};
  for (const rel of items) {
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) {
      out[rel] = null;
      continue;
    }
    out[rel] = { sha256: sha256File(abs), bytes: statSync(abs).size };
  }
  return out;
}

export function defaultRunId() {
  const iso = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const sha = (git(['rev-parse', '--short', 'HEAD']) || 'nogit').trim();
  return `phase-05-${iso}-${sha}`;
}

export function initEvidence(runId = defaultRunId()) {
  const dir = join(EVIDENCE_ROOT, runId);
  mkdirSync(dir, { recursive: true });
  const meta = {
    runId,
    createdAt: new Date().toISOString(),
    commit: git(['rev-parse', 'HEAD']),
    commitShort: git(['rev-parse', '--short', 'HEAD']),
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
    dirty: git(['status', '--porcelain']) !== '',
    node: process.version,
    npm: (() => {
      /* Windows 下 npm 是 npm.cmd，execFileSync('npm') 会 ENOENT */
      const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      try { return execFileSync(cmd, ['-v'], { encoding: 'utf8', shell: process.platform === 'win32' }).trim(); } catch { return null; }
    })(),
    platform: `${os.platform()} ${os.release()} ${os.arch()}`,
    cpus: os.cpus().length > 0 ? os.cpus()[0].model : null,
    gpuNote: '本机仅有集成显卡；浏览器测试只做 WebGL 功能冒烟，不代表真实 GPU 性能。',
    assets: assetHashes(),
  };
  writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
  return { dir, meta, relDir: relative(ROOT, dir).replace(/\\/g, '/') };
}

export function writeArtifact(dir, name, content) {
  const abs = join(dir, name);
  writeFileSync(abs, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  return abs;
}

export function recordFile(dir, absPath) {
  if (!existsSync(absPath)) return null;
  const rec = { path: relative(dir, absPath).replace(/\\/g, '/'), sha256: sha256File(absPath), bytes: statSync(absPath).size };
  return rec;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1].endsWith('evidence.mjs')) {
  const [, , cmd, ...rest] = process.argv;
  if (cmd === 'init') {
    const { dir, relDir, meta } = initEvidence(rest[0]);
    console.log(`✓ 证据目录：${relDir}`);
    console.log(JSON.stringify(meta, null, 2));
  } else if (cmd === 'note') {
    const runId = rest[0];
    const dir = join(EVIDENCE_ROOT, runId || readdirSync(EVIDENCE_ROOT).sort().pop());
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `note-${Date.now()}.txt`), rest.slice(1).join(' '));
    console.log(`✓ 写入 ${relative(ROOT, dir)}`);
  } else if (cmd === 'file') {
    const p = resolve(ROOT, rest[1]);
    console.log(JSON.stringify(recordFile(resolve(ROOT, rest[0]), p)));
  } else {
    console.log('用法: node tools/evidence.mjs init [runId] | note <runId> <text> | file <runId> <path>');
  }
}
