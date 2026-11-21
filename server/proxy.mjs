// 科普智能体 · 文案生成代理
// 只做一件事：POST /api/gen → DeepSeek → 返回 { text, ms }
// key 只存在于本机环境变量 / .env，浏览器拿不到。

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8790);

async function loadKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY.trim();
  try {
    const t = await readFile(path.join(ROOT, '.env'), 'utf8');
    const m = t.match(/^\s*DEEPSEEK_API_KEY\s*=\s*(\S+)\s*$/m);
    return m ? m[1] : '';
  } catch { return ''; }
}
const KEY = await loadKey();

const SYS = `你是科普编辑。用户会给你一场参观/演示的过程记录，每条记录有类型（问 / 答 / 看 / 段）。
请据此写一篇 220–300 字的科普短文，给普通公众看。

硬性要求：
1. 先回答记录里那个问题本身，把科学机制讲清楚；再串起其他记录。
2. 严禁编造记录里没有的场景细节：不要写讲解员的动作、灯光、观众表情、观众说了什么、谁记了笔记。
3. 可以用记录里出现的条目名。
4. 不要补数字。记录里有的数字照用，没有的不推算。
5. 第一句直接给结论，不用"众所周知""随着…的发展""在本次参观中"。
6. 不用"赋能、打造、一站式、沉浸式体验"这类空词。
7. 结尾不要喊口号，落在具体的东西上即可。
8. 最重要：读者不知道曾经有过一场参观。禁止出现这些词——讲解员、观众、现场、屏幕上、片子放完、激光笔、灯光、参观、本场。
   把记录当成素材来写一篇独立文章，不要复述"谁做了什么"。
`;

const TAIL = {
  copy: '9. 只输出正文，不要标题、不要小标题、不要 markdown。',
  post: '9. 第一行是标题，单独一行；其后是正文段落；不要小标题、不要 markdown、不要列表。',
  script: '9. 只输出镜头行，一行一个镜头，每行四个字段用竖线隔开；不要段落、不要标题、不要编号、不要空行。'
};
const GENRE_NAME = { copy: '展馆讲解词', post: '科普推文', script: '短视频脚本' };
const BAN = ['讲解员', '观众', '屏幕上', '激光笔', '灯光', '参观', '本场', '片子放完'];
const hitBan = t => BAN.filter(w => t.includes(w));

const GENRE = {
  copy: '【体裁要求·最高优先级】写一篇展馆讲解词，600–800 字，口语、句子短、适合朗读；可以用展项名指路；结尾留一句给听众的提问。与下文"不要标题""不要小标题"的冲突处，以此条为准：仍然不要标题。',
  post: '【体裁要求·最高优先级】写一篇科普推文，260–360 字。第一行是标题（不加"标题："二字），空一行，然后：一个生活锚点 → 一段机制 → 一句落点。与下文"不要标题"冲突时，以此条为准：要标题。',
  script: '【体裁要求·最高优先级】写一个短视频脚本，严格 8–10 行，每行必须含三个竖线（画面｜解说｜字幕｜秒数），一行一个镜头，不要写成段落。每行严格为"画面｜解说｜字幕｜秒数"，例如"井口特写｜这是套管，撑住井壁｜套管｜5s"。总时长 45–60 秒。竖线分隔不算 markdown，与下文"不要 markdown"冲突时以此条为准。'
};
const FACT_RULE = `

【事实底稿·最高优先级】
用户还会给你一组"事实底稿"，来自权威科普文章。要求：
1. 涉及机理、数值、年代、比例时，只能使用底稿里的说法与数字，一个字都不能改、不能四舍五入；
2. 底稿以外的科学细节一律不写，宁可少写；
3. 底稿与记录冲突时，以底稿为准。`;

async function callDeepSeek(ledger, genre, extra, facts) {
  const factBlock = (facts && facts.length)
    ? '\n\n【事实底稿】\n' + facts.map((f, i) => (i + 1) + '. ' + f).join('\n')
    : '';
  const messages = [
    { role: 'system', content: SYS + '\n\n' + (GENRE[genre] || '') + '\n' + (TAIL[genre] || TAIL.copy) + (factBlock ? FACT_RULE : '') },
    { role: 'user', content: (GENRE_NAME[genre] ? '【本次要写的体裁】' + GENRE_NAME[genre] + '\n\n' : '') + JSON.stringify(ledger || [], null, 1) + factBlock }
  ];
  if (extra) messages.push(...extra);
  const r = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },
    body: JSON.stringify({ model: 'deepseek-chat', temperature: genre === 'script' ? 0.25 : (extra ? 0.4 : 0.7), max_tokens: 1500, messages })
  });
  const j = await r.json();
  return j?.choices?.[0]?.message?.content?.trim() || '';
}


/* ——— 科普问答：/api/ask ——— */
const ASK_SYS = `你是石油科普讲解员，回答对象是普通公众，可能有中小学生。
要求：
1. 先用一句话给结论，再解释为什么；总长 120–220 字。
2. 只讲石油、天然气、炼化、油品用途、开采与储运相关的内容。
3. 不编数字。下面给的资料里有数字就用，没有就不写具体数值。
4. 不写"众所周知""随着…的发展"，不用"赋能、打造、一站式"这类空词。
5. 结尾不要喊口号。
6. 如果问题与石油无关，直接说"这个问题超出了本展项的范围"，并用一句话给出本展项能回答的相关方向。`;

