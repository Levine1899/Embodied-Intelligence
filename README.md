# 石油科普智能体（V3）

面向中国石油 / 临沂大学人工智能与具身智能实验室的科普演示站：**一条原油从地下到用户的三维流程 + 六章知识补充 + 随身问答 + 可信文案生成**。

前端零构建：原生 HTML / CSS / JS，Three.js 走本地文件；后端只有一个 Node 代理，把请求转给 DeepSeek，Key 只留在服务器。

**当前版本 3.4.0**（2026-11-21）· 详见 [CHANGELOG.md](CHANGELOG.md)

---

## 1. 页面

| 页面 | 文件 | 说明 |
|---|---|---|
| 登录 | `web/login.html` | 授权用户登录；公开页，不加载 auth guard |
| 首页 | `web/index.html` | 100vh 视频海报；三个入口：三维演示 / 六章知识 / 塔剖面 |
| 三维沙盘 | `web/sandbox.html` | 五环节流程：地下开采 → 地面处理 → 储运 → 炼化 → 产品去向；每环节可「读本章知识」 |
| 探索大厅 | `web/explore.html` | 六章目录 + 两个三维入口 |
| 章节页 | `web/chapter.html?id=<id>` | 2D 图示 + 关键知识 + 来源 + 「回到三维演示」 |
| 塔剖面 | `web/tower.html` | 常减压塔三档剖切（外观 / 半剖 / 全剖）、五个热点 |
| 问答 | `web/ask.html` | 空态 + 对话态；依赖 `/api/dify-chat` 代理 |
| 写作 | `web/write.html` | 三种体裁；依赖 `/api/dify-write` 代理 |
| 科普视频 | `web/videos.html`、`web/video.html` | 按分类分页浏览视频，点击进入独立播放页 |
| 知识库 | `web/kb.html` | 15 条公开科普来源的检索视图 |

除登录页和静态错误页外，**所有页面都需要登录**：未登录直接访问时，服务端（`dev.mjs` 或 Nginx `auth_request`）会在交付 HTML 之前跳转登录页，
前端 `auth-guard.js` 只负责体验与 BFCache 复查。

一级导航包含首页、智能问答、沉浸式讲解、科普文案和科普视频。

### 三维两层的分工

- **沙盘**看流程：设备是低模，讲物料怎么走、每个环节在干什么。
- **塔页**看设备：单塔垂直剖面，讲塔板汽液接触、侧线与减压原理。
- 沙盘每个环节都能进塔页；塔页可回到「流程沙盘 · 炼化环节」。

### 问答策略

1. 库内命中 → 直接给预写答案，附引用与原文链接。
2. 库外但属于石油/能源 → 调模型组织，标注「模型补充 · 未逐条核验」。
3. 超范围或涉内部数据 → 不采用模型，明确拒答并给相近条目。

三档表达：童话 / 通俗 / 工程；童话档在服务端有硬守卫（超 120 字或出现术语时自动重写）。

---

## 2. 本地运行

### 2.1 完整登录环境（推荐）

```bash
npm install                 # 首次：安装 proper-lockfile 等依赖
node server/auth-cli.mjs init-admin   # 首次：在终端里隐藏输入管理员密码
npm run dev                 # http://127.0.0.1:5173
```

`npm run dev` 会启动两个进程：`server/dev.mjs`（静态 + 页面保护 + `/api/*` 转发）和
`server/proxy.mjs`（认证与业务 API，只监听 `127.0.0.1:8790`）。
未登录访问业务页面会被服务端跳转到 `/login.html`；业务 API 一律返回 JSON 401。

### 2.2 仅静态预览（没有登录保护）

```bash
cd web
python -m http.server 8000
# http://127.0.0.1:8000/
```

> **这条命令只用于看静态排版/三维资源，不包含任何认证能力**：
> 没有 Session、没有 `/api/*` 转发，页面会显示成未登录状态。
> 不要把它当成“带登录的系统”来验收，也不要用于生产。

> 不要直接双击 `index.html`：`file://` 下塔页 `fetch('tower.obj')` 会被拦，三维塔空白。

### 2.3 只跑业务代理（生产形态）

```bash
NODE_ENV=production AUTH_COOKIE_SECURE=1 APP_ORIGINS=https://你的域名 \
AUTH_DATA_DIR=/var/lib/kepu-auth AUTH_TRUST_PROXY=1 \
node server/proxy.mjs   # 默认 127.0.0.1:8790，由 Nginx 反代 /api/ 并做页面 auth_request
```

完整部署、环境变量、备份恢复与 Nginx 样例见 [`docs/auth-deployment.md`](docs/auth-deployment.md)。

接口约定见 [docs/API.md](docs/API.md)，塔场景参数见 [docs/scene-distillation-tower.md](docs/scene-distillation-tower.md)。

### 科普视频资源

分类和视频条目存放在 `web/video-catalog.json`。每条视频的 `id` 对应 Dify 文档 ID，科普视频页和智能问答共用 `web/assets/videos/<id>.mp4`，封面位于 `web/assets/videos/posters/<id>.webp`。

