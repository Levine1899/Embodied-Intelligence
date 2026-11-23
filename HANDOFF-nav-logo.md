# 导航顺序 / “沉浸式讲解”入口 / 全站 Logo 交接

本文只说明代码位置和当前状态，供外部模型修改。生产目录不是源码目录。

## 源码根目录

`D:\Work\Embodied Intelligence\scienceagent\web`

生产静态目录（不要在这里当源码改）：

`/docker/nginx/www/kepu/v15`

服务器：`root@120.26.198.46`，容器：`nginx-web`，公网端口：`8020`。

---

## 1. 主菜单顺序

目标顺序：

```html
<a href="index.html">首页</a>
<a href="ask.html">智能问答</a>
<a href="sandbox.html">沉浸式讲解</a>
<a href="write.html">科普文案</a>
```

当前各页面位置：

| 页面 | 菜单代码位置 | 说明 |
|---|---|---|
| `web/ask.html` | `217-222` | 首页 / 智能问答（active）/ 沉浸式讲解 / 科普文案 |
| `web/write.html` | `621-626` | 首页 / 智能问答 / 沉浸式讲解 / 科普文案（active） |
| `web/sandbox.html` | `51-56` | 首页 / 智能问答 / 沉浸式讲解（active）/ 科普文案 |
| `web/explore.html` | `111-116` | 同上，无 active |
| `web/chapter.html` | `110-115` | 同上，无 active |
| `web/tower.html` | `95-100` | 同上，无 active |
| `web/kb.html` | `59` | 单行 `.knav`，顺序同上 |
| `web/index.html` | 无横向主菜单 | 首页原本只有品牌 + 入口卡；如果要求首页也出现主菜单，需要新增 `<nav>`（品牌在 `100`，`.brand` CSS 在 `39-41`） |

菜单链接目标：

- 智能问答：`ask.html`
- 沉浸式讲解：`sandbox.html`（3D 沙盘，不是 `explore.html`）
- 科普文案：`write.html`

## 2. “智能问答 → 探索”仍进入六章列表页

主菜单的“探索”已经去掉，改名为“沉浸式讲解”，并且指向 `sandbox.html`。

对应代码：

- `web/ask.html:220`：`<a href="sandbox.html">沉浸式讲解</a>`
- `web/sandbox.html:54`：`<a href="sandbox.html" aria-current="page">沉浸式讲解</a>`
- 其他页面同表。

**仍会进入六章列表的链接只剩内容页链接，不是主菜单：**

- `web/index.html:129`：首页“六章知识”入口 → `explore.html`
- `web/chapter.html:121`：面包屑“探索大厅” → `explore.html`
- `web/chapter.html:160-161`：上一章 / 下一章 → `explore.html`
- `web/chapter.html:168`：“返回探索大厅” → `explore.html`
- `web/explore.html` 本身是六章列表页，保留。

如果用户仍然看到旧菜单（“探索 / 科普文案生成”），先确认浏览器地址是否还是旧标签页或缓存；源码和 V15 生产文件中的主菜单已经是新顺序。

## 3. 全站 Logo

统一文件：

`web/assets/science-logo.png`

所有页面 header 的品牌位置：

| 页面 | HTML 位置 | 当前写法 |
|---|---|---|
| `web/index.html` | `100` | `<a class="brand"...><img ...><b>油见未来</b><span>石油 · 科学 · 阅读</span></a>` |
| `web/ask.html` | `216` | `<a class="brand"...><img ...>油见未来</a>` |
| `web/write.html` | `620` | `<a class="brand"...><img ...><span>油见未来</span></a>` |
| `web/sandbox.html` | `50` | `<a class="brand"...><img ...><span>油见未来</span> <small>石油科学</small></a>` |
| `web/explore.html` | `110` | `<a class="brand"...><img ...><b>油见未来</b><span>...</span></a>` |
| `web/chapter.html` | `109` | 同上 |
| `web/tower.html` | `94` | `<a class="brand"...><img ...>油见未来<small>常减压蒸馏 · 剖面详解</small></a>` |
| `web/kb.html` | `57` | `<a class="brand"...><img ...>油见未来</a>` |

对应 Logo CSS：

- `web/index.html:39-40`
- `web/explore.html:24-25`
- `web/chapter.html:21-22`
- `web/ask.html:14-15` 和 `196-197`（ask 有两段 `.brand`，后者会覆盖部分尺寸）
- `web/write.html:61`（已有 img 样式）
- `web/sandbox.html:27`（整段 header CSS 在同一行，含 `.brand img`）
- `web/tower.html:17-18`
- `web/kb.html:18-19`

如果要求换成另一张“中石油官方 Logo”，只需替换 `web/assets/science-logo.png`；所有页面引用已经统一为这一个文件，不需要逐页改路径。

## 4. 部署位置（外部模型修改后）

1. 只改 `scienceagent/web/**`。
2. 重新打包 `web/`，上传到 `/docker/nginx/www/kepu/`，解压成新版本目录（例如 `v16`）。
3. 把 `/docker/nginx/www/kepu/index.html` 的 meta refresh 目标改为新版本。
4. 旧 `/v6/`～`/v15/` 目录当前都是 V15 的拷贝；不要直接改这些目录作为源码。

当前生产：

- 根：`http://120.26.198.46:8020/`
- 当前版本：`http://120.26.198.46:8020/v15/`
- `v15/sandbox.html`
- 备份：`index.html.bak-20261123-173410`

## 5. 验收

```text
打开 /v15/ask.html
菜单文本必须是：首页 智能问答 沉浸式讲解 科普文案
点“沉浸式讲解”必须到 /v15/sandbox.html
不能到 /v15/explore.html

每个页面 header 必须有：
<img src="assets/science-logo.png" alt="中国石油">
并且 naturalWidth > 0

/v15/sandbox.html 的“沉浸式讲解”必须有 aria-current="page"
```

如果验收仍然失败，需要记录失败页面的 **实际 URL**、浏览器里看到的菜单文本、点击后的目标 URL；仅凭“依然存在问题”无法定位是缓存、旧标签页还是另一个菜单入口。
