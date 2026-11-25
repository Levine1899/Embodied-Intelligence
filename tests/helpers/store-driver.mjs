// 子进程驱动：跨进程并发测试用。命令从 stdin 读 JSON，结果以一行 JSON 输出。
// 用法：node tests/helpers/store-driver.mjs  <<< '{"op":"createUser","args":{...}}'
import process from 'node:process';

let input = '';
for await (const chunk of process.stdin) input += chunk;

const command = JSON.parse(input || '{}');
const store = await import('../../server/auth-store.mjs');

try {
  let result;
  switch (command.op) {
    case 'initAdmin':
      result = await store.initAdmin(command.args);
      break;
    case 'createUser':
      result = await store.createUser(command.args);
      break;
    case 'resetPassword':
      result = await store.resetPassword(command.args.username, command.args.password, command.args.actor);
      break;
    case 'setStatus':
      result = await store.setUserStatus(command.args.username, command.args.status, command.args.actor);
      break;
    case 'list':
      result = await store.listUsers();
      break;
    case 'snapshot':
      result = await store.readDocument();
      break;
    case 'acquireInstance': {
      const release = await store.acquireInstanceLock();
      result = { acquired: true };
      await new Promise(resolve => setTimeout(resolve, Number(command.holdMs || 200)));
      await release();
      break;
    }
    default:
      throw new Error('未知操作：' + command.op);
  }
  process.stdout.write(JSON.stringify({ ok: true, result }) + '\n');
  process.exit(0);
} catch (error) {
  process.stdout.write(JSON.stringify({
    ok: false,
    code: error.code || 'unknown',
    message: error.message
  }) + '\n');
  process.exit(1);
}