部署时单独同步项目里的 `web/assets/videos/` 到生产站点的 `assets/videos/`。静态服务器需要为 MP4 提供 `video/mp4` 和 HTTP Range 支持，播放器才可以拖动进度。

---

## 3. 仓库结构

```
web/                    运行站点（生产目录，nginx root 指向这里）
  login.html              登录页（唯一公开的业务入口页）
  auth-error.html         认证服务不可用时的静态提示页（公开）
  assets/site/tokens.css  设计变量：暖墨 #0b0f11 / 赭黄 #d8a24a / 灰青 #8fb6ad
  assets/site/auth.css    登录页与账户 UI 样式
  assets/site/auth.js     登录页交互
  assets/site/auth-guard.js  受保护页面的认证 guard（体验层）
  assets/site/auth-next.js   next 参数白名单校验
  assets/fonts/           得意黑（SIL OFL 1.1）
  assets/tower/           塔模型（tower.obj 为塔页实际加载）、首页动图
  immersion.js            沙盘逻辑（相机、关卡、#stage 深链）
  levels/                 五环节细节场景
  tower.js                塔页逻辑（OBJ 加载、剖切、热点）
  chapters.js             六章数据
server/                 Node 认证 + 业务代理
  proxy.mjs              HTTP 入口：认证路由、API 鉴权、业务端点
  dev.mjs                开发服务器：静态托管 + 受保护页面服务端校验
  auth-config.mjs        环境变量与 fail-closed 启动检查
  auth-crypto.mjs        scrypt 参数、哈希/校验、密码策略、并发闸门
  auth-store.mjs         users.json Schema、原子写、跨进程锁、账户操作、审计
  auth-login.mjs         恒定成本的凭据校验
  auth-session.mjs       Session Map、Cookie、Origin、客户端 IP、限流
  auth-http.mjs          /api/auth/* 与业务 API 鉴权中间件
  auth-pages.mjs         受保护页面清单加载与判定
  protected-pages.json   页面 protected / public 清单（唯一来源）
  auth-cli.mjs           管理员 CLI
  secret-input.mjs       跨平台隐藏密码输入
  data/                  运行时账户数据（gitignore，禁止映射到 Web）
deploy/nginx-auth.example.conf  Nginx auth_request 接入样例
tests/                  认证自动化测试（crypto / store / CLI / API / pages）
tools/                  Blender 程序化塔模型 / 首页流动动图
docs/                   接口、部署与场景说明
```

设计系统：`web/assets/site/tokens.css` 是颜色、字号、间距的唯一来源；页面内不再写死色值（塔页/沙盘的既有色值已逐步收口）。

---

## 4. 登录与账户

- 账户保存在服务器本地 `server/data/users.json`（可用 `AUTH_DATA_DIR` 改位置），**不接数据库**；
  密码用 `node:crypto` 的异步 `scrypt` 哈希（`N=131072, r=8, p=1, keyLength=64`，每用户独立 salt），文件里没有明文。
- 账户只能由服务器命令行管理：`node server/auth-cli.mjs init-admin | add-user | reset-password | disable-user | enable-user | list-users`。
  密码只在终端隐藏输入，不接受管道/参数/环境变量。
- Session 保存在 Node 进程内存（Cookie `yj_session`，`HttpOnly; SameSite=Lax`，生产 `Secure`），
  **重启后全部失效**；密码重置/禁用后旧会话在下一次请求时失效（`authVersion` 撤销）。
- 所有 `/api/*` 默认要求登录（只有 `/api/auth/status`、`/api/auth/login`、`/api/auth/logout` 公开）；
  状态改变请求还要通过 `Origin` allowlist。
- 业务 HTML 由服务端拦截：开发环境是 `dev.mjs` 的 `/api/auth/verify` 子请求，生产是 Nginx `auth_request`；
  前端 `auth-guard.js` 只负责待定态、BFCache 复查与“退出登录”入口。
- 第一版只支持**单 Node 进程、单机、单 `AUTH_DATA_DIR`**；同一数据目录启动第二个实例会被运行锁拒绝。

完整操作见 [`docs/auth-deployment.md`](docs/auth-deployment.md)。

---

## 5. 内容与边界

- 六章要点为人工撰写；第 2–6 章各挂 3 条公开来源，共 15 条，链接可点开核验。
- 三维为**原理级示意**，非真实装置比例；塔板数、侧线位置为教学简化。
- 演示问题都落在知识库内；不要用站外问题考验演示稳定性。
- 知识库目标 40–50 条已核验来源，当前 15 条，标注「建设中」。

---

## 6. 验证口径

- `check_design`（1280×800 / 390×844）：首页、探索、章节、沙盘、塔页、问答均为 0 问题。
- 三维：沙盘 canvas WebGL 正常、五关卡脚本加载；塔页 `window.__tower.loaded === true`。
- 深链：`sandbox.html#stage=N` 生效；章节页「回到三维」、塔页「回到流程沙盘」双向可回。
- 认证：`npm test` 覆盖密码哈希、用户文件锁与损坏 fail-closed、CLI、会话撤销、API 401、页面服务端拦截、
  Origin/限流/可信代理、Dify SSE 与身份替换；`npm run auth:perf` 输出 scrypt 耗时与内存基线。
