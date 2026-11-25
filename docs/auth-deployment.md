# 登录认证 · 部署与运维手册

本文覆盖：运行边界、环境变量、初始化、用户管理、备份恢复、Nginx 接入、安全设计与回滚。
示例配置见 [`deploy/nginx-auth.example.conf`](../deploy/nginx-auth.example.conf)。

---

## 1. 第一版运行边界（务必先读）

第一版是**单机单进程**系统：

| 项目 | 现状 | 说明 |
|---|---|---|
| 用户账户 | 一个 `users.json` | 不接数据库，不引入 ORM |
| Session | Node 进程内存 `Map` | **进程重启后全部失效**，需重新登录 |
| 实例数 | 1 个 `proxy.mjs` | 同一 `AUTH_DATA_DIR` 启动第二个实例会被运行锁拒绝 |
| 并发 | 多浏览器 / 多用户并发 | Session、限流、锁都按单进程设计 |
| 账户管理 | 服务器命令行 CLI | 无网页注册、无网页用户管理 |
| 跨主机 / 集群 | 不支持 | 需要共享 Session 存储（如 Redis）后才能扩展，本次明确不做 |

> 两个 Node 实例各自持有互不共享的内存 Session。因此启动第二个实例时，进程会直接报错退出
> （`auth_store_instance_locked`），而不是假装“多实例已支持”。

**长连接撤销边界**：密码重置/禁用后，旧 Session 会在**下一次请求**时失效；
已经开始的 SSE / 长请求不会被即时中断。若需要实时终止长连接，属于后续增强，本版本未实现。

---

## 2. 运行环境

| 版本 | 状态 |
|---|---|
| Node 18 / 20 | **已 EOL，不作为本功能的生产目标** |
| Node 22 | 当前开发/测试基线（`package.json` engines `>=22`），可作为有升级计划的短期过渡 |
| Node 24 LTS | 新部署推荐目标（本仓库未在 24 上完成整机回归，标记 NOT VERIFIED） |
| Node 26 LTS | 需在部署环境完成兼容性验证后再用 |

升级 Node 后至少重跑：`npm test`（认证全套）+ `npm run validate:assets` + 一次登录/问答/写作人工回归。

依赖只有一个运行时包：`proper-lockfile@4.1.2`（MIT，纯 JS，无原生模块；用于跨进程文件锁）。
`npm ci` 会按 `package-lock.json` 安装。

---

## 3. 文件与权限

```
server/
  data/                 运行时创建，禁止提交、禁止映射到 Web 根
    users.json          账户（scrypt 哈希，无明文）
    auth-audit.log      管理操作审计（无密码材料）
    instance.lock       单实例运行锁的占位文件
    users.json.lock/    proper-lockfile 的跨进程锁目录（运行时短暂存在）
```

默认路径：`server/data`（相对 `server/` 解析，不依赖 `process.cwd()`）。
可用 `AUTH_DATA_DIR` 改到绝对路径，例如 `/var/lib/kepu-auth`。

- **Linux**：目录 `0700`、文件 `0600`（代码自动设置）。
- **Windows**：Node 的 mode 位没有 ACL 语义，必须由运维用 NTFS ACL 收紧，例如（管理员 PowerShell）：
  ```powershell
  icacls "D:\kepu\server\data" /inheritance:r /grant:r "SYSTEM:(OI)(CI)F" "Administrators:(OI)(CI)F"
  ```
  只把服务运行账号加入授权列表；不要授予 `Users` / `Everyone`。
- 备份文件权限必须与 `users.json` 相同，不能更宽。

---

