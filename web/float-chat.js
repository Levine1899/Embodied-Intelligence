/* Floating Dify chat: continuous conversation, no page reload. */
(function () {
  'use strict';
  if (document.getElementById('fc-root')) return;

  var style = document.createElement('style');
  style.textContent = [
    '#fc-root{position:fixed;right:22px;bottom:22px;z-index:80;font:13px/1.55 "Microsoft YaHei UI","PingFang SC",sans-serif;color:#e8e1d4}',
    '#fc-fab{display:flex;align-items:center;gap:9px;height:48px;padding:0 17px 0 13px;border:1px solid #c9944f;border-radius:999px;background:#1b160e;color:#f0d6a8;box-shadow:0 10px 30px #0009;cursor:pointer}',
    '#fc-fab:hover{border-color:#f0b35c;background:#29200f}',
    '#fc-fab .dot{width:8px;height:8px;border-radius:50%;background:#7fd6a8;box-shadow:0 0 0 4px #7fd6a822}',
    '#fc-fab b{font-weight:600;letter-spacing:.04em}',
    '#fc-panel{position:fixed;right:22px;bottom:82px;width:min(390px,calc(100vw - 28px));height:min(540px,calc(100vh - 110px));display:flex;flex-direction:column;background:#0d1418;border:1px solid #5e4c33;box-shadow:0 20px 60px #000c;overflow:hidden}',
    '#fc-panel[hidden]{display:none}',
    '#fc-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border-bottom:1px solid #26343c;background:#111b20}',
    '#fc-head h2{margin:0;font-size:15px;font-weight:600;color:#f0d6a8;letter-spacing:.04em}',
    '#fc-head small{display:block;font-size:10px;color:#7fa0ad;margin-top:2px;letter-spacing:.05em}',
    '#fc-close{background:none;border:1px solid #3b4a52;color:#b8c7cc;width:30px;height:30px;cursor:pointer}',
    '#fc-log{flex:1;overflow:auto;padding:14px 13px 8px;display:flex;flex-direction:column;gap:10px}',
    '.fc-msg{max-width:88%;padding:9px 11px;white-space:pre-wrap;word-break:break-word;line-height:1.65;font-size:12.5px}',
    '.fc-msg.user{align-self:flex-end;background:#3a2a12;border:1px solid #7a5c31;color:#f4e3c4;border-radius:10px 10px 2px 10px}',
    '.fc-msg.ai{align-self:flex-start;background:#141f24;border:1px solid #2d414a;color:#d6e3e6;border-radius:10px 10px 10px 2px}',
    '.fc-msg.ai.pending{color:#8ba0a8}',
    '.fc-msg.err{align-self:flex-start;background:#241513;border-color:#6d3b33;color:#e5b4a9}',
    '#fc-empty{padding:10px 2px;color:#8fa1a8;font-size:12px}',
    '#fc-suggest{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}',
    '#fc-suggest button{background:#142127;border:1px solid #31505c;color:#c2d6dc;padding:5px 8px;font-size:11.5px;cursor:pointer}',
    '#fc-form{display:flex;gap:7px;padding:10px 11px 12px;border-top:1px solid #26343c;background:#111b20}',
    '#fc-input{flex:1;resize:none;height:44px;max-height:110px;background:#0a1115;border:1px solid #33454e;color:#e7eeee;padding:9px 10px;font:12.5px/1.5 inherit;outline:none}',
    '#fc-input:focus{border-color:#c9944f}',
    '#fc-send{width:48px;border:1px solid #c9944f;background:#2a2112;color:#f0d6a8;cursor:pointer;font-size:16px}',
    '#fc-send:disabled{opacity:.45;cursor:default}',
    '#fc-hint{padding:0 12px 8px;font-size:10.5px;color:#74878e;background:#111b20}',
    '@media(max-width:520px){#fc-root{right:12px;bottom:12px}#fc-panel{right:8px;bottom:72px;height:min(68vh,520px)}#fc-fab{height:44px;padding:0 14px}}'
  ].join('');
  document.head.appendChild(style);

  var root = document.createElement('div');
  root.id = 'fc-root';
  root.innerHTML = [
    '<button type="button" id="fc-fab" aria-haspopup="dialog" aria-expanded="false" aria-controls="fc-panel"><span class="dot"></span><b>AI 对话</b></button>',
    '<section id="fc-panel" role="dialog" aria-modal="false" aria-labelledby="fc-title" hidden>',
    '  <header id="fc-head"><div><h2 id="fc-title">AI 对话</h2><small>Dify · 连续对话</small></div><button type="button" id="fc-close" aria-label="关闭对话">×</button></header>',
    '  <div id="fc-log" role="log" aria-live="polite"><div id="fc-empty">关于石油、地层、储运、炼化，或当前这一屏看到的东西，都可以直接问。<div id="fc-suggest"><button type="button" data-q="这一屏在讲什么？">这一屏在讲什么？</button><button type="button" data-q="油和气为什么会出现？">油和气为什么会出现？</button><button type="button" data-q="下一步可以看什么？">下一步可以看什么？</button></div></div></div>',
    '  <form id="fc-form"><textarea id="fc-input" maxlength="300" rows="1" placeholder="问点什么…（Enter 发送，Shift+Enter 换行）" aria-label="输入问题"></textarea><button type="submit" id="fc-send" aria-label="发送">↑</button></form>',
    '  <div id="fc-hint">回答由 Dify 生成，可能不准确；重要结论请查资料核对。</div>',
    '</section>'
  ].join('');
  document.body.appendChild(root);

  var fab = root.querySelector('#fc-fab');
  var panel = root.querySelector('#fc-panel');
  var closeBtn = root.querySelector('#fc-close');
  var logEl = root.querySelector('#fc-log');
  var form = root.querySelector('#fc-form');
  var input = root.querySelector('#fc-input');
  var sendBtn = root.querySelector('#fc-send');
  var empty = root.querySelector('#fc-empty');

  function makeId() {
    try { return 'guest-' + crypto.randomUUID(); } catch (e) {}
    return 'guest-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }
  var userId = '';
  try { userId = localStorage.getItem('kepu.chat.user') || ''; } catch (e) {}
  if (!userId || !/^[a-zA-Z0-9-]{1,80}$/.test(userId)) {
    userId = makeId();
    try { localStorage.setItem('kepu.chat.user', userId); } catch (e) {}
  }
  var conversationId = '';
  try { conversationId = sessionStorage.getItem('kepu.chat.conv') || ''; } catch (e) {}
  var messages = [];
  try { messages = JSON.parse(sessionStorage.getItem('kepu.chat.log') || '[]'); } catch (e) { messages = []; }
  if (!Array.isArray(messages)) messages = [];
  var busy = false;
  var current = null;

  function save() {
    try {
      sessionStorage.setItem('kepu.chat.conv', conversationId || '');
      sessionStorage.setItem('kepu.chat.log', JSON.stringify(messages.slice(-40)));
    } catch (e) {}
  }

  function scroll() { logEl.scrollTop = logEl.scrollHeight; }

  function add(role, text, cls) {
    if (empty) { empty.remove(); empty = null; }
    var d = document.createElement('div');
    d.className = 'fc-msg ' + (role || 'ai') + (cls ? ' ' + cls : '');
    d.textContent = text;
    logEl.appendChild(d);
    scroll();
    return d;
  }

  function paint() {
    logEl.querySelectorAll('.fc-msg').forEach(function (x) { x.remove(); });
    if (!messages.length) return;
    if (empty) { empty.remove(); empty = null; }
    messages.forEach(function (m) { add(m.role, m.text); });
  }

  function setBusy(v) {
    busy = v;
    sendBtn.disabled = v;
    input.disabled = v;
    if (!v) input.focus({ preventScroll: true });
  }

  function toggle(open) {
    var yes = typeof open === 'boolean' ? open : panel.hidden;
    panel.hidden = !yes;
    fab.setAttribute('aria-expanded', String(yes));
    if (yes) {
      paint();
      setTimeout(function () { input.focus({ preventScroll: true }); }, 30);
    }
  }

  async function send(text) {
    var q = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!q || busy) return;
    setBusy(true);
    messages.push({ role: 'user', text: q });
    add('user', q);
    var answer = '';
    var node = add('ai', '正在连接 Dify…', 'pending');
    current = { node: node, text: '' };
    try {
      var response = await fetch('/api/dify-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, conversation_id: conversationId || '', user: userId })
      });
      if (!response.ok) {
        var err = await response.json().catch(function () { return {}; });
        throw new Error(err.error || '请求失败（' + response.status + '）');
      }
      if (!response.body) throw new Error('浏览器不支持流式响应');
      var reader = response.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';
      var done = false;
      while (true) {
        var part = await reader.read();
        buffer += decoder.decode(part.value || new Uint8Array(), { stream: !part.done });
        var events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop();
        for (var i = 0; i < events.length; i += 1) {
          var data = events[i].split(/\r?\n/).filter(function (l) { return l.indexOf('data:') === 0; }).map(function (l) { return l.slice(5).trimStart(); }).join('\n');
          if (!data) continue;
          var msg;
          try { msg = JSON.parse(data); } catch (e) { continue; }
          if (msg.event === 'error') throw new Error(msg.message || '回答生成失败');
          if (msg.conversation_id) { conversationId = msg.conversation_id; save(); }
          if ((msg.event === 'message' || msg.event === 'agent_message') && typeof msg.answer === 'string') {
            answer += msg.answer;
            node.textContent = answer;
            node.classList.remove('pending');
            scroll();
          }
          if (msg.event === 'message_end') done = true;
        }
        if (part.done) break;
      }
      if (!done) throw new Error('回答中断，请重试');
      if (!answer.trim()) throw new Error('没有收到回答');
      node.textContent = answer;
      node.classList.remove('pending');
      messages.push({ role: 'ai', text: answer });
      save();
    } catch (e) {
      node.className = 'fc-msg err';
      node.textContent = e && e.message ? e.message : '连接失败，请稍后再试。';
      messages.push({ role: 'ai', text: node.textContent });
      save();
    } finally {
      current = null;
      setBusy(false);
    }
  }

  fab.addEventListener('click', function () { toggle(); });
  closeBtn.addEventListener('click', function () { toggle(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !panel.hidden) toggle(false);
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var t = input.value;
    input.value = '';
    input.style.height = '';
    send(t);
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.dispatchEvent(new Event('submit', { cancelable: true }));
    }
  });
  input.addEventListener('input', function () {
    input.style.height = 'auto';
    input.style.height = Math.min(110, input.scrollHeight) + 'px';
  });
  logEl.addEventListener('click', function (e) {
    var b = e.target.closest('#fc-suggest button');
    if (!b) return;
    send(b.getAttribute('data-q'));
    toggle(true);
  });

  window.__floatChat = {
    open: function () { toggle(true); },
    close: function () { toggle(false); },
    send: send,
    get conversationId() { return conversationId; }
  };
})();