function askMessages(question, ctx, tier, mode) {
  const block = (ctx || []).length
    ? '\n\n【可引用的资料】\n' + ctx.map((c, i) => (i + 1) + '. ' + c).join('\n')
    : '';
  const t = (mode !== 'open' && TIER_SYS[tier]) ? '\n\n' + TIER_SYS[tier] : '';
  const sys = mode === 'open' ? ASK_OPEN_SYS : ASK_SYS;
  return [
    { role: 'system', content: sys + t },
    { role: 'user', content: '问题：' + String(question || '').slice(0, 300) + block }
  ];
}

/* ——— 三档表达（真理源 §2：少儿童话 / 中学原理 / 硬核工程）——— */

/* ——— 库外补充：mode:"open"（允许模型用通用知识答石油 / 中石油相关题，但必须承认未核验）——— */
const ASK_OPEN_SYS = `你是石油与能源领域的科普编辑，回答对象是普通公众和中国石油系统的参访者。
判断顺序（先判断再回答）：
1. 如果问题与石油、天然气、炼化、油品用途、石油公司（中国石油等）、能源行业无关，只输出这一行：
   【超出范围】本展项不回答这个问题。
   不要解释原因，不要给替代建议。
2. 如果是"内部/未公开"数据、涉密信息、个人隐私、投资或价格预测、对具体人员评价，只输出：
   【不宜回答】这类信息我不能提供。
3. 其余石油/能源相关的问题，用你的通用知识回答：
   - 先一句话给结论，再给 2–4 句机制或背景；
   - 历史沿革、业务板块、公开常识可以直接讲；
   - 具体数字（产量、储量、营收、价格）拿不准就不写，或写"这个数字我记不准，建议查官方来源"；绝不编造；
   - 公司沿革类问题（成立、改制、重组年份）：必须同时说清"哪一年 + 当时那个机构的准确名称"；只要有一项说不准，就只回答"这个年份我记不准，建议查公司官网"，不要给一个可能混淆的年份；
   - 中石油/中石化等公司信息按公开口径说，不说内部指标。
4. 全篇 120–260 字，口语，不用"众所周知""随着…发展""赋能、打造、一站式"。
5. 结尾不要喊口号，不要加"以上仅供参考"这类套话（前端会统一标注来源属性）。`;


const TIER_SYS = {
  kid: `【表达档位·少儿童话版】读者是 8–12 岁的孩子。
1. 全篇 70–110 字，最多两段。
2. 必须用一个生活里能摸到的东西打比方（海绵、吸管、锅盖、吸管、饼干这类），不要自己编新道具。
3. 不用专业术语：不写"孔隙度、渗透率、馏分、干酪根、烃源岩"。
4. 不写数字，不写百分号。`,
  mid: `【表达档位·中学原理版】读者是中学生。
1. 150–200 字。
2. 结构：一句话结论 → 为什么会这样（机制）→ 一个生活里能对上的现象。
3. 可以用基础科学词（密度、压强、沸点、混合物），但不写工艺参数、不写井型与层位。`,
  pro: `【表达档位·硬核工程版】读者是工程师或石油行业爱好者。
1. 160–230 字。
2. 允许术语与工艺条件（层位、井型、压裂规模、沸点区间），但每个数字必须来自资料或问题本身，没有就写"资料未给出"，不推算。
3. 不做投资、安全或合规判断。`
};

async function callAsk(question, ctx, tier, mode) {
  const r = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },
    body: JSON.stringify({ model: 'deepseek-chat', temperature: 0.35, max_tokens: 700, messages: askMessages(question, ctx, tier, mode) })
  });
  const j = await r.json();
  return j?.choices?.[0]?.message?.content?.trim() || '';
}
const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];

  if (url !== '/api/gen' && url !== '/api/ask') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end('{"error":"not found"}');
  }
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    return res.end('{"error":"post only"}');
  }
  if (!KEY) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    return res.end('{"error":"no key"}');
  }

  let body = '';
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 64 * 1024) { res.writeHead(413); return res.end(); }
    body += c;
  }

  let payload = {};
  try { payload = JSON.parse(body || '{}'); } catch {}

  const t0 = Date.now();
  if (url === '/api/ask') {
    try {
      const tier = ['kid', 'mid', 'pro'].includes(payload.tier) ? payload.tier : 'mid';
      const mode = payload.mode === 'open' ? 'open' : 'rag';
      const text = await callAsk(payload.question, payload.ctx, tier, mode);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ text, ms: Date.now() - t0, tier, mode }));
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: String(e.message || e) }));
    }
  }
  try {
    let text = await callDeepSeek(payload.ledger, payload.genre, null, payload.facts);
    const banned = hitBan(text);
    if (banned.length) {
      text = await callDeepSeek(payload.ledger, payload.genre, [
        { role: 'assistant', content: text },
        { role: 'user', content: '重写。刚才出现了' + banned.join('、') + '，违反第 8 条。读者不应知道有过一场参观。' }
      ], payload.facts);
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ text, ms: Date.now() - t0 }));
  } catch (e) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: String(e.message || e) }));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`kepu-proxy on 127.0.0.1:${PORT}  key:${KEY ? 'loaded' : 'MISSING'}`);
});