## 4. 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `AUTH_DATA_DIR` | `server/data` | 账户数据目录；相对路径相对 `server/` 解析 |
| `AUTH_COOKIE_SECURE` | 生产默认 `1`，开发 `0` | 生产 HTTPS 必须为 `1`；生产环境不是 `1` 时服务拒绝启动 |
| `APP_ORIGINS` | `http://127.0.0.1:5173,http://localhost:5173` | 精确 Origin allowlist，逗号分隔；生产必须写实际 HTTPS 域名，不允许 `*` |
| `AUTH_TRUST_PROXY` | `0` | 只有位于可信 Nginx 之后才设 `1`；`npm run dev` 会自动为子进程设为 `1` |
| `AUTH_TRUSTED_PROXY_IPS` | `127.0.0.1,::1` | 允许读取 `X-Real-IP` 的连接来源；`X-Forwarded-For` 永远忽略 |
| `PORT` | `8790` | Node 认证/业务服务端口（只监听 `127.0.0.1`） |
| `DEV_PORT` | `5173` | 开发服务器端口 |
| `AUTH_SCRYPT_CONCURRENCY` | `2` | 同进程并发 scrypt 上限（内存约 128 MiB/个） |
| `AUTH_SESSION_MAX` | `10000` | Session 总量上限，防止内存无限增长 |
| `AUTH_LOGIN_MAX_FAILURES` | `5` | 登录失败阈值（15 分钟窗口） |

生产启动检查（任一不满足即拒绝启动）：
`NODE_ENV=production` + `AUTH_COOKIE_SECURE=1` + 显式 `APP_ORIGINS`（全 https、非回环）+
`AUTH_DATA_DIR` 不在 `web/` 内。

---

## 5. 首次部署

```bash
# 1) 依赖与代码
npm ci

# 2) 初始化第一个管理员（只能执行一次；密码在终端隐藏输入）
AUTH_DATA_DIR=/var/lib/kepu-auth node server/auth-cli.mjs init-admin

# 3) 启动认证 + 业务代理（只监听 127.0.0.1:8790）
NODE_ENV=production \
AUTH_DATA_DIR=/var/lib/kepu-auth \
AUTH_COOKIE_SECURE=1 \
APP_ORIGINS=https://kepu.example.com \
AUTH_TRUST_PROXY=1 \
node server/proxy.mjs
```

Web 静态文件仍由 Nginx 托管；受保护 HTML 由 `auth_request` 把关（见第 8 节）。

开发环境（含完整登录）：

```bash
node server/auth-cli.mjs init-admin   # 默认写入 server/data
npm install                            # 首次
npm run dev                            # http://127.0.0.1:5173
```

> **`python -m http.server` 只能做静态预览**：它没有认证、不转发 `/api/*`，
> 不能作为包含登录功能的运行方式。用它打开业务页面时，浏览器会因为没有 Session 而只看到登录页。

---

## 6. 用户管理命令

```bash
node server/auth-cli.mjs init-admin              # 仅用户库为空时可用
node server/auth-cli.mjs add-user                # 交互输入用户名/显示名/角色/密码
node server/auth-cli.mjs reset-password <用户名>  # 重置并递增 authVersion
node server/auth-cli.mjs disable-user <用户名>    # 禁止禁用最后一个可用管理员
node server/auth-cli.mjs enable-user <用户名>
node server/auth-cli.mjs list-users              # 只列公开字段
```

- 密码只能**在 TTY 中隐藏输入**；非 TTY（管道/CI）会被拒绝，不会回退明文。
- 新建/重置密码：至少 15 个字符，允许空格与 Unicode，**不 trim、不截断**；拒绝弱口令与用户名重复。
- 用户名 3–32 位 ASCII 字母/数字/`.`/`_`/`-`，**不区分大小写**（`Admin` 与 `admin` 冲突）。
- CLI 与 API 共用同一 store、同一把跨进程锁；CLI 修改后旧 Session 在下一次请求时失效。
- 审计记录写入 `auth-audit.log`（操作类型、目标用户、时间、CLI OS 账号），不含密码材料。

---

## 7. 备份、恢复与故障处理

### 7.1 备份（服务运行中可做）

`users.json` 是原子替换写入的，任何时刻读到的都是完整文件。

```bash
install -m 600 -o "$(id -u)" -g "$(id -g)" \
  /var/lib/kepu-auth/users.json \
  /var/lib/kepu-auth/backups/users-$(date +%Y%m%d-%H%M%S).json
```

