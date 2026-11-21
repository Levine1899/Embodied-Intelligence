/* v3-lead · 在 V2 的沉浸页上补两件事：随身问答 + 真·文案生成
   不改 V2 原文件，全部逻辑在这一层。 */
(function () {
  const $ = s => document.querySelector(s);

  /* ---------- 当前环节上下文 ---------- */
  function stageName() {
    const bar = document.querySelector('.lvl.on .lvl__bar b');
    if (bar && bar.textContent.trim()) return bar.textContent.trim();
    const b = document.querySelector('#stages [aria-current="step"]');
    if (b) return b.childNodes[0].textContent.trim();
    const c = $('#chapter');
    return c ? c.textContent.trim() : '总览';
  }

  /* ---------- 知识包（6 条，带来源） ---------- */
  const KB = [
    /* —— 地下开采 —— */
    { k: ['黑', '颜色', '为什么'], t: '石油为什么是黑的',
      a: '颜色主要来自<b>沥青质和胶质</b>，这两类大分子吸收大部分可见光；含量越高、油越稠越黑，轻质油偏金黄。',
      c: ['科普中国 · 石油专题', '石油地质学基础 · 组分'] },
    { k: ['藏', '哪儿', '哪里', '油湖'], t: '油气藏在哪儿',
      a: '不是地下有个油湖，而是<b>岩石孔隙里的油被圈闭扣住了</b>：上有盖层、旁有遮挡，油跑不掉才聚起来。',
      c: ['中国石油报 · 解构地球深部“藏宝图”', '馆藏展项：井筒与地层剖面'] },
    { k: ['圈闭', '盖层', '遮挡'], t: '圈闭是什么',
      a: '圈闭 = <b>储层 + 盖层 + 遮挡</b>三件事同时成立。缺一样，油气就继续往上跑，最后散掉，成不了藏。',
      c: ['中国石油报 · 勘探专题', '石油地质学基础 · 圈闭类型'] },
    { k: ['注水', '压力', '采不'], t: '为什么有的井要注水',
      a: '油藏压力会随开采下降，压力不够油就流不动。注水是<b>把压力补回去</b>，同时把油往井的方向推。',
      c: ['公开油田开发资料 · 注水开发', '中国石油 · 提高采收率公开介绍'] },
    { k: ['多深', '深度', '几千米'], t: '一口井能打多深',
      a: '常规油井两三千米，深井超深井可到<b>八千米以上</b>。越深温度和压力越高，对套管和钻具要求越苛刻。',
      c: ['中国石油 · 深地探测公开报道', '公开钻井工程资料'] },
    /* —— 井筒与钻井 —— */
    { k: ['岩心', '取心'], t: '岩心是什么',
      a: '取心钻头把地下岩石整段取上来的圆柱，直径 6–12 厘米。<b>测井是推断，岩心是实物核对。</b>',
      c: ['馆藏展品档案 A-1024', '钻井取心作业规范（公开摘要）'] },
    { k: ['套管', '井壁', '塌'], t: '套管是干什么的',
      a: '套管是下在井里的钢管，<b>把井壁撑住</b>并隔开不同地层。没有它，岩石会缩径、坍塌，井就废了。',
      c: ['公开钻井工程资料 · 井身结构', '中国石油 · 钻井科普'] },
    { k: ['水平井', '拐弯', '定向'], t: '水平井为什么能多出油',
      a: '水平井在油层里<b>横着走几百米</b>，和油的接触面比直井大得多，同样的压差能采出更多。页岩油靠它才有效。',
      c: ['中国石油 · 页岩油开发公开报道', '公开钻井工程资料 · 定向井'] },
    { k: ['泥浆', '钻井液'], t: '为什么钻井要泥浆',
      a: '泥浆一边<b>带出岩屑</b>，一边用液柱压力压住地层防止井喷，还顺带给钻头降温。它是钻井的"血液"。',
      c: ['公开钻井工程资料 · 钻井液', '中国石油 · 钻井科普'] },
    /* —— 地面处理 —— */
    { k: ['不是汽油', '为什么不能直接', '直接用'], t: '井口出来的为什么不是汽油',
      a: '井口出来的是<b>油、气、水、砂混在一起</b>的产出物，还带着盐和硫。不分离、不脱水，管道和炼厂都不收。',
      c: ['公开油气集输资料', '中国石油 · 地面工程公开介绍'] },
    { k: ['分离', '三相', '油水'], t: '油、气、水怎么分开',
      a: '靠<b>重力沉降 + 压差</b>：三相分离器里气往上、油在中、水在下，各自从不同出口走。',
      c: ['公开油气集输资料 · 三相分离', '中国石油 · 地面工程公开介绍'] },
    { k: ['脱水', '乳化', '盐'], t: '为什么要脱水',
      a: '水里有盐，进炼厂会<b>腐蚀设备、毒化催化剂</b>。所以要在井场先脱水脱盐，把含水率降到 1% 以下。',
      c: ['公开炼化预处理资料 · 电脱盐', '中国石油 · 炼化公开介绍'] },
    /* —— 储运 —— */
    { k: ['管道', '堵', '凝'], t: '管道会不会堵',
      a: '会。油温降下来黏度上升，蜡会析出。<b>加热输送 + 清管</b>是常规手段，高凝油还要掺稀或加降凝剂。',
      c: ['公开管道输送资料 · 含蜡原油', '中国石油 · 管道业务公开介绍'] },
    { k: ['储罐', '浮顶'], t: '储罐为什么是浮顶',
      a: '浮顶跟着液面升降，<b>把油气空间压到几乎为零</b>，既减少蒸发损耗，也降低爆炸风险。',
      c: ['公开储运资料 · 浮顶罐', '中国石油 · 储运公开介绍'] },
    { k: ['运输', '一吨', '火车', '船'], t: '一吨油怎么运最划算',
      a: '长距离走<b>管道</b>最便宜；跨海走油轮；铁路和公路只适合短途或没有管道的地方。',
      c: ['公开油气储运资料', '中国石油 · 物流公开介绍'] },
    /* —— 炼化 —— */
    { k: ['分馏', '炼', '塔'], t: '分馏怎么分开油',
      a: '靠<b>沸点差</b>：常压塔把轻组分从上部切出，底部重油再进减压塔，降低压力让它在较低温度下继续分。',
      c: ['公开炼化流程资料（常减压）', '中国石油 · 炼化业务公开介绍'] },
    { k: ['减压', '负压'], t: '减压塔是干什么的',
      a: '重油在常压下要 500℃ 以上才馏得动，那个温度早就裂解了。<b>抽真空降沸点</b>，就能在 400℃ 左右继续分。',
      c: ['公开炼化流程资料 · 减压蒸馏', '中国石油 · 炼化公开介绍'] },
    { k: ['催化', '裂化', '重整'], t: '催化裂化是什么',
      a: '把<b>大分子打碎成小分子</b>：重油在催化剂上裂成汽油、液化气。没有它，一桶油只能出很少的汽油。',
      c: ['公开炼化流程资料 · 催化裂化', '中国石油 · 炼化公开介绍'] },
    /* —— 产品 —— */
    { k: ['变成', '衣服', '产品', '塑料'], t: '一滴油能变成什么',
      a: '原油 → 石脑油 → PX → PTA → 聚酯 → <b>涤纶</b>，就是身上的外套；旁支还有沥青、口罩、化肥。',
      c: ['中国石油公开年报 · 炼化板块', '公开化工流程资料'] },
    { k: ['回收', '降解'], t: '石油做的东西能回收吗',
      a: '热塑性塑料（PET、PP）<b>可以熔融再造</b>；涤纶可化学解聚回单体。但混合、污染的材料目前大多只能焚烧或填埋。',
      c: ['公开塑料回收资料', '中国石油 · 化工新材料公开介绍'] }
  ];

  const LEDGER = [];
  const log = (k, t, d) => LEDGER.push(d ? { k, t, d } : { k, t });

  /* ---------- 面板 DOM ---------- */
  const side = document.querySelector('.side');
  if (!side) return;

  const box = document.createElement('div');
  box.className = 'leadai';
  box.innerHTML = [
    '<div class="leadai__h"><span>问一句</span><em id="leadai-ctx">上下文 · 总览</em></div>',
    '<div class="leadai__log" id="leadai-log">',
    '<div class="lm sys"><b>星火</b>这一层看到的东西，可以随时问我。库里有答案我直接给；库里没有、但属于石油这行的，我调模型组织一段，并标出来源属性。</div>',
    '</div>',
    '<form class="leadai__ask" id="leadai-form"><input id="leadai-q" placeholder="就这一层问一句…" aria-label="提问"><button type="submit" aria-label="发送">↑</button></form>',
    '<div class="leadai__foot"><span id="leadai-pending">待审补库 0 条</span><span class="leadai__tiers" id="leadai-tiers">档位：<button type="button" data-tier="kid">童话</button><button type="button" data-tier="mid" aria-pressed="true" class="on">通俗</button><button type="button" data-tier="pro">工程</button></span></div>'
  ].join('');
  const src = side.querySelector('.source');
  if (src) side.insertBefore(box, src); else side.appendChild(box);

  const logEl = box.querySelector('#leadai-log');

  function push(html, cls) {
    const d = document.createElement('div');
    d.className = 'lm ' + (cls || 'sys');
    d.innerHTML = html;
    logEl.appendChild(d);
    logEl.scrollTop = logEl.scrollHeight;
    return d;
  }
  /* ---------- 外部文章知识库（kb-sources.js） ---------- */
  if (window.__KB_EXTRA && window.__KB_EXTRA.length) {
    window.__KB_EXTRA.forEach(it => KB.push(it));
  }

  /* 当前是第几关：优先读关卡 UI，其次读舞台按钮 */
  function stageIndex() {
    const lvl = document.querySelector('.lvl.on');
    if (lvl && /^l\d$/.test(lvl.id)) return parseInt(lvl.id.slice(1), 10) - 1;
    const b = document.querySelector('#stages [aria-current="step"]');
    if (b && b.dataset.stage) return parseInt(b.dataset.stage, 10);
    return -1;
  }

  /* 右栏「延伸阅读」：每关挂 2–3 篇外链文章 */
  const ext = document.createElement('div');
  ext.className = 'lext';
  ext.innerHTML = '<h3>延伸阅读 <em id="lext-n"></em></h3><ul id="lext-list"></ul>';
  side.appendChild(ext);

  function renderExt() {
    const i = stageIndex();
    const list = window.__KB_EXTRA ? window.__KB_EXTRA.filter(x => x.stage === i + 1) : [];
    const ul = ext.querySelector('#lext-list');
    const n = ext.querySelector('#lext-n');
    if (!list.length) { ext.style.display = 'none'; return; }
    ext.style.display = '';
    n.textContent = list.length + ' 篇';
    ul.innerHTML = list.map(x => (
      '<li><a href="' + x.url + '" target="_blank" rel="noopener noreferrer">' +
      '<b>' + x.t + '</b><span>' + x.sum + '</span><i>' + x.org + ' · ' + x.date + ' ↗</i>' +
      '</a></li>'
    )).join('');
  }

  function syncCtx() {
    const n = stageName();
    box.querySelector('#leadai-ctx').textContent = '上下文 · ' + n;
    renderExt();
  }
  syncCtx();
  document.querySelectorAll('#stages [data-stage]').forEach(b => b.addEventListener('click', () => setTimeout(syncCtx, 60)));
  document.addEventListener('stage-level', () => setTimeout(syncCtx, 80));

  /* ---------- 问答：库内命中走库答；库外石油相关问题交给模型，并标明来源属性 ---------- */
  function score(q, it) {
    let s = 0;
    // 只认 2 字以上的关键词：1 字词（水/油/气/井）会把任何石油题都误配到某条
    for (const k of it.k) if (k.length >= 2 && q.includes(k)) s += 2;
    // 标题前缀先去掉疑问词再比：否则"为什么要脱水"取到"为什么要"，任何为什么开头的问题都会命中
    const core = it.t.replace(/为什么|怎么|怎样|如何|什么|哪些|多少|呢|？|\?/g, '').slice(0, 4);
    if (core.length >= 2 && q.includes(core)) s += 3;
    return s;
  }

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const PENDING_KEY = 'v3.ask.pending';
  function pendingList() { try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]'); } catch (e) { return []; } }
  function paintPending() {
    const el = box.querySelector('#leadai-pending');
    if (el) el.textContent = '待审补库 ' + pendingList().length + ' 条';
    box.querySelectorAll('#leadai-tiers button').forEach(b => {
      const on = b.dataset.tier === tier;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.classList.toggle('on', on);
    });
  }
  function addPending(q) {
    const l = pendingList();
    if (!l.some(x => x.q === q)) {
      l.unshift({ q: q, at: Date.now() });
      try { localStorage.setItem(PENDING_KEY, JSON.stringify(l.slice(0, 50))); } catch (e) { /* 忽略 */ }
    }
    paintPending();
  }

  let tier = 'mid';
  const TIER_NAME = { kid: '少儿童话', mid: '通俗版', pro: '工程版' };
  const TIER_SHORT = { kid: '童话', mid: '通俗', pro: '工程' };
  const TIER_ORDER = ['kid', 'mid', 'pro'];
  const nextTier = () => TIER_ORDER[(TIER_ORDER.indexOf(tier) + 1) % TIER_ORDER.length];

  function nearestChips(ranked) {
    return ranked.slice(0, 2).filter(r => r && r.it)
      .map(r => '<button type="button" class="lm-sug" data-q="' + esc(r.it.t) + '">' + esc(r.it.t) + '</button>')
      .join('');
  }

  function refuseCard(q, ranked, why) {
    const near = nearestChips(ranked);
    const d = push('<div class="who">库外 · 未采用模型</div>这个我<b>答不了</b>。' +
      (why ? '<span class="lm-note">（' + esc(why) + '）</span>' : '') +
      '<div class="lm-note">知识库里没有对应条目，这类问题也不适合让模型即兴发挥。</div>' +
      (near ? '<div style="margin-top:6px">要不要试试：' + near + '</div>' : ''), 'warn');
    d.querySelectorAll('.lm-sug').forEach(b => { b.onclick = () => ask(b.dataset.q); });
    log('拒答', q, why || '库外');
  }

  async function openAnswer(q) {
    const r = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q, ctx: [stageName()], tier: tier, mode: 'open' })
    });
    const j = await r.json();
    if (!r.ok || !j.text) throw new Error(j.error || '没有拿到回答');
    return j.text;
  }

  function modelCard(q, text) {
    const d = push(
      '<div class="who">模型补充 · 未逐条核验 · ' + TIER_NAME[tier] + '</div>' +
      '<div class="lm-body">' + esc(text).replace(/\n+/g, '<br/>') + '</div>' +
      '<div class="lm-acts">' +
        '<button type="button" class="lm-act" data-a="tier">换个' + TIER_SHORT[nextTier()] + '档重讲</button>' +
        '<button type="button" class="lm-act" data-a="save">加入待审补库</button>' +
        '<button type="button" class="lm-act" data-a="copy">复制</button>' +
      '</div>' +
      '<div class="lm-note">这段是模型按通用知识组织的：公司沿革、数字请以官方公开资料为准。</div>', 'model');
    d.querySelectorAll('.lm-act').forEach(b => {
      b.onclick = () => {
        const a = b.dataset.a;
        if (a === 'tier') { tier = nextTier(); paintPending(); ask(q); }
        else if (a === 'save') { addPending(q); b.textContent = '已加入待审'; b.disabled = true; }
        else if (a === 'copy') {
          if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => { b.textContent = '已复制'; });
        }
      };
    });
    log('模型答', q, text.slice(0, 40));
  }

  async function ask(q) {
    q = (q || '').trim();
    if (!q) return;
    push(esc(q), 'me');
    log('问', q);
    const ranked = KB.map(it => ({ it, s: score(q, it) })).sort((a, b) => b.s - a.s);

    if (ranked[0] && ranked[0].s >= 3) {
      const it = ranked[0].it;
      const STAGE_NAMES = ['地下开采', '地面处理', '储运', '炼化', '产品去向'];
      const tag = it.stage ? STAGE_NAMES[it.stage - 1] : stageName();
      const srcLink = it.url
        ? `<a class="lm-read" href="${it.url}" target="_blank" rel="noopener noreferrer">读原文 · ${it.org} ↗</a>`
        : '';
      push(`<span class="who">${esc(tag)} · 依据 ${it.c.length} 条</span>${it.a}` +
        `<div class="cite">${it.c.map((c, i) => `<i>0${i + 1}</i>${esc(c)}`).join('')}</div>` + srcLink);
      log('答', it.t, it.a.replace(/<[^>]+>/g, ''));
      return;
    }

    const wait = push('<div class="who">库外</div>知识库里没有直接对应的条目，我组织一个回答，并标明来源属性…', 'wait');
    let text = '';
    try {
      text = await openAnswer(q);
    } catch (e) {
      wait.remove();
      refuseCard(q, ranked, e.message);
      return;
    }
    wait.remove();
    const head = text.slice(0, 40);
    if (/【超出范围】/.test(head)) { refuseCard(q, ranked, '不在本展项范围内'); addPending(q); return; }
    if (/【不宜回答】/.test(head)) { refuseCard(q, ranked, '这类信息不能提供'); addPending(q); return; }
    modelCard(q, text);
    addPending(q);
  }

  box.querySelector('#leadai-form').addEventListener('submit', e => {
    e.preventDefault();
    const inp = box.querySelector('#leadai-q');
    ask(inp.value);
    inp.value = '';
  });

  /* 新增元素的样式（只加这一次，不动 index.html） */
  const style = document.createElement('style');
  style.textContent = [
    '.leadai__foot{display:flex;justify-content:space-between;gap:8px;margin-top:6px;font-size:11.5px;color:#7d93a2}',
    '.lm.model{border-left:2px solid #48d7f0;background:rgba(72,215,240,.06)}',
    '.lm.model .who{color:#48d7f0}',
    '.lm.wait{opacity:.75}',
    '.lm-body{margin:4px 0 6px;line-height:1.7}',
    '.lm-acts{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}',
    '.lm-act{height:26px;padding:0 9px;background:transparent;border:1px solid #2a4353;color:#cfe2ea;border-radius:6px;font-size:11.5px;cursor:pointer}',
    '.lm-act:hover{border-color:#48d7f0;color:#48d7f0}',
    '.lm-act:disabled{opacity:.55;cursor:default}',
    '.lm-note{font-size:11.5px;color:#7d93a2;margin-top:4px}',
    '.leadai__tiers{display:inline-flex;gap:4px;align-items:center}',
    '.leadai__tiers button{background:transparent;border:1px solid #2a4353;color:#9fb4c0;font-size:11px;padding:2px 7px;border-radius:4px;cursor:pointer}',
    '.leadai__tiers button.on{border-color:#48d7f0;color:#48d7f0}'
  ].join('\n');
  document.head.appendChild(style);
  box.querySelectorAll('#leadai-tiers button').forEach(b => {
    b.addEventListener('click', () => {
      if (!TIER_NAME[b.dataset.tier]) return;
      tier = b.dataset.tier;
      paintPending();
    });
  });
  paintPending();

  /* ---------- 生成材料 ---------- */
  const dlg = document.createElement('dialog');
  dlg.className = 'gendialog';
  dlg.innerHTML = [
    '<header><h2>本场材料</h2><button type="button" id="gen-close" aria-label="关闭">关闭</button></header>',
    '<div class="genbody"><div class="genres" id="gen-genres"><button type="button" data-genre="copy" aria-pressed="true">讲解词</button><button type="button" data-genre="post" aria-pressed="false">推文</button><button type="button" data-genre="script" aria-pressed="false">短视频脚本</button></div><div id="gen-meta" class="genmeta"></div><div id="gen-text">选体裁，然后生成。</div></div>',
    '<footer><button type="button" id="gen-run">开始生成</button><button type="button" id="gen-copy">复制</button><span id="gen-note"></span></footer>'
  ].join('');
  document.body.appendChild(dlg);

  const GENRE_NAME = { copy: '展馆讲解词', post: '科普推文', script: '短视频脚本' };
  const state = { genre: 'copy' };

  function fallbackText() {
    const first = LEDGER.find(x => x.k === '问');
    const stages = LEDGER.filter(x => x.k === '环节').map(x => x.t);
    return (first ? '这一场从「' + first.t + '」开始。\n\n' : '这一场还没提问。\n\n') +
      '走过了：' + (stages.length ? stages.join(' → ') : '地下开采 → 地面处理 → 储运 → 炼化 → 产品去向') + '。\n\n' +
      (state.genre === 'post' ? '（预置稿 · 推文精简版，可编辑）' : state.genre === 'script' ? '（预置稿 · 脚本骨架，可编辑）' : '（预置稿 · 讲解词，可编辑）');
  }

  async function runGen() {
    const out = dlg.querySelector('#gen-text');
    const note = dlg.querySelector('#gen-note');
    const genre = state.genre;
    const meta = dlg.querySelector('#gen-meta');
    meta.textContent = `本场记录 ${LEDGER.length} 条 · 环节 ${stageName()}`;
    out.textContent = '生成中……';
    note.textContent = '';

    let text = '', ms = 0;
    try {
      const r = await fetch('/api/gen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ledger: LEDGER, genre: genre, facts: buildFacts() })
      });
      const j = await r.json();
      if (j && j.text) { text = j.text; ms = j.ms || 0; }
    } catch (e) { /* 落到降级 */ }

    if (!text) {
      text = fallbackText();
      note.textContent = '预置稿 · 未连上模型';
    } else {
      note.textContent = `DeepSeek 实时生成 · ${(ms / 1000).toFixed(1)} s · 未经审核`;
    }
    out.textContent = text;
    log('生成', '本场材料', text.slice(0, 60));
  }

  /* 事实底稿：当前关卡的外部文章要点，原样交给模型，不许改数字 */
  function buildFacts() {
    const i = stageIndex();
    const pool = (window.__KB_EXTRA || []).filter(x => i < 0 || x.stage === i + 1);
    const use = pool.length ? pool : (window.__KB_EXTRA || []);
    return use.map(x => x.sum + ' ' + (x.a || '').replace(/<[^>]+>/g, '')).slice(0, 6);
  }

  const genBtn = document.createElement('button');
  genBtn.type = 'button';
  genBtn.className = 'genbtn genbtn--side';
  genBtn.innerHTML = '<b>生成本场材料</b><span>讲解词 / 推文 / 短视频脚本</span>';
  genBtn.onclick = () => { dlg.showModal(); runGen(); };
  if (src) side.insertBefore(genBtn, src); else side.appendChild(genBtn);

  dlg.querySelectorAll('#gen-genres [data-genre]').forEach(b => {
    b.onclick = () => {
      state.genre = b.dataset.genre;
      dlg.querySelectorAll('#gen-genres [data-genre]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      runGen();
    };
  });
  dlg.querySelector('#gen-close').onclick = () => dlg.close();
  dlg.querySelector('#gen-run').onclick = runGen;
  dlg.querySelector('#gen-copy').onclick = () => {
    navigator.clipboard && navigator.clipboard.writeText(dlg.querySelector('#gen-text').textContent);
    dlg.querySelector('#gen-copy').textContent = '已复制';
    setTimeout(() => dlg.querySelector('#gen-copy').textContent = '复制', 1200);
  };

  /* ---------- 记录：环节与选择题 ---------- */
  document.querySelectorAll('#stages [data-stage]').forEach(b => {
    b.addEventListener('click', () => log('环节', stageName()));
  });
  const choices = document.getElementById('choices');
  if (choices) {
    choices.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      const q = (document.getElementById('question') || {}).textContent || '';
      log('选择', q.trim(), b.textContent.trim());
    });
  }
  log('环节', stageName());

  window.__leadai = { ledger: LEDGER, ask, stageName };
})();
