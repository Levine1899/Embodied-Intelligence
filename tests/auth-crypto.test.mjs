// 密码哈希与策略单元测试。
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  hashPassword, verifyPassword, checkNewPassword, verifyDummyPassword, isSupportedPasswordRecord,
  cryptoStats, SCRYPT_PARAMS, SCRYPT_KEY_LENGTH, SCRYPT_SALT_BYTES,
  PASSWORD_MIN_CHARS, PASSWORD_MAX_CHARS, PASSWORD_MAX_BYTES
} from '../server/auth-crypto.mjs';

const PASSWORD = '正确 Horse 电池 staple 😀';

test('scrypt 记录结构符合白名单参数，且能正确校验', async () => {
  const record = await hashPassword(PASSWORD);
  assert.equal(record.algorithm, 'scrypt');
  assert.deepEqual(record.params, { N: SCRYPT_PARAMS.N, r: SCRYPT_PARAMS.r, p: SCRYPT_PARAMS.p });
  assert.equal(record.keyLength, SCRYPT_KEY_LENGTH);
  assert.equal(Buffer.from(record.salt, 'base64').length, SCRYPT_SALT_BYTES);
  assert.equal(Buffer.from(record.hash, 'base64').length, SCRYPT_KEY_LENGTH);
  assert.equal(isSupportedPasswordRecord(record), true);

  assert.equal(await verifyPassword(PASSWORD, record), true);
  assert.equal(await verifyPassword(PASSWORD + 'x', record), false);
  // 密码不做 trim：前后空白属于密码本体
  assert.equal(await verifyPassword(' ' + PASSWORD, record), false);
});

test('两次哈希使用独立随机 salt，结果不同', async () => {
  const a = await hashPassword(PASSWORD);
  const b = await hashPassword(PASSWORD);
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.hash, b.hash);
});

test('不支持的 scrypt 参数被拒绝，且不会真的跑一次高耗时哈希', async () => {
  const record = await hashPassword(PASSWORD);
  const before = cryptoStats.verifyCalls;

  const weak = structuredClone(record);
  weak.params.N = 16384;
  await assert.rejects(() => verifyPassword(PASSWORD, weak), error => error.code === 'unsupported_password_record');

  const wrongAlg = structuredClone(record);
  wrongAlg.algorithm = 'pbkdf2';
  await assert.rejects(() => verifyPassword(PASSWORD, wrongAlg), error => error.code === 'unsupported_password_record');

  const longHash = structuredClone(record);
  longHash.hash = Buffer.alloc(32).toString('base64');
  await assert.rejects(() => verifyPassword(PASSWORD, longHash), error => error.code === 'unsupported_password_record');

  assert.equal(cryptoStats.verifyCalls, before, '参数不合法时不应进入 scrypt');
});

test('dummy 校验与真实校验同参数，且必然失败', async () => {
  const before = cryptoStats.dummyVerifyCalls;
  assert.equal(await verifyDummyPassword(PASSWORD), false);
  assert.equal(await verifyDummyPassword('another-guess'), false);
  assert.equal(cryptoStats.dummyVerifyCalls, before + 2);
});

test('新建密码策略：长度、Unicode、空格、字节上限', () => {
  assert.equal(checkNewPassword('a'.repeat(PASSWORD_MIN_CHARS - 1)).ok, false);
  assert.equal(checkNewPassword('abc def ghi jkl mno').ok, true);         // 19 字符含空格
  assert.equal(checkNewPassword('生活 中的 石油 科学 123').ok, true);       // Unicode + 空格
  assert.equal(checkNewPassword('a'.repeat(PASSWORD_MAX_CHARS + 1)).ok, false);
  assert.equal(checkNewPassword('😀'.repeat(129)).code, 'password_too_long');
  // 128 个相同字符属于“重复字符”，会被策略拒绝；上限本身由一条 128 字符的普通密码验证
  assert.equal(checkNewPassword('😀'.repeat(128)).code, 'password_repeated');
  const alnum = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const long128 = Array.from({ length: PASSWORD_MAX_CHARS }, (_, i) => alnum[(i * 7 + 3) % alnum.length]).join('');
  assert.equal(Array.from(long128).length, PASSWORD_MAX_CHARS);
  assert.equal(checkNewPassword(long128).ok, true, '128 字符的普通密码应允许');
  assert.equal(PASSWORD_MAX_BYTES, 512);
  assert.equal(checkNewPassword('x'.repeat(PASSWORD_MIN_CHARS)).code, 'password_repeated');
  assert.equal(checkNewPassword('q7m-z2p k9v').ok, false, '14 字符应过短');
});

test('新建密码策略：拒绝弱口令、用户名相同、连续字符与重复拼接', () => {
  assert.equal(checkNewPassword('passwordpassword').code, 'password_weak');
  assert.equal(checkNewPassword('adminadminadmin').code, 'password_weak');
  assert.equal(checkNewPassword('Admin', { username: 'admin' }).ok, false);
  assert.equal(checkNewPassword('adminadminadmin', { username: 'admin' }).ok, false);
  assert.equal(checkNewPassword('123456789012345').code, 'password_weak');
  assert.equal(checkNewPassword('aaaaaaaaaaaaaaa').code, 'password_weak');
  assert.equal(checkNewPassword('qwertyuiopasdfg').ok, false);
  assert.equal(checkNewPassword('abcabcabcabcabc').code, 'password_repeated');
  assert.equal(checkNewPassword('abababababababab').code, 'password_repeated');
  assert.equal(checkNewPassword('n0t-a-repeat-pattern-x').ok, true);
});

test('密码原值参与哈希：不做 trim、不截断（以字节与字符一致为准）', async () => {
  const withSpaces = '  lead and trail  ';
  const record = await hashPassword(withSpaces);
  assert.equal(await verifyPassword(withSpaces, record), true);
  assert.equal(await verifyPassword(withSpaces.trim(), record), false);
  assert.ok(Buffer.byteLength(withSpaces) <= PASSWORD_MAX_BYTES);
});