审计文件按同样权限备份；备份目录不要放在 Web 根。

### 7.2 恢复

```bash
# 1) 先备份“当前文件”（即使它已损坏）
cp -p /var/lib/kepu-auth/users.json /var/lib/kepu-auth/users.corrupt-$(date +%Y%m%d-%H%M%S).json

# 2) 用备份覆盖（保持 0600）
install -m 600 backups/users-20261125-120000.json /var/lib/kepu-auth/users.json

# 3) 校验可读（不会打印密码材料）
node -e "import('./server/auth-store.mjs').then(async m => { const d = await m.readDocument(); console.log('users=', d.users.length); })"
```

### 7.3 users.json 损坏

服务会 **fail closed**：认证接口返回 503，日志只记错误类别，**不会自动清空或覆盖**。
修复必须由人工完成：先备份原文件，再按备份恢复或按 Schema 修复。
**不要**通过删除文件来“重置”——那只会得到空用户库，需要重新 `init-admin`。

### 7.4 运行锁残留（进程被强杀后）

正常退出（SIGINT/SIGTERM）会释放锁。若进程被强制结束（如 `kill -9`、Windows 任务管理器结束进程），
锁目录可能残留；`proper-lockfile` 在 20 秒 stale 后会安全回收。若需要立即重启：

```bash
# 确认没有 proxy 进程在跑之后
rm -rf /var/lib/kepu-auth/instance.lock.lock
```

若日志提示 `auth_store_instance_locked`，说明**确实**有另一个实例持有锁，先确认进程再处理。

### 7.5 Windows 上强杀后重启

Windows 无法对 `SIGTERM` 走优雅退出，强杀后同样按 7.4 处理（等待 20 秒或清理锁目录）。

---

## 8. Nginx 接入

### 8.1 先确认模块

```bash
nginx -V 2>&1 | tr ' ' '\n' | grep auth_request
# 期望看到：--with-http_auth_request_module
```

官方文档说明 `ngx_http_auth_request_module` 需要编译进 Nginx，可能不是默认构建。

### 8.2 合并样例

把 [`deploy/nginx-auth.example.conf`](../deploy/nginx-auth.example.conf) 的关键 location
合并进现场 `server` 块（不要整段替换线上配置），逐项核对：

1. `location = /_auth { internal; ... }` —— 内部子请求，公网不可访问；
2. 受保护 HTML（`index/sandbox/explore/chapter/tower/ask/write/kb/_spike-separator`）挂 `auth_request`；
3. `/` 也挂 `auth_request`；
4. `login.html`、`/assets/` 不挂；
5. `/api/` 只反代，不挂 `auth_request`，`proxy_intercept_errors off` 保证 401 仍是 JSON；
6. `proxy_buffering off` 保证 Dify SSE 不被缓冲；
7. `X-Real-IP $remote_addr` 覆盖写入、`X-Forwarded-For ""` 清空；
8. 未登记的 `.html` 默认 404（新增页面必须同时改 Nginx 与 `server/protected-pages.json`）；
9. 认证服务异常时返回 **503** + `auth-error.html`（`error_page ... =503`），不能把业务页面当已登录交付；
10. `root` 只能指向 `web/`，绝不映射 `server/data`。

修改后：

```bash
docker exec nginx-web nginx -t && docker exec nginx-web nginx -s reload
# 或：nginx -t && systemctl reload nginx
```

> 仓库内已用 **nginx 1.26.2** 对样例配置做过 `nginx -t` 与真实 `auth_request` 端到端验证
> （未登录 302、登录后 200、未登录 API 401、未登记页面 404、`/_auth` 直接访问 404、
> 认证服务停机 503 + 错误页）。现场仍需用自己的 Nginx 版本与配置执行一次 `nginx -t` 并复验，
> 因为版本、模块与证书路径都可能不同。

### 8.3 没有 auth_request 模块时

