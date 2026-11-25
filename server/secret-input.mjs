// 跨平台隐藏密码输入：raw mode 手动读取，不回显、支持粘贴/退格，正常或异常退出都恢复终端。
// 非 TTY 一律拒绝（绝不回退到明文管道），并可通过传入 input/output 做可注入测试。

import process from 'node:process';

export class SecretInputError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SecretInputError';
    this.code = code;
  }
}

const CTRL_C = '\u0003';
const CTRL_D = '\u0004';
const BACKSPACE = '\u007f';
const BACKSPACE_WIN = '\b';

/**
 * @param {object} options
 * @param {string} options.prompt
 * @param {NodeJS.ReadStream} [options.input]
 * @param {NodeJS.WriteStream} [options.output]
 * @param {boolean} [options.requireTTY]
 * @returns {Promise<string>} 原始密码字符串（不 trim、不截断）
 */
export function readSecret(options = {}) {
  const prompt = options.prompt || '密码: ';
  const input = options.input || process.stdin;
  const output = options.output || process.stdout;
  const requireTTY = options.requireTTY !== false;

  if (requireTTY && !(input.isTTY && output.isTTY)) {
    return Promise.reject(new SecretInputError(
      'not_tty',
      '当前输入不是终端（TTY）。出于安全考虑，密码只能直接在终端输入，不接受管道、环境变量或命令行参数。'
    ));
  }
  if (typeof input.setRawMode !== 'function') {
    return Promise.reject(new SecretInputError('not_tty', '当前输入流不支持隐藏输入。'));
  }

  return new Promise((resolve, reject) => {
    let chars = [];
    let settled = false;

    const restore = () => {
      // 无论正常结束、取消还是异常，都把终端从 raw mode 里退出来
      try { input.setRawMode(false); } catch { /* ignore */ }
      try { input.pause(); } catch { /* ignore */ }
      process.removeListener('SIGINT', onProcessSigint);
      process.removeListener('exit', onProcessExit);
    };

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      input.removeListener('data', onData);
      restore();
      output.write('\n');
      if (error) reject(error);
      else resolve(value);
    };

    const onProcessExit = () => {
      // 异常退出（未捕获异常/正常退出）也要把终端 echo 恢复
      try { input.setRawMode(false); } catch { /* ignore */ }
    };
    const onProcessSigint = () => {
      try { input.setRawMode(false); } catch { /* ignore */ }
      process.exit(130);
    };

    const onData = chunk => {
      if (settled) return;
      const text = typeof chunk === 'string' ? chunk : String(chunk);
      for (const ch of text) {
        if (ch === '\r' || ch === '\n') return finish(null, chars.join(''));
        if (ch === CTRL_C) {
          output.write('^C');
          return finish(new SecretInputError('cancelled', '已取消输入'));
        }
        if (ch === CTRL_D) {
          return finish(new SecretInputError('eof', '输入已结束（EOF）'));
        }
        if (ch === BACKSPACE || ch === BACKSPACE_WIN) {
          chars.pop();
          continue;
        }
        if (ch < ' ') continue; // 其他控制字符忽略（方向键等）
        chars.push(ch);
      }
    };

    process.on('exit', onProcessExit);
    process.on('SIGINT', onProcessSigint);
    input.on('data', onData);
    try {
      input.setRawMode(true);
      input.resume();
      if (typeof input.setEncoding === 'function') input.setEncoding('utf8');
    } catch (error) {
      return finish(new SecretInputError('not_tty', '无法进入隐藏输入模式：' + error.message));
    }
    output.write(prompt);
  });
}

/** 二次确认：两次输入必须完全一致（区分空白字符）。 */
export async function readSecretConfirmed({ prompt = '密码: ', confirmPrompt = '再次输入密码: ', ...rest }) {
  const first = await readSecret({ prompt, ...rest });
  const second = await readSecret({ prompt: confirmPrompt, ...rest });
  if (first !== second) {
    throw new SecretInputError('mismatch', '两次输入的密码不一致');
  }
  return first;
}
