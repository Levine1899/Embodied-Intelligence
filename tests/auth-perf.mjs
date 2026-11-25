// 本机 scrypt 基线：哈希/校验 P50/P95 与内存占用。
// 用法：npm run auth:perf
// 说明：不同机器差异很大，这个脚本只用于“目标生产机实测并留档”，不参与 CI 判定。
import os from 'node:os';
import process from 'node:process';

import {
  hashPassword, verifyPassword, SCRYPT_PARAMS, SCRYPT_KEY_LENGTH, SCRYPT_MAXMEM, SCRYPT_SALT_BYTES
} from '../server/auth-crypto.mjs';

const SAMPLES = Number(process.env.PERF_SAMPLES || 10);
const PASSWORD = '性能基线用的密码 with spaces 😀';

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function stats(values) {
  return {
    p50: Number(percentile(values, 50).toFixed(1)),
    p95: Number(percentile(values, 95).toFixed(1)),
    min: Number(Math.min(...values).toFixed(1)),
    max: Number(Math.max(...values).toFixed(1)),
    mean: Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1))
  };
}

const rssMb = () => Math.round(process.memoryUsage().rss / 1048576);

async function main() {
  console.log('石油科普智能体 · 认证 scrypt 基线');
  console.log('运行环境: Node ' + process.version + ' / ' + process.platform + ' ' + process.arch
    + ' / 逻辑 CPU ' + os.cpus().length + '（' + os.cpus()[0].model.trim() + '）');
  console.log('参数: N=' + SCRYPT_PARAMS.N + ' r=' + SCRYPT_PARAMS.r + ' p=' + SCRYPT_PARAMS.p
    + ' keyLength=' + SCRYPT_KEY_LENGTH + ' salt=' + SCRYPT_SALT_BYTES + 'B maxmem=' + (SCRYPT_MAXMEM / 1048576) + 'MiB');
  console.log('样本: ' + SAMPLES + ' 次（串行，含事件循环调度开销）');
  console.log('');

  const baselineRss = rssMb();
  await hashPassword(PASSWORD); // warmup
  const warmRss = rssMb();

  const hashTimes = [];
  let peakRss = warmRss;
  let record = null;
  for (let i = 0; i < SAMPLES; i += 1) {
    const started = performance.now();
    record = await hashPassword(PASSWORD);
    hashTimes.push(performance.now() - started);
    peakRss = Math.max(peakRss, rssMb());
  }

  const verifyTimes = [];
  for (let i = 0; i < SAMPLES; i += 1) {
    const started = performance.now();
    const ok = await verifyPassword(PASSWORD, record);
    if (!ok) throw new Error('校验基线失败：正确密码未通过');
    verifyTimes.push(performance.now() - started);
    peakRss = Math.max(peakRss, rssMb());
  }

  const h = stats(hashTimes);
  const v = stats(verifyTimes);
  console.log('hash    : p50=' + h.p50 + 'ms  p95=' + h.p95 + 'ms  min=' + h.min + 'ms  max=' + h.max + 'ms  mean=' + h.mean + 'ms');
  console.log('verify  : p50=' + v.p50 + 'ms  p95=' + v.p95 + 'ms  min=' + v.min + 'ms  max=' + v.max + 'ms  mean=' + v.mean + 'ms');
  console.log('RSS     : baseline=' + baselineRss + 'MiB  warm=' + warmRss + 'MiB  peak=' + peakRss + 'MiB');
  console.log('');
  console.log('并发上限由 AUTH_SCRYPT_CONCURRENCY 控制（默认 2）；每路 scrypt 峰值内存约 128 MiB。');

  const report = {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpus: os.cpus().length,
    cpuModel: os.cpus()[0].model.trim(),
    params: { ...SCRYPT_PARAMS, keyLength: SCRYPT_KEY_LENGTH, maxmemMiB: SCRYPT_MAXMEM / 1048576 },
    samples: SAMPLES,
    hash: h,
    verify: v,
    rssMiB: { baseline: baselineRss, warm: warmRss, peak: peakRss }
  };
  console.log('JSON ' + JSON.stringify(report));
}

main().catch(error => {
  console.error('[auth-perf] 失败：' + (error && error.message ? error.message : error));
  process.exit(1);
});
