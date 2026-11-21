# 油见未来 · 科普智能体

面向中国石油 / 临沂大学人工智能与具身智能实验室的科普演示端：**一条原油从地下到用户的三维流程线 + 随身问答 + 可信文案生成**。

前端是零构建的原生 HTML / JS（Three.js 走本地文件），后端是一个只做两件事的 Node 代理：把请求转给 DeepSeek，API Key 只留在服务器上。

---

## 1. 它有什么

| 模块 | 说明 |
|---|---|
| **沉浸讲解** `web/index.html` | Three.js 三维流程沙盘（井口→处理→储运→炼化→产品），可拖动旋转、缩放、点设备看细节；底部五环节条；五个关卡任务；右侧「问一句」随身问答 |
| **科普问答** `web/ask.html` | 独立问答页，同样的三段策略 |
| **文案生成** `web/write.html` | 三种体裁（展馆讲解词 / 科普推文 / 短视频脚本），真调模型；生成后给**本地库引用**与**三道防线**审核 |
| **知识库** `web/kb.html` | 15 条公开科普条目的检索视图 |

### 问答的三段策略（重点）

1. **库里命中** → 直接给库里的预写答案，附逐条引用与原文链接。可信、最快。
2. **库外、但属于石油 / 中石油 / 能源** → 调模型组织一段，界面明确标注「模型补充 · 未逐条核验」，并给「换档 / 加入待审补库 / 复制」。
3. **与石油无关**（模型只回 `【超出范围】`）或**涉内部数据 / 预测 / 隐私**（`【不宜回答】`）→ 不采用模型，直接说答不了，并给出相近条目。

prompt 里压了三条硬规矩，避免"看起来会答"变成"答错还很自信"：

- 公司沿革类必须「年份 + 当时机构名」同时说清，否则只准回"这个年份我记不准，建议查官网"；
- 具体数字拿不准不写，不推算；
- 越界只输出固定标记，前端据此转拒答，不把模型的解释粘给观众。

### 文案页

- **事实底稿**：用户填的数字是全文唯一数字来源；底稿没写的数字模型不补。
- **句级信源**：按主题 + 底稿在本地知识库检索，取前 2 条并显示命中分数；没命中就明说"不会给文案挂假出处"。
- **三道防线**：机器初筛（字数 / 套话 / 数字来源）→ 编辑复审 → 专家终审；可退回但必填原因，记录操作人与时间，状态存本机。

---

## 2. 快速开始

```bash
# 1. 配置 Key（只在服务器侧）
cp server/.env.example server/.env
#   然后把 DEEPSEEK_API_KEY=... 填进 server/.env

# 2. 起开发服务器（会同时拉起 API 代理）
npm run dev
#    打开 http://127.0.0.1:5173
```

没有 Key 也能开页面，但问答的"模型补充"与文案生成会报错——这是有意的：**不伪造结果**。

如果只想单独跑代理：

```bash
npm run api        # 监听 127.0.0.1:8790
```

---

## 3. 目录结构

```
scienceagent/
├─ web/                     # 前端（零构建，直接用文件路径运行）
│  ├─ index.html            # 沉浸讲解主页（3D 沙盘）
│  ├─ ask.html / write.html / kb.html
│  ├─ immersion.js          # 3D 场景、五环节、关卡联动
│  ├─ ai.js                 # 随身问答（三段策略）
│  ├─ kb-sources.js         # 外部科普条目（标题/摘要/要点/出处/网址）
│  ├─ levels/               # 五个关卡
│  └─ assets/               # three.browser.js + 场景图片
├─ server/
│  ├─ proxy.mjs             # /api/ask 与 /api/gen，Key 只在服务端
│  ├─ dev.mjs               # 本地静态服务 + /api 转发
│  └─ .env.example
└─ docs/API.md              # 接口契约
```

---

## 4. 接口

见 [`docs/API.md`](docs/API.md)。两个端点：

- `POST /api/ask` — `{ question, ctx?, tier?, mode? }`；`mode:"open"` 时允许用通用知识回答石油题。
- `POST /api/gen` — `{ ledger, genre, facts? }`；`genre` ∈ `copy | post | script`。

---

## 5. 生产部署（参考）

```nginx
server {
  listen 80;
  server_name example.com;

  root /var/www/scienceagent/web;
  index index.html;

  location / { try_files $uri $uri/ =404; }

  location /api/ {
    proxy_pass http://127.0.0.1:8790;
    proxy_set_header Host $host;
    proxy_read_timeout 120s;
  }
}
```

```ini
# /etc/systemd/system/scienceagent-api.service
[Unit]
Description=scienceagent api proxy
After=network.target

[Service]
WorkingDirectory=/opt/scienceagent/server
Environment=DEEPSEEK_API_KEY=sk-xxx
ExecStart=/usr/bin/node proxy.mjs
Restart=always

[Install]
WantedBy=multi-user.target
```

`systemctl enable --now scienceagent-api`。

---

## 6. 已知限制（别当成能力）

- 知识库只有 **15 条**，覆盖面窄；库外问题靠模型补充，**没有逐条核验**，界面已标注。
- 关键词打分是简单的 2-gram + 关键词匹配，复杂问法可能匹配不准；命中阈值 3 分。
- 三维场景是**示意级**（基础几何体 + 材质），不是外包精模。
- 问答与文案都依赖外网模型接口，网络不稳会失败——失败时会明说，不返回编造结果。
- 没有登录、没有多用户、没有持久化审核记录（审核状态存浏览器 localStorage）。

---

## 7. 来源与版本

- 本项目是内部演示版 **V3** 抽离出来的独立工程（V4 / V5 未包含）。
- 内容依据：中国石油 / 临沂大学人工智能与具身智能实验室科普展项资料，以及公开科普条目（见 `web/kb-sources.js` 的出处字段）。
- 版本记录见 [`CHANGELOG.md`](CHANGELOG.md)。
