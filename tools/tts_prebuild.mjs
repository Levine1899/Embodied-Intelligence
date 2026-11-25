#!/usr/bin/env node
/*
 * Pre-render the fixed narration texts through the local iFlytek proxy.
 *
 * Usage:
 *   node tools/tts_prebuild.mjs [--api http://127.0.0.1:8790/api/tts] [--out web/assets/tts]
 *
 * The output is content-addressed:
 *   web/assets/tts/<sha256>.mp3
 *   web/assets/tts/manifest.json
 *
 * Text keys must match voice.js exactly: raw narration/body text is normalized
 * with whitespace collapse + trim before hashing and lookup.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const opt = { api: 'http://127.0.0.1:8790/api/tts', out: path.join(ROOT, 'web/assets/tts') };
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--api') opt.api = args[++i];
  else if (args[i] === '--out') opt.out = path.resolve(args[++i]);
}

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

function balanced(source, start) {
  const open = source[start];
  const close = open === '[' ? ']' : '}';
  let depth = 0, quote = '', esc = false;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === quote) quote = '';
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === open) depth++;
    else if (c === close && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unbalanced ${open} at ${start}`);
}

function evalLiteral(src, label) {
  try { return vm.runInNewContext(`(${src})`, Object.create(null), { timeout: 2000 }); }
  catch (e) { throw new Error(`${label}: ${e.message}`); }
}

function extractArray(source, marker, label) {
  const i = source.indexOf(marker);
  if (i < 0) throw new Error(`marker not found: ${label}`);
  const start = source.indexOf('[', i);
  return evalLiteral(balanced(source, start), label);
}

function extractObject(source, marker, label) {
  const i = source.indexOf(marker);
  if (i < 0) throw new Error(`marker not found: ${label}`);
  const start = source.indexOf('{', i);
  return evalLiteral(balanced(source, start), label);
}

function decodeJsString(raw) {
  return vm.runInNewContext(`(${raw})`, Object.create(null), { timeout: 2000 });
}

const immersion = fs.readFileSync(path.join(ROOT, 'web/immersion.js'), 'utf8');
const stageMatch = immersion.match(/const\s+stageNames\s*=\s*(\[.*?\]);/s);
if (!stageMatch) throw new Error('stageNames not found');
const stageNames = evalLiteral(stageMatch[1], 'stageNames');
const explanations = extractArray(immersion, 'const explanations =', 'explanations');
const deviceInfo = extractObject(immersion, 'const DEVICE_INFO =', 'DEVICE_INFO');

const journey = fs.readFileSync(path.join(ROOT, 'web/journey.js'), 'utf8');
const tourNarrations = [];
for (const m of journey.matchAll(/\bnarration\s*:\s*('(?:\\.|[^'])*')/g)) {
  tourNarrations.push(decodeJsString(m[1]));
}

const mission = fs.readFileSync(path.join(ROOT, 'web/mission.js'), 'utf8');
const goals = [...mission.matchAll(/\bgoal\s*:\s*('(?:\\.|[^'])*')/g)].map((m) => decodeJsString(m[1]));
const clues = [...mission.matchAll(/\bclue\s*:\s*('(?:\\.|[^'])*')/g)].map((m) => decodeJsString(m[1]));
if (goals.length !== clues.length) throw new Error(`mission goal/clue mismatch ${goals.length}/${clues.length}`);

const items = [];
function add(kind, id, title, text, extra = {}) {
  const clean = norm(text);
  if (!clean) return;
  const hash = crypto.createHash('sha256').update(clean, 'utf8').digest('hex');
  if (items.some((x) => x.hash === hash)) return;
  items.push({ kind, id, title: norm(title), text: clean, hash, ...extra });
}

stageNames.forEach((stageName, stage) => {
  (explanations[stage] || []).forEach((text, depth) => {
    add('stage', `stage-${stage}-${depth}`, `${stageName} · 第${depth + 1}档`, `${stageName}。${text}`, { stage, depth });
  });
});
Object.entries(deviceInfo).forEach(([objectId, info]) => {
  add('device', `device-${objectId}`, info.name || objectId, `${info.name || ''}。${info.text || ''}`, { objectId, stage: info.stage });
});
tourNarrations.forEach((text, i) => add('tour', `tour-${i + 1}`, `导览第${i + 1}站`, text, { step: i + 1 }));
goals.forEach((goal, i) => add('mission', `mission-${i + 1}`, `任务第${i + 1}步`, `${goal}。线索：${clues[i]}`, { step: i + 1 }));

console.log(`texts: ${items.length} (${stageNames.length} stages, ${Object.keys(deviceInfo).length} devices, ${tourNarrations.length} tour, ${goals.length} missions)`);
if (process.argv.includes('--dry')) {
  for (const it of items) console.log(it.kind, it.id, it.text.length, it.text.slice(0, 24));
  process.exit(0);
}

fs.mkdirSync(opt.out, { recursive: true });
const manifestPath = path.join(opt.out, 'manifest.json');
const old = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null;
const oldByHash = new Map((old && old.items || []).map((x) => [x.hash, x]));

let generated = 0, skipped = 0, failed = 0;
for (const item of items) {
  const target = path.join(opt.out, `${item.hash}.mp3`);
  const oldItem = oldByHash.get(item.hash);
  if (oldItem && fs.existsSync(target) && fs.statSync(target).size > 1000) {
    skipped++;
    continue;
  }
  let ok = false;
  for (let attempt = 1; attempt <= 4 && !ok; attempt++) {
    try {
      const res = await fetch(opt.api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: item.text }),
        signal: AbortSignal.timeout(45000)
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`HTTP ${res.status}: ${err.slice(0, 160)}`);
      }
      const ct = res.headers.get('content-type') || '';
      const buf = Buffer.from(await res.arrayBuffer());
      if (!/audio\//.test(ct) || buf.length < 1000) throw new Error(`bad audio ${ct} ${buf.length}`);
      fs.writeFileSync(target, buf);
      generated++;
      ok = true;
      console.log(`[${generated + skipped}/${items.length}] ${item.kind} ${item.id} ${buf.length}B`);
    } catch (e) {
      if (attempt === 4) {
        failed++;
        console.error(`[FAIL] ${item.id}: ${e.message}`);
      } else {
        await new Promise((r) => setTimeout(r, 600 * attempt));
      }
    }
  }
}

// Remove stale generated takes that no longer correspond to a source text.
const wantedFiles = new Set(items.map((x) => `${x.hash}.mp3`));
for (const f of fs.readdirSync(opt.out)) {
  if (f.endsWith('.mp3') && !wantedFiles.has(f)) {
    fs.unlinkSync(path.join(opt.out, f));
    console.log(`[clean] ${f}`);
  }
}

const manifest = {
  version: `tts-${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}`,
  generatedAt: new Date().toISOString(),
  voice: 'x6_zhantingnvjiedai_pro',
  count: items.length,
  items: items.map(({ text, hash, ...rest }) => {
    const file = `${hash}.mp3`;
    return { ...rest, text, hash, file: `tts/${file}`, bytes: fs.existsSync(path.join(opt.out, file)) ? fs.statSync(path.join(opt.out, file)).size : 0 };
  })
};
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`manifest: ${manifestPath}; generated=${generated} skipped=${skipped} failed=${failed}`);
if (failed) process.exitCode = 1;