不能退回“前端 JS 跳转”。可选等价方案（任选其一，并在部署记录里写明）：

- **A. 由 Node 托管受保护 HTML**：让 Nginx 把受保护页面反代到 Node，
  Node 在返回 HTML 前先做与 `dev.mjs` 相同的 `/api/auth/verify` 判断；
- **B. 换用支持服务端鉴权子请求的反向代理**（如 Caddy + forward_auth、Traefik ForwardAuth），
  语义与 `auth_request` 等价；
- **C. 升级/重新编译 Nginx** 加 `--with-http_auth_request_module`。

本次交付的 `server/dev.mjs` 已经实现了与方案 A 相同的服务端判定逻辑，可直接作为替代实现的参考。

---

## 9. 安全设计说明

| 项 | 做法 |
|---|---|
| 密码哈希 | `scrypt`，`N=131072, r=8, p=1, keyLength=64`，每用户 16 字节随机 salt，`maxmem=256MiB`；只允许异步 API |
| 参数白名单 | 读取 `users.json` 时严格比对参数组合；不支持的组合直接拒绝，绝不把文件里的任意参数传给 scrypt |
| 恒定成本 | 用户名不存在跑随机 dummy 记录；禁用账户先完整校验再拒绝；三种失败对外同一文案 |
| 并发控制 | 同进程 scrypt 并发 ≤ 2、队列 ≤ 32；登录请求体 ≤ 8KB；密码 ≤ 512 字节 |
| 登录限流 | `规范化用户名 + 可信客户端 IP`，15 分钟内 5 次失败 → 15 分钟限制；表有容量上限 |
| 客户端 IP | 仅当连接来自可信代理时读 `X-Real-IP`；`X-Forwarded-For` 一律忽略 |
| Origin | 登录/登出/所有状态改变的业务 API 必须带 allowlist 内 Origin；缺失即 403 |
| Cookie | `yj_session`，`HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`，生产加 `Secure`，不设 `Domain` |
| Session | 32 字节随机 Token；服务端只存 SHA-256(Token)；每用户最多 5 个；8 小时绝对 / 30 分钟空闲 |
| 撤销 | `authVersion` 在重置/禁用/启用时递增；每次请求重新读取用户文件比对 |
| 日志 | 只记请求 ID、失败类别、脱敏 IP；不记密码、salt、hash、Cookie、Token、请求体 |
| 数据位置 | `server/data` 在 `web/` 之外，并在启动时校验；`.gitignore` 忽略整个目录与锁 |

---

## 10. 测试

```bash
npm test            # 全部认证测试（crypto / store / CLI / API / 页面）
npm run auth:perf   # 本机 scrypt 哈希/校验 P50/P95 与内存占用
```

页面/接口测试会真实启动 `proxy.mjs` 与 `dev.mjs`，使用临时数据目录，不会写 `server/data`。

---

## 11. 回滚

代码回滚不影响账户数据（`server/data` 不在 Git 里）：

```bash
git checkout <上一个稳定提交> -- server web package.json package-lock.json deploy
npm ci
# 账户数据保持原样；如需回到无认证版本，同时撤掉 Nginx auth_request 配置
```

回滚到无认证版本意味着**失去登录保护**。生产回滚应同时：
1. 备份 `server/data`；
2. 保留 Node 进程或明确关闭公网访问；
3. 在变更记录中写明“认证已回滚，站点当前无登录保护”。

---

## 12. 已知限制与后续

- 单 Node 进程；多实例/多主机不支持 Session 共享（会拒绝启动或需要共享存储，本次不引入）。
- 进程重启 / 机器重启后所有 Session 失效。
- 在途 SSE 长请求不会因撤销立即中断，只保证下一次请求 401。
- Windows 的 TTY 隐藏输入已验证逻辑与自动化测试；**真实 Windows 终端人工验证标记 NOT RUN**，
  部署到 Windows 时请按 `docs/auth-tty-checklist.md` 手工走一遍。
- 尚未实现 MFA、找回密码、网页用户管理——均属后续版本范围。
