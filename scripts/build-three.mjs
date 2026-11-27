#!/usr/bin/env node
/**
 * 用 esbuild 把 three + GLTFLoader 打成单一浏览器 bundle（Phase 6）。
 *
 * 设计要点：
 *  - 只有这里能决定页面用哪套 Three.js；entry 里 import 的是同一个 npm 包，
 *    保证 THREE 与 GLTFLoader 是同一实例（不会出现 instanceof 判型失败）。
 *  - 先写临时文件再原子替换：构建失败**不会**把半成品或旧产物留在原位冒充成功。
 *  - 失败时删除已存在的 bundle 并 exit 1 —— 让页面在控制台明确报错，
 *    而不是静默用旧 runtime 跑出难以定位的行为差异。
 *  - banner 写入实际版本/REVISION/构建时间/产物 sha256，便于运行时与证据核对。
 */
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFile, writeFile, rename, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = resolve(ROOT, 'web/assets/three-entry.js');
const OUT = resolve(ROOT, 'web/assets/three.bundle.js');
const TMP = `${OUT}.tmp`;

const EXPECTED_THREE = '0.180.0';
const EXPECTED_REVISION = '180';

function rel(p) {
  return relative(ROOT, p).replace(/\\/g, '/');
}

async function readThreeVersion() {
  const pkg = JSON.parse(await readFile(resolve(ROOT, 'node_modules/three/package.json'), 'utf8'));
  return pkg.version;
}

async function main() {
  const threeVersion = await readThreeVersion();
  if (threeVersion !== EXPECTED_THREE) {
    throw new Error(
      `three 版本必须精确等于 ${EXPECTED_THREE}，实际 ${threeVersion}。` +
        '不允许 ^ / ~ / x 范围（见 package.json 与 lockfile）。',
    );
  }

  const started = Date.now();
  await build({
    entryPoints: [ENTRY],
    outfile: TMP,
    bundle: true,
    format: 'iife',
    globalName: undefined,
    platform: 'browser',
    target: ['es2020'],
    minify: true,
    legalComments: 'none',
    sourcemap: false,
    logLevel: 'silent',
    metafile: true,
    banner: {
      js: `/*! petro three bundle | three@${threeVersion} | REVISION ${EXPECTED_REVISION} | built ${new Date().toISOString()} | 由 scripts/build-three.mjs 生成，勿手改 */`,
    },
  });

  const buf = await readFile(TMP);
  const sha256 = createHash('sha256').update(buf).digest('hex');

  /* 产物自检：REVISION 与 GLTFLoader 必须真的在包里，否则这次构建不算成功 */
  const text = buf.toString('utf8');
  if (!text.includes(`'${EXPECTED_REVISION}'`) && !text.includes(`"${EXPECTED_REVISION}"`)) {
    throw new Error(`bundle 里找不到 REVISION ${EXPECTED_REVISION}，构建产物不可信`);
  }
  if (!/GLTFLoader/.test(text)) {
    throw new Error('bundle 里找不到 GLTFLoader，构建产物不可信');
  }

  await rename(TMP, OUT);

  const meta = {
    three: threeVersion,
    revision: EXPECTED_REVISION,
    bundle: rel(OUT),
    bytes: (await stat(OUT)).size,
    sha256,
    builtAt: new Date().toISOString(),
    buildMs: Date.now() - started,
    source: rel(ENTRY),
  };
  await writeFile(resolve(ROOT, 'web/assets/three.bundle.meta.json'), `${JSON.stringify(meta, null, 2)}\n`);

  console.log('✓ three bundle 构建成功');
  console.log(`  three@${threeVersion}  REVISION ${EXPECTED_REVISION}`);
  console.log(`  ${meta.bundle}  ${meta.bytes} B  sha256=${sha256.slice(0, 16)}…`);
  console.log(`  用时 ${meta.buildMs} ms`);
  console.log(`  元数据 ${rel(resolve(ROOT, 'web/assets/three.bundle.meta.json'))}`);
}

main().catch(async (err) => {
  /* 失败即删除产物：不允许旧 bundle 继续冒充成功 */
  await rm(TMP, { force: true }).catch(() => {});
  await rm(OUT, { force: true }).catch(() => {});
  console.error('✗ three bundle 构建失败：' + err.message);
  console.error('  已删除 web/assets/three.bundle.js —— 页面会明确报错，而不是静默使用旧 runtime。');
  process.exit(1);
});
